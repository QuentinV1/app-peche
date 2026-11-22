/**
 * Modèle de données unifié — Application Pêche France (PWA & APK)
 * Partagé entre le pipeline d'ingestion (data-pipeline/) et l'application mobile.
 */

export type EnvironmentType = 'sea' | 'freshwater' | 'both';

export type MaritimeFacade =
  | 'MEMN'     // Manche Est - Mer du Nord
  | 'NAMO'     // Nord Atlantique - Manche Ouest
  | 'SA'       // Sud-Atlantique
  | 'MED'      // Méditerranée
  | 'NATIONAL';

export type SpeciesCategory =
  | 'fish'
  | 'crustacean'
  | 'shellfish'
  | 'cephalopod';

export interface SourceTrace {
  sourceName: string;
  sourceUrl: string;
  effectiveDate?: string;   // ISO 8601 (YYYY-MM-DD)
  lastCheckedAt: string;    // ISO 8601
}

export interface Species {
  id: string;               // ex: "dicentrarchus-labrax"
  commonName: string;       // ex: "Bar européen (Loup)"
  scientificName: string;   // ex: "Dicentrarchus labrax"
  aliases: string[];        // ex: ["bar", "loup", "bar commun"]
  category: SpeciesCategory;
  environment: EnvironmentType;
  imageUrl?: string;
  measureMethod?: string;   // ex: "Longueur totale : du bout du museau à l'extrémité de la nageoire caudale"
  /** Mois de présence / pic saisonnier (1 = janvier .. 12 = décembre) */
  peakMonths?: number[];
}

export interface DateRange {
  start: string;            // Format "MM-DD" ou "YYYY-MM-DD"
  end: string;              // Format "MM-DD" ou "YYYY-MM-DD"
  note?: string;            // ex: "No-kill obligatoire uniquement"
}

export interface RegulationRule extends SourceTrace {
  id: string;
  speciesId: string;
  environment: 'sea' | 'freshwater';
  facade?: MaritimeFacade;
  /** Catégorie piscicole eau douce (1re, 2e ou les deux) */
  freshwaterCategory?: '1ere' | '2eme' | 'both';
  /** Sous-zone spécifique (ex: "sud_48N", "nord_48N", "riviere_pont_labbe") */
  subZone?: string;
  /** Code département INSEE si règle départementale/régionale (ex: "29") */
  departmentCode?: string;
  regionCode?: string;
  /** Taille minimale de capture en centimètres */
  minSizeCm?: number;
  /** Poids minimal en grammes (si applicable) */
  minWeightG?: number;
  /** Nombre max de captures par pêcheur et par jour */
  quotaPerDay?: number;
  /** Unité du quota (défaut: "individus") */
  quotaUnit?: 'individuals' | 'kg';
  openPeriods?: DateRange[];
  closedPeriods?: DateRange[];
  /** Marquage obligatoire (ex: ablation nageoire caudale) */
  markingRequired: boolean;
  markingDetails?: string;
  /** Déclaration / enregistrement obligatoire (ex: RecFishing) */
  declarationRequired: boolean;
  declarationDetails?: string;
  gearRestrictions?: string[];
  notes?: string;
}

export type ZoneRuleType =
  | 'prohibition'   // Interdiction totale ou partielle
  | 'restriction'   // Soumis à conditions / licence / période
  | 'reserve'       // Réserve naturelle / cantonnement
  | 'sanitary'      // Alerte ou fermeture sanitaire
  | 'limit';        // Limite administrative / maritime (3 milles, 6 milles, 48e parallèle)

export interface ZoneProperties {
  id: string;
  source: 'CACEM' | 'CNSP' | 'DPMA_SHOM' | 'ARS_PREF';
  name: string;
  type: ZoneRuleType;
  facade?: MaritimeFacade | string;
  themes: string[];
  resume?: string;
  refReg?: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  prohibitionPeriods?: string;
  authorizationPeriods?: string;
}

export type SanitaryStatus = 'open' | 'warning' | 'closed' | 'unknown';

export interface SanitaryAlert extends SourceTrace {
  id: string;
  zoneName: string;
  departmentCode: string;
  commune?: string;
  status: SanitaryStatus;
  reason?: string;
  speciesAffected: string[];
  /** Indique si l'interdiction concerne le loisir même en cas de réouverture pro */
  recreationalBanned?: boolean;
}

export interface ManifestSourceInfo {
  id: string;
  name: string;
  datasetId?: string;
  url: string;
  lastModified: string;
  recordCount: number;
}

export interface DataManifest {
  version: string;          // ex: "2026.11.17.1"
  generatedAt: string;      // ISO 8601
  sources: ManifestSourceInfo[];
  checksums?: Record<string, string>;
  files: {
    zones: string;
    species: string;
    regulations: string;
    alerts: string;
  };
}

export interface CatchEntry {
  id: string;
  speciesId?: string;
  speciesName: string;
  environment: 'sea' | 'freshwater';
  sizeCm?: number;
  weightG?: number;
  released: boolean;
  date: string; // ISO 8601
  lat?: number;
  lng?: number;
  locationLabel?: string;
  photoDataUrl?: string;
  notes?: string;
}

export interface SessionPoint {
  lat: number;
  lng: number;
  timestamp: string;
  accuracy?: number;
  speedKts?: number;
  speedKmh?: number;
  headingDeg?: number;
}

export type WaypointKind = 'spot' | 'catch' | 'anchor' | 'hazard';

export interface SessionWaypoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  kind: WaypointKind;
  timestamp: string;
}

export interface FishingSession {
  id: string;
  name?: string;
  date?: string; // YYYY-MM-DD
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'paused' | 'completed';
  environment: 'sea' | 'freshwater';
  points: SessionPoint[];
  waypoints?: SessionWaypoint[];
  distanceKm: number;
  maxSpeedKts?: number;
  avgSpeedKts?: number;
  source?: 'gps' | 'gpx';
}
