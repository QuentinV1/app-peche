import { openDB } from 'idb';
import type {
  DataManifest,
  RegulationRule,
  SanitaryAlert,
  Species,
  ZoneProperties,
} from '../../schema/types';
import type { FeatureCollection, Geometry } from 'geojson';

const DB_NAME = 'app-peche-offline';
const DB_VERSION = 3;
const STORE_NAME = 'datasets';
export const CATCHES_STORE = 'catches';
export const SESSIONS_STORE = 'sessions';

/**
 * URL de base distante optionnelle (ex: GitHub Pages / CDN) pour les mises à jour
 * OTA. Retombe sur `${BASE_URL}data/...` (bundle local PWA).
 */
const REMOTE_BASE = (import.meta.env.VITE_DATA_BASE_URL as string | undefined)?.replace(/\/$/, '');
const LOCAL_DATA_BASE = `${import.meta.env.BASE_URL}data`;

export async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(CATCHES_STORE)) {
        db.createObjectStore(CATCHES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
      }
    },
  });
}

export async function fetchJson<T>(relativePath: string): Promise<T> {
  const localUrl = `${LOCAL_DATA_BASE}/${relativePath}`;
  const urls = REMOTE_BASE ? [`${REMOTE_BASE}/${relativePath}`, localUrl] : [localUrl];
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function loadCoreData(forceRefresh = false): Promise<{
  manifest: DataManifest;
  species: Species[];
  regulations: RegulationRule[];
  alerts: SanitaryAlert[];
  fromCache: boolean;
}> {
  const db = await getDb();
  const cachedManifest = (await db.get(STORE_NAME, 'manifest')) as DataManifest | undefined;
  const cachedSpecies = (await db.get(STORE_NAME, 'species')) as Species[] | undefined;
  const cachedRegulations = (await db.get(STORE_NAME, 'regulations')) as RegulationRule[] | undefined;
  const cachedAlerts = (await db.get(STORE_NAME, 'alerts')) as SanitaryAlert[] | undefined;

  if (!forceRefresh && cachedManifest && cachedSpecies && cachedRegulations && cachedAlerts) {
    if (navigator.onLine) {
      try {
        const remoteManifest = await fetchJson<DataManifest>('manifest.json');
        const sameVersion = remoteManifest.version === cachedManifest.version;
        const sameChecksums =
          JSON.stringify(remoteManifest.checksums ?? {}) ===
          JSON.stringify(cachedManifest.checksums ?? {});
        if (sameVersion && sameChecksums) {
          return {
            manifest: cachedManifest,
            species: cachedSpecies,
            regulations: cachedRegulations,
            alerts: cachedAlerts,
            fromCache: true,
          };
        }
      } catch {
        return {
          manifest: cachedManifest,
          species: cachedSpecies,
          regulations: cachedRegulations,
          alerts: cachedAlerts,
          fromCache: true,
        };
      }
    } else {
      return {
        manifest: cachedManifest,
        species: cachedSpecies,
        regulations: cachedRegulations,
        alerts: cachedAlerts,
        fromCache: true,
      };
    }
  }

  try {
    const [manifest, species, regulations, alerts] = await Promise.all([
      fetchJson<DataManifest>('manifest.json'),
      fetchJson<Species[]>('species.json'),
      fetchJson<RegulationRule[]>('regulations.json'),
      fetchJson<SanitaryAlert[]>('alerts.json'),
    ]);

    // Si la version change, invalider les caches de façades pour forcer leur rafraîchissement
    if (cachedManifest && cachedManifest.version !== manifest.version) {
      for (const f of ['NAMO', 'MEMN', 'SA', 'MED'] as const) {
        await db.delete(STORE_NAME, `zones-${f}`);
      }
    }

    await db.put(STORE_NAME, manifest, 'manifest');
    await db.put(STORE_NAME, species, 'species');
    await db.put(STORE_NAME, regulations, 'regulations');
    await db.put(STORE_NAME, alerts, 'alerts');
    return { manifest, species, regulations, alerts, fromCache: false };
  } catch (err) {
    if (cachedManifest && cachedSpecies && cachedRegulations && cachedAlerts) {
      return {
        manifest: cachedManifest,
        species: cachedSpecies,
        regulations: cachedRegulations,
        alerts: cachedAlerts,
        fromCache: true,
      };
    }
    throw err;
  }
}

export type FacadeCode = 'NAMO' | 'MEMN' | 'SA' | 'MED';

export async function loadFacadeZones(
  facade: FacadeCode
): Promise<FeatureCollection<Geometry, ZoneProperties>> {
  const db = await getDb();
  const key = `zones-${facade}`;
  const cached = (await db.get(STORE_NAME, key)) as
    | FeatureCollection<Geometry, ZoneProperties>
    | undefined;

  if (cached && !navigator.onLine) {
    return cached;
  }

  try {
    const data = await fetchJson<FeatureCollection<Geometry, ZoneProperties>>(
      `facades/zones-${facade}.geojson`
    );
    await db.put(STORE_NAME, data, key);
    return data;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}
