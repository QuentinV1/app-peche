import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { BookOpen, Camera, Cloud, Droplets, Fish, Info, Map as MapIcon, MessageSquarePlus, Route, User as UserIcon, Waves } from 'lucide-react';
import type {
  DataManifest,
  FishingSession,
  RegulationRule,
  SanitaryAlert,
  SessionPoint,
  SessionWaypoint,
  Species,
  WaypointKind,
  ZoneProperties,
} from '../schema/types';
import type { FeatureCollection, Geometry } from 'geojson';
import { loadCoreData, loadFacadeZones, type FacadeCode } from './services/dataStore';
import { getFirebaseDb, observerAuth, signOutUser } from './services/firebase';
import { clearHubAuthCache, verifyUserAccess } from './services/accessControl';
import {
  activerSyncCloud,
  cloudState,
  loadLocalSettings,
  reinitialiserEtatCloud,
  saveLocalSettings,
  subscribeCloudState,
  subscribeLocalDataChange,
  subscribeSettingsChange,
  type CloudState,
} from './services/cloudSync';
import {
  computeBearingDeg,
  computeSessionSpeeds,
  computeTrackDistanceKm,
  deleteSession,
  haversineKm,
  listSessions,
  saveSession,
} from './services/sessionStore';
import { findZonesAtPoint } from './services/zoneProximity';
import { AuthModal } from './components/AuthModal';
import { FeedbackModal } from './components/FeedbackModal';
import { AccessGate, type AccessGateState } from './components/AccessGate';
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
  const initialSettings = loadLocalSettings();
  const [tab, setTab] = useState<TabKey>('map');
  const [environment, setEnvironmentState] = useState<FishingEnvironment>(initialSettings.environment);
  const [selectedFacade, setSelectedFacadeState] = useState<FacadeCode>(initialSettings.selectedFacade);
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
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [activeZonesAlert, setActiveZonesAlert] = useState<ZoneProperties[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [gate, setGate] = useState<AccessGateState>({ phase: 'loading' });
  const [authOpen, setAuthOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [cloud, setCloud] = useState<CloudState>({ ...cloudState });
  const userRef = useRef<User | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const facadeZonesCacheRef = useRef<FeatureCollection<Geometry, ZoneProperties> | null>(null);
  const currentFacadeRef = useRef<FacadeCode>(initialSettings.selectedFacade);
  const currentEnvRef = useRef<FishingEnvironment>(initialSettings.environment);

  const setEnvironment = useCallback((nextEnv: FishingEnvironment) => {
    currentEnvRef.current = nextEnv;
    setEnvironmentState(nextEnv);
    saveLocalSettings({
      environment: nextEnv,
      selectedFacade: currentFacadeRef.current,
    });
  }, []);

  const setSelectedFacade = useCallback((nextFacade: FacadeCode) => {
    currentFacadeRef.current = nextFacade;
    setSelectedFacadeState(nextFacade);
    saveLocalSettings({
      environment: currentEnvRef.current,
      selectedFacade: nextFacade,
    });
  }, []);

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

  const runAccessCheck = useCallback(async (targetUser: User, background = false) => {
    if (!background) {
      setGate({ phase: 'loading' });
    }
    const res = await verifyUserAccess(getFirebaseDb(), 'app-peche', targetUser);
    if (userRef.current?.uid !== targetUser.uid) return;
    if (res.outcome === 'authorized') {
      setGate({ phase: 'authorized', status: res.status, offline: res.offline });
      activerSyncCloud().catch(() => {});
    } else if (res.outcome === 'unauthorized') {
      reinitialiserEtatCloud();
      setGate({ phase: 'unauthorized', email: res.email });
    } else {
      reinitialiserEtatCloud();
      setGate({ phase: 'offline_unverified', email: res.email });
    }
  }, []);

  const handleGateSignOut = useCallback(async () => {
    clearHubAuthCache('app-peche');
    reinitialiserEtatCloud();
    await signOutUser();
    userRef.current = null;
    setUser(null);
    setGate({ phase: 'unauthenticated' });
  }, []);

  useEffect(() => {
    syncData(false);
    listSessions().then(setSavedSessions).catch(() => {});
    const onOnline = () => {
      setIsOnline(true);
      if (userRef.current) {
        void runAccessCheck(userRef.current, true);
      }
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const unsubCloud = subscribeCloudState(setCloud);
    const unsubData = subscribeLocalDataChange(() => {
      listSessions().then(setSavedSessions).catch(() => {});
    });
    const unsubSettings = subscribeSettingsChange((nextSettings) => {
      currentEnvRef.current = nextSettings.environment;
      currentFacadeRef.current = nextSettings.selectedFacade;
      setEnvironmentState(nextSettings.environment);
      setSelectedFacadeState(nextSettings.selectedFacade);
    });
    const unsubAuth = observerAuth((nextUser) => {
      userRef.current = nextUser;
      setUser(nextUser);
      if (nextUser) {
        void runAccessCheck(nextUser, false);
      } else {
        reinitialiserEtatCloud();
        setGate({ phase: 'unauthenticated' });
      }
    });

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      unsubCloud();
      unsubData();
      unsubSettings();
      unsubAuth();
    };
  }, [syncData, runAccessCheck]);

  useEffect(() => {
    if (activeSession?.environment === 'sea') {
      loadFacadeZones(selectedFacade)
        .then((geojson) => {
          facadeZonesCacheRef.current = geojson;
        })
        .catch(() => {});
    }
  }, [activeSession?.environment, selectedFacade]);

  useEffect(() => {
    if (activeSession?.status !== 'active') {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      setWakeLockActive(false);
      return;
    }

    let cancelled = false;
    const requestWakeLock = async () => {
      if (!('wakeLock' in navigator) || !navigator.wakeLock) return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener('release', () => {
          if (!cancelled) setWakeLockActive(false);
        });
      } catch {
        setWakeLockActive(false);
      }
    };

    requestWakeLock();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      setWakeLockActive(false);
    };
  }, [activeSession?.status]);

  useEffect(() => {
    if (activeSession?.status !== 'active' || !navigator.geolocation) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (!activeSession) setActiveZonesAlert([]);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const nowIso = new Date().toISOString();
        const rawSpeedMs = pos.coords.speed;
        const rawHeading = pos.coords.heading;
        const basePt: SessionPoint = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          timestamp: nowIso,
          accuracy: Math.round(pos.coords.accuracy),
        };

        if (facadeZonesCacheRef.current) {
          const hits = findZonesAtPoint(basePt.lng, basePt.lat, facadeZonesCacheRef.current)
            .filter((z) => z.type === 'prohibition' || z.type === 'reserve' || z.type === 'sanitary');
          setActiveZonesAlert(hits.slice(0, 3));
        }

        setActiveSession((prev) => {
          if (!prev || prev.status !== 'active') return prev;
          const lastPt = prev.points[prev.points.length - 1];
          const pt: SessionPoint = { ...basePt };
          if (rawSpeedMs !== null && Number.isFinite(rawSpeedMs) && rawSpeedMs >= 0) {
            pt.speedKmh = Number((rawSpeedMs * 3.6).toFixed(1));
            pt.speedKts = Number((rawSpeedMs * 1.94384).toFixed(1));
          } else if (lastPt) {
            const dtHours = (Date.parse(nowIso) - Date.parse(lastPt.timestamp)) / 3_600_000;
            const dKm = haversineKm(lastPt, basePt);
            if (dtHours > 0.0002) {
              const kmh = dKm / dtHours;
              if (kmh <= 120) {
                pt.speedKmh = Number(kmh.toFixed(1));
                pt.speedKts = Number((kmh / 1.852).toFixed(1));
              }
            }
          }
          if (rawHeading !== null && Number.isFinite(rawHeading) && rawHeading >= 0) {
            pt.headingDeg = Math.round(rawHeading);
          } else if (lastPt && haversineKm(lastPt, basePt) > 0.003) {
            pt.headingDeg = computeBearingDeg(lastPt, basePt);
          }

          const nextPoints = [...prev.points, pt];
          const speeds = computeSessionSpeeds(nextPoints);
          const updated: FishingSession = {
            ...prev,
            points: nextPoints,
            distanceKm: computeTrackDistanceKm(nextPoints),
            maxSpeedKts: speeds.maxSpeedKts,
            avgSpeedKts: speeds.avgSpeedKts,
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
    const speeds = computeSessionSpeeds(activeSession.points);
    const finished: FishingSession = {
      ...activeSession,
      status: 'completed',
      endedAt: new Date().toISOString(),
      maxSpeedKts: speeds.maxSpeedKts,
      avgSpeedKts: speeds.avgSpeedKts,
    };
    await saveSession(finished);
    setActiveSession(null);
    setActiveZonesAlert([]);
    setDisplayedSession(finished);
    setSavedSessions(await listSessions());
  };

  const handleAddWaypoint = async (kind: WaypointKind, label: string) => {
    if (!activeSession) return;
    const lastPt = activeSession.points[activeSession.points.length - 1];
    let lat = lastPt?.lat;
    let lng = lastPt?.lng;

    if ((lat === undefined || lng === undefined) && navigator.geolocation) {
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            lat = Number(pos.coords.latitude.toFixed(6));
            lng = Number(pos.coords.longitude.toFixed(6));
            resolve();
          },
          () => resolve(),
          { enableHighAccuracy: true, timeout: 6000 },
        );
      });
    }
    if (lat === undefined || lng === undefined) return;

    const wp: SessionWaypoint = {
      id: `wp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      lat,
      lng,
      label: label.trim() || 'Point GPS',
      kind,
      timestamp: new Date().toISOString(),
    };
    setActiveSession((prev) => {
      if (!prev) return null;
      const updated: FishingSession = {
        ...prev,
        waypoints: [...(prev.waypoints ?? []), wp],
      };
      saveSession(updated).catch(() => {});
      return updated;
    });
  };

  const handleImportGpxSession = async (session: FishingSession) => {
    await saveSession(session);
    setSavedSessions(await listSessions());
    setDisplayedSession(session);
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

  if (gate.phase !== 'authorized') {
    return (
      <div className="app-shell" data-env={environment}>
        <AccessGate
          gate={gate}
          user={user}
          onRetryVerification={() => {
            if (userRef.current) {
              void runAccessCheck(userRef.current, false);
            }
          }}
          onSignOut={handleGateSignOut}
        />
      </div>
    );
  }

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
          <button
            type="button"
            id="btn-feedback-header"
            className="auth-header-btn"
            onClick={() => setFeedbackOpen(true)}
            title="Envoyer un feedback (évolution ou bug)"
            aria-label="Envoyer un feedback"
          >
            <MessageSquarePlus size={14} aria-hidden="true" />
            <span>Feedback</span>
          </button>
          <button
            type="button"
            id="btn-auth-header"
            className={`auth-header-btn ${user ? 'auth-header-btn-signed' : ''}`}
            onClick={() => setAuthOpen(true)}
            title={user ? `Connecté : ${user.email || user.uid}` : 'Se connecter au Cloud'}
          >
            {user ? <UserIcon size={14} aria-hidden="true" /> : <Cloud size={14} aria-hidden="true" />}
            <span>
              {user
                ? (user.email || user.displayName || 'Cloud').split('@')[0]
                : 'Connexion'}
            </span>
          </button>
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
            wakeLockActive={wakeLockActive}
            activeZonesAlert={activeZonesAlert}
            onStartSession={handleStartSession}
            onTogglePauseSession={handleTogglePauseSession}
            onStopSession={handleStopSession}
            onAddWaypoint={handleAddWaypoint}
            onImportGpxSession={handleImportGpxSession}
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
      <AuthModal
        open={authOpen}
        user={user}
        cloud={cloud}
        onClose={() => setAuthOpen(false)}
        onUserUpdated={setUser}
      />
      <FeedbackModal
        open={feedbackOpen}
        user={user}
        db={getFirebaseDb()}
        context={`tab=${tab}; env=${environment}; facade=${selectedFacade}`}
        onClose={() => setFeedbackOpen(false)}
      />
    </div>
  );
}
export default App;
