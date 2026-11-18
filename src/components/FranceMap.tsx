import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Fish,
  Layers,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  X,
} from 'lucide-react';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { FishingSession, SanitaryAlert, ZoneProperties } from '../../schema/types';
import type { FishingEnvironment, FocusedSpeciesRule } from '../App';
import { loadFacadeZones, type FacadeCode } from '../services/dataStore';
import {
  fetchDepartmentDroughtStatus,
  fetchDepartmentFishInventory,
  type DroughtSummary,
  type FreshwaterSpeciesSummary,
} from '../services/freshwaterApi';
import { sessionToGeoJson } from '../services/sessionStore';
import { buildSpotRecommendation, type SpotRecommendation } from '../services/spotRecommender';
import { resolveSourceReference, resolveZoneReference } from '../services/referenceUrl';
import { alertMatchesSpecies, zoneMatchesSpecies } from '../services/speciesMatch';
import {
  computeBBox,
  findFeatureByCode,
  getFacadeForDepartment,
  getFacadeForRegion,
  loadAdminLayer,
  searchCommunes,
  type AdminProperties,
  type CommuneHit,
} from '../services/geoAdmin';

interface FranceMapProps {
  visible?: boolean;
  environment?: FishingEnvironment;
  selectedFacade: FacadeCode;
  onSelectFacade: (facade: FacadeCode) => void;
  alerts: SanitaryAlert[];
  onOpenSpecies: () => void;
  focusedSpeciesRule?: FocusedSpeciesRule | null;
  onClearFocusedSpecies?: () => void;
  trackToDisplay?: FishingSession | null;
  isActiveTrack?: boolean;
  onOpenTracks?: () => void;
  onHideDisplayedTrack?: () => void;
}

const FRANCE_VIEW = { center: [2.2, 46.6] as [number, number], zoom: 5.0 };

const FACADE_CENTERS: Record<FacadeCode, { center: [number, number]; zoom: number }> = {
  MEMN: { center: [0.3, 49.9], zoom: 6.5 },
  NAMO: { center: [-3.2, 47.9], zoom: 6.6 },
  SA: { center: [-1.3, 45.0], zoom: 6.7 },
  MED: { center: [5.2, 43.1], zoom: 6.5 },
};

const TYPE_LABELS: Record<string, { label: string; shortLabel: string; color: string }> = {
  prohibition: { label: 'Interdiction', shortLabel: 'Interdiction', color: '#dc2626' },
  reserve: { label: 'Réserve / Parc', shortLabel: 'Réserve', color: '#d97706' },
  sanitary: { label: 'Alerte sanitaire', shortLabel: 'Sanitaire', color: '#9333ea' },
  restriction: { label: 'Zone réglementée', shortLabel: 'Réglementée', color: '#0284c7' },
};

type ZoneFilterKey = 'all' | 'prohibition' | 'reserve' | 'sanitary' | 'restriction';

function isEpandageZone(props: ZoneProperties): boolean {
  const haystack = `${props.name ?? ''} ${props.resume ?? ''}`.toLowerCase();
  return haystack.includes('epand') || haystack.includes('épand');
}

function isSpatioTemporelleZone(props: ZoneProperties): boolean {
  const haystack = `${props.name ?? ''} ${props.resume ?? ''}`.toLowerCase();
  return haystack.includes('spatio-temporelle');
}

