import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DATA_DIR = path.join(ROOT, 'public', 'data');

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function sha256Short(filePath) {
  const buf = await fs.readFile(filePath);
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

test('manifest.json est valide et ses checksums SHA-256 correspondent aux fichiers', async () => {
  const manifest = await readJson(path.join(DATA_DIR, 'manifest.json'));
  assert.match(manifest.version, /^\d{4}\.\d{2}\.\d{2}\.\d+$/, 'Format de version attendu YYYY.MM.DD.N');
  assert.ok(!Number.isNaN(Date.parse(manifest.generatedAt)), 'generatedAt doit être une date ISO valide');
  assert.ok(Array.isArray(manifest.sources) && manifest.sources.length >= 2, 'Au moins 2 sources officielles attendues');

  for (const source of manifest.sources) {
    assert.ok(source.id && source.name && source.url, 'Source incomplète');
    assert.ok(source.recordCount > 0, `recordCount > 0 attendu pour ${source.id}`);
  }

  assert.ok(manifest.checksums && Object.keys(manifest.checksums).length >= 8, 'Checksums manquants');
  for (const [relPath, expectedHash] of Object.entries(manifest.checksums)) {
    const dataHash = await sha256Short(path.join(DATA_DIR, relPath));
    assert.equal(dataHash, expectedHash, `Checksum mismatch dans data/${relPath}`);

    const publicHash = await sha256Short(path.join(PUBLIC_DATA_DIR, relPath));
    assert.equal(publicHash, expectedHash, `Désynchronisation entre data/${relPath} et public/data/${relPath}`);
  }
});

test('species.json respecte le schéma unifié', async () => {
  const species = await readJson(path.join(DATA_DIR, 'species.json'));
  assert.ok(Array.isArray(species) && species.length >= 10, 'Au moins 10 espèces attendues');

  const ids = new Set();
  const validCategories = new Set(['fish', 'crustacean', 'shellfish', 'cephalopod']);
  const validEnv = new Set(['sea', 'freshwater', 'both']);

  for (const sp of species) {
    assert.ok(sp.id && typeof sp.id === 'string', 'id manquant');
    assert.ok(!ids.has(sp.id), `Doublon species.id: ${sp.id}`);
    ids.add(sp.id);

    assert.ok(sp.commonName && sp.scientificName, `Noms manquants pour ${sp.id}`);
    assert.ok(Array.isArray(sp.aliases), `aliases doit être un tableau pour ${sp.id}`);
    assert.ok(validCategories.has(sp.category), `Catégorie invalide pour ${sp.id}: ${sp.category}`);
    assert.ok(validEnv.has(sp.environment), `Environnement invalide pour ${sp.id}: ${sp.environment}`);
  }
});

test('regulations.json respecte le schéma et les mailles réglementaires clés (non-régression)', async () => {
  const species = await readJson(path.join(DATA_DIR, 'species.json'));
  const speciesIds = new Set(species.map((s) => s.id));
  const regulations = await readJson(path.join(DATA_DIR, 'regulations.json'));

  assert.ok(Array.isArray(regulations) && regulations.length >= 15, 'Au moins 15 règles attendues');

  const ruleIds = new Set();
  for (const rule of regulations) {
    assert.ok(rule.id && !ruleIds.has(rule.id), `id manquant ou en doublon: ${rule.id}`);
    ruleIds.add(rule.id);
    assert.ok(speciesIds.has(rule.speciesId), `speciesId inconnu dans ${rule.id}: ${rule.speciesId}`);
    assert.ok(rule.environment === 'sea' || rule.environment === 'freshwater', `Environnement invalide: ${rule.environment}`);
    assert.equal(typeof rule.markingRequired, 'boolean', `markingRequired booléen attendu pour ${rule.id}`);
    assert.equal(typeof rule.declarationRequired, 'boolean', `declarationRequired booléen attendu pour ${rule.id}`);
    assert.ok(rule.sourceName && rule.sourceUrl && rule.lastCheckedAt, `Traçabilité source manquante pour ${rule.id}`);
    if (rule.minSizeCm !== undefined) {
      assert.ok(typeof rule.minSizeCm === 'number' && rule.minSizeCm > 0, `minSizeCm invalide pour ${rule.id}`);
    }
  }

  // Tests de non-régression sur les mailles nationales (Arrêté du 26 oct. 2012 modifié)
  const barNamo = regulations.filter((r) => r.speciesId === 'dicentrarchus-labrax' && r.facade === 'NAMO');
  assert.ok(barNamo.length >= 1, 'Règle Bar NAMO manquante');
  for (const r of barNamo) {
    assert.ok(r.minSizeCm >= 42, `Régression maille Bar NAMO: attendu >= 42 cm, reçu ${r.minSizeCm}`);
    assert.equal(r.markingRequired, true, 'Le marquage du bar doit rester obligatoire');
  }

  const barMed = regulations.find((r) => r.speciesId === 'dicentrarchus-labrax' && r.facade === 'MED');
  assert.ok(barMed && barMed.minSizeCm >= 30, 'Régression maille Bar/Loup Méditerranée (attendu >= 30 cm)');

  const lieuJaune = regulations.find((r) => r.speciesId === 'pollachius-pollachius');
  assert.ok(lieuJaune && lieuJaune.minSizeCm >= 30, 'Régression maille Lieu jaune (attendu >= 30 cm)');

  const homard = regulations.find((r) => r.speciesId === 'homarus-gammarus');
  assert.ok(homard && homard.minSizeCm >= 8.7, 'Régression maille Homard (attendu >= 8.7 cm)');
});

test('alerts.json respecte le schéma SanitaryAlert', async () => {
  const alerts = await readJson(path.join(DATA_DIR, 'alerts.json'));
  assert.ok(Array.isArray(alerts), 'alerts.json doit être un tableau');
  const validStatuses = new Set(['open', 'warning', 'closed', 'unknown']);

  for (const alert of alerts) {
    assert.ok(alert.id && alert.zoneName && alert.departmentCode, 'Champs obligatoires manquants dans alerte');
    assert.ok(validStatuses.has(alert.status), `Statut sanitaire invalide: ${alert.status}`);
    assert.ok(Array.isArray(alert.speciesAffected), 'speciesAffected doit être un tableau');
    assert.ok(alert.sourceName && alert.sourceUrl && alert.lastCheckedAt, 'Traçabilité source manquante dans alerte');
  }
});

test('GeoJSON des façades maritimes valides et non vides', async () => {
  const validSources = new Set(['CACEM', 'CNSP', 'DPMA_SHOM', 'ARS_PREF']);
  const validTypes = new Set(['prohibition', 'restriction', 'reserve', 'sanitary', 'limit']);

  for (const facade of ['NAMO', 'MEMN', 'SA', 'MED']) {
    const fc = await readJson(path.join(DATA_DIR, 'facades', `zones-${facade}.geojson`));
    assert.equal(fc.type, 'FeatureCollection', `zones-${facade}.geojson doit être une FeatureCollection`);
    assert.ok(Array.isArray(fc.features) && fc.features.length > 0, `zones-${facade}.geojson ne doit pas être vide`);

    // Vérifier un échantillon + toutes les propriétés obligatoires
    for (const feat of fc.features) {
      assert.equal(feat.type, 'Feature');
      assert.ok(feat.geometry && feat.geometry.type && feat.geometry.coordinates, `Géométrie invalide dans ${facade}`);
      assert.ok(feat.properties && feat.properties.id && feat.properties.name, `Propriétés id/name manquantes dans ${facade}`);
      assert.ok(validSources.has(feat.properties.source), `Source invalide dans ${facade}: ${feat.properties.source}`);
      assert.ok(validTypes.has(feat.properties.type), `Type de zone invalide dans ${facade}: ${feat.properties.type}`);
    }
  }
});
