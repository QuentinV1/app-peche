import { useState } from 'react';
import { Image as ImageIcon, Ruler } from 'lucide-react';
import type { SpeciesCategory } from '../../schema/types';

interface SpeciesVisualProps {
  speciesId: string;
  commonName: string;
  category: SpeciesCategory;
  minSizeCm?: number;
  minWeightG?: number;
}

interface VisualStyle {
  body: string;
  belly: string;
  fin: string;
  accent: string;
  shape:
    | 'bass'
    | 'pollock'
    | 'gadoid'
    | 'sparid'
    | 'meagre'
    | 'flatfish-oval'
    | 'flatfish-diamond'
    | 'mackerel'
    | 'conger'
    | 'mullet'
    | 'scorpionfish'
    | 'lobster'
    | 'spiny-lobster'
    | 'langoustine'
    | 'shrimp'
    | 'crab-width'
    | 'spider-crab'
    | 'cockle'
    | 'clam'
    | 'scallop'
    | 'mussel'
    | 'oyster'
    | 'razor'
    | 'octopus'
    | 'cuttlefish';
  spots?: string;
  stripes?: boolean;
  goldenBrow?: boolean;
  shoulderSpot?: boolean;
  barbel?: boolean;
}

const SPECIES_STYLES: Record<string, VisualStyle> = {
  'dicentrarchus-labrax': { shape: 'bass', body: '#64748b', belly: '#e2e8f0', fin: '#475569', accent: '#1e293b', shoulderSpot: true },
  'pollachius-pollachius': { shape: 'pollock', body: '#78716c', belly: '#fef3c7', fin: '#57534e', accent: '#a8a29e' },
  'pollachius-virens': { shape: 'pollock', body: '#334155', belly: '#cbd5e1', fin: '#1e293b', accent: '#f8fafc' },
  'gadus-morhua': { shape: 'gadoid', body: '#7c6f52', belly: '#f5f5f4', fin: '#57534e', accent: '#44403c', spots: '#44403c', barbel: true },
  'merlangius-merlangus': { shape: 'gadoid', body: '#94a3b8', belly: '#f8fafc', fin: '#64748b', accent: '#1e293b', shoulderSpot: true },
  'sparus-aurata': { shape: 'sparid', body: '#94a3b8', belly: '#f1f5f9', fin: '#64748b', accent: '#f59e0b', goldenBrow: true, shoulderSpot: true },
  'spondyliosoma-cantharus': { shape: 'sparid', body: '#475569', belly: '#cbd5e1', fin: '#334155', accent: '#94a3b8', stripes: true },
  'pagellus-bogaraveo': { shape: 'sparid', body: '#f472b6', belly: '#fce7f3', fin: '#ec4899', accent: '#1e293b', shoulderSpot: true },
  'diplodus-sargus': { shape: 'sparid', body: '#94a3b8', belly: '#f8fafc', fin: '#64748b', accent: '#0f172a', stripes: true },
  'pagellus-erythrinus': { shape: 'sparid', body: '#fb7185', belly: '#fff1f2', fin: '#f43f5e', accent: '#be123c' },
  'pagrus-pagrus': { shape: 'sparid', body: '#f87171', belly: '#fef2f2', fin: '#ef4444', accent: '#991b1b' },
  'lithognathus-mormyrus': { shape: 'sparid', body: '#cbd5e1', belly: '#f8fafc', fin: '#94a3b8', accent: '#334155', stripes: true },
  'argyrosomus-regius': { shape: 'meagre', body: '#78716c', belly: '#e7e5e4', fin: '#a16207', accent: '#ca8a04' },
  'solea-solea': { shape: 'flatfish-oval', body: '#78614c', belly: '#d6c7b2', fin: '#5c4938', accent: '#1c1917', spots: '#443322' },
  'pleuronectes-platessa': { shape: 'flatfish-diamond', body: '#85674b', belly: '#e7dccb', fin: '#6b513a', accent: '#ea580c', spots: '#f97316' },
  'scophthalmus-maximus': { shape: 'flatfish-diamond', body: '#6b5e4e', belly: '#d6d3d1', fin: '#57534e', accent: '#292524', spots: '#292524' },
  'scophthalmus-rhombus': { shape: 'flatfish-diamond', body: '#7c6a56', belly: '#e7e5e4', fin: '#5c4d3c', accent: '#44403c', spots: '#e7e5e4' },
  'scomber-scombrus': { shape: 'mackerel', body: '#0284c7', belly: '#f1f5f9', fin: '#0369a1', accent: '#0f172a', stripes: true },
  'conger-conger': { shape: 'conger', body: '#475569', belly: '#cbd5e1', fin: '#334155', accent: '#0f172a' },
  'mullus-surmuletus': { shape: 'mullet', body: '#ef4444', belly: '#fee2e2', fin: '#f97316', accent: '#eab308', stripes: true, barbel: true },
  'scorpaena-scrofa': { shape: 'scorpionfish', body: '#dc2626', belly: '#fecaca', fin: '#b91c1c', accent: '#7f1d1d', spots: '#450a0a' },
  'melanogrammus-aeglefinus': { shape: 'gadoid', body: '#64748b', belly: '#f1f5f9', fin: '#475569', accent: '#0f172a', shoulderSpot: true, barbel: true },
  'clupea-harengus': { shape: 'mackerel', body: '#3b82f6', belly: '#f8fafc', fin: '#64748b', accent: '#1e3a8a' },
  'chelon-labrosus': { shape: 'mullet', body: '#64748b', belly: '#f1f5f9', fin: '#475569', accent: '#334155', stripes: true },
  'trachurus-trachurus': { shape: 'mackerel', body: '#475569', belly: '#f1f5f9', fin: '#334155', accent: '#0f172a', shoulderSpot: true },
  'sardina-pilchardus': { shape: 'mackerel', body: '#2563eb', belly: '#f8fafc', fin: '#64748b', accent: '#1e293b' },
  'engraulis-encrasicolus': { shape: 'mackerel', body: '#0ea5e9', belly: '#f8fafc', fin: '#64748b', accent: '#0369a1' },
  'merluccius-merluccius': { shape: 'gadoid', body: '#64748b', belly: '#f8fafc', fin: '#475569', accent: '#1e293b' },
  'molva-molva': { shape: 'conger', body: '#78716c', belly: '#f5f5f4', fin: '#57534e', accent: '#292524', barbel: true },
  'alosa-alosa': { shape: 'bass', body: '#64748b', belly: '#f8fafc', fin: '#475569', accent: '#1e293b', shoulderSpot: true },
  'thunnus-thynnus': { shape: 'mackerel', body: '#1e3a8a', belly: '#e2e8f0', fin: '#1d4ed8', accent: '#0f172a' },
  'sciaena-umbra': { shape: 'bass', body: '#57534e', belly: '#d6d3d1', fin: '#44403c', accent: '#f59e0b' },
  'homarus-gammarus': { shape: 'lobster', body: '#1d4ed8', belly: '#93c5fd', fin: '#1e3a8a', accent: '#f59e0b' },
  'palinurus-elephas': { shape: 'spiny-lobster', body: '#c2410c', belly: '#fed7aa', fin: '#9a3412', accent: '#fbbf24' },
  'nephrops-norvegicus': { shape: 'langoustine', body: '#fb923c', belly: '#ffedd5', fin: '#ea580c', accent: '#9a3412' },
  'maja-brachydactyla': { shape: 'spider-crab', body: '#b45309', belly: '#fde68a', fin: '#92400e', accent: '#78350f' },
  'cancer-pagurus': { shape: 'crab-width', body: '#b91c1c', belly: '#fca5a5', fin: '#7f1d1d', accent: '#1e293b' },
  'necora-puber': { shape: 'crab-width', body: '#334155', belly: '#94a3b8', fin: '#1d4ed8', accent: '#ef4444' },
  'palaemon-serratus': { shape: 'shrimp', body: '#fb7185', belly: '#ffe4e6', fin: '#f43f5e', accent: '#be123c' },
  'cerastoderma-edule': { shape: 'cockle', body: '#e7e5e4', belly: '#f5f5f4', fin: '#a8a29e', accent: '#78716c' },
  'ruditapes-decussatus': { shape: 'clam', body: '#d6d3d1', belly: '#f5f5f4', fin: '#78716c', accent: '#57534e' },
  'ruditapes-philippinarum': { shape: 'clam', body: '#a8a29e', belly: '#e7e5e4', fin: '#57534e', accent: '#44403c' },
  'pecten-maximus': { shape: 'scallop', body: '#fdba74', belly: '#ffedd5', fin: '#ea580c', accent: '#9a3412' },
  'mytilus-edulis': { shape: 'mussel', body: '#1e293b', belly: '#475569', fin: '#0f172a', accent: '#38bdf8' },
  'magallana-gigas': { shape: 'oyster', body: '#a8a29e', belly: '#e7e5e4', fin: '#78716c', accent: '#57534e' },
  'venus-verrucosa': { shape: 'clam', body: '#d6b89c', belly: '#f5ebe0', fin: '#a68a64', accent: '#6f4e37' },
  'donax-trunculus': { shape: 'clam', body: '#fde047', belly: '#fef9c3', fin: '#eab308', accent: '#a16207' },
  'ensis-siliqua': { shape: 'razor', body: '#d6b89c', belly: '#f5ebe0', fin: '#8d6e63', accent: '#5d4037' },
  'buccinum-undatum': { shape: 'clam', body: '#d6c7b2', belly: '#f5ebe0', fin: '#a68a64', accent: '#5c4938' },
  'haliotis-tuberculata': { shape: 'oyster', body: '#78716c', belly: '#e2e8f0', fin: '#57534e', accent: '#38bdf8' },
  'octopus-vulgaris': { shape: 'octopus', body: '#c2410c', belly: '#fdba74', fin: '#9a3412', accent: '#7c2d12' },
  'sepia-officinalis': { shape: 'cuttlefish', body: '#a16207', belly: '#fef08a', fin: '#854d0e', accent: '#422006' },
};

