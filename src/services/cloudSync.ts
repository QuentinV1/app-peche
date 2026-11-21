import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Unsubscribe,
} from 'firebase/firestore';
import type { CatchEntry, FishingSession } from '../../schema/types';
import { CATCHES_STORE, SESSIONS_STORE, getDb, type FacadeCode } from './dataStore';
import { estConnecteFirebase, getFirebaseDb, getFirebaseUser } from './firebase';

export const LAST_UID_KEY = 'app_peche_last_uid';
export const SETTINGS_STORAGE_KEY = 'app_peche_settings_v1';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface CloudSettings {
  environment: 'sea' | 'freshwater';
  selectedFacade: FacadeCode;
  updatedAt?: string;
}

export interface CloudState {
  initialSyncDone: boolean;
  syncedCols: Record<string, boolean>;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncedAt: string | null;
  catchesCount: number;
  sessionsCount: number;
}

export const cloudState: CloudState = {
  initialSyncDone: false,
  syncedCols: {},
  syncStatus: 'idle',
  syncError: null,
  lastSyncedAt: null,
  catchesCount: 0,
  sessionsCount: 0,
};

type CloudSubscriber = (state: CloudState) => void;
const stateSubscribers = new Set<CloudSubscriber>();
const dataChangeSubscribers = new Set<() => void>();
const settingsChangeSubscribers = new Set<(settings: CloudSettings) => void>();

let unsubListeners: Unsubscribe[] = [];
let _suppressCloudSync = false;
let _syncTimer: ReturnType<typeof setTimeout> | null = null;

function notifyCloudState(): void {
  const snapshot: CloudState = {
    ...cloudState,
    syncedCols: { ...cloudState.syncedCols },
  };
  stateSubscribers.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {
      // ignore subscriber error
    }
  });
}

function notifyLocalDataChanged(): void {
  dataChangeSubscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore subscriber error
    }
  });
}

function notifySettingsChanged(settings: CloudSettings): void {
  settingsChangeSubscribers.forEach((cb) => {
    try {
      cb(settings);
    } catch {
      // ignore subscriber error
    }
  });
}

export function subscribeCloudState(cb: CloudSubscriber): () => void {
  stateSubscribers.add(cb);
  cb({ ...cloudState, syncedCols: { ...cloudState.syncedCols } });
  return () => {
    stateSubscribers.delete(cb);
  };
}

export function subscribeLocalDataChange(cb: () => void): () => void {
  dataChangeSubscribers.add(cb);
  return () => {
    dataChangeSubscribers.delete(cb);
  };
}

export function subscribeSettingsChange(cb: (settings: CloudSettings) => void): () => void {
  settingsChangeSubscribers.add(cb);
  return () => {
    settingsChangeSubscribers.delete(cb);
  };
}

export function loadLocalSettings(): CloudSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CloudSettings>;
      const env = parsed.environment === 'freshwater' ? 'freshwater' : 'sea';
      const facade: FacadeCode =
        parsed.selectedFacade && ['NAMO', 'MEMN', 'SA', 'MED'].includes(parsed.selectedFacade)
          ? parsed.selectedFacade
          : 'NAMO';
      return {
        environment: env,
        selectedFacade: facade,
        updatedAt: parsed.updatedAt,
      };
    }
  } catch {
    // ignore localStorage error
  }
  return { environment: 'sea', selectedFacade: 'NAMO' };
}

export function saveLocalSettings(settings: CloudSettings, skipCloud = false): void {
  try {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        environment: settings.environment,
        selectedFacade: settings.selectedFacade,
        updatedAt: settings.updatedAt ?? new Date().toISOString(),
      }),
    );
  } catch {
    // ignore localStorage error
  }
  if (!skipCloud) {
    planifierPushCloud();
  }
}

export function arreterListenersFirestore(): void {
  unsubListeners.forEach((unsub) => {
    try {
      unsub();
    } catch {
      // ignore
    }
  });
  unsubListeners = [];
  if (_syncTimer) {
    clearTimeout(_syncTimer);
    _syncTimer = null;
  }
}

export function reinitialiserEtatCloud(): void {
  arreterListenersFirestore();
  cloudState.initialSyncDone = false;
  cloudState.syncedCols = {};
  cloudState.syncStatus = 'idle';
  cloudState.syncError = null;
  cloudState.lastSyncedAt = null;
  notifyCloudState();
}

