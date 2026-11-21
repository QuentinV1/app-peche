import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  Cloud,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  formatAuthError,
  resendVerificationEmail,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  signUpWithEmail,
} from '../services/firebase';

interface AuthModalProps {
  open: boolean;
  user: User | null;
  syncing: boolean;
  syncMessage: string | null;
  syncError: string | null;
  onClose: () => void;
  onSyncNow: () => Promise<void>;
}

export function AuthModal({
  open,
  user,
  syncing,
  syncMessage,
  syncError,
  onClose,
  onSyncNow,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!open) return null;

  const handleGoogle = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
        onClose();
      } else {
        await signUpWithEmail(email, password);
        setInfo(
          'Compte créé ! Un e-mail de vérification vient d’être envoyé. Valide ton adresse puis reconnecte-toi.',
        );
      }
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await resendVerificationEmail(user);
      setInfo('E-mail de vérification renvoyé. Vérifie ta boîte de réception.');
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOutUser();
      onClose();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="auth-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={onClose}
    >
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-head">
          <h2 id="auth-modal-title">
            {user ? 'Compte & Synchronisation' : 'Connexion Pêche France'}
          </h2>
          <button
            type="button"
            className="auth-close-btn"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {user ? (
          <div className="auth-account-body">
            <div className="auth-user-card">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="auth-avatar"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="auth-avatar auth-avatar-fallback">
                  {(user.displayName ?? user.email ?? 'P')[0].toUpperCase()}
                </div>
              )}
              <div className="auth-user-meta">
                <strong>{user.displayName || 'Pêcheur'}</strong>
                <span>{user.email}</span>
              </div>
            </div>

            {!user.emailVerified ? (
              <div className="auth-alert auth-alert-warn">
                <ShieldAlert size={16} />
                <div>
                  <strong>E-mail non vérifié.</strong>
                  <p>
                    La synchronisation cloud nécessite une adresse e-mail vérifiée.
                  </p>
                  <button
                    type="button"
                    className="auth-link-btn"
                    disabled={busy}
                    onClick={handleResendVerification}
                  >
                    Renvoyer l’e-mail de vérification
                  </button>
                </div>
              </div>
            ) : (
              <div className="auth-alert auth-alert-ok">
                <CheckCircle2 size={16} />
                <div>
                  <strong>Synchronisation cloud active</strong>
                  <p>
                    Carnet de prises et tracés GPS synchronisés sur{' '}
                    <code>quentin-apps-hub</code>.
                  </p>
                </div>
              </div>
            )}

            {syncMessage && <p className="auth-status-msg">{syncMessage}</p>}
            {(syncError || error) && (
              <p className="auth-error-msg">{syncError || error}</p>
            )}
            {info && <p className="auth-info-msg">{info}</p>}

            <div className="auth-actions">
              {user.emailVerified && (
                <button
                  type="button"
                  className="auth-primary-btn"
                  disabled={syncing || busy}
                  onClick={onSyncNow}
                >
                  <RefreshCw size={15} className={syncing ? 'spin' : ''} />
                  {syncing ? 'Synchronisation...' : 'Synchroniser maintenant'}
                </button>
              )}
              <button
                type="button"
                className="auth-secondary-btn"
                disabled={busy}
                onClick={handleSignOut}
              >
                <LogOut size={15} />
                Se déconnecter
              </button>
            </div>
          </div>
        ) : (
          <div className="auth-login-body">
            <p className="auth-intro">
              Connecte-toi pour sauvegarder et synchroniser ton carnet de prises et tes
              tracés GPS entre tes appareils. Les cartes et réglementations restent
              disponibles hors-ligne.
            </p>

            <button
              type="button"
              className="auth-google-btn"
              disabled={busy}
              onClick={handleGoogle}
            >
              <Cloud size={16} />
              Continuer avec Google
            </button>

            <div className="auth-divider">
              <span>ou par e-mail</span>
            </div>

            <form className="auth-form" onSubmit={handleEmailSubmit}>
              <label className="auth-field">
                <span>Adresse e-mail</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom.nom@exemple.fr"
                />
              </label>

              <label className="auth-field">
                <span>Mot de passe</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>

              {error && <p className="auth-error-msg">{error}</p>}
              {info && <p className="auth-info-msg">{info}</p>}

              <button type="submit" className="auth-primary-btn" disabled={busy}>
                <Mail size={15} />
                {busy
                  ? 'Connexion...'
                  : mode === 'login'
                    ? 'Se connecter'
                    : 'Créer un compte'}
              </button>
            </form>

            <button
              type="button"
              className="auth-switch-mode"
              onClick={() => {
                setMode((m) => (m === 'login' ? 'signup' : 'login'));
                setError(null);
                setInfo(null);
              }}
            >
              {mode === 'login'
                ? 'Pas encore de compte ? Créer un compte'
                : 'Déjà un compte ? Se connecter'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