function formatMeasureLabel(minSizeCm?: number, minWeightG?: number, suffix?: string): string {
  if (minSizeCm !== undefined) {
    const val = String(minSizeCm).replace('.', ',');
    return suffix ? `${val} cm (${suffix})` : `${val} cm`;
  }
  if (minWeightG !== undefined) {
    return minWeightG >= 1000 ? `${minWeightG / 1000} kg` : `${minWeightG} g`;
  }
  return 'Maille';
}

function MeasureLineH({
  x1,
  x2,
  y,
  label,
}: {
  x1: number;
  x2: number;
  y: number;
  label: string;
}) {
  const mid = (x1 + x2) / 2;
  return (
    <g className="measure-overlay">
      <line x1={x1} y1={y - 10} x2={x1} y2={y + 6} stroke="#dc2626" strokeWidth="1.5" strokeDasharray="2,2" />
      <line x1={x2} y1={y - 10} x2={x2} y2={y + 6} stroke="#dc2626" strokeWidth="1.5" strokeDasharray="2,2" />
      <line x1={x1 + 3} y1={y} x2={x2 - 3} y2={y} stroke="#dc2626" strokeWidth="1.8" />
      <polygon points={`${x1},${y} ${x1 + 6},${y - 3.5} ${x1 + 6},${y + 3.5}`} fill="#dc2626" />
      <polygon points={`${x2},${y} ${x2 - 6},${y - 3.5} ${x2 - 6},${y + 3.5}`} fill="#dc2626" />
      <rect x={mid - 28} y={y - 8} width="56" height="15" rx="4" fill="#ffffff" stroke="#dc2626" strokeWidth="1" />
      <text x={mid} y={y + 3} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#dc2626">
        {label}
      </text>
    </g>
  );
}

