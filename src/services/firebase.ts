import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCuYM0tMpd1f1jDYz27OhCaPpcAWhI3i48',
  authDomain: 'quentin-apps-hub.firebaseapp.com',
  projectId: 'quentin-apps-hub',
  storageBucket: 'quentin-apps-hub.firebasestorage.app',
  messagingSenderId: '249016348389',
  appId: '1:249016348389:web:47308355f098df469cee0c',
};

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let currentUser: User | null = null;
let initTried = false;

export function isFirebaseSupportedEnv(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol === 'file:') return false;
  return true;
}

export function initFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } | null {
  if (appInstance && authInstance && dbInstance) {
    return { app: appInstance, auth: authInstance, db: dbInstance };
  }
  if (initTried) return null;
  initTried = true;

  if (!isFirebaseSupportedEnv()) {
    return null;
  }

  try {
    const existing = getApps();
    appInstance = existing.length > 0 ? existing[0] : initializeApp(FIREBASE_CONFIG);

    const appCheckSiteKey =
      (import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY as string | undefined) ||
      '6LfRaysuAAAAACpC4hKbGG5Bjpr3Ifr1CyUSlmRe';
    if (appCheckSiteKey) {
      try {
        initializeAppCheck(appInstance, {
          provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
          isTokenAutoRefreshEnabled: true,
        });
      } catch {
        // Ignorer en local si AppCheck échoue
      }
    }

    authInstance = getAuth(appInstance);
    authInstance.languageCode = 'fr';

    try {
      dbInstance = initializeFirestore(appInstance, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
        ignoreUndefinedProperties: true,
      });
    } catch {
      dbInstance = getFirestore(appInstance);
    }

    return { app: appInstance, auth: authInstance, db: dbInstance };
  } catch (err) {
    console.warn('Firebase SDK indisponible (mode hors-ligne local):', err);
    appInstance = null;
    authInstance = null;
    dbInstance = null;
    return null;
  }
}

export function getFirebaseApp(): FirebaseApp {
  const inst = initFirebase();
  if (!inst) {
    const existing = getApps();
    return existing.length > 0 ? existing[0] : initializeApp(FIREBASE_CONFIG);
  }
  return inst.app;
}

export function getFirebaseAuth(): Auth | null {
  return initFirebase()?.auth ?? null;
}

export function getFirebaseDb(): Firestore | null {
  return initFirebase()?.db ?? null;
}

export function getFirebaseUser(): User | null {
  return currentUser ?? authInstance?.currentUser ?? null;
}

export function estConnecteFirebase(): boolean {
  return Boolean(getFirebaseUser());
}

export function observerAuth(onUserChanged: (user: User | null) => void): () => void {
  const inst = initFirebase();
  if (!inst) {
    currentUser = null;
    onUserChanged(null);
    return () => {};
  }
  return onAuthStateChanged(inst.auth, (user) => {
    currentUser = user ?? null;
    onUserChanged(currentUser);
  });
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle(): Promise<User> {
  const inst = initFirebase();
  if (!inst) throw new Error('Firebase indisponible hors-ligne.');
  const cred = await signInWithPopup(inst.auth, googleProvider);
  currentUser = cred.user;
  return cred.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const inst = initFirebase();
  if (!inst) throw new Error('Firebase indisponible hors-ligne.');
  const cred = await signInWithEmailAndPassword(inst.auth, email.trim(), password);
  currentUser = cred.user;
  return cred.user;
}

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const inst = initFirebase();
  if (!inst) throw new Error('Firebase indisponible hors-ligne.');
  const cred = await createUserWithEmailAndPassword(inst.auth, email.trim(), password);
  currentUser = cred.user;
  if (cred.user) {
    sendEmailVerification(cred.user).catch(() => {});
  }
  return cred.user;
}

export async function resendVerificationEmail(): Promise<boolean> {
  const inst = initFirebase();
  const user = inst?.auth.currentUser;
  if (!inst || !user) throw new Error('Aucun utilisateur connecté.');
  if (user.emailVerified) return false;
  await sendEmailVerification(user);
  return true;
}

export async function reloadFirebaseUser(): Promise<User | null> {
  const inst = initFirebase();
  const user = inst?.auth.currentUser;
  if (!inst || !user) return null;
  await user.reload();
  currentUser = inst.auth.currentUser;
  return currentUser;
}

export async function signOutUser(): Promise<void> {
  const inst = initFirebase();
  if (!inst) return;
  await signOut(inst.auth);
  currentUser = null;
}

export function formatAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return 'Accès Firestore refusé (vérifiez que votre e-mail est bien vérifié et autorisé).';
  }
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
      return 'Trop de tentatives. Réessayez dans quelques minutes.';
    case 'auth/popup-closed-by-user':
      return 'Fenêtre de connexion fermée avant la fin.';
    case 'auth/popup-blocked':
      return 'La fenêtre Google a été bloquée par le navigateur.';
    case 'auth/network-request-failed':
      return 'Impossible de joindre le serveur (mode hors-ligne ?).';
    default:
      return err instanceof Error ? err.message : 'Erreur de connexion inconnue.';
  }
}