export function cleanForFirestore<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_k, v) => (v === undefined ? null : v)),
  ) as T;
}

/**
 * Prépare une prise pour Firestore sans inclure de binaire/photo base64 (reste en local dans IndexedDB).
 */
function sanitizeCatchForFirestore(entry: CatchEntry): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  return cleanForFirestore({
    id: String(entry.id),
    speciesId: entry.speciesId ?? null,
    speciesName: String(entry.speciesName),
    environment: entry.environment === 'freshwater' ? 'freshwater' : 'sea',
    sizeCm: typeof entry.sizeCm === 'number' ? entry.sizeCm : null,
    weightG: typeof entry.weightG === 'number' ? entry.weightG : null,
    released: Boolean(entry.released),
    date: String(entry.date),
    lat: typeof entry.lat === 'number' ? entry.lat : null,
    lng: typeof entry.lng === 'number' ? entry.lng : null,
    locationLabel: entry.locationLabel ?? null,
    hasLocalPhoto: Boolean(entry.photoDataUrl),
    notes: entry.notes ?? null,
    createdAt: entry.date || nowIso,
    updatedAt: nowIso,
  });
}

/**
 * Prépare une session de pêche pour Firestore (limite les points si très nombreux pour garantir < 1 Mo/doc).
 */
function sanitizeSessionForFirestore(session: FishingSession): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const rawPoints = Array.isArray(session.points) ? session.points : [];
  const maxPoints = 2500;
  const step = rawPoints.length > maxPoints ? Math.ceil(rawPoints.length / maxPoints) : 1;
  const points = (step > 1 ? rawPoints.filter((_p, idx) => idx % step === 0) : rawPoints).map(
    (pt) => ({
      lat: Number(pt.lat),
      lng: Number(pt.lng),
      timestamp: String(pt.timestamp),
      accuracy: typeof pt.accuracy === 'number' ? pt.accuracy : null,
    }),
  );

  return cleanForFirestore({
    id: String(session.id),
    name: session.name ?? 'Session de pêche',
    date: session.date ?? session.startedAt.slice(0, 10),
    startedAt: String(session.startedAt),
    endedAt: session.endedAt ?? null,
    status: session.status,
    environment: session.environment === 'freshwater' ? 'freshwater' : 'sea',
    points,
    distanceKm: Number(session.distanceKm || 0),
    createdAt: session.startedAt || nowIso,
    updatedAt: nowIso,
  });
}

function normalizeCatchFromFirestore(raw: Record<string, unknown>, localExisting?: CatchEntry): CatchEntry | null {
  const source = (raw.payload && typeof raw.payload === 'object' ? raw.payload : raw) as Record<string, unknown>;
  if (!source.id || !source.speciesName || !source.date) return null;
  return {
    id: String(source.id),
    speciesId: typeof source.speciesId === 'string' ? source.speciesId : undefined,
    speciesName: String(source.speciesName),
    environment: source.environment === 'freshwater' ? 'freshwater' : 'sea',
    sizeCm: typeof source.sizeCm === 'number' ? source.sizeCm : undefined,
    weightG: typeof source.weightG === 'number' ? source.weightG : undefined,
    released: Boolean(source.released),
    date: String(source.date),
    lat: typeof source.lat === 'number' ? source.lat : undefined,
    lng: typeof source.lng === 'number' ? source.lng : undefined,
    locationLabel: typeof source.locationLabel === 'string' ? source.locationLabel : undefined,
    // Conserver la photo locale en IndexedDB si elle existe déjà sur cet appareil
    photoDataUrl: localExisting?.photoDataUrl,
    notes: typeof source.notes === 'string' ? source.notes : undefined,
  };
}

function normalizeSessionFromFirestore(raw: Record<string, unknown>): FishingSession | null {
  const source = (raw.payload && typeof raw.payload === 'object' ? raw.payload : raw) as Record<string, unknown>;
  if (!source.id || !source.startedAt) return null;
  const rawPts = Array.isArray(source.points) ? source.points : [];
  return {
    id: String(source.id),
    name: typeof source.name === 'string' ? source.name : undefined,
    date: typeof source.date === 'string' ? source.date : String(source.startedAt).slice(0, 10),
    startedAt: String(source.startedAt),
    endedAt: typeof source.endedAt === 'string' ? source.endedAt : undefined,
    status:
      source.status === 'active' || source.status === 'paused' || source.status === 'completed'
        ? source.status
        : 'completed',
    environment: source.environment === 'freshwater' ? 'freshwater' : 'sea',
    points: rawPts
      .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
      .map((p) => ({
        lat: Number(p.lat),
        lng: Number(p.lng),
        timestamp: String(p.timestamp ?? ''),
        accuracy: typeof p.accuracy === 'number' ? p.accuracy : undefined,
      })),
    distanceKm: typeof source.distanceKm === 'number' ? source.distanceKm : 0,
  };
}

