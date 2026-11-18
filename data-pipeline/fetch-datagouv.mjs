#!/usr/bin/env node
/**
 * Pipeline d'ingestion Phase 0/2 — Récupère et normalise les données officielles
 * depuis l'API data.gouv.fr (CACEM & CNSP) vers data/zones.geojson + data/manifest.json.
 *
 * Usage:
 *   node data-pipeline/fetch-datagouv.mjs [--force] [--limit=N]
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const RAW_DIR = path.join(__dirname, 'raw');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const DATASETS = [
  {
    id: 'cacem',
    name: 'Zones réglementaires CACEM',
    datasetId: '682ae3040ebe621687ec64ad',
    format: 'csv',
  },
  {
    id: 'cnsp',
    name: 'Réglementation des pêches cartographiée (CNSP)',
    datasetId: '60c0ad5b8d17ba18c7b17bd0',
    format: 'csv',
  },
];

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : Infinity;

/**
 * Parseur CSV RFC-4180 par tranches (zero-copy sur les champs non échappés)
 * pour traiter des fichiers > 100 Mo sans exploser la RAM.
 */
function* iterCsvRows(text) {
  let headers = null;
  let row = [];
  let inQuotes = false;
  let fieldStart = 0;
  let hasEscapedQuote = false;

  const pushField = (endIdx) => {
    let val = text.slice(fieldStart, endIdx);
    if (hasEscapedQuote) {
      val = val.replace(/""/g, '"');
      hasEscapedQuote = false;
    }
    row.push(val);
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (inQuotes) {
      if (ch === 34 /* " */) {
        if (text.charCodeAt(i + 1) === 34) {
          hasEscapedQuote = true;
          i++;
        } else {
          pushField(i);
          inQuotes = false;
          // avancer jusqu'à , ou \n
          while (i + 1 < text.length) {
            const nxt = text.charCodeAt(i + 1);
            if (nxt === 44 /* , */) {
              i++;
              fieldStart = i + 1;
              if (text.charCodeAt(fieldStart) === 34) {
                inQuotes = true;
                i++;
                fieldStart = i + 1;
              }
              break;
            }
            if (nxt === 13 /* \r */ || nxt === 10 /* \n */) {
              if (nxt === 13 && text.charCodeAt(i + 2) === 10) i++;
              i++;
              fieldStart = i + 1;
              if (!headers) {
                headers = row.map((h) => h.trim());
              } else if (row.length === headers.length) {
                const obj = {};
                for (let c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
                yield obj;
              }
              row = [];
              if (text.charCodeAt(fieldStart) === 34) {
                inQuotes = true;
                i++;
                fieldStart = i + 1;
              }
              break;
            }
            i++;
          }
        }
      }
    } else {
      if (ch === 34 /* " */ && i === fieldStart) {
        inQuotes = true;
        fieldStart = i + 1;
      } else if (ch === 44 /* , */) {
        pushField(i);
        fieldStart = i + 1;
      } else if (ch === 13 /* \r */ || ch === 10 /* \n */) {
        pushField(i);
        if (ch === 13 && text.charCodeAt(i + 1) === 10) i++;
        fieldStart = i + 1;
        if (!headers) {
          headers = row.map((h) => h.trim());
        } else if (row.length === headers.length) {
          const obj = {};
          for (let c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
          yield obj;
        }
        row = [];
      }
    }
  }
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

/** Convertit un anneau WKT "lon lat,lon lat,..." en tableau de coordonnées GeoJSON (5 décimales) */
function parseRing(ringStr) {
  const pts = ringStr.trim().split(',');
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const parts = pts[i].trim().split(/\s+/);
    const lon = Number.parseFloat(parts[0]);
    const lat = Number.parseFloat(parts[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      out.push([round5(lon), round5(lat)]);
    }
  }
  return out;
}

/** Découpe les groupes de parenthèses de premier niveau dans une chaîne */
function splitTopLevelGroups(str) {
  const groups = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 40 /* ( */) {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (c === 41 /* ) */) {
      depth--;
      if (depth === 0 && start !== -1) {
        groups.push(str.slice(start, i));
        start = -1;
      }
    }
  }
  return groups;
}

/** Convertit WKT (POLYGON / MULTIPOLYGON) en géométrie GeoJSON */
function wktToGeoJson(wkt) {
  if (!wkt) return null;
  const trimmed = wkt.trim();
  if (trimmed.startsWith('MULTIPOLYGON')) {
    const inner = trimmed.slice(trimmed.indexOf('(') + 1, trimmed.lastIndexOf(')'));
    const polyGroups = splitTopLevelGroups(inner);
    const coordinates = polyGroups
      .map((poly) => splitTopLevelGroups(poly).map(parseRing).filter((r) => r.length >= 4))
      .filter((p) => p.length > 0);
    return coordinates.length > 0 ? { type: 'MultiPolygon', coordinates } : null;
  }
  if (trimmed.startsWith('POLYGON')) {
    const inner = trimmed.slice(trimmed.indexOf('(') + 1, trimmed.lastIndexOf(')'));
    const coordinates = splitTopLevelGroups(inner)
      .map(parseRing)
      .filter((r) => r.length >= 4);
    return coordinates.length > 0 ? { type: 'Polygon', coordinates } : null;
  }
  return null;
}

function inferRuleType(text = '') {
  const t = text.toLowerCase();
  if (t.includes('interdit') || t.includes('interdiction') || t.includes('fermeture') || t.includes('fermé')) {
    return 'prohibition';
  }
  if (t.includes('réserve') || t.includes('cantonnement') || t.includes('parc')) return 'reserve';
  if (t.includes('sanitaire') || t.includes('pollution')) return 'sanitary';
  return 'restriction';
}

function normalizeCacem(row, idx) {
  const geometry = wktToGeoJson(row.wkt);
  if (!geometry) return null;
  const themes = row.themes ? row.themes.split(/[;,|]/).map((s) => s.trim()).filter(Boolean) : [];
  return {
    type: 'Feature',
    geometry,
    properties: {
      id: `cacem-${row.id || idx}`,
      source: 'CACEM',
      name: row.poly_name || row.layer_name || row.location || 'Zone réglementaire',
      type: inferRuleType(`${row.layer_name} ${row.resume} ${row.ref_reg}`),
      facade: row.facade || undefined,
      themes,
      resume: row.resume || undefined,
      refReg: row.ref_reg || undefined,
      url: row.url || undefined,
      startDate: row.date ? row.date.slice(0, 10) : undefined,
      endDate: row.date_fin ? row.date_fin.slice(0, 10) : undefined,
      prohibitionPeriods: row.prohibition_periods || undefined,
      authorizationPeriods: row.authorization_periods || undefined,
    },
  };
}

function normalizeCnsp(row, idx) {
  const geometry = wktToGeoJson(row.wkt);
  if (!geometry) return null;
  const themes = row.thematique ? row.thematique.split('-').map((s) => s.trim()).filter(Boolean) : [];
  return {
    type: 'Feature',
    geometry,
    properties: {
      id: `cnsp-${idx}`,
      source: 'CNSP',
      name: row.zone || 'Zone réglementée CNSP',
      type: inferRuleType(`${row.zone} ${row.thematique} ${row.reglementations}`),
      facade: row.type_de_reglementation || undefined,
      themes,
      refReg: row.reglementations || undefined,
    },
  };
}

async function fetchDatasetMeta(ds) {
  const res = await fetch(`https://www.data.gouv.fr/api/1/datasets/${ds.datasetId}/`);
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${ds.datasetId}`);
  const json = await res.json();
  const resource = json.resources.find((r) => (r.format || '').toLowerCase() === ds.format);
  if (!resource) throw new Error(`Ressource ${ds.format} introuvable pour ${ds.datasetId}`);
  return {
    ...ds,
    url: resource.url,
    lastModified: resource.last_modified || json.last_modified,
  };
}

async function downloadIfNeeded(meta) {
  await fsp.mkdir(RAW_DIR, { recursive: true });
  const filePath = path.join(RAW_DIR, `${meta.id}.${meta.format}`);
  if (!FORCE) {
    try {
      const stat = await fsp.stat(filePath);
      if (stat.size > 0) {
        console.log(`[cache] ${meta.id}.${meta.format} déjà présent (${(stat.size / 1024 / 1024).toFixed(1)} Mo)`);
        return await fsp.readFile(filePath, 'utf8');
      }
    } catch {
      // absent, on télécharge
    }
  }
  console.log(`[download] ${meta.name} -> ${meta.url}`);
  const curlBin = process.platform === 'win32' ? 'curl.exe' : 'curl';
  execFileSync(curlBin, ['-fSL', '--retry', '3', '--http1.1', '-o', filePath, meta.url], {
    stdio: 'inherit',
  });
  return await fsp.readFile(filePath, 'utf8');
}

async function main() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const geojsonPath = path.join(DATA_DIR, 'zones.geojson');
  const out = fs.createWriteStream(geojsonPath, { encoding: 'utf8' });
  out.write('{"type":"FeatureCollection","features":[\n');

  let firstFeature = true;
  let totalCount = 0;
  const sources = [];

  for (const ds of DATASETS) {
    const meta = await fetchDatasetMeta(ds);
    const csvText = await downloadIfNeeded(meta);
    const normalizer = ds.id === 'cacem' ? normalizeCacem : normalizeCnsp;
    let rowIdx = 0;
    let count = 0;

    for (const row of iterCsvRows(csvText)) {
      if (rowIdx >= LIMIT) break;
      rowIdx++;
      const feat = normalizer(row, rowIdx);
      if (feat) {
        if (!firstFeature) out.write(',\n');
        firstFeature = false;
        out.write(JSON.stringify(feat));
        count++;
        totalCount++;
      }
    }

    console.log(`[ok] ${ds.id}: ${count} zones GeoJSON valides (sur ${rowIdx} lignes)`);
    sources.push({
      id: ds.id,
      name: meta.name,
      datasetId: ds.datasetId,
      url: meta.url,
      lastModified: meta.lastModified,
      recordCount: count,
    });
  }

  await new Promise((resolve, reject) => {
    out.write('\n]}\n', (err) => (err ? reject(err) : out.end(resolve)));
  });

  const stat = await fsp.stat(geojsonPath);
  const now = new Date();
  const version = `${now.toISOString().slice(0, 10).replace(/-/g, '.')}.1`;
  const manifest = {
    version,
    generatedAt: now.toISOString(),
    sources,
    files: {
      zones: 'zones.geojson',
      species: 'species.json',
      regulations: 'regulations.json',
      alerts: 'alerts.json',
    },
  };
  await fsp.writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[done] ${totalCount} zones écrites dans data/zones.geojson (${(stat.size / 1024 / 1024).toFixed(1)} Mo, version ${version})`);
}

main().catch((err) => {
  console.error('[error]', err);
  process.exit(1);
});
