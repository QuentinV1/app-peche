import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  Calendar,
  Check,
  Compass,
  Download,
  Fish,
  Flag,
  Gauge,
  Lock,
  MapPin,
  Moon,
  Navigation,
  Pause,
  Pencil,
  Play,
  Plus,
  Route,
  Square,
  Sun,
  Timer,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { FishingSession, WaypointKind, ZoneProperties } from '../../schema/types';
import type { FishingEnvironment } from '../App';
import {
  formatDurationHms,
  formatHeadingCardinal,
  kmToNauticalMiles,
} from '../services/sessionStore';
import { downloadGpxFile, parseGpxToSession } from '../services/gpx';

interface TracksPanelProps {
  defaultEnvironment: FishingEnvironment;
  activeSession: FishingSession | null;
  savedSessions: FishingSession[];
  displayedSession: FishingSession | null;
  wakeLockActive?: boolean;
  activeZonesAlert?: ZoneProperties[];
  onStartSession: (params: {
    name: string;
    date: string;
    environment: FishingEnvironment;
  }) => void;
  onTogglePauseSession: () => void;
  onStopSession: () => Promise<void>;
  onAddWaypoint?: (kind: WaypointKind, label: string) => Promise<void>;
  onImportGpxSession?: (session: FishingSession) => Promise<void>;
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

const WAYPOINT_PRESETS: { kind: WaypointKind; label: string }[] = [
  { kind: 'spot', label: 'Spot' },
  { kind: 'catch', label: 'Prise' },
  { kind: 'anchor', label: 'Mouillage' },
  { kind: 'hazard', label: 'Danger' },
];

export function TracksPanel({
  defaultEnvironment,
  activeSession,
  savedSessions,
  displayedSession,
  wakeLockActive = false,
  activeZonesAlert = [],
  onStartSession,
  onTogglePauseSession,
  onStopSession,
  onAddWaypoint,
  onImportGpxSession,
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
  const [gpxFeedback, setGpxFeedback] = useState<string | null>(null);
  const [envFilter, setEnvFilter] = useState<'all' | FishingEnvironment>('all');
  const [darkCockpit, setDarkCockpit] = useState(true);
  const [wpLabel, setWpLabel] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const gpxInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!activeSession || activeSession.status !== 'active') return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeSession?.status, activeSession?.id]);

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

  const handleGpxFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onImportGpxSession) return;
    try {
      const text = await file.text();
      const parsed = parseGpxToSession(text, file.name, defaultEnvironment);
      await onImportGpxSession(parsed);
      setGpxFeedback(
        `GPX importé : "${parsed.name}" (${parsed.points.length} pts · ${parsed.distanceKm} km)`,
      );
    } catch (err) {
      setGpxFeedback(
        err instanceof Error ? err.message : "Impossible d'importer ce fichier GPX.",
      );
    }
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

  const lastPoint = activeSession?.points[activeSession.points.length - 1];
  const elapsedMs = activeSession
    ? Math.max(0, nowMs - Date.parse(activeSession.startedAt))
    : 0;

  return (
    <div className="panel-scroll">
      <div className="info-card catch-stats-card">
        <div className="catch-header-row">
          <div>
            <h2 style={{ margin: 0 }}>Tracés &amp; Navigation</h2>
            <p className="scientific-name" style={{ margin: '2px 0 0' }}>
              {savedSessions.length} tracé{savedSessions.length > 1 ? 's' : ''} ·{' '}
              {totalDistanceKm} km ({kmToNauticalMiles(totalDistanceKm)} NM)
            </p>
          </div>
          <div className="track-header-btns">
            {onImportGpxSession && (
              <>
                <input
                  ref={gpxInputRef}
                  type="file"
                  accept=".gpx,application/gpx+xml,text/xml"
                  style={{ display: 'none' }}
                  onChange={handleGpxFileChange}
                />
                <button
                  type="button"
                  className="chip"
                  onClick={() => gpxInputRef.current?.click()}
                  title="Importer un tracé .gpx (Apple Watch, iPhone, Garmin...)"
                >
                  <Upload size={14} /> Importer .gpx
                </button>
              </>
            )}
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
        {gpxFeedback && (
          <p className="rule-detail" style={{ marginTop: 8 }}>
            {gpxFeedback}
          </p>
        )}
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
        <article
          className={`info-card track-active-card track-cockpit ${darkCockpit ? 'track-cockpit-dark' : ''}`}
        >
          <div className="rule-card-header">
            <div>
              <div className="cockpit-badges">
                <span className="session-status">
                  <Navigation size={12} />
                  <strong>
                    {activeSession.status === 'active' ? 'GPS actif' : 'En pause'}
                  </strong>
                </span>
                <span
                  className={`wakelock-pill ${wakeLockActive ? 'wakelock-on' : ''}`}
                  title="Maintien de l'écran allumé (iPhone / Android)"
                >
                  <Lock size={11} />
                  {wakeLockActive ? 'Écran maintenu' : 'Veille auto'}
                </span>
              </div>
              <h3 style={{ marginTop: 6 }}>{activeSession.name || 'Tracé en cours'}</h3>
              <p className="scientific-name">
                <Calendar size={12} style={{ verticalAlign: 'middle' }} />{' '}
                {formatTrackDate(activeSession)} ·{' '}
                {activeSession.environment === 'sea' ? 'Mer' : 'Eau douce'}
              </p>
            </div>
            <button
              type="button"
              className="cockpit-theme-btn"
              onClick={() => setDarkCockpit((v) => !v)}
              title={darkCockpit ? 'Passer en mode clair' : 'Passer en mode nuit cockpit'}
              aria-label="Basculer le mode sombre cockpit"
            >
              {darkCockpit ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>

          {activeZonesAlert.length > 0 && (
            <div className="cockpit-zone-alert">
              <AlertTriangle size={16} />
              <div>
                <strong>Alerte zone réglementée (Nav&amp;Co) :</strong>{' '}
                {activeZonesAlert.map((z) => z.name).join(' · ')}
              </div>
            </div>
          )}

          <div className="cockpit-grid">
            <div className="cockpit-stat">
              <span className="cockpit-stat-label">
                <Timer size={12} /> Durée
              </span>
              <strong className="cockpit-stat-value">
                {formatDurationHms(elapsedMs)}
              </strong>
              <span className="cockpit-stat-sub">
                {activeSession.points.length} pts GPS
              </span>
            </div>
            <div className="cockpit-stat">
              <span className="cockpit-stat-label">
                <Route size={12} /> Distance
              </span>
              <strong className="cockpit-stat-value">
                {activeSession.distanceKm.toFixed(2)} km
              </strong>
              <span className="cockpit-stat-sub">
                {kmToNauticalMiles(activeSession.distanceKm)} NM
              </span>
            </div>
            <div className="cockpit-stat">
              <span className="cockpit-stat-label">
                <Gauge size={12} /> Vitesse
              </span>
              <strong className="cockpit-stat-value">
                {lastPoint?.speedKts !== undefined ? `${lastPoint.speedKts} nds` : '—'}
              </strong>
              <span className="cockpit-stat-sub">
                {lastPoint?.speedKmh !== undefined
                  ? `${lastPoint.speedKmh} km/h`
                  : 'En attente GPS'}
              </span>
            </div>
            <div className="cockpit-stat">
              <span className="cockpit-stat-label">
                <Compass size={12} /> Cap
              </span>
              <strong className="cockpit-stat-value">
                {formatHeadingCardinal(lastPoint?.headingDeg)}
              </strong>
              <span className="cockpit-stat-sub">
                {lastPoint?.accuracy !== undefined
                  ? `Précision ±${lastPoint.accuracy} m`
                  : 'Signal en cours'}
              </span>
            </div>
          </div>

          {onAddWaypoint && (
            <div className="cockpit-waypoints">
              <div className="cockpit-wp-row">
                <input
                  type="text"
                  maxLength={50}
                  value={wpLabel}
                  onChange={(e) => setWpLabel(e.target.value)}
                  placeholder="Libellé point (optionnel)..."
                  className="cockpit-wp-input"
                />
              </div>
              <div className="cockpit-wp-btns">
                {WAYPOINT_PRESETS.map((preset) => (
                  <button
                    key={preset.kind}
                    type="button"
                    className="cockpit-wp-btn"
                    onClick={async () => {
                      await onAddWaypoint(preset.kind, wpLabel || preset.label);
                      setWpLabel('');
                    }}
                  >
                    {preset.kind === 'spot' && <MapPin size={12} />}
                    {preset.kind === 'catch' && <Fish size={12} />}
                    {preset.kind === 'anchor' && <Anchor size={12} />}
                    {preset.kind === 'hazard' && <Flag size={12} />}
                    <span>+ {preset.label}</span>
                  </button>
                ))}
              </div>
              {(activeSession.waypoints?.length ?? 0) > 0 && (
                <p className="cockpit-wp-count">
                  {activeSession.waypoints?.length} point
                  {(activeSession.waypoints?.length ?? 0) > 1 ? 's' : ''} marqué
                  {(activeSession.waypoints?.length ?? 0) > 1 ? 's' : ''} sur cette sortie
                </p>
              )}
            </div>
          )}

          <div className="track-actions" style={{ marginTop: 12 }}>
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
              Aucun tracé enregistré. Créez un nouveau tracé ou importez un fichier
              .gpx (iPhone / Apple Watch / GPS).
            </p>
          </div>
        ) : (
          archivedSessions.map((session) => {
            const isDisplayed = displayedSession?.id === session.id;
            const isEditing = editingId === session.id;
            const durationMs =
              session.endedAt && session.startedAt
                ? Math.max(0, Date.parse(session.endedAt) - Date.parse(session.startedAt))
                : 0;

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
                          {formatTrackDate(session)} · {session.points.length} pts ·{' '}
                          {session.distanceKm} km ({kmToNauticalMiles(session.distanceKm)} NM)
                          {durationMs > 0 ? ` · ${formatDurationHms(durationMs)}` : ''}
                        </p>
                        {(session.avgSpeedKts || session.waypoints?.length) && (
                          <p className="scientific-name" style={{ marginTop: 2 }}>
                            {session.avgSpeedKts
                              ? `Moy. ${session.avgSpeedKts} nds (max ${session.maxSpeedKts ?? session.avgSpeedKts} nds)`
                              : ''}
                            {session.avgSpeedKts && session.waypoints?.length ? ' · ' : ''}
                            {session.waypoints?.length
                              ? `${session.waypoints.length} point${session.waypoints.length > 1 ? 's' : ''} marqué${session.waypoints.length > 1 ? 's' : ''}`
                              : ''}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {session.source === 'gpx' && (
                          <span className="gpx-badge">GPX</span>
                        )}
                        <span className="size-badge">
                          {session.environment === 'sea' ? 'Mer' : 'Eau douce'}
                        </span>
                      </div>
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
                        onClick={() => downloadGpxFile(session)}
                        title="Exporter au format .gpx"
                      >
                        <Download size={13} /> .gpx
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