async function replaceLocalStore<T extends { id: string }>(
  storeName: typeof CATCHES_STORE | typeof SESSIONS_STORE,
  items: T[],
): Promise<void> {
  const localDb = await getDb();
  const tx = localDb.transaction(storeName, 'readwrite');
  await tx.store.clear();
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
}

async function updateLocalCounts(): Promise<void> {
  try {
    const localDb = await getDb();
    cloudState.catchesCount = await localDb.count(CATCHES_STORE);
    cloudState.sessionsCount = await localDb.count(SESSIONS_STORE);
  } catch {
    // ignore
  }
}

type BatchOp =
  | { type: 'set'; ref: DocumentReference<DocumentData>; data: Record<string, unknown> }
  | { type: 'delete'; ref: DocumentReference<DocumentData> };

async function commitInChunks(ops: BatchOp[]): Promise<void> {
  const db = getFirebaseDb();
  if (!db || ops.length === 0) return;
  const CHUNK_SIZE = 450;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const slice = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of slice) {
      if (op.type === 'set') {
        batch.set(op.ref, op.data);
      } else {
        batch.delete(op.ref);
      }
    }
    await batch.commit();
  }
}

export async function syncAllUserDataToFirestore(): Promise<void> {
  const db = getFirebaseDb();
  const user = getFirebaseUser();
  if (!db || !user) return;

  const uid = user.uid;
  const localDb = await getDb();
  const localCatches = ((await localDb.getAll(CATCHES_STORE)) as CatchEntry[]).filter(
    (c) => c && c.id,
  );
  const localSessions = ((await localDb.getAll(SESSIONS_STORE)) as FishingSession[]).filter(
    (s) => s && s.id && s.status !== 'active',
  );

  // 1. Collection catches
  const catchesColRef = collection(db, 'peche_users', uid, 'catches');
  const existingCatchesSnap = await getDocs(catchesColRef);
  const currentCatchIds = new Set(localCatches.map((c) => String(c.id)));
  const catchOps: BatchOp[] = [];

  existingCatchesSnap.docs.forEach((d) => {
    if (!currentCatchIds.has(d.id)) {
      catchOps.push({ type: 'delete', ref: d.ref });
    }
  });
  localCatches.forEach((item) => {
    const docId = String(item.id);
    catchOps.push({
      type: 'set',
      ref: doc(catchesColRef, docId),
      data: sanitizeCatchForFirestore(item),
    });
  });
  await commitInChunks(catchOps);

  // 2. Collection sessions
  const sessionsColRef = collection(db, 'peche_users', uid, 'sessions');
  const existingSessionsSnap = await getDocs(sessionsColRef);
  const currentSessionIds = new Set(localSessions.map((s) => String(s.id)));
  const sessionOps: BatchOp[] = [];

  existingSessionsSnap.docs.forEach((d) => {
    if (!currentSessionIds.has(d.id)) {
      sessionOps.push({ type: 'delete', ref: d.ref });
    }
  });
  localSessions.forEach((item) => {
    const docId = String(item.id);
    sessionOps.push({
      type: 'set',
      ref: doc(sessionsColRef, docId),
      data: sanitizeSessionForFirestore(item),
    });
  });
  await commitInChunks(sessionOps);

  // 3. Settings doc (peche_users/{uid}/settings/main)
  const settings = loadLocalSettings();
  await setDoc(
    doc(db, 'peche_users', uid, 'settings', 'main'),
    cleanForFirestore({
      id: 'main',
      environment: settings.environment,
      selectedFacade: settings.selectedFacade,
      updatedAt: new Date().toISOString(),
    }),
  );

  cloudState.catchesCount = localCatches.length;
  cloudState.sessionsCount = localSessions.length;
}

