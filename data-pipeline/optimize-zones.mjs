#!/usr/bin/env node
/**
 * Découpe data/zones.geojson par façade maritime (NAMO, MEMN, SA, MED, OTHER)
 * et simplifie les polygones (Douglas-Peucker) pour un chargement rapide sur PWA & APK.
 *
 * Usage:
 *   node data-pipeline/optimize-zones.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const FACADES_DIR = path.join(DATA_DIR, 'facades');
const TOLERANCE = 0.0003; // ~25-30 m

function perpDistSq(p, a, b) {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplifyDP(pts, tolSq) {
  if (pts.length <= 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let idx = 0;
    for (let i = first + 1; i < last; i++) {
      const d = perpDistSq(pts[i], pts[first], pts[last]);
      if (d > maxDist) {
        idx = i;
        maxDist = d;
      }
    }
    if (maxDist > tolSq) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }

  const out = [];
  for (let i = 0; i < pts.length; i++) {
    if (keep[i]) out.push(pts[i]);
  }
  return out.length >= 4 ? out : pts.slice(0, 4);
}

function simplifyGeometry(geom, tolSq) {
  if (geom.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geom.coordinates.map((ring) => simplifyDP(ring, tolSq)),
    };
  }
  if (geom.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geom.coordinates.map((poly) =>
        poly.map((ring) => simplifyDP(ring, tolSq))
      ),
    };
  }
  return geom;
}

function firstCoord(coords) {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') return coords;
  return firstCoord(coords[0]);
}

function mapFacadeBucket(raw = '', geometry = null) {
  const f = raw.toUpperCase();
  if (f.includes('NAMO')) return 'NAMO';
  if (f.includes('MEMN')) return 'MEMN';
  if (f.includes('SA') || f.includes('SUD-ATL') || f.includes('SUD ATL')) return 'SA';
  if (f.includes('MED')) return 'MED';

  // Fallback géographique pour les zones métropolitaines sans façade explicite (ex: règlements UE / CNSP)
  const pt = geometry?.coordinates ? firstCoord(geometry.coordinates) : null;
  if (pt) {
    const [lon, lat] = pt;
    if (lon >= -6.5 && lon <= 10.5 && lat >= 41.0 && lat <= 51.5) {
      if (lat < 44.0 && lon >= 2.5) return 'MED';
      if (lat >= 49.0 && lon >= -2.0) return 'MEMN';
      if (lat < 46.3 && lon < 0.5) return 'SA';
      return 'NAMO';
    }
  }
  return 'OTHER';
}

async function main() {
  await fs.mkdir(FACADES_DIR, { recursive: true });
  const raw = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'zones.geojson'), 'utf8'));
  const buckets = { NAMO: [], MEMN: [], SA: [], MED: [], OTHER: [] };
  const tolSq = TOLERANCE * TOLERANCE;

  for (const feat of raw.features) {
    const bucket = mapFacadeBucket(feat.properties?.facade, feat.geometry);
    buckets[bucket].push({
      ...feat,
      geometry: simplifyGeometry(feat.geometry, tolSq),
    });
  }

  for (const [facade, features] of Object.entries(buckets)) {
    const outPath = path.join(FACADES_DIR, `zones-${facade}.geojson`);
    await fs.writeFile(
      outPath,
      JSON.stringify({ type: 'FeatureCollection', features }),
      'utf8'
    );
    const stat = await fs.stat(outPath);
    console.log(`[facade] ${facade}: ${features.length} zones -> ${(stat.size / 1024 / 1024).toFixed(2)} Mo`);
  }
}

main().catch((err) => {
  console.error('[error]', err);
  process.exit(1);
});
