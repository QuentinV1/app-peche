import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Camera, Droplets, Fish, Info, Map as MapIcon, Route, Waves } from 'lucide-react';
import type {
  DataManifest,
  FishingSession,
  RegulationRule,
  SanitaryAlert,
  Species,
} from '../schema/types';
import { loadCoreData, type FacadeCode } from './services/dataStore';
import {
  computeTrackDistanceKm,
  deleteSession,
  listSessions,
  saveSession,
} from './services/sessionStore';
import { FranceMap } from './components/FranceMap';
import { TracksPanel } from './components/TracksPanel';
import { SpeciesPanel } from './components/SpeciesPanel';
import { CatchLogPanel } from './components/CatchLogPanel';
import { VisionMeasurePanel } from './components/VisionMeasurePanel';
import { InfoPanel } from './components/InfoPanel';

type TabKey = 'map' | 'tracks' | 'species' | 'catches' | 'vision' | 'info';
export type FishingEnvironment = 'sea' | 'freshwater';

export interface FocusedSpeciesRule {
  species: Species;
  rule: RegulationRule;
  facade: FacadeCode;
}

export function App() {
  const [tab, setTab] = useState<TabKey>('map');
  const [environment, setEnvironment] = useState<FishingEnvironment>('sea');
  const [selectedFacade, setSelectedFacade] = useState<FacadeCode>('NAMO');
  const [manifest, setManifest] = useState<DataManifest | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const [regulations, setRegulations] = useState<RegulationRule[]>([]);
  const [alerts, setAlerts] = useState<SanitaryAlert[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [focusedSpeciesRule, setFocusedSpeciesRule] = useState<FocusedSpeciesRule | null>(null);
  const [activeSession, setActiveSession] = useState<FishingSession | null>(null);
  const [savedSessions, setSavedSessions] = useState<FishingSession[]>([]);
  const [displayedSession, setDisplayedSession] = useState<FishingSession | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const syncData = useCallback(async (force = false) => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await loadCoreData(force);
      setManifest(res.manifest);
      setSpecies(res.species);
      setRegulations(res.regulations);
      setAlerts(res.alerts);
      setFromCache(res.fromCache);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les données');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    syncData(false);
    listSessions().then(setSavedSessions).catch(() => {});
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [syncData]);

  useEffect(() => {
    if (activeSession?.status !== 'active' || !navigator.geolocation) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const pt = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          timestamp: new Date().toISOString(),
          accuracy: Math.round(pos.coords.accuracy),
        };
        setActiveSession((prev) => {
          if (!prev || prev.status !== 'active') return prev;
          const nextPoints = [...prev.points, pt];
          const updated: FishingSession = {
            ...prev,
            points: nextPoints,
            distanceKm: computeTrackDistanceKm(nextPoints),
          };
          saveSession(updated).catch(() => {});
          return updated;
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10_000 },
    );
    watchIdRef.current = watchId;

    return () => {
      navigator.geolocation.clearWatch(watchId);
      watchIdRef.current = null;
    };
  }, [activeSession?.status]);

  const handleStartSession = ({
    name,
    date,
    environment: trackEnv,
  }: {
    name: string;
    date: string;
    environment: FishingEnvironment;
  }) => {
    const fresh: FishingSession = {
      id: `session-${Date.now()}`,
      name,
      date,
      startedAt: new Date().toISOString(),
      status: 'active',
      environment: trackEnv,
      points: [],
      distanceKm: 0,
    };
    setDisplayedSession(null);
    setActiveSession(fresh);
    saveSession(fresh)
      .then(() => listSessions().then(setSavedSessions))
      .catch(() => {});
  };

  const handleTogglePauseSession = () => {
    setActiveSession((prev) => {
      if (!prev) return null;
      const next: FishingSession = {
        ...prev,
        status: prev.status === 'active' ? 'paused' : 'active',
      };
      saveSession(next).catch(() => {});
      return next;
    });
  };

  const handleStopSession = async () => {
    if (!activeSession) return;
    const finished: FishingSession = {
      ...activeSession,
      status: 'completed',
      endedAt: new Date().toISOString(),
    };
    await saveSession(finished);
    setActiveSession(null);
    setDisplayedSession(finished);
    setSavedSessions(await listSessions());
  };

  const handleUpdateSessionMeta = async (id: string, name: string, date: string) => {
    const existing = savedSessions.find((s) => s.id === id);
    if (!existing) return;
    const updated: FishingSession = { ...existing, name, date };
    await saveSession(updated);
    setSavedSessions(await listSessions());
    if (displayedSession?.id === id) setDisplayedSession(updated);
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    if (displayedSession?.id === id) setDisplayedSession(null);
    setSavedSessions(await listSessions());
  };

  return (
    <div className="app-shell" data-env={environment}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-badge" aria-hidden="true">
            <Fish size={18} />
          </span>
          <span>Pêche France</span>
        </div>
        <div className="header-right">
          <div className="env-switch" role="group" aria-label="Milieu de pêche">
            <button
              type="button"
              className={`env-btn ${environment === 'sea' ? 'env-btn-active' : ''}`}
              onClick={() => setEnvironment('sea')}
            >
              <Waves size={13} aria-hidden="true" />
              <span>Mer</span>
            </button>
            <button
              type="button"
              className={`env-btn ${environment === 'freshwater' ? 'env-btn-active' : ''}`}
              onClick={() => setEnvironment('freshwater')}
            >
              <Droplets size={13} aria-hidden="true" />
              <span>Eau douce</span>
            </button>
          </div>
          <span className="version-tag">
            {manifest ? `MàJ ${manifest.version}` : 'Chargement...'}
          </span>
        </div>
      </header>

      {error && <div className="global-error">{error}</div>}

      <main className="app-main">
        <FranceMap
          visible={tab === 'map'}
          environment={environment}
          selectedFacade={selectedFacade}
          onSelectFacade={setSelectedFacade}
          alerts={alerts}
          onOpenSpecies={() => setTab('species')}
          focusedSpeciesRule={focusedSpeciesRule}
          onClearFocusedSpecies={() => setFocusedSpeciesRule(null)}
          trackToDisplay={activeSession ?? displayedSession}
          isActiveTrack={Boolean(activeSession)}
          onOpenTracks={() => setTab('tracks')}
          onHideDisplayedTrack={() => setDisplayedSession(null)}
        />
        {tab === 'tracks' && (
          <TracksPanel
            defaultEnvironment={environment}
            activeSession={activeSession}
            savedSessions={savedSessions}
            displayedSession={displayedSession}
            onStartSession={handleStartSession}
            onTogglePauseSession={handleTogglePauseSession}
            onStopSession={handleStopSession}
            onUpdateSessionMeta={handleUpdateSessionMeta}
            onDeleteSession={handleDeleteSession}
            onShowOnMap={(session) => {
              setDisplayedSession(session);
              setTab('map');
            }}
            onHideFromMap={() => setDisplayedSession(null)}
          />
        )}
        {tab === 'species' && (
          <SpeciesPanel
            species={species}
            regulations={regulations}
            environment={environment}
            onChangeEnvironment={setEnvironment}
            selectedFacade={selectedFacade}
            onSelectFacade={setSelectedFacade}
            onLocateSpecies={(sp, rule, facade) => {
              setFocusedSpeciesRule({ species: sp, rule, facade });
              setTab('map');
            }}
          />
        )}
        {tab === 'catches' && (
          <CatchLogPanel species={species} defaultEnvironment={environment} />
        )}
        {tab === 'vision' && (
          <VisionMeasurePanel
            species={species}
            regulations={regulations}
            environment={environment}
            selectedFacade={selectedFacade}
          />
        )}
        {tab === 'info' && (
          <InfoPanel
            manifest={manifest}
            alerts={alerts}
            fromCache={fromCache}
            isOnline={isOnline}
            refreshing={refreshing}
            onRefresh={() => syncData(true)}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Navigation principale">
        <button
          type="button"
          className={`nav-btn ${tab === 'map' ? 'nav-btn-active' : ''}`}
          onClick={() => setTab('map')}
        >
          <MapIcon size={20} />
          <span>Carte</span>
        </button>
        <button
          type="button"
          className={`nav-btn ${tab === 'tracks' ? 'nav-btn-active' : ''}`}
          onClick={() => setTab('tracks')}
        >
          <span className="nav-icon-wrap">
            <Route size={20} />
            {activeSession && <span className="nav-dot-live" aria-hidden="true" />}
          </span>
          <span>Tracés</span>
        </button>
        <button
          type="button"
          className={`nav-btn ${tab === 'species' ? 'nav-btn-active' : ''}`}
          onClick={() => setTab('species')}
        >
          <Fish size={20} />
          <span>Mailles</span>
        </button>
        <button
          type="button"
          className={`nav-btn ${tab === 'catches' ? 'nav-btn-active' : ''}`}
          onClick={() => setTab('catches')}
        >
          <BookOpen size={20} />
          <span>Carnet</span>
        </button>
        <button
          type="button"
          className={`nav-btn ${tab === 'vision' ? 'nav-btn-active' : ''}`}
          onClick={() => setTab('vision')}
        >
          <Camera size={20} />
          <span>IA / Mesure</span>
        </button>
        <button
          type="button"
          className={`nav-btn ${tab === 'info' ? 'nav-btn-active' : ''}`}
          onClick={() => setTab('info')}
        >
          <Info size={20} />
          <span>Données</span>
        </button>
      </nav>
    </div>
  );
}
export default App;
