import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { addDoc, collection, serverTimestamp, type Firestore } from 'firebase/firestore';
import { Bug, CheckCircle2, Clock, Lightbulb, MessageSquarePlus, Send, X } from 'lucide-react';

export type FeedbackType = 'evolution' | 'bug';

interface LocalFeedbackItem {
  id: string;
  type: FeedbackType;
  comment: string;
  createdAt: string;
  synced: boolean;
  context?: string;
}

interface FeedbackModalProps {
  open: boolean;
  user: User | null;
  db: Firestore | null;
  context?: string;
  onClose: () => void;
}

const STORAGE_KEY = 'app_peche_feedbacks_v1';
const APP_ID = 'app-peche';
const APP_NAME = 'App Pêche';

function loadLocalFeedbacks(): LocalFeedbackItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalFeedbacks(items: LocalFeedbackItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 30)));
  } catch {
    // Ignore storage quota errors
  }
}

export function FeedbackModal({ open, user, db, context, onClose }: FeedbackModalProps) {
  const [type, setType] = useState<FeedbackType>('evolution');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [history, setHistory] = useState<LocalFeedbackItem[]>(() => loadLocalFeedbacks());

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(null);
    setHistory(loadLocalFeedbacks());

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !db || !user || !user.emailVerified || !user.email || !navigator.onLine) return;
    const items = loadLocalFeedbacks();
    const pending = items.filter((item) => !item.synced);
    if (pending.length === 0) return;

    let cancelled = false;
    (async () => {
      const updated = [...items];
      for (const item of pending) {
        if (cancelled) break;
        try {
          await addDoc(collection(db, 'hub_feedbacks'), {
            appId: APP_ID,
            appName: APP_NAME,
            type: item.type,
            comment: item.comment.slice(0, 2000),
            status: 'open',
            authorUid: user.uid,
            authorEmail: (user.email || '').trim().toLowerCase(),
            authorName: (user.displayName || '').trim().slice(0, 80),
            context: (item.context || '').slice(0, 300),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          const idx = updated.findIndex((x) => x.id === item.id);
          if (idx >= 0) updated[idx] = { ...updated[idx], synced: true };
        } catch {
          // Will retry later
        }
      }
      if (!cancelled) {
        saveLocalFeedbacks(updated);
        setHistory(updated);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, db, user]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = comment.trim();
    if (!trimmed) {
      setError('Veuillez saisir un commentaire.');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    const canSync = Boolean(db && user && user.emailVerified && user.email && navigator.onLine);
    let synced = false;

    if (canSync && db && user && user.email) {
      try {
        await addDoc(collection(db, 'hub_feedbacks'), {
          appId: APP_ID,
          appName: APP_NAME,
          type,
          comment: trimmed.slice(0, 2000),
          status: 'open',
          authorUid: user.uid,
          authorEmail: user.email.trim().toLowerCase(),
          authorName: (user.displayName || '').trim().slice(0, 80),
          context: (context || '').slice(0, 300),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        synced = true;
      } catch {
        synced = false;
      }
    }

    const nextItem: LocalFeedbackItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      comment: trimmed,
      createdAt: new Date().toISOString(),
      synced,
      context,
    };
    const nextHistory = [nextItem, ...loadLocalFeedbacks()].slice(0, 30);
    saveLocalFeedbacks(nextHistory);
    setHistory(nextHistory);
    setComment('');
    setBusy(false);
    setSuccess(
      synced
        ? 'Feedback envoyé avec succès !'
        : 'Feedback enregistré localement. Il sera envoyé dès la connexion au Cloud.'
    );
  }

  return (
    <div
      className="auth-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
      onClick={onClose}
    >
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-head">
          <h2 id="feedback-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquarePlus size={20} color="var(--ocean)" />
            <span>Feedback — {APP_NAME}</span>
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

        <form onSubmit={handleSubmit} className="auth-account-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
              Type de retour
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => setType('evolution')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: type === 'evolution' ? '1.5px solid var(--ocean)' : '1px solid rgba(148, 163, 184, 0.25)',
                  background: type === 'evolution' ? 'rgba(14, 165, 233, 0.16)' : 'rgba(15, 23, 42, 0.25)',
                  color: type === 'evolution' ? '#38bdf8' : 'var(--text)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                <Lightbulb size={15} />
                <span>Évolution</span>
              </button>
              <button
                type="button"
                onClick={() => setType('bug')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: type === 'bug' ? '1.5px solid #ef4444' : '1px solid rgba(148, 163, 184, 0.25)',
                  background: type === 'bug' ? 'rgba(239, 68, 68, 0.16)' : 'rgba(15, 23, 42, 0.25)',
                  color: type === 'bug' ? '#f87171' : 'var(--text)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                <Bug size={15} />
                <span>Bug</span>
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="feedback-comment-input"
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}
            >
              <span>Commentaire</span>
              <span>{comment.length} / 2000</span>
            </label>
            <textarea
              id="feedback-comment-input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              rows={4}
              required
              placeholder={
                type === 'evolution'
                  ? "Décrivez l'amélioration ou la nouvelle fonctionnalité souhaitée..."
                  : 'Décrivez le problème rencontré et comment le reproduire...'
              }
              style={{
                width: '100%',
                borderRadius: 10,
                border: '1px solid rgba(148, 163, 184, 0.25)',
                background: 'rgba(15, 23, 42, 0.35)',
                color: 'var(--text)',
                padding: '10px 12px',
                fontSize: '0.88rem',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && <p className="auth-error-msg">{error}</p>}
          {success && (
            <p
              style={{
                margin: 0,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(16, 185, 129, 0.14)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#34d399',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <CheckCircle2 size={15} />
              <span>{success}</span>
            </p>
          )}

          <button
            type="submit"
            className="auth-primary-btn"
            disabled={busy || !comment.trim()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Send size={15} />
            <span>{busy ? 'Envoi...' : 'Envoyer le feedback'}</span>
          </button>
        </form>

        {history.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid rgba(148, 163, 184, 0.18)', paddingTop: 12 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
              Vos derniers retours ({history.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 170, overflowY: 'auto' }}>
              {history.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(15, 23, 42, 0.25)',
                    border: '1px solid rgba(148, 163, 184, 0.15)',
                    fontSize: '0.8rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        color: item.type === 'bug' ? '#f87171' : '#38bdf8',
                      }}
                    >
                      {item.type === 'bug' ? <Bug size={12} /> : <Lightbulb size={12} />}
                      {item.type === 'bug' ? 'Bug' : 'Évolution'}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: 'var(--muted)' }}>
                      {item.synced ? <CheckCircle2 size={11} color="#34d399" /> : <Clock size={11} color="#fbbf24" />}
                      {new Date(item.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {item.comment}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
