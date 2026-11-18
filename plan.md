# Plan du Projet — Application Pêche France (PWA & APK)

> **Règle de persistance** : Ce fichier (`plan.md`) ainsi que `instruction.md` ne doivent **jamais** être supprimés. Ils servent de référence vivante pour piloter le développement.

---

## Vue d'ensemble des Phases

- [x] **Phase 0** : Inventaire, analyse et structuration des données réglementaires (Mer en priorité)
- [x] **Phase 1** : Architecture technique unifiée (Codebase unique -> PWA iOS + APK Android)
- [x] **Phase 2** : Pipeline d'ingestion et de mise à jour automatique des réglementations
- [x] **Phase 3** : Développement V1 — Carte interactive France & Fiches réglementaires (Bord de mer)
- [ ] **Phase 4** : Packaging, tests terrain, déploiement `.pwa` (iOS) & `.apk` (Android)
- [x] **Phase 5 (V2)** : Extension Eau douce (Rivières) + Carnet de prises + Espèces par saison
- [x] **Phase 6 (V3)** : IA Reconnaissance d'espèce + Mesure caméra + Recommandation de spots

---

## Phase 0 — Inventaire & Exploitation des Données Réglementaires (Priorité Immédiate)

L'objectif de cette phase est de vérifier concrètement quelles données officielles françaises sont accessibles, dans quels formats, à quelle fréquence elles sont mises à jour, et comment les croiser pour couvrir les 5 besoins réglementaires.

### 0.1 Sources identifiées pour la V1 (Bord de mer / Littoral)