function MeasureLineV({
  x,
  y1,
  y2,
  label,
}: {
  x: number;
  y1: number;
  y2: number;
  label: string;
}) {
  const mid = (y1 + y2) / 2;
  return (
    <g className="measure-overlay">
      <line x1={x - 10} y1={y1} x2={x + 6} y2={y1} stroke="#dc2626" strokeWidth="1.5" strokeDasharray="2,2" />
      <line x1={x - 10} y1={y2} x2={x + 6} y2={y2} stroke="#dc2626" strokeWidth="1.5" strokeDasharray="2,2" />
      <line x1={x} y1={y1 + 3} x2={x} y2={y2 - 3} stroke="#dc2626" strokeWidth="1.8" />
      <polygon points={`${x},${y1} ${x - 3.5},${y1 + 6} ${x + 3.5},${y1 + 6}`} fill="#dc2626" />
      <polygon points={`${x},${y2} ${x - 3.5},${y2 - 6} ${x + 3.5},${y2 - 6}`} fill="#dc2626" />
      <rect x={x + 6} y={mid - 8} width="46" height="15" rx="4" fill="#ffffff" stroke="#dc2626" strokeWidth="1" />
      <text x={x + 29} y={mid + 3} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#dc2626">
        {label}
      </text>
    </g>
  );
}

