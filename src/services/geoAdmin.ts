import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { getDb, type FacadeCode } from './dataStore';

export interface AdminProperties {
  code: string;
  nom: string;
}

export interface CommuneHit {
  nom: string;
  code: string;
  codeDepartement: string;
  codeRegion: string;
  centre: { type: 'Point'; coordinates: [number, number] };
}

const REGION_TO_FACADE: Record<string, FacadeCode> = {
  '32': 'MEMN', // Hauts-de-France
  '28': 'MEMN', // Normandie
  '53': 'NAMO', // Bretagne
  '52': 'NAMO', // Pays de la Loire
  '75': 'SA',   // Nouvelle-Aquitaine
  '76': 'MED',  // Occitanie
  '93': 'MED',  // PACA
  '94': 'MED',  // Corse
};

const DEPT_TO_FACADE: Record<string, FacadeCode> = {
  '59': 'MEMN', '62': 'MEMN', '80': 'MEMN', '76': 'MEMN', '27': 'MEMN', '14': 'MEMN', '50': 'MEMN',
  '35': 'NAMO', '22': 'NAMO', '29': 'NAMO', '56': 'NAMO', '44': 'NAMO', '85': 'NAMO',
  '17': 'SA', '33': 'SA', '40': 'SA', '64': 'SA',
  '66': 'MED', '11': 'MED', '34': 'MED', '30': 'MED', '13': 'MED', '83': 'MED', '06': 'MED', '2A': 'MED', '2B': 'MED',
};

export function getFacadeForRegion(code: string): FacadeCode {
  return REGION_TO_FACADE[code] ?? 'NAMO';
}

export function getFacadeForDepartment(code: string): FacadeCode {
  return DEPT_TO_FACADE[code] ?? 'NAMO';
}

