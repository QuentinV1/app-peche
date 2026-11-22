import { test, expect } from '@playwright/test';

test.describe('Pêche France — Parcours clés V1', () => {
  test('chargement initial, version manifest, filtres légende et zones NAMO', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.brand')).toContainText('Pêche France');
    await expect(page.locator('.version-tag')).toContainText(/MàJ \d{4}\.\d{2}\.\d{2}\.\d+/);
    await expect(page.locator('.map-canvas')).toBeVisible();
    await expect(page.locator('.zone-counter')).toContainText(/zones \(NAMO\)/, { timeout: 15_000 });

    // Filtrer par type "Interdiction" met à jour le compteur
    const fullCountText = await page.locator('.zone-counter').innerText();
    await page.locator('.legend-row').getByRole('button', { name: 'Interdiction' }).click();
    await expect(page.locator('.zone-counter')).not.toHaveText(fullCountText);
    await page.locator('.legend-row').getByRole('button', { name: 'Toutes' }).click();
    await expect(page.locator('.zone-counter')).toHaveText(fullCountText);

    // L'option Épandage (agri) est décochée par défaut et ajoute les zones agricoles si cochée
    const epandageCheckbox = page.getByRole('checkbox', { name: /Épandage/i });
    await expect(epandageCheckbox).not.toBeChecked();
    await epandageCheckbox.check();
    await expect(page.locator('.zone-counter')).not.toHaveText(fullCountText);
    await epandageCheckbox.uncheck();
    await expect(page.locator('.zone-counter')).toHaveText(fullCountText);

    // L'option Spatio-temporelle est décochée par défaut et ajoute la fermeture spatio-temporelle si cochée
    const spatioCheckbox = page.getByRole('checkbox', { name: /Spatio-temporelle/i });
    await expect(spatioCheckbox).not.toBeChecked();
    await spatioCheckbox.check();
    await expect(page.locator('.zone-counter')).not.toHaveText(fullCountText);
    await spatioCheckbox.uncheck();
    await expect(page.locator('.zone-counter')).toHaveText(fullCountText);

    // Pas de débordement horizontal sur mobile (390px)
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);
  });

  test('recherche commune littorale, alerte départementale (29) cliquable et persistance entre onglets', async ({ page }) => {
    await page.route('https://geo.api.gouv.fr/**', (route) => route.abort());
    await page.goto('/');

    const searchInput = page.getByPlaceholder(/Aller à une ville/);
    await searchInput.fill('ile tudy'); // Test recherche sans accents

    const resultBtn = page.locator('.commune-dropdown button').first();
    await expect(resultBtn).toContainText('Île-Tudy');
    await resultBtn.click();

    await expect(page.locator('.breadcrumb')).toContainText('Île-Tudy');
    const alertBanner = page.locator('.dept-alert-banner');
    await expect(alertBanner).toContainText('Alerte dép. 29');

    // Clic sur la bannière d'alerte ouvre la fiche détaillée
    await alertBanner.click();
    await expect(page.locator('.zone-sheet')).toContainText('Coque commune');
    await expect(page.locator('.zone-sheet .zone-link')).toHaveAttribute('href', /^https?:\/\//);
    await page.locator('.zone-sheet .icon-close').click();

    // Aller sur l'onglet Mailles puis revenir sur Carte : la sélection géographique est conservée
    await page.locator('.quick-spot-btn').click();
    await expect(page.locator('.cards-list')).toBeVisible();
    await page.getByRole('button', { name: 'Carte', exact: true }).click();
    await expect(page.locator('.breadcrumb')).toContainText('Île-Tudy');
  });

  test('consultation des mailles sur les 4 façades et catégorie Céphalopodes', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Mailles', exact: true }).click();
    const searchSpecies = page.getByPlaceholder(/Rechercher une espèce/);
    await searchSpecies.fill('bar');

    // En NAMO, le bar fait 42 cm
    await expect(page.locator('.cards-list')).toContainText('42 cm');
    await expect(page.locator('.cards-list')).toContainText('Marquage obligatoire');

    // Bascule sur Méditerranée (MED) -> 30 cm
    await page.locator('.filter-row').first().getByRole('button', { name: 'MED' }).click();
    await expect(page.locator('.cards-list')).toContainText('30 cm');

    // Vérifier que chaque façade a un jeu complet de règles (> 10 règles)
    await searchSpecies.fill('');
    for (const f of ['NAMO', 'MEMN', 'SA', 'MED']) {
      await page.locator('.filter-row').first().getByRole('button', { name: f, exact: true }).click();
      const count = await page.locator('.rule-card').count();
      expect(count).toBeGreaterThanOrEqual(12);
    }

    // Filtre Céphalopodes (Poulpe 1 kg & Seiche 10 cm)
    await page.locator('.filter-row').nth(1).getByRole('button', { name: 'Céphalopodes' }).click();
    await expect(page.locator('.cards-list')).toContainText('Poulpe commun');
    await expect(page.locator('.cards-list')).toContainText('1 kg');
    await expect(page.locator('.cards-list')).toContainText('Seiche commune');
  });

  test('onglet Données et mode hors-ligne IndexedDB (Carte + Mailles + Données sans erreur)', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.locator('.version-tag')).toContainText(/MàJ \d{4}\./);
    await expect(page.locator('.zone-counter')).toContainText(/zones \(NAMO\)/, { timeout: 15_000 });

    // Attendre que les couches admin soient bien persistées dans IndexedDB
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: 'Données', exact: true }).click();
    await expect(page.locator('.status-pill')).toContainText('En ligne');
    await expect(page.locator('.disclaimer-card')).toContainText('Avertissement légal');
    await expect(page.locator('.sources-list .source-link').first()).toHaveAttribute('href', /^https?:\/\//);

    // Passer hors-ligne et recharger la page
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.locator('.version-tag')).toContainText(/MàJ \d{4}\./, { timeout: 10_000 });
    await expect(page.locator('.zone-counter')).toContainText(/zones \(NAMO\)/, { timeout: 10_000 });
    await expect(page.locator('.inline-error')).toHaveCount(0);

    await page.getByRole('button', { name: 'Données', exact: true }).click();
    await expect(page.locator('.status-pill')).toContainText('Mode hors-ligne actif');
    await expect(page.locator('.cache-badge')).toContainText('Cache local IndexedDB');

    // L'onglet Mailles reste fonctionnel hors-ligne
    await page.getByRole('button', { name: 'Mailles', exact: true }).click();
    await expect(page.locator('.cards-list')).toContainText('Bar européen');
  });

  test('localisation et réglementation sur carte depuis la liste des mailles', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Mailles', exact: true }).click();
    const searchSpecies = page.getByPlaceholder(/Rechercher une espèce/);
    await searchSpecies.fill('coque');

    const locateBtn = page.locator('.locate-species-btn').first();
    await expect(locateBtn).toBeVisible();
    await locateBtn.click();

    const sheet = page.locator('.species-focus-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Coque commune');
    await expect(sheet).toContainText('Façade NAMO');
    await expect(sheet).toContainText('Alerte sanitaire dép. 29');

    await sheet.locator('.icon-close').click();
    await expect(sheet).toHaveCount(0);
  });

  test('V2 — switch Mer / Eau douce, filtre de saison et carnet de prises persistant', async ({ page }) => {
    await page.goto('/');

    // Passer en Eau douce depuis le switch du header
    await page.locator('.env-switch').getByRole('button', { name: 'Eau douce' }).click();
    await expect(page.locator('.zone-counter')).toContainText('Eau douce');

    await page.locator('.quick-spot-btn').click();
    await expect(page.locator('.cards-list')).toContainText('Truite fario');
    await expect(page.locator('.cards-list')).toContainText('23 cm');
    await expect(page.locator('.cards-list')).toContainText('Brochet');
    await expect(page.locator('.cards-list')).toContainText('60 cm');

    // Filtre de saison
    await page.getByRole('button', { name: /De saison/ }).click();
    await expect(page.locator('.month-select')).toBeVisible();

    // Carnet de prises : ajout + persistance IndexedDB
    await page.getByRole('button', { name: 'Carnet', exact: true }).click();
    await page.getByRole('button', { name: /Ajouter une prise/ }).click();
    await page.locator('.catch-form select').selectOption('salmo-trutta');
    await page.getByPlaceholder('45').fill('32');
    await page.getByRole('button', { name: 'Enregistrer la prise' }).click();

    await expect(page.locator('.cards-list')).toContainText('Truite fario');
    await expect(page.locator('.cards-list')).toContainText('32 cm');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Carnet', exact: true }).click();
    await expect(page.locator('.cards-list')).toContainText('Truite fario');
  });

  test('V3 — onglet Tracés (nommer, dater, Pause / Terminer, carte) et onglet IA / Mesure', async ({ page }) => {
    await page.goto('/');

    // Aller dans l'onglet Tracés
    await page.getByRole('button', { name: 'Tracés', exact: true }).click();
    await page.getByRole('button', { name: /Nouveau tracé/ }).click();
    await page.getByPlaceholder(/Sortie bar/).fill('Sortie bar Glénan');
    await page.locator('.catch-form input[type="date"]').fill('2026-11-17');
    await page.getByRole('button', { name: /Démarrer l'enregistrement GPS/ }).click();

    await expect(page.locator('.track-active-card')).toContainText('Sortie bar Glénan');
    await expect(page.locator('.session-status')).toContainText('GPS actif');
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('.session-status')).toContainText('En pause');
    await page.getByRole('button', { name: 'Terminer' }).click();

    // Le tracé terminé apparaît dans la liste avec son nom et sa date
    await expect(page.locator('.cards-list')).toContainText('Sortie bar Glénan');
    await expect(page.locator('.cards-list')).toContainText('17/11/2026');

    // Modifier le nom et la date
    await page.getByRole('button', { name: 'Renommer ou dater le tracé' }).click();
    await page.locator('.cards-list input[type="text"]').fill('Sortie lieu Quiberon');
    await page.locator('.cards-list input[type="date"]').fill('2026-11-18');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('.cards-list')).toContainText('Sortie lieu Quiberon');
    await expect(page.locator('.cards-list')).toContainText('18/11/2026');

    // Afficher sur la carte puis masquer
    await page.getByRole('button', { name: /Voir sur la carte/ }).click();
    await expect(page.locator('.session-status')).toContainText('Sortie lieu Quiberon');
    await page.getByRole('button', { name: 'Masquer', exact: true }).click();
    await expect(page.locator('.session-status')).toHaveCount(0);

    // Persistance après rechargement
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Tracés', exact: true }).click();
    await expect(page.locator('.cards-list')).toContainText('Sortie lieu Quiberon');

    // Onglet IA / Mesure
    await page.getByRole('button', { name: 'IA / Mesure', exact: true }).click();
    await expect(page.locator('.info-card h2')).toContainText('IA Reconnaissance & Mesure caméra');
  });

  test('V4 — photos des espèces, toggle schéma, cockpit Nav&Co et import GPX', async ({ page }) => {
    await page.goto('/');

    // Photos réelles des espèces + bascule Schéma / Photo
    await page.getByRole('button', { name: 'Mailles', exact: true }).click();
    const firstImg = page.locator('.species-photo-img').first();
    await expect(firstImg).toBeVisible();
    await expect(firstImg).toHaveAttribute('src', /\/images\/species\/.+\.jpg$/);

    await page.locator('.species-visual-toggle').first().click();
    await expect(page.locator('.species-visual-svg').first()).toBeVisible();
    await page.locator('.species-visual-toggle').first().click();
    await expect(firstImg).toBeVisible();

    // Import GPX (iPhone / Apple Watch)
    await page.getByRole('button', { name: 'Tracés', exact: true }).click();
    const gpxPayload = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <trk>
    <name>Sortie GPX Concarneau</name>
    <trkseg>
      <trkpt lat="47.8700" lon="-3.9200"><time>2026-11-20T08:00:00Z</time></trkpt>
      <trkpt lat="47.8750" lon="-3.9250"><time>2026-11-20T08:15:00Z</time></trkpt>
    </trkseg>
  </trk>
  <wpt lat="47.8750" lon="-3.9250"><name>Roche aux bars</name><type>spot</type></wpt>
</gpx>`;
    await page.locator('input[type="file"][accept*=".gpx"]').setInputFiles({
      name: 'concarneau.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(gpxPayload, 'utf8'),
    });

    await expect(page.locator('.cards-list')).toContainText('Sortie GPX Concarneau');
    await expect(page.locator('.cards-list')).toContainText('GPX');
    await expect(page.locator('.cards-list')).toContainText('1 point marqué');
  });
});