export function planifierPushCloud(skipCloud = false): void {
  updateLocalCounts().then(notifyCloudState).catch(() => {});
  if (skipCloud || _suppressCloudSync || !estConnecteFirebase() || !cloudState.initialSyncDone) {
    return;
  }
  if (_syncTimer) {
    clearTimeout(_syncTimer);
  }
  cloudState.syncStatus = 'syncing';
  cloudState.syncError = null;
  notifyCloudState();

  _syncTimer = setTimeout(async () => {
    try {
      await syncAllUserDataToFirestore();
      cloudState.syncStatus = 'synced';
      cloudState.lastSyncedAt = new Date().toISOString();
      notifyCloudState();
    } catch (err) {
      console.warn('Sync Firestore:', err);
      cloudState.syncStatus = 'error';
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'permission-denied' || code === 'firestore/permission-denied') {
        cloudState.syncError =
          'Accès Firestore refusé (vérifiez que votre e-mail est bien vérifié et autorisé).';
      } else {
        cloudState.syncError =
          err instanceof Error ? err.message : 'Erreur de synchronisation Firestore';
      }
      notifyCloudState();
    }
  }, 450);
}

export async function activerSyncCloud(): Promise<void> {
  const db = getFirebaseDb();
  const user = getFirebaseUser();
  if (!db || !user) return;

  reinitialiserEtatCloud();
  cloudState.syncStatus = 'syncing';
  await updateLocalCounts();
  notifyCloudState();

  const currentUid = user.uid;
  const previousUid = localStorage.getItem(LAST_UID_KEY);
  const isNewDeviceLogin = Boolean(currentUid && previousUid !== currentUid);
  let needsPushAfterInit = false;

  const handleSyncError = (label: string, err: unknown) => {
    console.warn(`Sync ${label}:`, err);
    cloudState.syncStatus = 'error';
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
    if (code === 'permission-denied' || code === 'firestore/permission-denied') {
      cloudState.syncError =
        'Accès Firestore refusé (vérifiez que votre e-mail est bien vérifié et autorisé).';
    } else {
      cloudState.syncError =
        err instanceof Error ? err.message : 'Erreur de synchronisation Firestore';
    }
    notifyCloudState();
  };

  const checkAllInitialSynced = () => {
    if (
      cloudState.syncedCols.catches &&
      cloudState.syncedCols.sessions &&
      !cloudState.initialSyncDone
    ) {
      cloudState.initialSyncDone = true;
      cloudState.syncStatus = 'synced';
      cloudState.lastSyncedAt = new Date().toISOString();
      localStorage.setItem(LAST_UID_KEY, currentUid);
      notifyCloudState();
      if (needsPushAfterInit) {
        needsPushAfterInit = false;
        planifierPushCloud(false);
      }
    }
  };

  // 1. Listener temps réel sur catches
  unsubListeners.push(
    onSnapshot(
      collection(db, 'peche_users', currentUid, 'catches'),
      async (snap) => {
        const fromCache = snap.metadata.fromCache;
        if (fromCache && snap.docs.length === 0) {
          return;
        }

        const localDb = await getDb();
        const localCatches = (await localDb.getAll(CATCHES_STORE)) as CatchEntry[];
        const localById = new Map(localCatches.map((c) => [String(c.id), c]));

        const serverList: CatchEntry[] = [];
        for (const d of snap.docs) {
          const item = normalizeCatchFromFirestore(
            { ...d.data(), id: d.id },
            localById.get(d.id),
          );
          if (item) serverList.push(item);
        }

        const isFirstServerForCol = !fromCache && !cloudState.syncedCols.catches;

        if (isFirstServerForCol) {
          cloudState.syncedCols.catches = true;

          if (serverList.length === 0 && localCatches.length > 0) {
            needsPushAfterInit = true;
          } else if (serverList.length > 0 && localCatches.length > 0 && isNewDeviceLogin) {
            const serverIds = new Set(serverList.map((i) => String(i.id)));
            const localOnly = localCatches.filter(
              (i) => i && i.id && !serverIds.has(String(i.id)),
            );
            const merged = [...serverList, ...localOnly];
            _suppressCloudSync = true;
            await replaceLocalStore(CATCHES_STORE, merged);
            _suppressCloudSync = false;
            if (localOnly.length > 0) {
              needsPushAfterInit = true;
            }
          } else {
            _suppressCloudSync = true;
            await replaceLocalStore(CATCHES_STORE, serverList);
            _suppressCloudSync = false;
          }

          await updateLocalCounts();
          checkAllInitialSynced();
        } else {
          _suppressCloudSync = true;
          await replaceLocalStore(CATCHES_STORE, serverList);
          _suppressCloudSync = false;
          await updateLocalCounts();
          notifyCloudState();
        }

        notifyLocalDataChanged();
      },
      (err) => handleSyncError('catches', err),
    ),
  );

  // 2. Listener temps réel sur sessions
  unsubListeners.push(
    onSnapshot(
      collection(db, 'peche_users', currentUid, 'sessions'),
      async (snap) => {
        const fromCache = snap.metadata.fromCache;
        if (fromCache && snap.docs.length === 0) {
          return;
        }

        const localDb = await getDb();
        const localSessions = (await localDb.getAll(SESSIONS_STORE)) as FishingSession[];
        const activeLocal = localSessions.filter((s) => s.status === 'active');
        const finishedLocal = localSessions.filter((s) => s.status !== 'active');

        const serverList: FishingSession[] = [];
        for (const d of snap.docs) {
          const item = normalizeSessionFromFirestore({ ...d.data(), id: d.id });
          if (item) serverList.push(item);
        }

        const isFirstServerForCol = !fromCache && !cloudState.syncedCols.sessions;

        if (isFirstServerForCol) {
          cloudState.syncedCols.sessions = true;

          if (serverList.length === 0 && finishedLocal.length > 0) {
            needsPushAfterInit = true;
          } else if (serverList.length > 0 && finishedLocal.length > 0 && isNewDeviceLogin) {
            const serverIds = new Set(serverList.map((i) => String(i.id)));
            const localOnly = finishedLocal.filter(
              (i) => i && i.id && !serverIds.has(String(i.id)),
            );
            const merged = [...serverList, ...localOnly, ...activeLocal];
            _suppressCloudSync = true;
            await replaceLocalStore(SESSIONS_STORE, merged);
            _suppressCloudSync = false;
            if (localOnly.length > 0) {
              needsPushAfterInit = true;
            }
          } else {
            _suppressCloudSync = true;
            await replaceLocalStore(SESSIONS_STORE, [...serverList, ...activeLocal]);
            _suppressCloudSync = false;
          }

          await updateLocalCounts();
          checkAllInitialSynced();
        } else {
          _suppressCloudSync = true;
          await replaceLocalStore(SESSIONS_STORE, [...serverList, ...activeLocal]);
          _suppressCloudSync = false;
          await updateLocalCounts();
          notifyCloudState();
        }

        notifyLocalDataChanged();
      },
      (err) => handleSyncError('sessions', err),
    ),
  );

  // 3. Listener temps réel sur settings/main
  unsubListeners.push(
    onSnapshot(
      doc(db, 'peche_users', currentUid, 'settings', 'main'),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Partial<CloudSettings>;
        const nextSettings: CloudSettings = {
          environment: data.environment === 'freshwater' ? 'freshwater' : 'sea',
          selectedFacade:
            data.selectedFacade && ['NAMO', 'MEMN', 'SA', 'MED'].includes(data.selectedFacade)
              ? data.selectedFacade
              : 'NAMO',
          updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
        };
        _suppressCloudSync = true;
        saveLocalSettings(nextSettings, true);
        _suppressCloudSync = false;
        notifySettingsChanged(nextSettings);
      },
      (err) => handleSyncError('settings', err),
    ),
  );
}

export async function forcerSyncCloud(): Promise<boolean> {
  if (!estConnecteFirebase()) {
    throw new Error('Non connecté au Cloud.');
  }
  cloudState.syncStatus = 'syncing';
  cloudState.syncError = null;
  notifyCloudState();
  try {
    await syncAllUserDataToFirestore();
    cloudState.initialSyncDone = true;
    cloudState.syncStatus = 'synced';
    cloudState.lastSyncedAt = new Date().toISOString();
    const user = getFirebaseUser();
    if (user?.uid) {
      localStorage.setItem(LAST_UID_KEY, user.uid);
    }
    notifyCloudState();
    return true;
  } catch (err) {
    cloudState.syncStatus = 'error';
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
    if (code === 'permission-denied' || code === 'firestore/permission-denied') {
      cloudState.syncError =
        'Accès Firestore refusé (vérifiez que votre e-mail est bien vérifié et autorisé).';
    } else {
      cloudState.syncError =
        err instanceof Error ? err.message : 'Erreur de synchronisation Firestore';
    }
    notifyCloudState();
    throw err;
  }
}
