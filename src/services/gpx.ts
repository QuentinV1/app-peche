import type { FishingSession, SessionPoint, SessionWaypoint } from '../../schema/types';
import type { FishingEnvironment } from '../App';
import {
  computeBearingDeg,
  computeSessionSpeeds,
  computeTrackDistanceKm,
  haversineKm,
} from './sessionStore';

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportSessionToGpx(session: FishingSession): string {
  const title = session.name || 'Tracé Pêche France';
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Peche France PWA" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <metadata>',
    `    <name>${escapeXml(title)}</name>`,
    `    <time>${escapeXml(session.startedAt)}</time>`,
    '  </metadata>',
  ];

  for (const wp of session.waypoints ?? []) {
    lines.push(
      `  <wpt lat="${wp.lat}" lon="${wp.lng}">`,
      `    <name>${escapeXml(wp.label)}</name>`,
      `    <type>${escapeXml(wp.kind)}</type>`,
      `    <time>${escapeXml(wp.timestamp)}</time>`,
      '  </wpt>',
    );
  }

  if (session.points.length > 0) {
    lines.push('  <trk>', `    <name>${escapeXml(title)}</name>`, '    <trkseg>');
    for (const pt of session.points) {
      lines.push(
        `      <trkpt lat="${pt.lat}" lon="${pt.lng}">`,
        `        <time>${escapeXml(pt.timestamp)}</time>`,
        '      </trkpt>',
      );
    }
    lines.push('    </trkseg>', '  </trk>');
  }

  lines.push('</gpx>');
  return lines.join('\n');
}

export function downloadGpxFile(session: FishingSession): void {
  const xml = exportSessionToGpx(session);
  const blob = new Blob([xml], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const slug = (session.name || session.id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/(^-|-$)/g, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug || 'trace-peche'}.gpx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function parseGpxToSession(
  gpxText: string,
  fallbackName: string,
  defaultEnvironment: FishingEnvironment,
): FishingSession {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gpxText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Fichier GPX invalide ou corrompu.');
  }

  const rawPoints: SessionPoint[] = [];
  const trkpts = Array.from(doc.querySelectorAll('trkpt, rtept'));
  const baseTimeMs = Date.now();

  for (let i = 0; i < trkpts.length; i += 1) {
    const el = trkpts[i];
    const lat = Number(el.getAttribute('lat'));
    const lng = Number(el.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const timeText = el.querySelector('time')?.textContent?.trim();
    const timestamp =
      timeText && !Number.isNaN(Date.parse(timeText))
        ? new Date(timeText).toISOString()
        : new Date(baseTimeMs + i * 5000).toISOString();

    const pt: SessionPoint = {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      timestamp,
    };

    if (rawPoints.length > 0) {
      const prev = rawPoints[rawPoints.length - 1];
      const dtHours = (Date.parse(pt.timestamp) - Date.parse(prev.timestamp)) / 3_600_000;
      const distKm = haversineKm(prev, pt);
      if (dtHours > 0.0001) {
        const kmh = distKm / dtHours;
        if (kmh <= 150) {
          pt.speedKmh = Number(kmh.toFixed(1));
          pt.speedKts = Number((kmh / 1.852).toFixed(1));
        }
      }
      if (distKm > 0.002) {
        pt.headingDeg = computeBearingDeg(prev, pt);
      }
    }
    rawPoints.push(pt);
  }

  const waypoints: SessionWaypoint[] = [];
  const wpts = Array.from(doc.querySelectorAll('wpt'));
  for (let i = 0; i < wpts.length; i += 1) {
    const el = wpts[i];
    const lat = Number(el.getAttribute('lat'));
    const lng = Number(el.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const label = el.querySelector('name')?.textContent?.trim() || `Point ${i + 1}`;
    const typeRaw = el.querySelector('type')?.textContent?.trim().toLowerCase();
    const kind: SessionWaypoint['kind'] =
      typeRaw === 'catch' || typeRaw === 'anchor' || typeRaw === 'hazard' ? typeRaw : 'spot';
    const timeText = el.querySelector('time')?.textContent?.trim();
    waypoints.push({
      id: `wp-gpx-${Date.now()}-${i}`,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      label: label.slice(0, 60),
      kind,
      timestamp:
        timeText && !Number.isNaN(Date.parse(timeText))
          ? new Date(timeText).toISOString()
          : new Date().toISOString(),
    });
  }

  if (rawPoints.length === 0 && waypoints.length === 0) {
    throw new Error('Aucun point GPS (<trkpt>, <rtept> ou <wpt>) trouvé dans ce GPX.');
  }

  const nameEl =
    doc.querySelector('trk > name')?.textContent?.trim() ||
    doc.querySelector('metadata > name')?.textContent?.trim();
  const cleanFallback = fallbackName.replace(/\.gpx$/i, '').trim() || 'Import GPX';
  const startedAt = rawPoints[0]?.timestamp ?? waypoints[0]?.timestamp ?? new Date().toISOString();
  const endedAt = rawPoints[rawPoints.length - 1]?.timestamp ?? startedAt;
  const speeds = computeSessionSpeeds(rawPoints);

  return {
    id: `session-gpx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: (nameEl || cleanFallback).slice(0, 80),
    date: startedAt.slice(0, 10),
    startedAt,
    endedAt,
    status: 'completed',
    environment: defaultEnvironment,
    points: rawPoints,
    waypoints: waypoints.length > 0 ? waypoints : undefined,
    distanceKm: computeTrackDistanceKm(rawPoints),
    maxSpeedKts: speeds.maxSpeedKts,
    avgSpeedKts: speeds.avgSpeedKts,
    source: 'gpx',
  };
}
