import type { FeatureCollection, Geometry, Position } from 'geojson';
import type { ZoneProperties } from '../../schema/types';

function pointInRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(lng: number, lat: number, rings: Position[][]): boolean {
  if (rings.length === 0 || !pointInRing(lng, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(lng, lat, rings[i])) return false;
  }
  return true;
}

export function findZonesAtPoint(
  lng: number,
  lat: number,
  geojson: FeatureCollection<Geometry, ZoneProperties> | null,
): ZoneProperties[] {
  if (!geojson) return [];
  const hits: ZoneProperties[] = [];
  for (const f of geojson.features) {
    if (!f.geometry || !f.properties) continue;
    const { type } = f.geometry;
    let matched = false;
    if (type === 'Polygon') {
      matched = pointInPolygonCoords(lng, lat, f.geometry.coordinates);
    } else if (type === 'MultiPolygon') {
      matched = f.geometry.coordinates.some((poly) => pointInPolygonCoords(lng, lat, poly));
    }
    if (matched) {
      hits.push(f.properties);
    }
  }
  return hits;
}