export function FranceMap({
  visible = true,
  environment = 'sea',
  selectedFacade,
  onSelectFacade,
  alerts,
  onOpenSpecies,
  focusedSpeciesRule = null,
  onClearFocusedSpecies,
  trackToDisplay = null,
  isActiveTrack = false,
  onOpenTracks,
  onHideDisplayedTrack,
}: FranceMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const regionsRef = useRef<FeatureCollection<Geometry, AdminProperties> | null>(null);
  const deptsRef = useRef<FeatureCollection<Geometry, AdminProperties> | null>(null);
  const zonesDataRef = useRef<FeatureCollection<Geometry, ZoneProperties> | null>(null);

  const [selectedRegion, setSelectedRegion] = useState<AdminProperties | null>(null);
  const [selectedDept, setSelectedDept] = useState<AdminProperties | null>(null);
  const [selectedCommune, setSelectedCommune] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [communeResults, setCommuneResults] = useState<CommuneHit[]>([]);

  const [loadingZones, setLoadingZones] = useState(false);
  const [rawZonesGeojson, setRawZonesGeojson] = useState<FeatureCollection<Geometry, ZoneProperties> | null>(null);
  const [showEpandage, setShowEpandage] = useState(false);
  const [showSpatioTemporelle, setShowSpatioTemporelle] = useState(false);
  const [zoneFilter, setZoneFilter] = useState<ZoneFilterKey>('all');
  const [selectedZone, setSelectedZone] = useState<ZoneProperties | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<SanitaryAlert | null>(null);
  const [onlySpeciesZones, setOnlySpeciesZones] = useState(false);
  const [droughtInfo, setDroughtInfo] = useState<DroughtSummary | null>(null);
  const [fishInfo, setFishInfo] = useState<FreshwaterSpeciesSummary | null>(null);
  const [showFreshwaterSheet, setShowFreshwaterSheet] = useState(false);
  const [spotRec, setSpotRec] = useState<SpotRecommendation | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const baseZonesGeojson = useMemo<FeatureCollection<Geometry, ZoneProperties>>(() => {
    if (!rawZonesGeojson) {
      return { type: 'FeatureCollection', features: [] };
    }
    if (showEpandage && showSpatioTemporelle) {
      return rawZonesGeojson;
    }
    return {
      ...rawZonesGeojson,
      features: rawZonesGeojson.features.filter((f) => {
        if (!showEpandage && isEpandageZone(f.properties)) return false;
        if (!showSpatioTemporelle && isSpatioTemporelleZone(f.properties)) return false;
        return true;
      }),
    };
  }, [rawZonesGeojson, showEpandage, showSpatioTemporelle]);

  const speciesMatchingFeatures = useMemo<Feature<Geometry, ZoneProperties>[]>(() => {
    if (!focusedSpeciesRule) return [];
    return baseZonesGeojson.features.filter((f) =>
      zoneMatchesSpecies(f.properties, focusedSpeciesRule.species),
    );
  }, [baseZonesGeojson, focusedSpeciesRule]);

  const speciesMatchingAlerts = useMemo<SanitaryAlert[]>(() => {
    if (!focusedSpeciesRule) return [];
    return alerts.filter((a) => alertMatchesSpecies(a, focusedSpeciesRule.species));
  }, [alerts, focusedSpeciesRule]);

  const visibleZonesGeojson = useMemo<FeatureCollection<Geometry, ZoneProperties>>(() => {
    if (!focusedSpeciesRule || !onlySpeciesZones) {
      return baseZonesGeojson;
    }
    return {
      ...baseZonesGeojson,
      features: speciesMatchingFeatures,
    };
  }, [baseZonesGeojson, focusedSpeciesRule, onlySpeciesZones, speciesMatchingFeatures]);

  const allFeatures = useMemo(
    () => visibleZonesGeojson.features.map((f) => f.properties),
    [visibleZonesGeojson],
  );

  const deptAlerts = useMemo(() => {
    if (!selectedDept) return [];
    return alerts.filter((a) => a.departmentCode === selectedDept.code);
  }, [alerts, selectedDept]);

  const filteredZoneCount = useMemo(() => {
    if (zoneFilter === 'all') return allFeatures.length;
    return allFeatures.filter((z) => z.type === zoneFilter).length;
  }, [allFeatures, zoneFilter]);

  // Redimensionner MapLibre lorsque l'onglet Carte redevient visible
  useEffect(() => {
    if (visible && mapRef.current) {
      mapRef.current.resize();
    }
  }, [visible]);

  // Initialisation MapLibre + couches Régions / Départements / Zones pêche
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap',
          },
        },
        layers: [
          {
            id: 'ocean-bg',
            type: 'background',
            paint: { 'background-color': '#dbeafe' },
          },
          { id: 'osm-tiles', type: 'raster', source: 'osm' },
        ],
      },
      center: FRANCE_VIEW.center,
      zoom: FRANCE_VIEW.zoom,
      minZoom: 4.5,
      maxZoom: 17,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right'
    );

    map.on('load', async () => {
      // 1. Ajouter immédiatement la source et les couches de zones de pêche (indépendant des couches admin)
      map.addSource('fishing-zones', {
        type: 'geojson',
        data: zonesDataRef.current ?? { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'fishing-zones-fill',
        type: 'fill',
        source: 'fishing-zones',
        paint: {
          'fill-color': [
            'match',
            ['get', 'type'],
            'prohibition',
            '#dc2626',
            'reserve',
            '#d97706',
            'sanitary',
            '#9333ea',
            '#0284c7',
          ],
          'fill-opacity': 0.35,
        },
      });
      map.addLayer({
        id: 'fishing-zones-outline',
        type: 'line',
        source: 'fishing-zones',
        paint: {
          'line-color': [
            'match',
            ['get', 'type'],
            'prohibition',
            '#991b1b',
            'reserve',
            '#92400e',
            'sanitary',
            '#6b21a8',
            '#075985',
          ],
          'line-width': 1.5,
        },
      });

      // Tracé GPS de session de pêche (mer, estuaire et terre ferme)
      map.addSource('session-track', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'session-track-line',
        type: 'line',
        source: 'session-track',
        filter: ['==', ['get', 'kind'], 'track'],
        paint: {
          'line-color': '#ea580c',
          'line-width': 3.5,
        },
      });
      map.addLayer({
        id: 'session-track-head',
        type: 'circle',
        source: 'session-track',
        filter: ['==', ['get', 'kind'], 'head'],
        paint: {
          'circle-radius': 6,
          'circle-color': '#ea580c',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      // Clic sur une zone réglementaire
      map.on('click', 'fishing-zones-fill', (e) => {
        const feat = e.features?.[0];
        if (!feat?.properties) return;
        const p = feat.properties as unknown as ZoneProperties & { themes?: string | string[] };
        const themes =
          typeof p.themes === 'string'
            ? (JSON.parse(p.themes) as string[])
            : p.themes ?? [];
        setSelectedAlert(null);
        setSelectedZone({ ...p, themes });
      });

      // 2. Charger les couches administratives (avec cache IndexedDB hors-ligne)
      try {
        const [regions, depts] = await Promise.all([
          loadAdminLayer('regions'),
          loadAdminLayer('departements'),
        ]);
        regionsRef.current = regions;
        deptsRef.current = depts;

        map.addSource('admin-regions', { type: 'geojson', data: regions });
        map.addLayer(
          {
            id: 'admin-regions-fill',
            type: 'fill',
            source: 'admin-regions',
            paint: { 'fill-color': '#0b4f6c', 'fill-opacity': 0.1 },
          },
          'fishing-zones-fill'
        );
        map.addLayer(
          {
            id: 'admin-regions-line',
            type: 'line',
            source: 'admin-regions',
            paint: { 'line-color': '#0b4f6c', 'line-width': 1.5 },
          },
          'fishing-zones-fill'
        );

        map.addSource('admin-depts', { type: 'geojson', data: depts });
        map.addLayer(
          {
            id: 'admin-depts-fill',
            type: 'fill',
            source: 'admin-depts',
            layout: { visibility: 'none' },
            paint: { 'fill-color': '#0284c7', 'fill-opacity': 0.08 },
          },
          'fishing-zones-fill'
        );
        map.addLayer(
          {
            id: 'admin-depts-line',
            type: 'line',
            source: 'admin-depts',
            layout: { visibility: 'none' },
            paint: { 'line-color': '#0369a1', 'line-width': 1.2, 'line-dasharray': [2, 2] },
          },
          'fishing-zones-fill'
        );

        // Clic sur une région -> zoom + affichage départements (sauf si clic sur une zone de pêche)
        map.on('click', 'admin-regions-fill', (e) => {
          const zoneHits = map.queryRenderedFeatures(e.point, {
            layers: ['fishing-zones-fill'],
          });
          if (zoneHits.length > 0) return;
          const feat = e.features?.[0];
          if (!feat?.properties) return;
          const props = feat.properties as AdminProperties;
          const full = findFeatureByCode(regions, props.code);
          if (full) {
            map.fitBounds(computeBBox(full.geometry), { padding: 24, duration: 750 });
          }
          setSelectedRegion(props);
          setSelectedDept(null);
          setSelectedCommune(null);
          onSelectFacade(getFacadeForRegion(props.code));
        });

        // Clic sur un département -> zoom + mise en avant zones pêche
        map.on('click', 'admin-depts-fill', (e) => {
          const zoneHits = map.queryRenderedFeatures(e.point, {
            layers: ['fishing-zones-fill'],
          });
          if (zoneHits.length > 0) return; // Priorité à la zone réglementaire cliquée
          const feat = e.features?.[0];
          if (!feat?.properties) return;
          const props = feat.properties as AdminProperties;
          const full = findFeatureByCode(depts, props.code);
          if (full) {
            map.fitBounds(computeBBox(full.geometry), { padding: 24, duration: 750 });
          }
          setSelectedDept(props);
          setSelectedCommune(null);
          onSelectFacade(getFacadeForDepartment(props.code));
        });

        for (const layer of ['admin-regions-fill', 'admin-depts-fill', 'fishing-zones-fill']) {
          map.on('mouseenter', layer, () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', layer, () => {
            map.getCanvas().style.cursor = '';
          });
        }
      } catch (err) {
        setMapError(err instanceof Error ? err.message : 'Erreur chargement carte');
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onSelectFacade]);

  // Basculer la visibilité Régions vs Départements selon le niveau de navigation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const showRegions = !selectedRegion && !selectedDept;
    const showDepts = Boolean(selectedRegion) && !selectedDept;

    if (map.getLayer('admin-regions-fill')) {
      map.setLayoutProperty('admin-regions-fill', 'visibility', showRegions ? 'visible' : 'none');
      map.setLayoutProperty('admin-regions-line', 'visibility', showRegions ? 'visible' : 'none');
    }
    if (map.getLayer('admin-depts-fill')) {
      map.setLayoutProperty('admin-depts-fill', 'visibility', showDepts ? 'visible' : 'none');
      map.setLayoutProperty('admin-depts-line', 'visibility', showDepts || selectedDept ? 'visible' : 'none');
    }
  }, [selectedRegion, selectedDept]);

  // Appliquer le filtre par type de zone et la visibilité Mer / Eau douce sur MapLibre
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const vis = environment === 'sea' ? 'visible' : 'none';
    const filterExpr: maplibregl.FilterSpecification | null =
      zoneFilter === 'all' ? null : ['==', ['get', 'type'], zoneFilter];
    if (map.getLayer('fishing-zones-fill')) {
      map.setLayoutProperty('fishing-zones-fill', 'visibility', vis);
      map.setFilter('fishing-zones-fill', filterExpr);
    }
    if (map.getLayer('fishing-zones-outline')) {
      map.setLayoutProperty('fishing-zones-outline', 'visibility', vis);
      map.setFilter('fishing-zones-outline', filterExpr);
    }
  }, [zoneFilter, environment]);

  // Charger les infos VigiEau (sécheresse) & Hub'Eau (poissons) en mode Eau douce
  useEffect(() => {
    if (environment !== 'freshwater' || !selectedDept) {
      setDroughtInfo(null);
      setFishInfo(null);
      setShowFreshwaterSheet(false);
      return;
    }
    let cancelled = false;
    setShowFreshwaterSheet(true);
    Promise.all([
      fetchDepartmentDroughtStatus(selectedDept.code),
      fetchDepartmentFishInventory(selectedDept.code),
    ]).then(([drought, fish]) => {
      if (cancelled) return;
      setDroughtInfo(drought);
      setFishInfo(fish);
    });
    return () => {
      cancelled = true;
    };
  }, [environment, selectedDept]);

  // Charger les zones GeoJSON de la façade sélectionnée
  useEffect(() => {
    let cancelled = false;
    async function syncFacade() {
      setLoadingZones(true);
      setMapError(null);
      try {
        const geojson = await loadFacadeZones(selectedFacade);
        if (cancelled) return;
        setRawZonesGeojson(geojson);
      } catch (err) {
        if (!cancelled) {
          setMapError(err instanceof Error ? err.message : 'Erreur chargement façade');
        }
      } finally {
        if (!cancelled) setLoadingZones(false);
      }
    }
    syncFacade();
    return () => {
      cancelled = true;
    };
  }, [selectedFacade]);

  // Synchroniser les zones visibles avec la source MapLibre
  useEffect(() => {
    zonesDataRef.current = visibleZonesGeojson;
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource('fishing-zones') as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(visibleZonesGeojson);
    };
    if (map.getSource('fishing-zones')) apply();
    else map.once('load', apply);
  }, [visibleZonesGeojson]);

  useEffect(() => {
    if (!selectedZone) return;
    if (
      (!showEpandage && isEpandageZone(selectedZone)) ||
      (!showSpatioTemporelle && isSpatioTemporelleZone(selectedZone))
    ) {
      setSelectedZone(null);
    }
  }, [showEpandage, showSpatioTemporelle, selectedZone]);

  // Centrer la carte et activer la façade lorsqu'une espèce est localisée depuis l'onglet Mailles
  useEffect(() => {
    if (!focusedSpeciesRule) {
      setOnlySpeciesZones(false);
      setSpotRec(null);
      return;
    }
    setSelectedZone(null);
    setSelectedAlert(null);
    setSelectedCommune(null);
    setSelectedDept(null);
    setSelectedRegion(null);
    setOnlySpeciesZones(false);

    if (focusedSpeciesRule.facade !== selectedFacade) {
      onSelectFacade(focusedSpeciesRule.facade);
    }
    const view = FACADE_CENTERS[focusedSpeciesRule.facade];
    mapRef.current?.flyTo({ center: view.center, zoom: view.zoom, duration: 750 });

    let cancelled = false;
    buildSpotRecommendation(
      focusedSpeciesRule.species,
      focusedSpeciesRule.rule.environment,
      focusedSpeciesRule.facade,
      view.center[1],
      view.center[0],
    ).then((rec) => {
      if (!cancelled) setSpotRec(rec);
    });
    return () => {
      cancelled = true;
    };
  }, [focusedSpeciesRule]);

  // Synchroniser le tracé GPS actif ou sélectionné sur MapLibre
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const data = sessionToGeoJson(trackToDisplay);
    const apply = () => {
      const src = map.getSource('session-track') as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(data);
    };
    if (map.getSource('session-track')) apply();
    else map.once('load', apply);
  }, [trackToDisplay]);

  // Centrer la carte sur un tracé sauvegardé lorsqu'on demande à l'afficher
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !visible || !trackToDisplay || isActiveTrack || trackToDisplay.points.length === 0) {
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    for (const pt of trackToDisplay.points) {
      bounds.extend([pt.lng, pt.lat]);
    }
    map.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 700 });
  }, [trackToDisplay?.id, visible, isActiveTrack]);

  const focusZoneFeature = (feat: Feature<Geometry, ZoneProperties>) => {
    if (feat.geometry) {
      mapRef.current?.fitBounds(computeBBox(feat.geometry), { padding: 40, maxZoom: 13, duration: 750 });
    }
    setSelectedAlert(null);
    setSelectedZone(feat.properties);
  };

  // Recherche de communes littorales
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length < 2) {
        if (active) setCommuneResults([]);
        return;
      }
      const hits = await searchCommunes(searchQuery);
      if (active) setCommuneResults(hits);
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const resetToFrance = () => {
    setSelectedRegion(null);
    setSelectedDept(null);
    setSelectedCommune(null);
    setSelectedZone(null);
    setSelectedAlert(null);
    mapRef.current?.flyTo({ center: FRANCE_VIEW.center, zoom: FRANCE_VIEW.zoom, duration: 750 });
  };

  const backToRegion = () => {
    setSelectedDept(null);
    setSelectedCommune(null);
    setSelectedZone(null);
    setSelectedAlert(null);
    if (selectedRegion && regionsRef.current) {
      const full = findFeatureByCode(regionsRef.current, selectedRegion.code);
      if (full) {
        mapRef.current?.fitBounds(computeBBox(full.geometry), { padding: 24, duration: 750 });
      }
    }
  };

  const handleManualFacade = (facade: FacadeCode) => {
    onSelectFacade(facade);
    setSelectedZone(null);
    setSelectedAlert(null);
    if (!selectedCommune && !selectedDept) {
      const view = FACADE_CENTERS[facade];
      mapRef.current?.flyTo({ center: view.center, zoom: view.zoom, duration: 700 });
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedZone) setSelectedZone(null);
      else if (selectedAlert) setSelectedAlert(null);
      else if (focusedSpeciesRule) {
        setOnlySpeciesZones(false);
        onClearFocusedSpecies?.();
      } else if (showFreshwaterSheet) {
        setShowFreshwaterSheet(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedZone, selectedAlert, focusedSpeciesRule, showFreshwaterSheet, onClearFocusedSpecies]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setMapError('Géolocalisation indisponible sur cet appareil.');
      return;
    }
    setMapError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 12.5,
          duration: 850,
        });
      },
      () => {
        setMapError('Position GPS refusée ou indisponible.');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const selectCommune = (c: CommuneHit) => {
    setSearchQuery('');
    setCommuneResults([]);
    setSelectedZone(null);
    setSelectedAlert(null);
    setSelectedCommune(c.nom);

    if (regionsRef.current) {
      const reg = findFeatureByCode(regionsRef.current, c.codeRegion);
      if (reg) setSelectedRegion(reg.properties);
    }
    const dept = deptsRef.current ? findFeatureByCode(deptsRef.current, c.codeDepartement) : undefined;
    setSelectedDept(dept?.properties ?? { code: c.codeDepartement, nom: `Dép. ${c.codeDepartement}` });

    onSelectFacade(getFacadeForDepartment(c.codeDepartement));
    mapRef.current?.flyTo({
      center: c.centre.coordinates,
      zoom: 12.2,
      duration: 900,
    });
  };

  const badge = selectedZone ? TYPE_LABELS[selectedZone.type] ?? TYPE_LABELS.restriction : null;
  const zoneReference = selectedZone ? resolveZoneReference(selectedZone) : null;
  const alertReference = selectedAlert
    ? resolveSourceReference(
        selectedAlert.sourceName,
        selectedAlert.sourceUrl,
        `${selectedAlert.zoneName} dép. ${selectedAlert.departmentCode}`,
      )
    : null;

  return (
    <div className="map-wrapper" style={visible ? undefined : { display: 'none' }}>
      <div className="map-toolbar">
        <div className="commune-search-wrap">
          <div className="search-bar compact-search">
            <Search size={16} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Aller à une ville / commune (ex: Le Guilvinec, Île-Tudy...)"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => {
                  setSearchQuery('');
                  setCommuneResults([]);
                }}
                aria-label="Effacer la recherche"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {communeResults.length > 0 && (
            <ul className="commune-dropdown">
              {communeResults.map((c) => (
                <li key={c.code}>
                  <button type="button" onClick={() => selectCommune(c)}>
                    <MapPin size={14} />
                    <span>
                      <strong>{c.nom}</strong> ({c.codeDepartement})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav className="breadcrumb" aria-label="Fil d'Ariane géographique">
          <button type="button" className="crumb-btn" onClick={resetToFrance}>
            France
          </button>
          {selectedRegion && (
            <>
              <ChevronRight size={14} />
              <button type="button" className="crumb-btn" onClick={backToRegion}>
                {selectedRegion.nom}
              </button>
            </>
          )}
          {selectedDept && (
            <>
              <ChevronRight size={14} />
              <span className="crumb-current">
                {selectedDept.nom} ({selectedDept.code})
              </span>
            </>
          )}
          {selectedCommune && (
            <>
              <ChevronRight size={14} />
              <span className="crumb-current">{selectedCommune}</span>
            </>
          )}
        </nav>

        {environment === 'sea' ? (
          <>
            <div className="map-subbar">
              <div className="facade-mini-pills" role="group" aria-label="Façade maritime">
                {(['NAMO', 'MEMN', 'SA', 'MED'] as FacadeCode[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`mini-pill ${selectedFacade === f ? 'mini-pill-active' : ''}`}
                    onClick={() => handleManualFacade(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <span className="zone-counter">
                <Layers size={14} />
                {loadingZones ? 'Chargement...' : `${filteredZoneCount} zones (${selectedFacade})`}
              </span>
              <button type="button" className="quick-spot-btn" onClick={onOpenSpecies}>
                <Fish size={14} /> Mailles {selectedFacade}
              </button>
            </div>

            <div className="legend-row" role="group" aria-label="Filtrer par type de zone">
              <button
                type="button"
                className={`legend-chip ${zoneFilter === 'all' ? 'legend-chip-active' : ''}`}
                onClick={() => setZoneFilter('all')}
              >
                Toutes
              </button>
              {(['prohibition', 'reserve', 'sanitary', 'restriction'] as const).map((typeKey) => {
                const info = TYPE_LABELS[typeKey];
                return (
                  <button
                    key={typeKey}
                    type="button"
                    className={`legend-chip ${zoneFilter === typeKey ? 'legend-chip-active' : ''}`}
                    onClick={() => setZoneFilter(zoneFilter === typeKey ? 'all' : typeKey)}
                  >
                    <span className="legend-dot" style={{ backgroundColor: info.color }} />
                    {info.shortLabel}
                  </button>
                );
              })}
              <label
                className={`legend-option ${showEpandage ? 'legend-option-active' : ''}`}
                title="Afficher les zones d'interdiction d'épandage agricole (hors pêche de loisir)"
              >
                <input
                  type="checkbox"
                  checked={showEpandage}
                  onChange={(e) => setShowEpandage(e.target.checked)}
                />
                <span>Épandage (agri)</span>
              </label>
              <label
                className={`legend-option ${showSpatioTemporelle ? 'legend-option-active' : ''}`}
                title="Afficher les fermetures spatio-temporelles (pêche professionnelle / protection cétacés)"
              >
                <input
                  type="checkbox"
                  checked={showSpatioTemporelle}
                  onChange={(e) => setShowSpatioTemporelle(e.target.checked)}
                />
                <span>Spatio-temporelle</span>
              </label>
            </div>
          </>
        ) : (
          <div className="map-subbar">
            <span className="zone-counter">
              <Layers size={14} />
              Eau douce · 1ère &amp; 2ème cat. · VigiEau / Hub&apos;Eau
            </span>
            <button type="button" className="quick-spot-btn" onClick={onOpenSpecies}>
              <Fish size={14} /> Mailles Eau douce
            </button>
          </div>
        )}

        {trackToDisplay && (
          <div className="session-bar">
            <span className="session-status">
              <Navigation size={13} />
              <strong>{trackToDisplay.name || 'Tracé'}</strong> ·{' '}
              {isActiveTrack
                ? trackToDisplay.status === 'active'
                  ? 'GPS actif'
                  : 'En pause'
                : 'Affiché'}{' '}
              · {trackToDisplay.distanceKm} km
            </span>
            {onOpenTracks && (
              <button type="button" className="chip" onClick={onOpenTracks}>
                Gérer
              </button>
            )}
            {!isActiveTrack && onHideDisplayedTrack && (
              <button type="button" className="chip" onClick={onHideDisplayedTrack}>
                Masquer
              </button>
            )}
          </div>
        )}

        {deptAlerts.length > 0 && (
          <button
            type="button"
            className="dept-alert-banner"
            onClick={() => {
              setSelectedZone(null);
              setSelectedAlert(deptAlerts[0]);
            }}
          >
            <AlertTriangle size={15} />
            <span>
              <strong>
                Alerte dép. {selectedDept?.code}
                {deptAlerts.length > 1 ? ` (${deptAlerts.length})` : ''} :
              </strong>{' '}
              {deptAlerts[0].zoneName}
            </span>
          </button>
        )}

        {mapError && <div className="inline-error">{mapError}</div>}
      </div>

      <div ref={containerRef} className="map-canvas" />

      <button
        type="button"
        className="locate-me-btn"
        onClick={handleLocateMe}
        aria-label="Centrer sur ma position GPS"
        title="Ma position"
      >
        <LocateFixed size={19} />
      </button>

      {selectedZone && badge && (
        <div className="zone-sheet" role="dialog" aria-label="Détail de la zone">
          <div className="sheet-grabber" aria-hidden="true" />
          <div className="zone-sheet-header">
            <span className="zone-badge" style={{ backgroundColor: badge.color }}>
              {badge.label}
            </span>
            <span className="zone-source">{selectedZone.source}</span>
            <button
              type="button"
              className="icon-close"
              onClick={() => setSelectedZone(null)}
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>
          <h3>{selectedZone.name}</h3>
          {selectedZone.resume && <p className="zone-resume">{selectedZone.resume}</p>}
          {selectedZone.refReg && (
            <p className="zone-ref">
              <strong>Référence :</strong> {selectedZone.refReg}
            </p>
          )}
          {selectedZone.prohibitionPeriods && (
            <p className="zone-ref">
              <strong>Fermeture :</strong> {selectedZone.prohibitionPeriods}
            </p>
          )}
          {selectedZone.authorizationPeriods && (
            <p className="zone-ref">
              <strong>Ouverture :</strong> {selectedZone.authorizationPeriods}
            </p>
          )}
          {zoneReference && (
            <a
              href={zoneReference.href}
              target="_blank"
              rel="noopener noreferrer"
              className="zone-link"
            >
              {zoneReference.isDirect ? 'Consulter le texte officiel' : 'Rechercher la référence'}{' '}
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      )}

      {focusedSpeciesRule && !selectedZone && !selectedAlert && (
        <div className="zone-sheet species-focus-sheet" role="dialog" aria-label="Localisation et réglementation de l'espèce">
          <div className="sheet-grabber" aria-hidden="true" />
          <div className="zone-sheet-header">
            <span className="zone-badge" style={{ backgroundColor: '#0b4f6c' }}>
              Espèce ciblée
            </span>
            <span className="zone-source">
              Façade {focusedSpeciesRule.facade}
              {focusedSpeciesRule.rule.subZone
                ? ` · ${focusedSpeciesRule.rule.subZone.replace(/_/g, ' ')}`
                : ''}
            </span>
            <button
              type="button"
              className="icon-close"
              onClick={() => {
                setOnlySpeciesZones(false);
                onClearFocusedSpecies?.();
              }}
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>
          <h3>{focusedSpeciesRule.species.commonName}</h3>
          {focusedSpeciesRule.rule.environment === 'freshwater' ? (
            <p className="zone-resume">
              <strong>Où pêcher :</strong> Cours d&apos;eau et plans d&apos;eau (
              {focusedSpeciesRule.rule.freshwaterCategory === '1ere'
                ? '1ère catégorie'
                : focusedSpeciesRule.rule.freshwaterCategory === '2eme'
                  ? '2ème catégorie'
                  : '1ère & 2ème catégories'}
              ) hors réserves et arrêtés sécheresse VigiEau. Cliquez sur un département pour voir
              les données locales.
            </p>
          ) : (
            <p className="zone-resume">
              <strong>Où pêcher :</strong> Pêche autorisée sur la façade{' '}
              <strong>{focusedSpeciesRule.facade}</strong>
              {focusedSpeciesRule.rule.subZone
                ? ` (${focusedSpeciesRule.rule.subZone.replace(/_/g, ' ')})`
                : ''}{' '}
              hors zones interdites et réserves.
            </p>
          )}
          <p className="zone-ref">
            <strong>Réglementation :</strong>{' '}
            {focusedSpeciesRule.rule.minSizeCm !== undefined
              ? `Maille ${focusedSpeciesRule.rule.minSizeCm} cm`
              : focusedSpeciesRule.rule.minWeightG !== undefined
                ? `Poids min. ${
                    focusedSpeciesRule.rule.minWeightG >= 1000
                      ? `${focusedSpeciesRule.rule.minWeightG / 1000} kg`
                      : `${focusedSpeciesRule.rule.minWeightG} g`
                  }`
                : 'Pas de taille minimale nationale'}
            {focusedSpeciesRule.rule.quotaPerDay !== undefined
              ? ` · Quota ${focusedSpeciesRule.rule.quotaPerDay} / jour`
              : ''}
            {focusedSpeciesRule.rule.markingRequired ? ' · Marquage obligatoire' : ''}
            {focusedSpeciesRule.rule.declarationRequired ? ' · Déclaration UE' : ''}
          </p>
          {focusedSpeciesRule.rule.closedPeriods &&
            focusedSpeciesRule.rule.closedPeriods.length > 0 && (
              <p className="zone-ref">
                <strong>Fermeture :</strong>{' '}
                {focusedSpeciesRule.rule.closedPeriods
                  .map((p) => `${p.start} → ${p.end}${p.note ? ` (${p.note})` : ''}`)
                  .join(' ; ')}
              </p>
            )}
          {spotRec && (
            <div className="spot-rec-box">
              <p className="zone-ref">
                <strong>Recommandation spots :</strong> {spotRec.seasonSummary}
              </p>
              <p className="zone-ref">
                <strong>Météo / Mer :</strong> {spotRec.conditions.verdict}
                {spotRec.conditions.windKmh !== undefined
                  ? ` · Vent ${spotRec.conditions.windKmh} km/h`
                  : ''}
                {spotRec.conditions.waveHeightM !== undefined
                  ? ` · Houle ${spotRec.conditions.waveHeightM} m`
                  : ''}
              </p>
              <p className="zone-ref">
                <strong>Secteurs conseillés :</strong> {spotRec.sectors.join(' · ')}
              </p>
            </div>
          )}
          {focusedSpeciesRule.rule.environment === 'sea' && (
            <div className="species-zones-box">
              {speciesMatchingFeatures.length > 0 ? (
                <>
                  <div className="species-zones-row">
                    <span className="zone-ref">
                      <strong>{speciesMatchingFeatures.length}</strong> zone(s) réglementée(s)
                      mentionnant cette espèce sur {focusedSpeciesRule.facade}.
                    </span>
                    <button
                      type="button"
                      className={`mini-pill ${onlySpeciesZones ? 'mini-pill-active' : ''}`}
                      onClick={() => setOnlySpeciesZones((v) => !v)}
                    >
                      {onlySpeciesZones ? 'Toutes les zones' : 'Filtrer sur cette espèce'}
                    </button>
                  </div>
                  <div className="species-zone-chips">
                    {speciesMatchingFeatures.slice(0, 4).map((feat) => (
                      <button
                        key={feat.properties.id}
                        type="button"
                        className="chip"
                        onClick={() => focusZoneFeature(feat)}
                      >
                        <MapPin size={12} /> {feat.properties.name}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="zone-ref">
                  Aucune zone spécifique à cette espèce sur {focusedSpeciesRule.facade} ; les
                  interdictions générales et réserves de la façade restent applicables.
                </p>
              )}
            </div>
          )}
          {speciesMatchingAlerts.length > 0 && (
            <div className="species-alert-row">
              {speciesMatchingAlerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  className="dept-alert-banner"
                  onClick={() => {
                    setSelectedZone(null);
                    setSelectedAlert(alert);
                  }}
                >
                  <AlertTriangle size={14} />
                  <span>
                    Alerte sanitaire dép. {alert.departmentCode} : {alert.zoneName}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {environment === 'freshwater' &&
        selectedDept &&
        showFreshwaterSheet &&
        !selectedZone &&
        !selectedAlert &&
        !focusedSpeciesRule && (
          <div className="zone-sheet freshwater-dept-sheet" role="dialog" aria-label="Infos eau douce département">
            <div className="sheet-grabber" aria-hidden="true" />
            <div className="zone-sheet-header">
              <span className="zone-badge" style={{ backgroundColor: '#0f766e' }}>
                Eau douce · Dép. {selectedDept.code}
              </span>
              <span className="zone-source">{selectedDept.nom}</span>
              <button
                type="button"
                className="icon-close"
                onClick={() => setShowFreshwaterSheet(false)}
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
            <h3>Rivières &amp; plans d&apos;eau ({selectedDept.nom})</h3>
            <p className="zone-ref">
              <strong>Sécheresse (VigiEau) :</strong>{' '}
              {droughtInfo
                ? `${droughtInfo.maxLevel} (${droughtInfo.zonesCount} zone(s))`
                : 'Vérifier les arrêtés locaux en ligne'}
            </p>
            {fishInfo && fishInfo.speciesNames.length > 0 && (
              <p className="zone-ref">
                <strong>Espèces recensées (Hub&apos;Eau) :</strong>{' '}
                {fishInfo.speciesNames.join(', ')}
              </p>
            )}
            <div className="species-zone-chips">
              <a
                href="https://www.geopeche.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="zone-link"
              >
                Parcours Géopêche (1ère/2ème cat., no-kill) <ExternalLink size={13} />
              </a>
              <a
                href="https://vigieau.gouv.fr/"
                target="_blank"
                rel="noopener noreferrer"
                className="zone-link"
              >
                VigiEau sécheresse <ExternalLink size={13} />
              </a>
            </div>
          </div>
        )}

      {selectedAlert && (
        <div className="zone-sheet" role="dialog" aria-label="Détail de l'alerte sanitaire">
          <div className="sheet-grabber" aria-hidden="true" />
          <div className="zone-sheet-header">
            <span className="zone-badge" style={{ backgroundColor: '#9333ea' }}>
              Alerte sanitaire ({selectedAlert.status === 'closed' ? 'Fermé' : 'Vigilance'})
            </span>
            <span className="zone-source">Dép. {selectedAlert.departmentCode}</span>
            <button
              type="button"
              className="icon-close"
              onClick={() => setSelectedAlert(null)}
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>
          <h3>{selectedAlert.zoneName}</h3>
          {selectedAlert.reason && <p className="zone-resume">{selectedAlert.reason}</p>}
          {selectedAlert.speciesAffected.length > 0 && (
            <p className="zone-ref">
              <strong>Espèces concernées :</strong> {selectedAlert.speciesAffected.join(', ')}
            </p>
          )}
          <p className="zone-ref">
            <strong>Source :</strong> {selectedAlert.sourceName}
          </p>
          {alertReference && (
            <a
              href={alertReference.href}
              target="_blank"
              rel="noopener noreferrer"
              className="zone-link"
            >
              {alertReference.isDirect ? "Consulter l'arrêté / source" : 'Rechercher la source'}{' '}
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
