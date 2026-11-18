#!/usr/bin/env node
/**
 * Pipeline Phase 2 :
 * 1. Exécute optimize-zones.mjs (découpage par façade + simplification).
 * 2. Calcule les empreintes SHA-256 et met à jour data/manifest.json.
 * 3. Synchronise le bundle complet dans public/data/ pour PWA & Capacitor APK.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

async function sha256File(filePath) {
  const buf = await fs.readFile(filePath);
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

async function main() {
  execFileSync(process.execPath, [path.join(__dirname, 'optimize-zones.mjs')], {
    stdio: 'inherit',
  });

  const manifestPath = path.join(DATA_DIR, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

  const checksums = {};
  for (const rel of ['species.json', 'regulations.json', 'alerts.json']) {
    checksums[rel] = await sha256File(path.join(DATA_DIR, rel));
  }
  const facades = await fs.readdir(path.join(DATA_DIR, 'facades'));
  for (const f of facades.filter((n) => n.endsWith('.geojson')).sort()) {
    checksums[`facades/${f}`] = await sha256File(path.join(DATA_DIR, 'facades', f));
  }

  manifest.generatedAt = new Date().toISOString();
  manifest.checksums = checksums;
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  execFileSync(process.execPath, [path.join(__dirname, 'sync-public.mjs')], {
    stdio: 'inherit',
  });
  console.log(`[bundle] Version ${manifest.version} prête (${Object.keys(checksums).length} fichiers vérifiés)`);
}

main().catch((err) => {
  console.error('[error]', err);
  process.exit(1);
});
