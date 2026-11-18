import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Ruler,
  Scale,
  Search,
  X,
} from 'lucide-react';
import type { RegulationRule, Species, SpeciesCategory } from '../../schema/types';
import type { FishingEnvironment } from '../App';
import type { FacadeCode } from '../services/dataStore';
import { normalizeText } from '../services/geoAdmin';
import { resolveSourceReference } from '../services/referenceUrl';
import { SpeciesVisual } from './SpeciesVisual';

interface SpeciesPanelProps {
  species: Species[];
  regulations: RegulationRule[];
  environment: FishingEnvironment;
  onChangeEnvironment: (env: FishingEnvironment) => void;
  selectedFacade: FacadeCode;
  onSelectFacade: (facade: FacadeCode) => void;
  onLocateSpecies?: (species: Species, rule: RegulationRule, facade: FacadeCode) => void;
}

const MONTH_NAMES = [
  'Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin',
  'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.',
];

const CATEGORY_LABELS: Record<'all' | SpeciesCategory, string> = {
  all: 'Toutes',
  fish: 'Poissons',
  crustacean: 'Crustacés',
  shellfish: 'Coquillages',
  cephalopod: 'Céphalopodes',
};

export function SpeciesPanel({
  species,
  regulations,
  environment,
  onChangeEnvironment,
  selectedFacade,
  onSelectFacade,
  onLocateSpecies,
}: SpeciesPanelProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | SpeciesCategory>('all');
  const [freshwaterCat, setFreshwaterCat] = useState<'all' | '1ere' | '2eme'>('all');
  const [onlyInSeason, setOnlyInSeason] = useState(false);
  const [seasonMonth, setSeasonMonth] = useState<number>(() => new Date().getMonth() + 1);

  const speciesMap = useMemo(() => {
    const map = new Map<string, Species>();
    for (const s of species) map.set(s.id, s);
    return map;
  }, [species]);

  const filteredRules = useMemo(() => {
    const q = normalizeText(query);
    return regulations.filter((rule) => {
      if (rule.environment !== environment) return false;
      const sp = speciesMap.get(rule.speciesId);
      if (!sp) return false;
      if (environment === 'sea') {
        if (category !== 'all' && sp.category !== category) return false;
        if (rule.facade && rule.facade !== 'NATIONAL' && rule.facade !== selectedFacade) {
          return false;
        }
      } else {
        if (
          freshwaterCat !== 'all' &&
          rule.freshwaterCategory &&
          rule.freshwaterCategory !== 'both' &&
          rule.freshwaterCategory !== freshwaterCat
        ) {
          return false;
        }
      }
      if (onlyInSeason && sp.peakMonths && !sp.peakMonths.includes(seasonMonth)) {
        return false;
      }
      if (!q) return true;
      return (
        normalizeText(sp.commonName).includes(q) ||
        normalizeText(sp.scientificName).includes(q) ||
        sp.aliases.some((a) => normalizeText(a).includes(q))
      );
    });
  }, [
    regulations,
    speciesMap,
    environment,
    category,
    freshwaterCat,
    selectedFacade,
    onlyInSeason,
    seasonMonth,
    query,
  ]);

  return (
    <div className="panel-scroll">
      <div className="search-bar">
        <Search size={18} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une espèce (bar, coque, homard, poulpe...)"
        />
        {query && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => setQuery('')}
            aria-label="Effacer la recherche"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {environment === 'sea' ? (
        <>
          <div className="filter-row">
            {(['NAMO', 'MEMN', 'SA', 'MED'] as FacadeCode[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`pill ${selectedFacade === f ? 'pill-active' : ''}`}
                onClick={() => onSelectFacade(f)}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="filter-row">
            {(['all', 'fish', 'crustacean', 'shellfish', 'cephalopod'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                className={`chip ${category === cat ? 'chip-active' : ''}`}
                onClick={() => setCategory(cat)}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="filter-row">
          {(
            [
              ['all', 'Toutes catégories'],
              ['1ere', '1ère catégorie'],
              ['2eme', '2ème catégorie'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`pill ${freshwaterCat === key ? 'pill-active' : ''}`}
              onClick={() => setFreshwaterCat(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="filter-row season-row">
        <button
          type="button"
          className={`chip ${onlyInSeason ? 'chip-active' : ''}`}
          onClick={() => setOnlyInSeason((v) => !v)}
        >
          <Calendar size={13} /> De saison ({MONTH_NAMES[seasonMonth - 1]})
        </button>
        {onlyInSeason && (
          <select
            className="month-select"
            aria-label="Mois de saison"
            value={seasonMonth}
            onChange={(e) => setSeasonMonth(Number(e.target.value))}
          >
            {MONTH_NAMES.map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="chip"
          onClick={() => onChangeEnvironment(environment === 'sea' ? 'freshwater' : 'sea')}
        >
          {environment === 'sea' ? 'Passer en Eau douce' : 'Passer en Mer'}
        </button>
      </div>

      <div className="panel-summary-row">
        <span>
          <strong>{filteredRules.length}</strong> règle{filteredRules.length > 1 ? 's' : ''} ·{' '}
          {environment === 'sea' ? `Façade ${selectedFacade}` : 'Eau douce'}
        </span>
      </div>

      <div className="cards-list">
        {filteredRules.length === 0 && (
          <p className="empty-state">
            Aucune règle trouvée pour cette façade / recherche.
          </p>
        )}
        {filteredRules.map((rule) => {
          const sp = speciesMap.get(rule.speciesId);
          if (!sp) return null;
          return (
            <article key={rule.id} className="rule-card">
              <div className="rule-card-header">
                <div>
                  <h3>{sp.commonName}</h3>
                  <span className="sci-name">{sp.scientificName}</span>
                </div>
                {rule.minSizeCm !== undefined ? (
                  <div className="size-badge">
                    <Ruler size={15} />
                    <span>{rule.minSizeCm} cm</span>
                  </div>
                ) : rule.minWeightG !== undefined ? (
                  <div className="size-badge">
                    <Scale size={15} />
                    <span>{rule.minWeightG >= 1000 ? `${rule.minWeightG / 1000} kg` : `${rule.minWeightG} g`}</span>
                  </div>
                ) : null}
              </div>

              <SpeciesVisual
                speciesId={sp.id}
                commonName={sp.commonName}
                category={sp.category}
                minSizeCm={rule.minSizeCm}
                minWeightG={rule.minWeightG}
              />

              {sp.measureMethod && (
                <p className="measure-method">
                  <Ruler size={13} />
                  <span><strong>Mesure :</strong> {sp.measureMethod}</span>
                </p>
              )}

              <div className="rule-meta">
                {rule.freshwaterCategory && (
                  <span className="tag tag-zone">
                    {rule.freshwaterCategory === 'both'
                      ? '1ère & 2ème cat.'
                      : rule.freshwaterCategory === '1ere'
                        ? '1ère catégorie'
                        : '2ème catégorie'}
                  </span>
                )}
                {sp.peakMonths && sp.peakMonths.includes(seasonMonth) && (
                  <span className="tag tag-quota">
                    <Calendar size={12} /> De saison
                  </span>
                )}
                {rule.subZone && (
                  <span className="tag tag-zone">
                    Zone : {rule.subZone.replace(/_/g, ' ')}
                  </span>
                )}
                {rule.quotaPerDay !== undefined && (
                  <span className="tag tag-quota">
                    Quota : {rule.quotaPerDay} / jour
                  </span>
                )}
                {rule.markingRequired && (
                  <span className="tag tag-warn">
                    <AlertTriangle size={12} /> Marquage obligatoire
                  </span>
                )}
                {rule.declarationRequired && (
                  <span className="tag tag-info">
                    <CheckCircle2 size={12} /> Déclaration UE
                  </span>
                )}
              </div>

              {rule.openPeriods && rule.openPeriods.length > 0 && (
                <p className="rule-detail">
                  <strong>Ouverture :</strong>{' '}
                  {rule.openPeriods
                    .map((p) => `${p.start} → ${p.end}${p.note ? ` (${p.note})` : ''}`)
                    .join(' ; ')}
                </p>
              )}

              {rule.closedPeriods && rule.closedPeriods.length > 0 && (
                <p className="rule-detail">
                  <strong>Fermeture :</strong>{' '}
                  {rule.closedPeriods
                    .map((p) => `${p.start} → ${p.end}${p.note ? ` (${p.note})` : ''}`)
                    .join(' ; ')}
                </p>
              )}

              {rule.markingDetails && (
                <p className="rule-detail">
                  <strong>Marquage :</strong> {rule.markingDetails}
                </p>
              )}

              {rule.declarationDetails && (
                <p className="rule-detail">
                  <strong>Déclaration :</strong> {rule.declarationDetails}
                </p>
              )}

              {rule.gearRestrictions && rule.gearRestrictions.length > 0 && (
                <p className="rule-detail">
                  <strong>Engins :</strong> {rule.gearRestrictions.join(' ')}
                </p>
              )}

              {rule.notes && <p className="rule-detail">{rule.notes}</p>}

              {onLocateSpecies && (
                <button
                  type="button"
                  className="locate-species-btn"
                  onClick={() =>
                    onLocateSpecies(
                      sp,
                      rule,
                      rule.facade && rule.facade !== 'NATIONAL'
                        ? (rule.facade as FacadeCode)
                        : selectedFacade,
                    )
                  }
                >
                  <MapPin size={14} /> Voir zones &amp; réglementation sur la carte
                </button>
              )}

              <p className="rule-source">
                Source :{' '}
                <a
                  href={
                    resolveSourceReference(rule.sourceName, rule.sourceUrl, sp?.commonName).href
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="source-link"
                >
                  {rule.sourceName} <ExternalLink size={11} />
                </a>{' '}
                (vérifié le {rule.lastCheckedAt.slice(0, 10)})
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
