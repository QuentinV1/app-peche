import type { FeatureCollection, Geometry } from 'geojson';
import type { FishingSession, SessionPoint } from '../../schema/types';
import { getDb, SESSIONS_STORE } from './dataStore';

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

export function sessionToGeoJson(session: FishingSession | null): FeatureCollection<Geometry> {
  if (!session || session.points.length === 0) {
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
  const last = coords[coords.length - 1];
  features.push({
    type: 'Feature',
    properties: { id: `${session.id}-head`, kind: 'head' },
    geometry: { type: 'Point', coordinates: last },
  });
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

export async function saveSession(session: FishingSession): Promise<void> {
  const db = await getDb();
  await db.put(SESSIONS_STORE, session);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(SESSIONS_STORE, id);
}
