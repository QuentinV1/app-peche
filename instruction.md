# Instructions du Projet — Application Pêche France (PWA)

> **Règle de persistance** : Ce fichier (`instruction.md`) ainsi que `plan.md` sont des documents structurants du projet. **Ils ne doivent jamais être supprimés.** Toute évolution majeure d'architecture, de périmètre ou de choix technique doit être reflétée ici et dans `plan.md`.

---

## 1. Vision & Périmètre du Produit

- **Cible utilisateur** : Pêcheur de loisir (particulier uniquement, **pas** de pêche professionnelle).
- **Zone géographique** : **France** (V1 focalisée sur la France métropolitaine et ses façades maritimes ; extension Outre-mer possible ultérieurement).
- **Environnements de pêche** :
  - **V1 (Priorité absolue)** : **Bord de mer / Littoral** (pêche du bord, pêche à pied, zones côtières — façades MEMN, NAMO, Sud-Atlantique, Méditerranée).
  - **V2** : **Rivières et plans d'eau** (eau douce : 1ère/2ème catégorie, FNPF / fédérations départementales / AAPPMA, parcours spécifiques). *Note sur les sources* : **ne pas utiliser Ifremer en V1** ; réserver les données Ifremer (**Sextant**, **SIH**) exclusivement aux fonctionnalités **V2/V3** (saisonnalité des espèces marines et recommandation de spots).
- **Problème principal résolu (irritant n°1)** : Connaître instantanément et de manière fiable la réglementation en vigueur selon l'endroit où l'on souhaite pêcher (Région -> Département / Façade -> Commune / Zone) malgré des règles complexes et changeantes :
  1. **Mailles** (tailles ou poids minimaux de capture : poissons, crustacés, coquillages).
  2. **Dates d'ouverture et de fermeture** par espèce (et périodes de repos biologique).
  3. **Quotas / Nombre de captures autorisées** par pêcheur et par jour (et obligations de marquage / déclaration).
  4. **Arrêtés de pêche et interdictions temporaires** (pollution, alertes sanitaires / phycotoxines, travaux, arrêtés préfectoraux).
  5. **Parcours et zones de pêche** (zones autorisées/interdites, réserves naturelles, parcs nationaux marins, cantonnement).

---

## 2. Contraintes Techniques Impératives

### 2.1 Cible unique PWA (iOS & Android)
- L'application est distribuée exclusivement sous forme de **PWA** (iOS Safari & Android Chrome/Edge) à partir d'un codebase unique (**React + TypeScript + Vite** + `vite-plugin-pwa`, Service Worker, Web App Manifest, icônes iOS/Android).
- L'ancien packaging natif Android (`.apk` / Capacitor) a été supprimé au profit de la PWA unifiée.

### 2.2 Fraîcheur des données & Mode Hors-Ligne
- Les réglementations doivent être **mises à jour le plus souvent possible** via un pipeline automatisé (détection de mises à jour sur les portails officiels + versioning des données).
- **Hors-ligne (Offline-first)** : En bord de mer ou au bord d'une rivière, le réseau est souvent faible ou absent. L'application (PWA et APK) doit mettre en cache localement le dernier jeu de données réglementaires téléchargé, avec affichage explicite de la **date de dernière mise à jour**.

### 2.3 Fiabilité juridique & Traçabilité
- Chaque règle affichée à l'utilisateur doit conserver :
  - Sa **source officielle** (ex. Arrêté du 26 octobre 2012 modifié, DDTM, Préfecture Maritime, ARS, data.gouv.fr).
  - Sa **date d'effet / dernière vérification**.
  - Un **lien vers le texte ou la source** lorsque disponible.
- L'interface doit inclure une mention légale claire rappelant que l'application est un outil d'aide à la décision et que le pêcheur reste responsable de vérifier la signalétique locale et les arrêtés municipaux/préfectoraux en vigueur.

---

## 3. Roadmap Fonctionnelle (Rappel)

- **Phase 0 (Prioritaire avant tout développement UI)** : Recenser, tester et structurer les sources de données réglementaires françaises exploitables (Open Data, APIs, textes consolidés), puis concevoir le modèle de données et le mécanisme de mise à jour continue.
- **V1 — Réglementation & Carte France (Bord de mer)** :
  - Carte interactive de France (navigation hiérarchique : France -> Région -> Zoom -> Département / Façade -> Commune / Zone).
  - Fiches réglementaires claires par zone et par espèce (maille, quota, période, marquage, arrêtés en cours, zones interdites).
  - Recherche rapide par lieu ou par espèce.
  - Packaging simultané `.pwa` (iOS) et `.apk` (Android).
- **V2 — Eau douce & Carnet de prises** :
  - Intégration des rivières / plans d'eau (catégories, AAPPMA, parcours no-kill, arrêtés sécheresse).
  - Carnet de prises personnel (photos, date, géolocalisation précise, espèce, taille).
  - Espèces présentes dans la région selon la saison.
- **V3 — IA, Sessions GPS & Recommandations** :
  - **Session de pêche avec suivi GPS** : démarrer/arrêter une session, enregistrer la trace GPS en continu et afficher le tracé sur la carte (compatible **terre ferme et pleine mer**, sans contrainte ni recalage sur route/terre).
  - Reconnaissance d'espèce par photo.
  - Mesure d'espèce assistée par caméra / référence visuelle.
  - Recommandation de lieux de pêche par espèce et par saison.

---

## 4. Conventions de Travail pour la Suite du Projet

- **Langue** : Documentation, commentaires fonctionnels et interface utilisateur en **français**. Identifiants de code (variables, types, fichiers) en **anglais** pour la maintenabilité.
- **Suivi dans `plan.md`** : Avant de démarrer une nouvelle étape, consulter `plan.md`. À la fin de chaque étape validée, mettre à jour le statut des tâches dans `plan.md`.
- **Qualité** : Privilégier des structures de données simples, typées (TypeScript / JSON Schema), testables et découplées de l'interface utilisateur afin de pouvoir faire évoluer les sources réglementaires sans casser l'application.