| Besoin réglementaire | Source officielle / Plateforme | Format / Accès | Couverture & Limites | Fréquence de MàJ |
| :--- | :--- | :--- | :--- | :--- |
| **Zones & parcours réglementés** (réserves, cantonnements, zones interdites, parcs marins) | **data.gouv.fr** — *« Réglementation des pêches cartographiée »* (CNSP) | API REST `data.gouv.fr` -> fichiers **CSV** & **GeoPackage (`.gpkg`)** | Couverture nationale maritime. Contient géométries, thématiques, espèces et références d'arrêtés. | Régulière (selon publications CNSP/DPMA) |
| **Zones de contrôle & pêche à pied** | **data.gouv.fr** — *« Zones réglementaires CACEM »* + arrêtés locaux pêche à pied | API REST `data.gouv.fr` -> **GeoPackage / Shapefile / GeoJSON** | Zones surveillées et arrêtés locaux (ex. remise à l'eau, périmètres côtiers). | Variable selon départements |
| **Limites maritimes d'usage** (bandes côtières, 3 milles, limites façades) | **data.gouv.fr** — *« Limites relatives aux usages de pêche »* (DPMA / Shom) | **Shapefile / GeoPackage** via `data.gouv.fr` | Indispensable pour situer l'utilisateur par rapport aux limites côtières. | Annuelle / ponctuelle |
| **Mailles (tailles minimales)** poissons, crustacés, mollusques | **Légifrance** — *Arrêté du 26 octobre 2012 modifié* (dont arrêté du 6 janvier 2026) | Texte juridique consolidé (HTML/API Légifrance PISTE ou extraction structurée) | Référence nationale par **façade maritime** (Manche/Mer du Nord, Atlantique, Méditerranée). | À chaque modification d'arrêté ministériel |
| **Quotas, marquage & déclaration obligatoire** | **Ministère / DIRM / UE 2023/2842** (*RecFishing*, *CatchMachine*) | Textes officiels (Légifrance, DIRM MEMN/NAMO/SA/Med) | Espèces soumises à quota/marquage (bar, thon rouge, lieu jaune, dorade rose, etc.) et règles d'enregistrement (16+ ans). | Annuelle / saisonnière |
| **Arrêtés sanitaires & pollution** (fermetures pêche à pied, phycotoxines) | **ARS** + **atlas-sanitaire-coquillages.fr** (OiEau / Min. Agriculture) | Portails régionaux ARS / `atlas-sanitaire-coquillages.fr` (`/statut/map`, `maps-masa.oieau.fr`) | Alertes sanitaires (E. coli, toxines) et arrêtés préfectoraux/municipaux de fermeture temporaire. *(Décision : ne pas utiliser Ifremer en V1)* | **Quotidienne à hebdomadaire** (critique !) |
| **Arrêtés préfectoraux ponctuels** (travaux, pollution, zones militaires) | **Préfectures Maritimes** (Premar Manche, Atlantique, Méditerranée) & **DDTM** | PDF / pages web préfectures maritimes | Souvent publiés en PDF : nécessite veille/scraping ciblé ou saisie assistée par IA/parseur. | Continue / ponctuelle |
| **Fonds de carte & limites administratives** (Régions, Départements, Communes littorales) | **IGN Géoplateforme / API Carto** (`apicarto.ign.fr`) + **Etalab GeoJSON** | API REST / GeoJSON / Tuiles vectorielles | Découpage exact pour le zoom progressif France -> Région -> Département -> Commune. | Annuelle |

### 0.2 Sources identifiées pour la V2 (Eau douce / Rivières)

- **Géopêche** (`geopeche.com`) & **FNPF / Fédérations départementales** : catégories piscicoles (1ère/2ème), réserves, parcours *no-kill*, lots AAPPMA (à vérifier : disponibilité d'API/flux publics ou partenariats).
- **Hub'Eau** (`hubeau.eaufrance.fr`) : *API Poisson* (peuplements par cours d'eau), *API Qualité des cours d'eau*, *API Hydrométrie*.
- **VigiEau / Propluvia** (`data.gouv.fr`) : arrêtés préfectoraux de restriction d'eau / sécheresse impactant la pêche.

### 0.3 Actions concrètes de la Phase 0
- [x] **0.1** Interroger l'API `https://www.data.gouv.fr/api/1/datasets/` pour lister les IDs exacts, URLs des ressources et dates de dernière mise à jour des jeux de données maritimes :
  - **Réglementation des pêches cartographiée (CNSP)** — ID `60c0ad5b8d17ba18c7b17bd0` (MàJ `2026-11-13`), CSV & `.gpkg` : `https://static.data.gouv.fr/resources/reglementation-des-peches-cartographiee/20261113-011823/reglementation-des-peches-cartographiee.csv`
  - **Zones réglementaires CACEM** — ID `682ae3040ebe621687ec64ad` (MàJ `2026-11-16`), CSV & `.gpkg` : `https://static.data.gouv.fr/resources/zones-reglementaires-cacem/20261116-141201/regulatory-areas.csv`
  - **Limites relatives aux usages de pêche (DPMA / Shom)** — ID `666326d47683aed116fd0ff9` (MàJ `2026-07-23`), flux WFS `https://services.data.shom.fr/INSPIRE/wfs?` (`limite_3milles_peche_wgs84_epsg4326`, `limite_6milles_bande_cotiere_peche_wgs84_epsg4326`) & archive `PECHE-DPMA.7z`.
- [x] **0.2** Inspecter les colonnes réelles des CSV (projection WGS84 / EPSG:4326 en `wkt`) :
  - CNSP : `type_de_reglementation, thematique, zone, reglementations, wkt`
  - CACEM : `id, creation, url, layer_name, facade, ref_reg, edition, source, observation, date, date_fin, type, wkt, resume, poly_name, plan, authorization_periods, prohibition_periods, additional_ref_reg, themes, tags, location`
- [x] **0.3** Vérifier l'accessibilité de `atlas-sanitaire-coquillages.fr` (V1 sanitaire) et `sextant.ifremer.fr` (réservé V2/V3) :
  - `atlas-sanitaire-coquillages.fr` : HTTP 200, carte `/statut/map` adossée à `https://maps-masa.oieau.fr` et aux endpoints internes `/api/ville/`, `/api/zones/by-department/{id}` (retourne 404 avec code départemental `29`, utilise probablement un ID interne).
  - `sextant.ifremer.fr` : Catalogue OGC CSW opérationnel (`https://sextant.ifremer.fr/geonetwork/srv/fre/csw?service=CSW&version=2.0.2&request=GetCapabilities` -> HTTP 200 ; `/services/wfs` retourne 404). Réservé pour V2/V3 (saisonnalité & spots).
- [x] **0.4** Concevoir le **schéma de données unifié** de l'application (`schema/types.ts` -> `zones.geojson`, `species.json`, `regulations.json`, `alerts.json`, `manifest.json`) avec traçabilité (`sourceName`, `sourceUrl`, `effectiveDate`, `lastCheckedAt`).
  - Pipeline Node.js (`data-pipeline/fetch-datagouv.mjs`) opérationnel : **5 857 zones officielles** extraites en GeoJSON (`4 667` CACEM + `1 190` CNSP, `101,1 Mo`, `data/manifest.json` v`2026.11.17.1`).
  - *Point d'attention mobile (Phase 1/2)* : `zones.geojson` pèse 101,1 Mo brut ; prévoir un découpage par façade (`NAMO`, `MEMN`, `SA`, `MED`) + simplification géométrique (Douglas-Peucker) pour que la PWA/APK reste légère (< 2-3 Mo par zone).
- [x] **0.5** Rédiger le socle de référence des mailles & quotas nationaux (Arrêté du 26 octobre 2012 modifié) structuré par façade maritime et par espèce (`data/species.json` : 17 espèces clés mer incluant poissons, crustacés, coquillages et céphalopodes ; `data/regulations.json` : 32 règles structurées couvrant les 4 façades `NAMO`, `MEMN`, `SA`, `MED`).
  - Optimisation mobile (`data-pipeline/optimize-zones.mjs`) : découpage par façade (avec rattachement géographique automatique des zones métropolitaines sans façade explicite) + simplification Douglas-Peucker -> `data/facades/zones-{NAMO,MEMN,SA,MED,OTHER}.geojson`.

---

## Phase 1 — Architecture Technique Unifiée (`.pwa` iOS + `.apk` Android)

Objectif : garantir **100 % de parité** entre la PWA iPhone et l'APK Android avec un seul projet.

- [x] **1.1** Initialiser le projet **Vite + React + TypeScript** (`package.json`, `tsconfig.json`, `src/App.tsx`).
- [x] **1.2** Configurer **PWA** (`vite-plugin-pwa`) : `manifest.webmanifest`, Service Worker (stratégie *Stale-While-Revalidate* / cache offline des règles et cartes), méta-tags Apple (`apple-touch-icon`, `apple-mobile-web-app-capable`).
- [x] **1.3** Configurer **Capacitor** (`@capacitor/core`, `@capacitor/android`) : projet `android/` généré et synchronisé avec `dist/`.
- [x] **1.4** Moteur cartographique compatible Web/PWA + WebView Android : **MapLibre GL JS** (`src/components/FranceMap.tsx`, zoom par façade + raccourci Le Guilvinec / Île-Tudy).
- [x] **1.5** Stockage local persistant hors-ligne (`src/services/dataStore.ts` avec IndexedDB via `idb`).

---

## Phase 2 — Pipeline d'Ingestion & Mise à Jour Continue des Réglementations

Objectif : automatiser la récupération, la normalisation et la publication des règles pour qu'elles soient à jour le plus souvent possible sans recompiler l'application.

- [x] **2.1** Pipeline `data-pipeline/` (`fetch-datagouv.mjs`, `optimize-zones.mjs`, `build-bundle.mjs`, `sync-public.mjs`) : interroge `data.gouv.fr`, détecte `last_modified`, simplifie les polygones par façade et normalise les alertes (`data/alerts.json`).
- [x] **2.2** Générer un **bundle de données versionné** (`data/manifest.json` avec `version`, `generatedAt` et empreintes `checksums` SHA-256 pour les 8 fichiers).
- [x] **2.3** Planifier l'exécution automatique via GitHub Actions (`.github/workflows/update-regulations.yml` : cron quotidien 06:00 UTC + déclenchement manuel `workflow_dispatch`, commit si diff).
- [x] **2.4** Côté application (`src/services/dataStore.ts`) : comparaison de `manifest.json` (local ou distant via `VITE_DATA_BASE_URL`), invalidation automatique des façades en cache si nouvelle version.

---

## Phase 3 — Développement V1 (Bord de mer & Carte de France)

- [x] **3.1 Navigation Cartographique Hiérarchique** :
  - Vue **France** -> clic sur une **Région** -> zoom automatique (`fitBounds`) -> affichage des **Départements** -> clic sur un Département -> zones réglementaires, avec fil d'Ariane cliquable (`France > Région > Département > Commune`).
  - Recherche directe par **commune littorale** (`geo.api.gouv.fr` + fallback hors-ligne) avec bascule automatique de façade.
- [x] **3.2 Vue Réglementation par Zone** :
  - Bandeau d'alerte départementale (`alerts.json`) + fiche détaillée au clic sur une zone (`CACEM` / `CNSP`, référence d'arrêté, fermeture, lien officiel).
  - Onglet **Mailles** synchronisé avec la façade active (`NAMO`, `MEMN`, `SA`, `MED`).
