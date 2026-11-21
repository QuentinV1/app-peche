import { useEffect, useState } from 'react';
import { ExternalLink, LayoutGrid, RefreshCw, ShieldAlert, Wifi, WifiOff, X } from 'lucide-react';
import type { DataManifest, SanitaryAlert } from '../../schema/types';
import {
  resolveManifestSourceReference,
  resolveSourceReference,
} from '../services/referenceUrl';

interface InfoPanelProps {
  manifest: DataManifest | null;
  alerts: SanitaryAlert[];
  fromCache: boolean;
  isOnline: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

export function InfoPanel({
  manifest,
  alerts,
  fromCache,
  isOnline,
  refreshing,
  onRefresh,
}: InfoPanelProps) {
  const [showOtherApps, setShowOtherApps] = useState(false);

  useEffect(() => {
    if (!showOtherApps) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowOtherApps(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showOtherApps]);

  return (
    <div className="panel-scroll">
      <div className="info-card">
        <div className="info-row">
          <span className="status-pill">
            {isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
            {isOnline ? 'En ligne' : 'Mode hors-ligne actif'}
          </span>
          {fromCache && <span className="cache-badge">Cache local IndexedDB</span>}
        </div>

        <h2>Fraîcheur des données</h2>
        {manifest ? (
          <>
            <p className="rule-detail">
              <strong>Version du bundle :</strong> {manifest.version}
            </p>
            <p className="rule-detail">
              <strong>Généré le :</strong>{' '}
              {new Date(manifest.generatedAt).toLocaleString('fr-FR')}
            </p>
            <ul className="sources-list">
              {manifest.sources.map((s) => {
                const sourceRef = resolveManifestSourceReference(s);
                return (
                  <li key={s.id}>
                    <a
                      href={sourceRef.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="source-link"
                    >
                      {s.name} <ExternalLink size={11} />
                    </a>{' '}
                    — {s.recordCount} zones (MàJ source : {s.lastModified.slice(0, 10)})
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="rule-detail">Chargement des métadonnées...</p>
        )}

        <button
          type="button"
          className="refresh-btn"
          disabled={!isOnline || refreshing}
          onClick={onRefresh}
        >
          <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Mise à jour...' : 'Vérifier les mises à jour'}
        </button>
      </div>

      {alerts.length > 0 && (
        <div className="info-card">
          <h3>Alertes &amp; Fermetures suivies ({alerts.length})</h3>
          <p className="rule-detail">
            Statut national en direct :{' '}
            <a
              href="https://www.atlas-sanitaire-coquillages.fr/statut/map"
              target="_blank"
              rel="noopener noreferrer"
              className="source-link"
            >
              Atlas Sanitaire Coquillages (OiEau / Min. Agriculture) <ExternalLink size={11} />
            </a>
          </p>
          {alerts.map((a) => (
            <div key={a.id} style={{ marginTop: 10 }}>
              <p className="rule-detail">
                <strong>{a.zoneName}</strong> (Dép. {a.departmentCode}
                {a.commune ? ` — ${a.commune}` : ''})
              </p>
              {a.reason && <p className="rule-detail">{a.reason}</p>}
              {a.speciesAffected.length > 0 && (
                <p className="rule-detail">
                  <strong>Espèces concernées :</strong> {a.speciesAffected.join(', ')}
                </p>
              )}
              <p className="rule-source">
                Source :{' '}
                <a
                  href={
                    resolveSourceReference(
                      a.sourceName,
                      a.sourceUrl,
                      `${a.zoneName} dép. ${a.departmentCode}`,
                    ).href
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="source-link"
                >
                  {a.sourceName} <ExternalLink size={11} />
                </a>
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="info-card disclaimer-card">
        <h3>
          <ShieldAlert size={18} /> Avertissement légal
        </h3>
        <p className="rule-detail">
          Cette application est un outil d&apos;aide à la décision pour les pêcheurs de loisir en
          France. Les arrêtés préfectoraux, municipaux et alertes sanitaires pouvant évoluer
          rapidement, le pêcheur reste seul responsable de vérifier la réglementation locale et la
          signalétique en vigueur avant toute capture.
        </p>
      </div>

      <div className="info-card">
        <h2>Mes autres applications</h2>
        <p className="rule-detail">
          Accéder rapidement aux autres applications web (GitHub Pages).
        </p>
        <button
          type="button"
          className="refresh-btn"
          onClick={() => setShowOtherApps(true)}
        >
          <LayoutGrid size={16} />
          Mes autres applications
        </button>
      </div>

      {showOtherApps && (
        <div
          className="auth-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="other-apps-title"
          onClick={() => setShowOtherApps(false)}
        >
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal-head">
              <h2 id="other-apps-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LayoutGrid size={18} color="var(--ocean)" />
                <span>Mes autres applications</span>
              </h2>
              <button
                type="button"
                className="auth-close-btn"
                onClick={() => setShowOtherApps(false)}
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
            <p className="rule-detail" style={{ marginBottom: 12 }}>
              Retrouvez toutes les autres applications hébergées sur GitHub Pages.
            </p>
            <div style={{ display: 'grid', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
              {[
                { name: "L'Affinoir", desc: "Charcuterie, salaisons & cave d'affinage", url: 'https://quentinv1.github.io/app-charcuterie/' },
                { name: 'App Voyage', desc: "Planificateur d'itinéraire, carte & carnet de voyage", url: 'https://quentinv1.github.io/app-voyage/' },
                { name: 'Budget Prévisionnel', desc: 'Budget du foyer, provisions & projections', url: 'https://quentinv1.github.io/budget-previsionnel/' },
                { name: 'Cave à vin', desc: 'Stock de bouteilles, apogée & dégustations', url: 'https://quentinv1.github.io/cave-a-vin/' },
                { name: 'Checklist Valise', desc: 'Bagages, calculateur de poids & règles IATA', url: 'https://quentinv1.github.io/checklist-valise/' },
                { name: 'Livre de recettes', desc: 'Recettes, planning semaine & liste de courses', url: 'https://quentinv1.github.io/livre-recettes/' },
                { name: 'Suivi Chasse', desc: 'Carnet de sorties, carte & album trophées', url: 'https://quentinv1.github.io/suivi-chasse/' },
                { name: 'Travaux Maison', desc: 'Plan 2D/3D, courses, tâches & entretien', url: 'https://quentinv1.github.io/travaux-maison/' },
              ].map((app) => (
                <a
                  key={app.url}
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 12px',
                    border: '1px solid var(--border, #e2e8f0)',
                    borderRadius: 10,
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{app.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted, #64748b)' }}>{app.desc}</div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 600, color: 'var(--ocean, #0284c7)', whiteSpace: 'nowrap' }}>
                    Ouvrir <ExternalLink size={14} />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
