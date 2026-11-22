import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  Anchor,
  Camera,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Navigation,
  RefreshCw,
  ShieldAlert,
  UserPlus,
  WifiOff,
} from 'lucide-react';
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
  const [mode, setMode] = useState<'login' | 'register'>('login');
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
    void handleEmailAuth(mode === 'register');
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

  const highlights = [
    {
      icon: MapPin,
      title: 'Zones & Mailles à jour',
      desc: '5 857 zones maritimes, tailles légales et alertes sanitaires.',
    },
    {
      icon: Navigation,
      title: 'Carnet de prises & GPS',
      desc: 'Enregistre tes captures, photos et tracés de session.',
    },
    {
      icon: Camera,
      title: 'Reconnaissance IA',
      desc: 'Identification d’espèces par photo et spots recommandés.',
    },
  ];

  return (
    <div
      className="split-auth-backdrop"
      id="access-gate-wall"
      role="dialog"
      aria-modal="true"
      aria-label="Contrôle d'accès Pêche France"
    >
      <div className="split-auth-card">
        {/* Panneau éditorial */}
        <div className="split-auth-editorial">
          <div>
            <div className="split-auth-brand">
              <div className="split-auth-badge">
                <Anchor size={24} color="#ffffff" />
              </div>
              <div>
                <p className="split-auth-brand-title">Pêche France</p>
                <p className="split-auth-brand-sub">Réglementation &amp; Carnet de prises</p>
              </div>
            </div>

            <h1 className="split-auth-headline">
              Prépare tes sorties en mer et en eau douce.
            </h1>
            <p className="split-auth-lead">
              Synchronisé en temps réel sur tous tes appareils et accessible hors-ligne sur l&apos;eau.
            </p>

            <div className="split-auth-highlights">
              {highlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="split-auth-highlight">
                    <div className="split-auth-highlight-icon">
                      <Icon size={16} />
                    </div>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="split-auth-footer">
            <WifiOff size={14} />
            <span>Cartes &amp; réglementations disponibles hors-ligne</span>
          </div>
        </div>

        {/* Formulaire */}
        <div className="split-auth-form-pane">
          {gate.phase === 'loading' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                padding: '40px 12px',
                textAlign: 'center',
              }}
            >
              <Loader2 size={28} className="spin" color="#0284c7" />
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>
                Vérification de votre session et de vos autorisations…
              </p>
            </div>
          )}

          {gate.phase === 'unauthenticated' && (
            <div id="access-gate-login">
              <h2 className="split-auth-form-title">
                {mode === 'login' ? 'Connexion à ton espace' : 'Créer ton compte'}
              </h2>
              <p className="split-auth-form-sub">
                Utilise ton compte autorisé pour retrouver ton carnet et tes tracés GPS.
              </p>

              <button
                type="button"
                className="split-auth-google-btn"
                disabled={busy}
                onClick={() => void handleGoogle()}
              >
                <LogIn size={16} />
                <span>Continuer avec Google</span>
              </button>

              <div className="split-auth-divider">
                <span>ou par e-mail</span>
              </div>

              <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  id="gate-auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  className="split-auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="adresse@email.com"
                />

                <input
                  id="gate-auth-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className="split-auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mot de passe (6+ caractères)"
                />

                <button
                  type="submit"
                  className="split-auth-submit-btn"
                  disabled={busy}
                >
                  {mode === 'register' ? <UserPlus size={16} /> : <Mail size={16} />}
                  <span>{mode === 'register' ? 'Créer un compte' : 'Se connecter par e-mail'}</span>
                </button>
              </form>

              <button
                type="button"
                className="split-auth-toggle-btn"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setError(null);
                }}
              >
                {mode === 'login'
                  ? 'Pas encore de compte ? Créer un compte'
                  : 'Déjà inscrit ? Se connecter'}
              </button>

              {error && (
                <p
                  className="auth-error-msg"
                  id="gate-auth-error"
                  style={{ marginTop: 12, textAlign: 'center' }}
                >
                  {error}
                </p>
              )}
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
                  className="split-auth-submit-btn"
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
                  className="split-auth-google-btn"
                  disabled={busy}
                  onClick={onRetryVerification}
                >
                  <RefreshCw size={15} />
                  <span>Réessayer</span>
                </button>
                <button
                  type="button"
                  className="split-auth-submit-btn"
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
    </div>
  );
}
