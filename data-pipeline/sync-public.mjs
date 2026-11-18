#!/usr/bin/env node
/**
 * Copie les données normalisées (data/) vers public/data/ pour le bundle PWA & Capacitor APK.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'data');
const DEST = path.join(ROOT, 'public', 'data');

async function main() {
  await fs.mkdir(path.join(DEST, 'facades'), { recursive: true });
  for (const file of ['manifest.json', 'species.json', 'regulations.json', 'alerts.json']) {
    await fs.copyFile(path.join(SRC, file), path.join(DEST, file));
  }
  const facades = await fs.readdir(path.join(SRC, 'facades'));
  for (const f of facades) {
    if (f.endsWith('.geojson')) {
      await fs.copyFile(path.join(SRC, 'facades', f), path.join(DEST, 'facades', f));
    }
  }
  console.log(`[sync-public] Données copiées dans public/data/ (${facades.length} façades)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
