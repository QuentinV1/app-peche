import { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  MapPin,
  Navigation,
  Pause,
  Pencil,
  Play,
  Plus,
  Route,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { FishingSession } from '../../schema/types';
import type { FishingEnvironment } from '../App';

interface TracksPanelProps {
  defaultEnvironment: FishingEnvironment;
  activeSession: FishingSession | null;
  savedSessions: FishingSession[];
  displayedSession: FishingSession | null;
  onStartSession: (params: {
    name: string;
    date: string;
    environment: FishingEnvironment;
  }) => void;
  onTogglePauseSession: () => void;
  onStopSession: () => Promise<void>;
  onUpdateSessionMeta: (id: string, name: string, date: string) => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  onShowOnMap: (session: FishingSession) => void;
  onHideFromMap: () => void;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTrackDate(session: FishingSession): string {
  const raw = session.date ?? session.startedAt.slice(0, 10);
  const parts = raw.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return new Date(session.startedAt).toLocaleDateString('fr-FR');
}

export function TracksPanel({
  defaultEnvironment,
  activeSession,
  savedSessions,
  displayedSession,
  onStartSession,
  onTogglePauseSession,
  onStopSession,
  onUpdateSessionMeta,
  onDeleteSession,
  onShowOnMap,
  onHideFromMap,
}: TracksPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayIsoDate);
  const [env, setEnv] = useState<FishingEnvironment>(defaultEnvironment);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [envFilter, setEnvFilter] = useState<'all' | FishingEnvironment>('all');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const archivedSessions = useMemo(() => {
    return savedSessions
      .filter((s) => s.id !== activeSession?.id)
      .filter((s) => (envFilter === 'all' ? true : s.environment === envFilter));
  }, [savedSessions, activeSession?.id, envFilter]);

  const totalDistanceKm = useMemo(
    () =>
      Number(
        savedSessions.reduce((acc, s) => acc + (s.distanceKm || 0), 0).toFixed(2),
      ),
    [savedSessions],
  );

  const handleOpenForm = () => {
    setEnv(defaultEnvironment);
    setDate(todayIsoDate());
    setName('');
    setFeedback(null);
    setShowForm(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFeedback('Veuillez saisir un nom pour ce tracé.');
      return;
    }
    if (!date) {
      setFeedback('Veuillez choisir une date.');
      return;
    }
    setFeedback(null);
    onStartSession({ name: trimmed, date, environment: env });
    setShowForm(false);
    setName('');
  };

  const startEditing = (session: FishingSession) => {
    setEditingId(session.id);
    setEditName(session.name ?? '');
    setEditDate(session.date ?? session.startedAt.slice(0, 10));
  };

  const saveEdit = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed || !editDate) return;
    await onUpdateSessionMeta(id, trimmed, editDate);
    setEditingId(null);
  };

  return (
    <div className="panel-scroll">
      <div className="info-card catch-stats-card">
        <div className="catch-header-row">
          <div>
            <h2 style={{ margin: 0 }}>Tracés de pêche</h2>
            <p className="scientific-name" style={{ margin: '2px 0 0' }}>
              {savedSessions.length} tracé{savedSessions.length > 1 ? 's' : ''} ·{' '}
              {totalDistanceKm} km enregistrés
            </p>
          </div>
          {!activeSession && (
            <button
              type="button"
              className="quick-spot-btn"
              onClick={() => (showForm ? setShowForm(false) : handleOpenForm())}
            >
              <Plus size={15} /> {showForm ? 'Fermer' : 'Nouveau tracé'}
            </button>
          )}
        </div>
      </div>

      {showForm && !activeSession && (
        <form className="info-card catch-form" onSubmit={handleCreateSubmit}>
          <h3>Nouveau tracé GPS</h3>
          {feedback && <div className="inline-error">{feedback}</div>}

          <label className="form-field">
            <span>Nom du tracé</span>
            <input
              type="text"
              maxLength={80}
              placeholder="Ex. Sortie bar — Glénan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>

          <div className="form-row-2">
            <label className="form-field">
              <span>Date</span>
              <input
                type="date"
                min="2000-01-01"
                max="2099-12-31"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Milieu</span>
              <select
                value={env}
                onChange={(e) => setEnv(e.target.value as FishingEnvironment)}
              >
                <option value="sea">Mer</option>
                <option value="freshwater">Eau douce</option>
              </select>
            </label>
          </div>

          <div className="track-actions">
            <button type="submit" className="quick-spot-btn">
              <Play size={15} /> Démarrer l&apos;enregistrement GPS
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => setShowForm(false)}
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {activeSession && (
        <article className="info-card track-active-card">
          <div className="rule-card-header">
            <div>
              <h3>{activeSession.name || 'Tracé en cours'}</h3>
              <p className="scientific-name">
                <Calendar size={12} style={{ verticalAlign: 'middle' }} />{' '}
                {formatTrackDate(activeSession)} ·{' '}
                {activeSession.environment === 'sea' ? 'Mer' : 'Eau douce'}
              </p>
            </div>
            <span className="session-status">
              <Navigation size={13} />
              <strong>
                {activeSession.status === 'active' ? 'GPS actif' : 'En pause'}
              </strong>
            </span>
          </div>

          <div className="track-metrics">
            <span>{activeSession.points.length} pts GPS</span>
            <span>·</span>
            <strong>{activeSession.distanceKm} km</strong>
          </div>

          <div className="track-actions">
            <button
              type="button"
              className="chip"
              onClick={onTogglePauseSession}
            >
              {activeSession.status === 'active' ? (
                <>
                  <Pause size={13} /> Pause
                </>
              ) : (
                <>
                  <Play size={13} /> Reprendre
                </>
              )}
            </button>
            <button
              type="button"
              className="session-btn session-btn-stop"
              onClick={onStopSession}
            >
              <Square size={13} /> Terminer
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => onShowOnMap(activeSession)}
            >
              <MapPin size={13} /> Voir sur la carte
            </button>
          </div>
        </article>
      )}

      <div className="filter-row" style={{ marginBottom: 10 }}>
        <button
          type="button"
          className={`chip ${envFilter === 'all' ? 'chip-active' : ''}`}
          onClick={() => setEnvFilter('all')}
        >
          Tous
        </button>
        <button
          type="button"
          className={`chip ${envFilter === 'sea' ? 'chip-active' : ''}`}
          onClick={() => setEnvFilter('sea')}
        >
          Mer
        </button>
        <button
          type="button"
          className={`chip ${envFilter === 'freshwater' ? 'chip-active' : ''}`}
          onClick={() => setEnvFilter('freshwater')}
        >
          Eau douce
        </button>
      </div>

      <div className="cards-list">
        {archivedSessions.length === 0 && !activeSession ? (
          <div className="empty-state">
            <Route size={28} style={{ opacity: 0.4, marginBottom: 6 }} />
            <p>
              Aucun tracé enregistré. Créez un nouveau tracé pour suivre votre
              parcours de pêche.
            </p>
          </div>
        ) : (
          archivedSessions.map((session) => {
            const isDisplayed = displayedSession?.id === session.id;
            const isEditing = editingId === session.id;

            return (
              <article key={session.id} className="rule-card">
                {isEditing ? (
                  <div className="catch-form">
                    <label className="form-field">
                      <span>Nom du tracé</span>
                      <input
                        type="text"
                        maxLength={80}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span>Date</span>
                      <input
                        type="date"
                        min="2000-01-01"
                        max="2099-12-31"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                      />
                    </label>
                    <div className="track-actions">
                      <button
                        type="button"
                        className="quick-spot-btn"
                        onClick={() => saveEdit(session.id)}
                      >
                        <Check size={14} /> Enregistrer
                      </button>
                      <button
                        type="button"
                        className="chip"
                        onClick={() => setEditingId(null)}
                      >
                        <X size={14} /> Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rule-card-header">
                      <div>
                        <h3>{session.name || 'Tracé sans nom'}</h3>
                        <p className="scientific-name">
                          {formatTrackDate(session)} · {session.points.length}{' '}
                          pts · {session.distanceKm} km
                        </p>
                      </div>
                      <span className="size-badge">
                        {session.environment === 'sea' ? 'Mer' : 'Eau douce'}
                      </span>
                    </div>

                    <div className="track-actions">
                      <button
                        type="button"
                        className={`chip ${isDisplayed ? 'chip-active' : ''}`}
                        onClick={() =>
                          isDisplayed ? onHideFromMap() : onShowOnMap(session)
                        }
                      >
                        <MapPin size={13} />{' '}
                        {isDisplayed ? 'Masquer de la carte' : 'Voir sur la carte'}
                      </button>
                      <button
                        type="button"
                        className="chip"
                        aria-label="Renommer ou dater le tracé"
                        onClick={() => startEditing(session)}
                      >
                        <Pencil size={13} /> Modifier
                      </button>
                      {confirmDeleteId === session.id ? (
                        <>
                          <button
                            type="button"
                            className="session-btn session-btn-stop"
                            onClick={async () => {
                              await onDeleteSession(session.id);
                              setConfirmDeleteId(null);
                            }}
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            className="chip"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Annuler
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="chip"
                          aria-label="Supprimer le tracé"
                          onClick={() => setConfirmDeleteId(session.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
