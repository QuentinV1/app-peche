import type { FeatureCollection, Geometry } from 'geojson';
import type { FishingSession, SessionPoint } from '../../schema/types';
import { getDb, SESSIONS_STORE } from './dataStore';
import { planifierPushCloud } from './cloudSync';

export function haversineKm(a: SessionPoint, b: SessionPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function computeTrackDistanceKm(points: SessionPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return Number(total.toFixed(3));
}

export function kmToNauticalMiles(km: number): number {
  return Number((km / 1.852).toFixed(2));
}

export function computeBearingDeg(a: SessionPoint, b: SessionPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return Math.round((toDeg(Math.atan2(y, x)) + 360) % 360);
}

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

export function formatHeadingCardinal(deg?: number): string {
  if (deg === undefined || Number.isNaN(deg)) return '—';
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return `${Math.round(deg)}° ${CARDINALS[idx]}`;
}

export function formatDurationHms(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function computeSessionSpeeds(points: SessionPoint[]): { maxSpeedKts: number; avgSpeedKts: number } {
  if (points.length < 2) return { maxSpeedKts: 0, avgSpeedKts: 0 };
  let maxKts = 0;
  for (const pt of points) {
    if (pt.speedKts !== undefined && pt.speedKts > maxKts) {
      maxKts = pt.speedKts;
    }
  }
  const firstMs = Date.parse(points[0].timestamp);
  const lastMs = Date.parse(points[points.length - 1].timestamp);
  const hours = (lastMs - firstMs) / 3_600_000;
  const distNm = kmToNauticalMiles(computeTrackDistanceKm(points));
  const avgKts = hours > 0.0005 ? Number((distNm / hours).toFixed(1)) : 0;
  if (maxKts === 0 && avgKts > 0) {
    maxKts = avgKts;
  }
  return {
    maxSpeedKts: Number(maxKts.toFixed(1)),
    avgSpeedKts: avgKts,
  };
}

export function sessionToGeoJson(session: FishingSession | null): FeatureCollection<Geometry> {
  if (!session || (session.points.length === 0 && (!session.waypoints || session.waypoints.length === 0))) {
    return { type: 'FeatureCollection', features: [] };
  }
  const coords = session.points.map((p) => [p.lng, p.lat]);
  const features: FeatureCollection<Geometry>['features'] = [];
  if (coords.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { id: session.id, kind: 'track' },
      geometry: { type: 'LineString', coordinates: coords },
    });
  }
  if (coords.length >= 1) {
    const last = coords[coords.length - 1];
    features.push({
      type: 'Feature',
      properties: { id: `${session.id}-head`, kind: 'head' },
      geometry: { type: 'Point', coordinates: last },
    });
  }
  for (const wp of session.waypoints ?? []) {
    features.push({
      type: 'Feature',
      properties: {
        id: wp.id,
        kind: 'waypoint',
        waypointKind: wp.kind,
        label: wp.label,
      },
      geometry: { type: 'Point', coordinates: [wp.lng, wp.lat] },
    });
  }
  return { type: 'FeatureCollection', features };
}

export async function listSessions(): Promise<FishingSession[]> {
  const db = await getDb();
  const all = (await db.getAll(SESSIONS_STORE)) as FishingSession[];
  return all.sort((a, b) => {
    const dateA = a.date ?? a.startedAt.slice(0, 10);
    const dateB = b.date ?? b.startedAt.slice(0, 10);
    const cmp = dateB.localeCompare(dateA);
    return cmp !== 0 ? cmp : b.startedAt.localeCompare(a.startedAt);
  });
}

export async function saveSession(session: FishingSession, skipCloud = false): Promise<void> {
  const db = await getDb();
  await db.put(SESSIONS_STORE, session);
  if (!skipCloud && session.status !== 'active') {
    planifierPushCloud(false);
  }
}

export async function deleteSession(id: string, skipCloud = false): Promise<void> {
  const db = await getDb();
  await db.delete(SESSIONS_STORE, id);
  planifierPushCloud(skipCloud);
}
