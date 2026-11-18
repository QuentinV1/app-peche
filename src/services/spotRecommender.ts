import type { Species } from '../../schema/types';
import type { FacadeCode } from './dataStore';

export interface SpotConditions {
  windKmh?: number;
  waveHeightM?: number;
  tempC?: number;
  verdict: string;
}

export interface SpotRecommendation {
  inSeason: boolean;
  seasonSummary: string;
  sectors: string[];
  conditions: SpotConditions;
}

const FACADE_SECTORS: Record<FacadeCode, string[]> = {
  NAMO: ['Pointe du Raz / Audierne', 'Archipel des Glénan / Concarneau', 'Golfe du Morbihan (hors réserves)'],
  MEMN: ['Côte d’Opale / Cap Gris-Nez', 'Falaises d’Étretat / Fécamp', 'Côte de Nacre'],
  SA: ['Île de Ré / Pertuis d’Antioche', 'Bassin d’Arcachon (passes)', 'Côte basque / Saint-Jean-de-Luz'],
  MED: ['Côte Bleue (hors parc marin)', 'Îles d’Hyères (hors cœur de parc)', 'Cap d’Agde / Étang de Thau'],
};

const FRESHWATER_SECTORS = [
  'Cours d’eau 1ère catégorie (zones courantes & fosses)',
  'Grands fleuves & rivières 2ème catégorie (bordures & obstacles)',
  'Lacs de barrage & retenues (zones autorisées)',
];

/**
 * Récupère les conditions météo/houle en direct via Open-Meteo (sans clé API).
 */
export async function fetchSpotConditions(
  lat: number,
  lng: number,
  environment: 'sea' | 'freshwater',
): Promise<SpotConditions> {
  if (!navigator.onLine) {
    return { verdict: 'Hors-ligne — vérifier la météo et les marées localement' };
  }
  try {
    const weatherPromise = fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m`,
      { signal: AbortSignal.timeout(4500) },
    ).then((r) => (r.ok ? r.json() : null));

    const marinePromise =
      environment === 'sea'
        ? fetch(
            `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&current=wave_height`,
            { signal: AbortSignal.timeout(4500) },
          ).then((r) => (r.ok ? r.json() : null))
        : Promise.resolve(null);

    const [weather, marine] = await Promise.all([weatherPromise, marinePromise]);
    const windKmh = weather?.current?.wind_speed_10m as number | undefined;
    const tempC = weather?.current?.temperature_2m as number | undefined;
    const waveHeightM = marine?.current?.wave_height as number | undefined;

    let verdict = 'Conditions favorables';
    if ((windKmh !== undefined && windKmh > 35) || (waveHeightM !== undefined && waveHeightM > 1.8)) {
      verdict = 'Conditions agitées — prudence recommandée';
    } else if (windKmh === undefined && waveHeightM === undefined) {
      verdict = 'Données météo indisponibles';
    }

    return { windKmh, waveHeightM, tempC, verdict };
  } catch {
    return { verdict: 'Conditions indisponibles (réseau)' };
  }
}

export async function buildSpotRecommendation(
  species: Species,
  environment: 'sea' | 'freshwater',
  facade: FacadeCode,
  lat: number,
  lng: number,
): Promise<SpotRecommendation> {
  const currentMonth = new Date().getMonth() + 1;
  const inSeason = species.peakMonths ? species.peakMonths.includes(currentMonth) : true;
  const seasonSummary = inSeason
    ? `Période favorable pour ${species.commonName} ce mois-ci.`
    : `Hors pic saisonnier habituel pour ${species.commonName}.`;

  const conditions = await fetchSpotConditions(lat, lng, environment);
  const sectors = environment === 'sea' ? FACADE_SECTORS[facade] : FRESHWATER_SECTORS;

  return {
    inSeason,
    seasonSummary,
    sectors,
    conditions,
  };
}
