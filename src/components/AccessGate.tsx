import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { Cloud, Loader2, LogOut, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import {
  formatAuthError,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '../services/firebase';
import type { AccessStatus } from '../services/accessControl';

export type AccessGateState =
  | { phase: 'loading' }
  | { phase: 'unauthenticated' }
  | { phase: 'authorized'; status: AccessStatus; offline: boolean }
  | { phase: 'unauthorized'; email: string }
  | { phase: 'offline_unverified'; email: string };

interface AccessGateProps {
  gate: AccessGateState;
  user: User | null;
  onRetryVerification: () => void;
  onSignOut: () => Promise<void>;
}

export function AccessGate({
  gate,
  user,
  onRetryVerification,
  onSignOut,
}: AccessGateProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (gate.phase === 'authorized') return null;

  const handleGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
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
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleEmailAuth(false);
  };

  const handleSignOutClick = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSignOut();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="auth-modal-backdrop"
      id="access-gate-wall"
      role="dialog"
      aria-modal="true"
      aria-label="Contrôle d'accès Pêche France"
      style={{ zIndex: 9999 }}
    >
      <div className="auth-modal">
        <div className="auth-modal-head">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cloud size={20} color="var(--ocean)" />
            <span>Pêche France — Accès</span>
          </h2>
        </div>

        {gate.phase === 'loading' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              padding: '28px 12px',
              textAlign: 'center',
            }}
          >
            <Loader2 size={28} className="spin" color="var(--ocean)" />
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)' }}>
              Vérification de votre session et de vos autorisations…
            </p>
          </div>
        )}

        {gate.phase === 'unauthenticated' && (
          <div className="auth-login-body" id="access-gate-login">
            <p className="auth-intro">
              Connexion requise pour accéder à l&apos;application Pêche France.
              Connectez-vous une première fois en ligne pour activer l&apos;utilisation
              hors-ligne en mer.
            </p>

            <form className="auth-form" onSubmit={handleFormSubmit}>
              <label className="auth-field">
                <span>Email</span>
                <input
                  id="gate-auth-email"
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
                  id="gate-auth-password"
                  type="password"
                  minLength={6}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>

              {error && (
                <p className="auth-error-msg" id="gate-auth-error">
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
                  onClick={() => void handleEmailAuth(true)}
                >
                  Créer un compte
                </button>
                <button
                  type="button"
                  className="auth-google-btn"
                  disabled={busy}
                  onClick={() => void handleGoogle()}
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

        {gate.phase === 'unauthorized' && (
          <div className="auth-account-body" id="access-gate-unauthorized">
            <div
              className="auth-error-msg"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14 }}
            >
              <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Accès non autorisé</div>
                <div style={{ fontSize: '0.84rem', lineHeight: 1.45 }}>
                  Le compte <strong>{user?.email || gate.email}</strong> n&apos;est pas
                  autorisé à accéder à cette application. Contactez un administrateur.
                </div>
              </div>
            </div>

            <div className="auth-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="auth-secondary-btn"
                disabled={busy}
                onClick={() => void handleSignOutClick()}
              >
                <LogOut size={15} />
                <span>Se déconnecter / Changer de compte</span>
              </button>
            </div>
          </div>
        )}

        {gate.phase === 'offline_unverified' && (
          <div className="auth-account-body" id="access-gate-offline">
            <div
              className="auth-alert auth-alert-warn"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14 }}
            >
              <WifiOff size={20} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  Connexion Internet requise pour vérifier vos autorisations
                </div>
                <div style={{ fontSize: '0.84rem', lineHeight: 1.45 }}>
                  Aucune autorisation hors-ligne valide n&apos;a été trouvée pour{' '}
                  <strong>{user?.email || gate.email}</strong>. Connectez-vous à Internet
                  pour valider votre accès.
                </div>
              </div>
            </div>

            <div className="auth-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="auth-primary-btn"
                disabled={busy}
                onClick={onRetryVerification}
              >
                <RefreshCw size={15} />
                <span>Réessayer</span>
              </button>
              <button
                type="button"
                className="auth-secondary-btn"
                disabled={busy}
                onClick={() => void handleSignOutClick()}
              >
                <LogOut size={15} />
                <span>Se déconnecter / Changer de compte</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
