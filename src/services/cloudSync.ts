import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import type { CatchEntry, FishingSession } from '../../schema/types';
import { CATCHES_STORE, SESSIONS_STORE, getDb } from './dataStore';
import { auth, db } from './firebase';

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

function isVerifiedUser(): string | null {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return null;
  return user.uid;
}

export async function pushCatchToCloud(entry: CatchEntry, uid?: string): Promise<void> {
  const userId = uid ?? isVerifiedUser();
  if (!userId) return;

  const docRef = doc(db, 'peche_journals', userId, 'catches', entry.id);
  const snap = await getDoc(docRef);
  const payload = stripUndefined({
    id: entry.id,
    speciesId: entry.speciesId,
    speciesName: entry.speciesName,
    environment: entry.environment,
    sizeCm: entry.sizeCm,
    weightG: entry.weightG,
    released: entry.released,
    date: entry.date,
    lat: entry.lat,
    lng: entry.lng,
    locationLabel: entry.locationLabel,
    photoDataUrl: entry.photoDataUrl,
    notes: entry.notes,
  });

  if (!snap.exists()) {
    await setDoc(docRef, {
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      title: entry.speciesName,
      date: entry.date,
      notes: entry.notes ?? '',
      payload,
    });
  } else {
    await setDoc(
      docRef,
      {
        updatedAt: serverTimestamp(),
        title: entry.speciesName,
        date: entry.date,
        notes: entry.notes ?? '',
        payload,
      },
      { merge: true },
    );
  }
}

export async function removeCatchFromCloud(id: string, uid?: string): Promise<void> {
  const userId = uid ?? isVerifiedUser();
  if (!userId) return;
  await deleteDoc(doc(db, 'peche_journals', userId, 'catches', id));
}

export async function pushSessionToCloud(session: FishingSession, uid?: string): Promise<void> {
  const userId = uid ?? isVerifiedUser();
  if (!userId) return;

  const docRef = doc(db, 'peche_journals', userId, 'sessions', session.id);
  const snap = await getDoc(docRef);
  const payload = stripUndefined({
    id: session.id,
    name: session.name,
    date: session.date,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    status: session.status,
    environment: session.environment,
    points: session.points,
    distanceKm: session.distanceKm,
  });

  if (!snap.exists()) {
    await setDoc(docRef, {
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      title: session.name ?? 'Session de pêche',
      status: session.status,
      date: session.date ?? session.startedAt.slice(0, 10),
      payload,
    });
  } else {
    await setDoc(
      docRef,
      {
        updatedAt: serverTimestamp(),
        title: session.name ?? 'Session de pêche',
        status: session.status,
        date: session.date ?? session.startedAt.slice(0, 10),
        payload,
      },
      { merge: true },
    );
  }
}

export async function removeSessionFromCloud(id: string, uid?: string): Promise<void> {
  const userId = uid ?? isVerifiedUser();
  if (!userId) return;
  await deleteDoc(doc(db, 'peche_journals', userId, 'sessions', id));
}

/**
 * Synchronise de façon bidirectionnelle les prises et tracés GPS locaux (IndexedDB)
 * avec Firestore (`peche_journals/{uid}`).
 */
export async function syncAllWithCloud(uid: string): Promise<{
  catchesSynced: number;
  sessionsSynced: number;
}> {
  const localDb = await getDb();

  // 1. Prises
  const localCatches = (await localDb.getAll(CATCHES_STORE)) as CatchEntry[];
  const remoteCatchesSnap = await getDocs(collection(db, 'peche_journals', uid, 'catches'));
  const remoteCatchIds = new Set<string>();

  for (const docSnap of remoteCatchesSnap.docs) {
    remoteCatchIds.add(docSnap.id);
    const data = docSnap.data();
    const payload = data.payload as CatchEntry | undefined;
    if (payload && payload.id && payload.speciesName && payload.date) {
      await localDb.put(CATCHES_STORE, payload);
    }
  }

  for (const entry of localCatches) {
    if (!remoteCatchIds.has(entry.id)) {
      await pushCatchToCloud(entry, uid);
    }
  }

  // 2. Sessions GPS (uniquement les sessions terminées ou en pause pour éviter le bruit)
  const localSessions = (await localDb.getAll(SESSIONS_STORE)) as FishingSession[];
  const remoteSessionsSnap = await getDocs(collection(db, 'peche_journals', uid, 'sessions'));
  const remoteSessionIds = new Set<string>();

  for (const docSnap of remoteSessionsSnap.docs) {
    remoteSessionIds.add(docSnap.id);
    const data = docSnap.data();
    const payload = data.payload as FishingSession | undefined;
    if (payload && payload.id && payload.startedAt) {
      await localDb.put(SESSIONS_STORE, payload);
    }
  }

  for (const session of localSessions) {
    if (!remoteSessionIds.has(session.id) && session.status !== 'active') {
      await pushSessionToCloud(session, uid);
    }
  }

  const finalCatches = await localDb.count(CATCHES_STORE);
  const finalSessions = await localDb.count(SESSIONS_STORE);
  return { catchesSynced: finalCatches, sessionsSynced: finalSessions };
}