export function SpeciesVisual({
  speciesId,
  commonName,
  category,
  minSizeCm,
  minWeightG,
}: SpeciesVisualProps) {
  const st = SPECIES_STYLES[speciesId] ?? {
    shape: category === 'crustacean' ? 'crab-width' : category === 'shellfish' ? 'clam' : 'bass',
    body: '#64748b',
    belly: '#e2e8f0',
    fin: '#475569',
    accent: '#1e293b',
  };

  const renderIllustration = () => {
    switch (st.shape) {
      case 'bass':
      case 'pollock':
      case 'gadoid':
      case 'meagre':
        return (
          <g>
            {/* Nageoires dorsales */}
            <path d="M92,31 L114,17 L128,31 Z" fill={st.fin} />
            <path d="M132,31 L162,21 L172,34 Z" fill={st.fin} />
            {/* Nageoires pelvienne & anale */}
            <path d="M95,58 L108,71 L115,58 Z" fill={st.fin} opacity="0.85" />
            <path d="M138,57 L164,68 L172,54 Z" fill={st.fin} opacity="0.85" />
            {/* Nageoire caudale */}
            <path d="M188,45 L218,24 L211,45 L218,66 Z" fill={st.fin} />
            {/* Corps */}
            <path
              d="M36,45 C52,27 115,24 190,40 L190,50 C115,66 52,63 36,45 Z"
              fill={st.body}
            />
            <path
              d="M38,46 C56,58 115,61 188,49 L188,46 C120,52 60,51 38,46 Z"
              fill={st.belly}
              opacity="0.85"
            />
            {/* Opercule & oeil */}
            <path d="M74,34 C79,42 79,50 74,56" fill="none" stroke={st.accent} strokeWidth="1.3" opacity="0.6" />
            <circle cx="54" cy="41" r="3.5" fill="#ffffff" />
            <circle cx="54.5" cy="41" r="1.8" fill="#0f172a" />
            {st.shoulderSpot && <circle cx="77" cy="40" r="3" fill={st.accent} opacity="0.8" />}
            {st.barbel && <path d="M44,51 L41,58" stroke={st.accent} strokeWidth="1.8" strokeLinecap="round" />}
            {st.spots && (
              <g fill={st.spots} opacity="0.45">
                <circle cx="105" cy="39" r="2" />
                <circle cx="122" cy="36" r="2.2" />
                <circle cx="140" cy="40" r="1.8" />
                <circle cx="155" cy="38" r="2" />
              </g>
            )}
            <MeasureLineH x1={36} x2={218} y={82} label={formatMeasureLabel(minSizeCm, minWeightG)} />
          </g>
        );

      case 'sparid':
        return (
          <g>
            <path d="M84,26 L158,20 L166,35 L84,35 Z" fill={st.fin} />
            <path d="M136,61 L162,70 L170,56 Z" fill={st.fin} opacity="0.85" />
            <path d="M186,45 L216,25 L208,45 L216,65 Z" fill={st.fin} />
            <path
              d="M42,46 C56,22 125,18 188,41 L188,49 C125,72 56,68 42,46 Z"
              fill={st.body}
            />
            <path
              d="M44,47 C62,62 125,66 186,49 L186,46 C125,55 62,55 44,47 Z"
              fill={st.belly}
              opacity="0.85"
            />
            {st.stripes && (
              <g stroke={st.accent} strokeWidth="2.2" opacity="0.45">
                <line x1="95" y1="30" x2="95" y2="60" />
                <line x1="112" y1="28" x2="112" y2="62" />
                <line x1="129" y1="29" x2="129" y2="61" />
                <line x1="146" y1="31" x2="146" y2="59" />
              </g>
            )}
            {st.goldenBrow && (
              <path d="M48,37 Q58,33 66,36" fill="none" stroke="#f59e0b" strokeWidth="2.8" strokeLinecap="round" />
            )}
            {st.shoulderSpot && <circle cx="78" cy="39" r="3.2" fill={st.accent} opacity="0.85" />}
            <circle cx="57" cy="41" r="3.8" fill="#ffffff" />
            <circle cx="57.5" cy="41" r="2" fill="#0f172a" />
            <MeasureLineH x1={42} x2={216} y={82} label={formatMeasureLabel(minSizeCm, minWeightG)} />
          </g>
        );

      case 'mackerel':
        return (
          <g>
            <path d="M98,32 L114,19 L126,32 Z" fill={st.fin} />
            <path d="M138,34 L152,25 L160,35 Z" fill={st.fin} />
            <path d="M188,45 L218,26 L208,45 L218,64 Z" fill={st.fin} />
            <path d="M36,45 C58,28 135,28 190,42 L190,48 C135,62 58,62 36,45 Z" fill={st.body} />
            <path d="M38,46 C62,56 135,57 188,48 L188,45 C135,49 62,49 38,46 Z" fill={st.belly} />
            <g stroke="#0f172a" strokeWidth="1.8" fill="none" opacity="0.7">
              <path d="M84,33 Q88,40 84,43" />
              <path d="M96,32 Q100,40 96,43" />
              <path d="M108,32 Q112,40 108,43" />
              <path d="M120,33 Q124,40 120,43" />
              <path d="M132,34 Q136,40 132,43" />
              <path d="M144,35 Q148,40 144,43" />
            </g>
            <circle cx="53" cy="42" r="3.2" fill="#ffffff" />
            <circle cx="53.5" cy="42" r="1.7" fill="#0f172a" />
            <MeasureLineH x1={36} x2={218} y={82} label={formatMeasureLabel(minSizeCm, minWeightG)} />
          </g>
        );

      case 'conger':
        return (
          <g>
            <path
              d="M34,44 C52,35 90,34 135,38 C168,41 196,42 220,45 C196,50 168,51 135,51 C90,52 52,54 34,44 Z"
              fill={st.body}
            />
            <path
              d="M66,35 C110,31 170,36 220,45 C170,40 110,38 66,37 Z"
              fill={st.fin}
            />
            <circle cx="48" cy="41" r="3" fill="#ffffff" />
            <circle cx="48.5" cy="41" r="1.6" fill="#0f172a" />
            <MeasureLineH x1={34} x2={220} y={82} label={formatMeasureLabel(minSizeCm, minWeightG)} />
          </g>
        );

      case 'mullet':
      case 'scorpionfish':
        return (
          <g>
            <path d="M86,30 L110,16 L124,31 Z" fill={st.fin} />
            <path d="M130,32 L158,22 L168,35 Z" fill={st.fin} />
            <path d="M186,45 L215,27 L207,45 L215,63 Z" fill={st.fin} />
            <path d="M38,47 C48,26 115,24 188,40 L188,50 C115,65 50,64 38,47 Z" fill={st.body} />
            <path d="M40,48 C56,59 115,61 186,49 L186,47 C120,53 58,53 40,48 Z" fill={st.belly} opacity="0.85" />
            {st.barbel && (
              <g stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round">
                <line x1="43" y1="53" x2="36" y2="63" />
                <line x1="47" y1="54" x2="41" y2="64" />
              </g>
            )}
            <circle cx="54" cy="39" r="3.6" fill="#ffffff" />
            <circle cx="54.5" cy="39" r="1.9" fill="#0f172a" />
            <MeasureLineH x1={38} x2={215} y={82} label={formatMeasureLabel(minSizeCm, minWeightG)} />
          </g>
        );

      case 'flatfish-oval':
      case 'flatfish-diamond':
        return (
          <g>
            <path
              d={
                st.shape === 'flatfish-oval'
                  ? 'M42,45 C58,23 138,22 184,38 L184,52 C138,68 58,67 42,45 Z'
                  : 'M40,45 C75,18 135,18 184,40 L184,50 C135,72 75,72 40,45 Z'
              }
              fill={st.body}
            />
            <path d="M184,41 L212,28 L206,45 L212,62 L184,49 Z" fill={st.fin} />
            {st.spots && (
              <g fill={st.spots} opacity="0.85">
                <circle cx="95" cy="36" r="2.6" />
                <circle cx="122" cy="48" r="2.8" />
                <circle cx="145" cy="37" r="2.4" />
                <circle cx="110" cy="55" r="2.3" />
                <circle cx="160" cy="49" r="2.5" />
              </g>
            )}
            <circle cx="56" cy="40" r="2.6" fill="#ffffff" />
            <circle cx="56" cy="40" r="1.3" fill="#0f172a" />
            <circle cx="62" cy="46" r="2.6" fill="#ffffff" />
            <circle cx="62" cy="46" r="1.3" fill="#0f172a" />
            <MeasureLineH x1={40} x2={212} y={82} label={formatMeasureLabel(minSizeCm, minWeightG)} />
          </g>
        );

      case 'lobster':
      case 'spiny-lobster':
        return (
          <g>
            {/* Antennes */}
            <path d="M68,36 Q42,20 26,24" fill="none" stroke={st.body} strokeWidth="1.6" />
            <path d="M68,46 Q42,62 26,58" fill="none" stroke={st.body} strokeWidth="1.6" />
            {/* Pinces (homard uniquement) */}
            {st.shape === 'lobster' && (
              <g fill={st.body}>
                <path d="M74,34 L52,22 C44,18 38,24 46,30 L64,36 Z" />
                <path d="M74,50 L52,62 C44,66 38,60 46,54 L64,48 Z" />
              </g>
            )}
            {/* Céphalothorax (zone mesurée !) */}
            <rect x="68" y="31" width="54" height="22" rx="10" fill={st.body} />
            {/* Abdomen (queue) */}
            <rect x="122" y="34" width="16" height="16" rx="3" fill={st.fin} />
            <rect x="139" y="35" width="15" height="14" rx="3" fill={st.body} />
            <rect x="155" y="36" width="14" height="12" rx="3" fill={st.fin} />
            {/* Nageoire caudale */}
            <path d="M169,36 L192,28 L188,42 L192,56 L169,48 Z" fill={st.body} />
            <circle cx="75" cy="37" r="2.2" fill="#0f172a" />
            <circle cx="75" cy="47" r="2.2" fill="#0f172a" />
            <MeasureLineH x1={74} x2={122} y={80} label={formatMeasureLabel(minSizeCm, minWeightG, 'LC')} />
          </g>
        );

      case 'langoustine':
      case 'shrimp':
        return (
          <g>
            <path d="M62,38 Q36,24 22,28" fill="none" stroke={st.body} strokeWidth="1.4" />
            {st.shape === 'langoustine' && (
              <g stroke={st.body} strokeWidth="3.5" strokeLinecap="round">
                <line x1="70" y1="36" x2="36" y2="26" />
                <line x1="70" y1="48" x2="36" y2="58" />
              </g>
            )}
            {/* Rostre -> Telson */}
            <path d="M52,42 L70,35 L118,34 L178,39 L194,32 L190,42 L194,52 L178,45 L118,50 L70,49 Z" fill={st.body} />
            <circle cx="67" cy="39" r="2.2" fill="#0f172a" />
            <MeasureLineH x1={52} x2={194} y={80} label={formatMeasureLabel(minSizeCm, minWeightG, 'LT')} />
          </g>
        );

      case 'crab-width':
        return (
          <g>
            {/* Pattes */}
            <g stroke={st.fin} strokeWidth="3" strokeLinecap="round" fill="none">
              <path d="M90,34 L72,22" />
              <path d="M86,44 L66,44" />
              <path d="M92,54 L74,64" />
              <path d="M160,34 L178,22" />
              <path d="M164,44 L184,44" />
              <path d="M158,54 L176,64" />
            </g>
            {/* Pinces */}
            <path d="M102,27 L94,16 C88,12 84,18 90,24 Z" fill={st.body} />
            <path d="M148,27 L156,16 C162,12 166,18 160,24 Z" fill={st.body} />
            {/* Carapace */}
            <ellipse cx="125" cy="43" rx="38" ry="21" fill={st.body} />
            <circle cx="114" cy="27" r="2.2" fill="#0f172a" />
            <circle cx="136" cy="27" r="2.2" fill="#0f172a" />
            <MeasureLineH x1={87} x2={163} y={80} label={formatMeasureLabel(minSizeCm, minWeightG)} />
          </g>
        );

      case 'spider-crab':
        return (
          <g>
            <g stroke={st.fin} strokeWidth="2.4" strokeLinecap="round" fill="none">
              <path d="M102,36 L74,20 L62,28" />
              <path d="M100,45 L68,42 L58,52" />
              <path d="M104,54 L76,64 L68,74" />
              <path d="M148,36 L176,20 L188,28" />
              <path d="M150,45 L182,42 L192,52" />
              <path d="M146,54 L174,64 L182,74" />
            </g>
            <path d="M125,20 C142,22 150,36 148,50 C146,62 136,68 125,68 C114,68 104,62 102,50 C100,36 108,22 125,20 Z" fill={st.body} />
            <circle cx="118" cy="26" r="2" fill="#0f172a" />
            <circle cx="132" cy="26" r="2" fill="#0f172a" />
            <MeasureLineV x={160} y1={20} y2={68} label={formatMeasureLabel(minSizeCm, minWeightG)} />
          </g>
        );

      case 'cockle':
      case 'clam':
      case 'scallop':
        return (
          <g>
            <ellipse cx="125" cy="42" rx="34" ry="24" fill={st.body} stroke={st.fin} strokeWidth="2" />
            <path d="M105,24 Q125,42 105,60" fill="none" stroke={st.accent} strokeWidth="1.2" opacity="0.55" />
            <path d="M125,19 L125,65" fill="none" stroke={st.accent} strokeWidth="1.2" opacity="0.55" />
            <path d="M145,24 Q125,42 145,60" fill="none" stroke={st.accent} strokeWidth="1.2" opacity="0.55" />
            <MeasureLineH x1={91} x2={159} y={80} label={formatMeasureLabel(minSizeCm, minWeightG)} />
          </g>
        );

      case 'mussel':
      case 'oyster':
        return (
          <g>
            <path
              d="M84,48 C84,30 132,20 166,34 C174,40 168,58 142,60 C110,62 84,56 84,48 Z"
              fill={st.body}
              stroke={st.fin}
              strokeWidth="2"
            />
            <MeasureLineH x1={84} x2={169} y={80} label={formatMeasureLabel(minSizeCm, minWeightG)} />
          </g>
        );

      case 'razor':
        return (
          <g>
            <rect x="64" y="34" width="122" height="16" rx="4" fill={st.body} stroke={st.fin} strokeWidth="2" />
            <line x1="64" y1="42" x2="186" y2="42" stroke={st.accent} strokeWidth="1" opacity="0.5" />
            <MeasureLineH x1={64} x2={186} y={80} label={formatMeasureLabel(minSizeCm, minWeightG)} />
          </g>
        );

      case 'octopus':
        return (
          <g>
            <ellipse cx="125" cy="32" rx="20" ry="16" fill={st.body} />
            <g stroke={st.body} strokeWidth="4" strokeLinecap="round" fill="none">
              <path d="M112,45 Q92,56 80,68" />
              <path d="M118,47 Q108,60 102,72" />
              <path d="M125,48 Q125,62 125,74" />
              <path d="M132,47 Q142,60 148,72" />
              <path d="M138,45 Q158,56 170,68" />
            </g>
            <circle cx="118" cy="34" r="2.4" fill="#ffffff" />
            <circle cx="132" cy="34" r="2.4" fill="#ffffff" />
            <circle cx="118" cy="34" r="1.2" fill="#0f172a" />
            <circle cx="132" cy="34" r="1.2" fill="#0f172a" />
            <rect x="76" y="76" width="98" height="16" rx="5" fill="#fff1f2" stroke="#dc2626" strokeWidth="1" />
            <text x="125" y="87" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#dc2626">
              Pesée : min. {formatMeasureLabel(minSizeCm, minWeightG)}
            </text>
          </g>
        );

      case 'cuttlefish':
        return (
          <g>
            {/* Manteau */}
            <ellipse cx="108" cy="43" rx="44" ry="18" fill={st.body} />
            <ellipse cx="108" cy="43" rx="48" ry="22" fill="none" stroke={st.fin} strokeWidth="2.5" strokeDasharray="3,2" />
            {/* Tentacules */}
            <g stroke={st.body} strokeWidth="3" strokeLinecap="round">
              <line x1="150" y1="36" x2="182" y2="30" />
              <line x1="152" y1="43" x2="188" y2="43" />
              <line x1="150" y1="50" x2="182" y2="56" />
            </g>
            <circle cx="142" cy="38" r="2.5" fill="#ffffff" />
            <circle cx="142" cy="38" r="1.3" fill="#0f172a" />
            <MeasureLineH x1={64} x2={152} y={80} label={formatMeasureLabel(minSizeCm, minWeightG)} />
          </g>
        );
    }
  };

  const [imgFailed, setImgFailed] = useState(false);
  const [showDiagram, setShowDiagram] = useState(false);
  const photoSrc = `${import.meta.env.BASE_URL}images/species/${speciesId}.jpg`;
  const measureLabel = formatMeasureLabel(minSizeCm, minWeightG);

  if (!imgFailed && !showDiagram) {
    return (
      <div className="species-visual-box species-photo-box">
        <img
          src={photoSrc}
          alt={commonName}
          className="species-photo-img"
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
        <div className="species-photo-overlay">
          {(minSizeCm !== undefined || minWeightG !== undefined) && (
            <span className="species-measure-pill">
              <Ruler size={11} aria-hidden="true" />
              Min. {measureLabel}
            </span>
          )}
          <button
            type="button"
            className="species-visual-toggle"
            onClick={() => setShowDiagram(true)}
            title="Voir le schéma de mesure"
            aria-label={`Voir le schéma de mesure pour ${commonName}`}
          >
            <Ruler size={12} aria-hidden="true" />
            Schéma
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="species-visual-box">
      <svg
        viewBox="0 0 250 96"
        className="species-visual-svg"
        role="img"
        aria-label={`Illustration et schéma de mesure pour ${commonName}`}
      >
        <defs>
          <pattern id="ruler-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e2e8f0" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="250" height="96" rx="8" fill="#f8fafc" />
        <rect x="0" y="0" width="250" height="96" rx="8" fill="url(#ruler-grid)" />
        {renderIllustration()}
      </svg>
      {!imgFailed && (
        <button
          type="button"
          className="species-visual-toggle species-visual-toggle-float"
          onClick={() => setShowDiagram(false)}
          title="Voir la photo"
          aria-label={`Voir la photo pour ${commonName}`}
        >
          <ImageIcon size={12} aria-hidden="true" />
          Photo
        </button>
      )}
    </div>
  );
}
