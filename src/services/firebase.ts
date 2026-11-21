import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

const QUENTIN_HUB_CONFIG = {
  apiKey: 'AIzaSyCuYM0tMpd1f1jDYz27OhCaPpcAWhI3i48',
  authDomain: 'quentin-apps-hub.firebaseapp.com',
  projectId: 'quentin-apps-hub',
  storageBucket: 'quentin-apps-hub.firebasestorage.app',
  messagingSenderId: '249016348389',
  appId: '1:249016348389:web:47308355f098df469cee0c',
};

let appInstance: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!appInstance) {
    const existing = getApps();
    appInstance = existing.length > 0 ? existing[0] : initializeApp(QUENTIN_HUB_CONFIG);
    const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY as string | undefined;
    if (appCheckSiteKey && typeof window !== 'undefined') {
      initializeAppCheck(appInstance, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
  }
  return appInstance;
}

export const app = getFirebaseApp();
export const auth = getAuth(app);
auth.languageCode = 'fr';

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function resendVerificationEmail(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

/**
 * Initialise le profil utilisateur (`users/{uid}`) et le carnet personnel
 * (`peche_journals/{uid}`) dans Firestore selon les règles de `quentin-apps-hub`.
 */
export async function ensureUserJournal(user: User): Promise<void> {
  if (!user.emailVerified) return;

  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      photoURL: user.photoURL ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(
      userRef,
      {
        email: user.email ?? '',
        displayName: user.displayName ?? '',
        photoURL: user.photoURL ?? '',
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  const journalRef = doc(db, 'peche_journals', user.uid);
  const journalSnap = await getDoc(journalRef);
  if (!journalSnap.exists()) {
    await setDoc(journalRef, {
      ownerUid: user.uid,
      memberUids: [user.uid],
      name: 'Mon carnet Pêche France',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export function formatAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Adresse e-mail invalide.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou mot de passe incorrect.';
    case 'auth/email-already-in-use':
      return 'Un compte existe déjà avec cet e-mail.';
    case 'auth/weak-password':
      return 'Le mot de passe doit contenir au moins 6 caractères.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessaie dans quelques minutes.';
    case 'auth/popup-closed-by-user':
      return 'Fenêtre de connexion fermée avant la fin.';
    case 'auth/popup-blocked':
      return 'La fenêtre Google a été bloquée par le navigateur.';
    case 'auth/network-request-failed':
      return 'Impossible de joindre le serveur (mode hors-ligne ?).';
    case 'permission-denied':
      return 'Accès refusé : vérifie que ton e-mail est validé et autorisé sur quentin-apps-hub.';
    default:
      return err instanceof Error ? err.message : 'Erreur de connexion inconnue.';
  }
}