/** Calcule la bounding box [minLon, minLat, maxLon, maxLat] d'une géométrie GeoJSON */
export function computeBBox(geometry: Geometry): [[number, number], [number, number]] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      if (coords[0] < minX) minX = coords[0];
      if (coords[0] > maxX) maxX = coords[0];
      if (coords[1] < minY) minY = coords[1];
      if (coords[1] > maxY) maxY = coords[1];
    } else {
      for (const item of coords) visit(item);
    }
  };

  if ('coordinates' in geometry) {
    visit(geometry.coordinates);
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

export async function loadAdminLayer(
  type: 'regions' | 'departements'
): Promise<FeatureCollection<Geometry, AdminProperties>> {
  const db = await getDb();
  const key = `admin-${type}`;
  const cached = (await db.get('datasets', key)) as
    | FeatureCollection<Geometry, AdminProperties>
    | undefined;

  if (cached && !navigator.onLine) {
    return cached;
  }

  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/admin/${type}.geojson`);
    if (!res.ok) throw new Error(`Impossible de charger ${type}.geojson`);
    const data = (await res.json()) as FeatureCollection<Geometry, AdminProperties>;
    await db.put('datasets', data, key);
    return data;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

const OFFLINE_COMMUNES: CommuneHit[] = [
  // MEMN
  { nom: 'Dunkerque', code: '59183', codeDepartement: '59', codeRegion: '32', centre: { type: 'Point', coordinates: [2.377, 51.034] } },
  { nom: 'Boulogne-sur-Mer', code: '62160', codeDepartement: '62', codeRegion: '32', centre: { type: 'Point', coordinates: [1.614, 50.726] } },
  { nom: 'Le Crotoy', code: '80228', codeDepartement: '80', codeRegion: '32', centre: { type: 'Point', coordinates: [1.625, 50.216] } },
  { nom: 'Dieppe', code: '76217', codeDepartement: '76', codeRegion: '28', centre: { type: 'Point', coordinates: [1.078, 49.924] } },
  { nom: 'Étretat', code: '76254', codeDepartement: '76', codeRegion: '28', centre: { type: 'Point', coordinates: [0.207, 49.707] } },
  { nom: 'Le Havre', code: '76351', codeDepartement: '76', codeRegion: '28', centre: { type: 'Point', coordinates: [0.107, 49.494] } },
  { nom: 'Ouistreham', code: '14488', codeDepartement: '14', codeRegion: '28', centre: { type: 'Point', coordinates: [-0.258, 49.276] } },
  { nom: 'Cherbourg-en-Cotentin', code: '50129', codeDepartement: '50', codeRegion: '28', centre: { type: 'Point', coordinates: [-1.622, 49.634] } },
  { nom: 'Granville', code: '50218', codeDepartement: '50', codeRegion: '28', centre: { type: 'Point', coordinates: [-1.597, 48.838] } },
  // NAMO
  { nom: 'Cancale', code: '35049', codeDepartement: '35', codeRegion: '53', centre: { type: 'Point', coordinates: [-1.852, 48.677] } },
  { nom: 'Saint-Malo', code: '35288', codeDepartement: '35', codeRegion: '53', centre: { type: 'Point', coordinates: [-2.008, 48.649] } },
  { nom: 'Erquy', code: '22054', codeDepartement: '22', codeRegion: '53', centre: { type: 'Point', coordinates: [-2.464, 48.632] } },
  { nom: 'Paimpol', code: '22162', codeDepartement: '22', codeRegion: '53', centre: { type: 'Point', coordinates: [-3.047, 48.779] } },
  { nom: 'Roscoff', code: '29239', codeDepartement: '29', codeRegion: '53', centre: { type: 'Point', coordinates: [-3.985, 48.726] } },
  { nom: 'Brest', code: '29019', codeDepartement: '29', codeRegion: '53', centre: { type: 'Point', coordinates: [-4.486, 48.39] } },
  { nom: 'Crozon', code: '29042', codeDepartement: '29', codeRegion: '53', centre: { type: 'Point', coordinates: [-4.489, 48.246] } },
  { nom: 'Douarnenez', code: '29046', codeDepartement: '29', codeRegion: '53', centre: { type: 'Point', coordinates: [-4.331, 48.093] } },
  { nom: 'Le Guilvinec', code: '29072', codeDepartement: '29', codeRegion: '53', centre: { type: 'Point', coordinates: [-4.283, 47.795] } },
  { nom: 'Île-Tudy', code: '29085', codeDepartement: '29', codeRegion: '53', centre: { type: 'Point', coordinates: [-4.167, 47.843] } },
  { nom: 'Loctudy', code: '29135', codeDepartement: '29', codeRegion: '53', centre: { type: 'Point', coordinates: [-4.175, 47.832] } },
  { nom: 'Concarneau', code: '29039', codeDepartement: '29', codeRegion: '53', centre: { type: 'Point', coordinates: [-3.918, 47.873] } },
  { nom: 'Lorient', code: '56121', codeDepartement: '56', codeRegion: '53', centre: { type: 'Point', coordinates: [-3.366, 47.748] } },
  { nom: 'Quiberon', code: '56186', codeDepartement: '56', codeRegion: '53', centre: { type: 'Point', coordinates: [-3.129, 47.484] } },
  { nom: 'Vannes', code: '56260', codeDepartement: '56', codeRegion: '53', centre: { type: 'Point', coordinates: [-2.757, 47.658] } },
  { nom: 'Le Croisic', code: '44049', codeDepartement: '44', codeRegion: '52', centre: { type: 'Point', coordinates: [-2.51, 47.293] } },
  { nom: 'La Baule-Escoublac', code: '44055', codeDepartement: '44', codeRegion: '52', centre: { type: 'Point', coordinates: [-2.392, 47.286] } },
  { nom: 'Pornic', code: '44131', codeDepartement: '44', codeRegion: '52', centre: { type: 'Point', coordinates: [-2.102, 47.116] } },
  { nom: "Noirmoutier-en-l'Île", code: '85163', codeDepartement: '85', codeRegion: '52', centre: { type: 'Point', coordinates: [-2.242, 47.001] } },
  { nom: "Les Sables-d'Olonne", code: '85194', codeDepartement: '85', codeRegion: '52', centre: { type: 'Point', coordinates: [-1.783, 46.497] } },
  // SA
  { nom: 'La Rochelle', code: '17300', codeDepartement: '17', codeRegion: '75', centre: { type: 'Point', coordinates: [-1.151, 46.16] } },
  { nom: "Saint-Pierre-d'Oléron", code: '17385', codeDepartement: '17', codeRegion: '75', centre: { type: 'Point', coordinates: [-1.306, 45.944] } },
  { nom: 'Royan', code: '17306', codeDepartement: '17', codeRegion: '75', centre: { type: 'Point', coordinates: [-1.028, 45.625] } },
  { nom: 'Arcachon', code: '33009', codeDepartement: '33', codeRegion: '75', centre: { type: 'Point', coordinates: [-1.168, 44.661] } },
  { nom: 'Lège-Cap-Ferret', code: '33236', codeDepartement: '33', codeRegion: '75', centre: { type: 'Point', coordinates: [-1.246, 44.793] } },
  { nom: 'Capbreton', code: '40065', codeDepartement: '40', codeRegion: '75', centre: { type: 'Point', coordinates: [-1.429, 43.642] } },
  { nom: 'Biarritz', code: '64122', codeDepartement: '64', codeRegion: '75', centre: { type: 'Point', coordinates: [-1.558, 43.483] } },
  { nom: 'Saint-Jean-de-Luz', code: '64483', codeDepartement: '64', codeRegion: '75', centre: { type: 'Point', coordinates: [-1.663, 43.388] } },
  // MED
  { nom: 'Collioure', code: '66053', codeDepartement: '66', codeRegion: '76', centre: { type: 'Point', coordinates: [3.082, 42.526] } },
  { nom: 'Leucate', code: '11202', codeDepartement: '11', codeRegion: '76', centre: { type: 'Point', coordinates: [3.029, 42.91] } },
  { nom: 'Agde', code: '34003', codeDepartement: '34', codeRegion: '76', centre: { type: 'Point', coordinates: [3.473, 43.31] } },
  { nom: 'Sète', code: '34301', codeDepartement: '34', codeRegion: '76', centre: { type: 'Point', coordinates: [3.696, 43.405] } },
  { nom: 'Le Grau-du-Roi', code: '30133', codeDepartement: '30', codeRegion: '76', centre: { type: 'Point', coordinates: [4.138, 43.538] } },
  { nom: 'Martigues', code: '13056', codeDepartement: '13', codeRegion: '93', centre: { type: 'Point', coordinates: [5.055, 43.405] } },
  { nom: 'Marseille', code: '13055', codeDepartement: '13', codeRegion: '93', centre: { type: 'Point', coordinates: [5.369, 43.296] } },
  { nom: 'Cassis', code: '13022', codeDepartement: '13', codeRegion: '93', centre: { type: 'Point', coordinates: [5.539, 43.214] } },
  { nom: 'Toulon', code: '83137', codeDepartement: '83', codeRegion: '93', centre: { type: 'Point', coordinates: [5.928, 43.124] } },
  { nom: 'Hyères', code: '83069', codeDepartement: '83', codeRegion: '93', centre: { type: 'Point', coordinates: [6.129, 43.12] } },
  { nom: 'Saint-Tropez', code: '83119', codeDepartement: '83', codeRegion: '93', centre: { type: 'Point', coordinates: [6.64, 43.267] } },
  { nom: 'Antibes', code: '06004', codeDepartement: '06', codeRegion: '93', centre: { type: 'Point', coordinates: [7.125, 43.58] } },
  { nom: 'Nice', code: '06088', codeDepartement: '06', codeRegion: '93', centre: { type: 'Point', coordinates: [7.262, 43.71] } },
  { nom: 'Ajaccio', code: '2A004', codeDepartement: '2A', codeRegion: '94', centre: { type: 'Point', coordinates: [8.738, 41.919] } },
  { nom: 'Bastia', code: '2B033', codeDepartement: '2B', codeRegion: '94', centre: { type: 'Point', coordinates: [9.45, 42.697] } },
];

export function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-']/g, ' ')
    .toLowerCase()
    .trim();
}

export async function searchCommunes(query: string): Promise<CommuneHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (navigator.onLine) {
    try {
      const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(
        q
      )}&fields=nom,code,codeDepartement,codeRegion,centre&boost=population&limit=6`;
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const remoteHits = (await res.json()) as CommuneHit[];
        if (remoteHits.length > 0) return remoteHits;
      }
    } catch {
      // Fallback hors-ligne ci-dessous (timeout ou absence réseau)
    }
  }
  const normQ = normalizeText(q);
  return OFFLINE_COMMUNES.filter(
    (c) => normalizeText(c.nom).includes(normQ) || c.codeDepartement.toLowerCase() === normQ
  ).slice(0, 8);
}

export function findFeatureByCode(
  collection: FeatureCollection<Geometry, AdminProperties>,
  code: string
): Feature<Geometry, AdminProperties> | undefined {
  return collection.features.find((f) => f.properties.code === code);
}
