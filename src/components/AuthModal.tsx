import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  Cloud,
  LogOut,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  formatAuthError,
  reloadFirebaseUser,
  resendVerificationEmail,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  signUpWithEmail,
} from '../services/firebase';
import {
  activerSyncCloud,
  forcerSyncCloud,
  reinitialiserEtatCloud,
  type CloudState,
} from '../services/cloudSync';

interface AuthModalProps {
  open: boolean;
  user: User | null;
  cloud: CloudState;
  onClose: () => void;
  onUserUpdated: (user: User | null) => void;
}

export function AuthModal({
  open,
  user,
  cloud,
  onClose,
  onUserUpdated,
}: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverifiedMsg, setUnverifiedMsg] = useState<string>(
    'Vérifiez votre boîte mail (ou utilisez « Continuer avec Google »).',
  );

  if (!open) return null;

  const handleGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailAuth = async (isRegister: boolean) => {
    if (!email.trim() || !password) {
      setError('Veuillez saisir votre e-mail et votre mot de passe.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isRegister) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      onClose();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleEmailAuth(false);
  };

  const handleResendVerification = async () => {
    setBusy(true);
    try {
      const sent = await resendVerificationEmail();
      setUnverifiedMsg(
        sent
          ? "E-mail de vérification envoyé ! Vérifiez votre boîte de réception (et les spams), puis cliquez sur « J'ai vérifié »."
          : 'Votre adresse est déjà vérifiée.',
      );
    } catch (err) {
      setUnverifiedMsg(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckVerification = async () => {
    setBusy(true);
    try {
      const refreshed = await reloadFirebaseUser();
      if (refreshed?.emailVerified) {
        await refreshed.getIdToken(true);
        onUserUpdated(refreshed);
        await activerSyncCloud();
      } else {
        setUnverifiedMsg(
          "Adresse toujours non vérifiée. Cliquez d'abord sur le lien reçu par e-mail.",
        );
      }
    } catch (err) {
      setUnverifiedMsg(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSyncNow = async () => {
    setBusy(true);
    setError(null);
    try {
      await forcerSyncCloud();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (!window.confirm('Se déconnecter du compte Cloud ?')) return;
    setBusy(true);
    setError(null);
    try {
      await signOutUser();
      reinitialiserEtatCloud();
      onUserUpdated(null);
      onClose();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const totalSyncedItems = (cloud.catchesCount || 0) + (cloud.sessionsCount || 0);
  const statusLabel = (() => {
    if (cloud.syncStatus === 'syncing') return 'Synchronisation en cours…';
    if (cloud.syncStatus === 'error') return 'Erreur de synchronisation';
    if (cloud.initialSyncDone || cloud.syncStatus === 'synced') {
      return `Synchronisé (${totalSyncedItems} élément${totalSyncedItems > 1 ? 's' : ''})`;
    }
    return 'Connexion au Cloud…';
  })();

  const statusColor = (() => {
    if (cloud.syncStatus === 'syncing') return '#d97706';
    if (cloud.syncStatus === 'error') return '#dc2626';
    if (cloud.initialSyncDone || cloud.syncStatus === 'synced') return '#059669';
    return 'var(--muted)';
  })();

  return (
    <div
      className="auth-modal-backdrop"
      id="modal-auth"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={onClose}
    >
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-head">
          <h2 id="auth-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cloud size={20} color="var(--ocean)" />
            <span>Compte Cloud Pêche France</span>
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
          <div className="auth-account-body" id="auth-logged-in-panel">
            <div className="auth-user-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <span style={{ fontSize: '0.73rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                Connecté en tant que
              </span>
              <strong id="auth-connected-email" style={{ fontSize: '0.94rem', wordBreak: 'break-all' }}>
                {user.email || user.displayName || user.uid}
              </strong>
              <span
                id="auth-sync-status"
                style={{ fontSize: '0.8rem', fontWeight: 600, color: statusColor, marginTop: 4 }}
              >
                {statusLabel}
              </span>
            </div>

            {(cloud.syncError || error) && (
              <p className="auth-error-msg" id="auth-sync-error-msg">
                {cloud.syncError || error}
              </p>
            )}

            {!user.emailVerified && (
              <div
                id="auth-unverified-box"
                className="auth-alert auth-alert-warn"
                style={{ flexDirection: 'column', gap: 8 }}
              >
                <div style={{ fontWeight: 700, color: '#b45309' }}>
                  Adresse e-mail non vérifiée
                </div>
                <div id="auth-unverified-msg" style={{ fontSize: '0.8rem', color: '#78350f' }}>
                  {unverifiedMsg}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    id="btn-resend-verif"
                    className="auth-secondary-btn"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem' }}
                    disabled={busy}
                    onClick={handleResendVerification}
                  >
                    Renvoyer l&apos;e-mail de vérification
                  </button>
                  <button
                    type="button"
                    id="btn-check-verif"
                    className="auth-primary-btn"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem' }}
                    disabled={busy}
                    onClick={handleCheckVerification}
                  >
                    J&apos;ai vérifié
                  </button>
                </div>
              </div>
            )}

            <div className="auth-actions">
              <button
                type="button"
                id="btn-force-sync"
                className="auth-primary-btn"
                disabled={cloud.syncStatus === 'syncing' || busy}
                onClick={handleSyncNow}
              >
                <RefreshCw
                  size={15}
                  className={cloud.syncStatus === 'syncing' ? 'spin' : ''}
                />
                <span>Synchroniser maintenant</span>
              </button>
              <button
                type="button"
                className="auth-secondary-btn"
                style={{ color: '#dc2626', borderColor: 'rgba(220, 38, 38, 0.25)' }}
                disabled={busy}
                onClick={handleSignOut}
              >
                <LogOut size={15} />
                <span>Se déconnecter</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="auth-login-body" id="auth-logged-out-panel">
            <p className="auth-intro">
              Connectez-vous pour synchroniser votre carnet de prises et vos tracés
              GPS entre tous vos appareils. Les cartes et réglementations restent
              disponibles hors-ligne.
            </p>

            <form className="auth-form" onSubmit={handleFormSubmit}>
              <label className="auth-field">
                <span>Email</span>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom@exemple.fr"
                />
              </label>

              <label className="auth-field">
                <span>Mot de passe (6 car. min)</span>
                <input
                  id="auth-password"
                  type="password"
                  minLength={6}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>

              {error && (
                <p className="auth-error-msg" id="auth-error-msg">
                  {error}
                </p>
              )}

              <div className="auth-actions">
                <button
                  type="submit"
                  className="auth-primary-btn"
                  disabled={busy}
                >
                  Se connecter
                </button>
                <button
                  type="button"
                  className="auth-secondary-btn"
                  disabled={busy}
                  onClick={() => handleEmailAuth(true)}
                >
                  Créer un compte
                </button>
                <button
                  type="button"
                  className="auth-google-btn"
                  disabled={busy}
                  onClick={handleGoogle}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  <span>Continuer avec Google</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
