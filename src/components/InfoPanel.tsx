import { ExternalLink, RefreshCw, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
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
    </div>
  );
}