- [x] **3.3 Fiche Espèce détaillée** : nom commun & scientifique, maille en cm, quota/jour, période de fermeture, marquage obligatoire, déclaration UE RecFishing, source officielle.
- [x] **3.4 UX Mobile-First** : interface contrastée, utilisable d'une main, Safe Area iOS/Android, indicateur de fraîcheur des données et mode hors-ligne IndexedDB.

---

## Phase 4 — Tests, Packaging & Distribution

- [x] **4.1** Tests automatisés du pipeline de données (`tests/data-pipeline.test.mjs` : validation de schéma JSON/GeoJSON, intégrité SHA-256 `data/` ↔ `public/data/`, non-régression sur les mailles).
- [x] **4.2** Tests E2E sur les parcours clés (`tests/e2e/app.spec.ts` : sélection commune/département -> alerte -> mailles par façade -> mode hors-ligne IndexedDB/SW).
- [ ] **4.3** Build & test **PWA sur iOS Safari** : build PWA + icônes PNG (`apple-touch-icon.png` 180×180, `icon-192.png`, `icon-512.png`) + Safe Area prêts ; reste le test physique sur iPhone Safari (ajout écran d'accueil & hors-ligne).
- [ ] **4.4** Build & signature du **`.apk` Android** via Capacitor + Gradle : `app-debug.apk` compilé (`android/app/build/outputs/apk/debug/app-debug.apk`) ; reste le déploiement/test sur appareil réel Android (S25 Ultra) et la signature release si distribution hors debug.

---

## Phase 5 — V2 : Rivières (Eau douce) & Compagnon de Pêche

- [x] **5.1** Intégration des données eau douce : départements, 1ère/2ème catégorie, parcours *no-kill*, réserves, arrêtés sécheresse (VigiEau), mailles et dates d'ouverture spécifiques (truite, brochet, sandre, etc.).
- [x] **5.2** Switch **Mer / Eau douce** dans la carte et les filtres.
- [x] **5.3** **Carnet de prises** : ajout d'une prise avec photo, date/heure, coordonnées GPS précises, espèce, taille, relâché/conservé (stockage local + export/sauvegarde).
- [x] **5.4** **Espèces présentes dans la région selon la saison** (calendrier de présence basé sur les données biologiques/Hub'Eau/façades).

---

## Phase 6 — V3 : Sessions GPS, Intelligence Artificielle & Recommandations

- [x] **6.1 Session de pêche & Tracé GPS** : bouton Démarrer / Pause / Terminer une session, suivi GPS continu (Geolocation API / Capacitor Geolocation), affichage du tracé en direct et sauvegardé sur la carte — **sans contrainte terre ferme** (fonctionne sur l'eau en mer/estuaire autant que sur terre/estran).
- [x] **6.2 Reconnaissance d'espèce par photo** (modèle embarqué ONNX/TFLite ou API vision selon connectivité).
- [x] **6.3 Mesure de l'espèce** via caméra (calibration par objet de référence ou ARCore/WebXR).
- [x] **6.4 Recommandation de lieux de pêche par espèce** (croisement espèce ciblée + saison + réglementation autorisée + conditions météo/marées).

---

## Évolutions & Idées (Backlog)

- [x] **Liste des mailles — Localisation & réglementation sur carte** : Avoir un bouton depuis la liste des mailles pour montrer sur la carte où le poisson peut être pêché et quelle est la réglementation dans la zone sur ce poisson.
