import { useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  RotateCcw,
  Ruler,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import type { CatchEntry, RegulationRule, Species, SpeciesCategory } from '../../schema/types';
import type { FishingEnvironment } from '../App';
import type { FacadeCode } from '../services/dataStore';
import { compressImageToDataUrl, saveCatch } from '../services/catchStore';
import {
  computeMeasuredCm,
  identifySpeciesFromPhoto,
  REFERENCE_PRESETS,
  type Point2D,
  type RecognitionCandidate,
  type ReferencePreset,
} from '../services/visionMeasure';

interface VisionMeasurePanelProps {
  species: Species[];
  regulations: RegulationRule[];
  environment: FishingEnvironment;
  selectedFacade: FacadeCode;
  onSavedCatch?: () => void;
}

export function VisionMeasurePanel({
  species,
  regulations,
  environment,
  selectedFacade,
  onSavedCatch,
}: VisionMeasurePanelProps) {
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [categoryHint, setCategoryHint] = useState<'all' | SpeciesCategory>('all');
  const [geminiKey, setGeminiKey] = useState<string>(
    () => localStorage.getItem('app_peche_gemini_key') ?? '',
  );
  const [identifying, setIdentifying] = useState(false);
  const [candidates, setCandidates] = useState<RecognitionCandidate[]>([]);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string>('');

  // Calibration & mesure
  const [presetId, setPresetId] = useState<ReferencePreset['id']>('card');
  const [customCm, setCustomCm] = useState('10');
  const [points, setPoints] = useState<Point2D[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const envSpecies = useMemo(
    () => species.filter((s) => s.environment === 'both' || s.environment === environment),
    [species, environment],
  );

  const selectedSpecies = useMemo(
    () => species.find((s) => s.id === selectedSpeciesId) ?? null,
    [species, selectedSpeciesId],
  );

  const activeRule = useMemo(() => {
    if (!selectedSpecies) return null;
    return (
      regulations.find(
        (r) =>
          r.speciesId === selectedSpecies.id &&
          r.environment === environment &&
          (environment === 'freshwater' || !r.facade || r.facade === 'NATIONAL' || r.facade === selectedFacade),
      ) ?? null
    );
  }, [regulations, selectedSpecies, environment, selectedFacade]);

  const refCm = useMemo(() => {
    if (presetId === 'custom') return Number(customCm) || 0;
    return REFERENCE_PRESETS.find((p) => p.id === presetId)?.cm ?? 8.56;
  }, [presetId, customCm]);

  const measuredCm = useMemo(() => {
    if (points.length < 4) return null;
    return computeMeasuredCm(points[0], points[1], refCm, points[2], points[3]);
  }, [points, refCm]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const dataUrl = await compressImageToDataUrl(file, 1000);
      setPhotoDataUrl(dataUrl);
      setPoints([]);
      setCandidates([]);
      setSaveMessage(null);
    } catch {
      setUploadError("Impossible de traiter l'image sélectionnée.");
    }
  };

  const handleIdentify = async () => {
    if (!photoDataUrl) return;
    setIdentifying(true);
    try {
      if (geminiKey.trim()) {
        localStorage.setItem('app_peche_gemini_key', geminiKey.trim());
      }
      const res = await identifySpeciesFromPhoto(
        photoDataUrl,
        species,
        environment,
        categoryHint,
        geminiKey,
      );
      setCandidates(res);
      if (res[0]) setSelectedSpeciesId(res[0].species.id);
    } finally {
      setIdentifying(false);
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || points.length >= 4) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPoints((prev) => [...prev, { x, y }]);
  };

  const stepPrompt =
    points.length < 2
      ? `Étape 1/2 : Cliquez aux 2 extrémités de l'objet repère (${points.length}/2)`
      : points.length < 4
        ? `Étape 2/2 : Cliquez du museau à la queue du poisson (${points.length - 2}/2)`
        : 'Mesure terminée !';

  const handleSaveToLog = async () => {
    if (!selectedSpecies) return;
    const entry: CatchEntry = {
      id: `catch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      speciesId: selectedSpecies.id,
      speciesName: selectedSpecies.commonName,
      environment,
      sizeCm: measuredCm ?? undefined,
      released:
        measuredCm !== null && activeRule?.minSizeCm !== undefined
          ? measuredCm < activeRule.minSizeCm
          : true,
      date: new Date().toISOString(),
      photoDataUrl: photoDataUrl ?? undefined,
      notes: measuredCm !== null ? `Mesuré par photo (${measuredCm} cm)` : 'Identifié par photo',
    };
    await saveCatch(entry);
    setSaveMessage('Prise enregistrée dans votre Carnet.');
    onSavedCatch?.();
  };

  const isCompliant =
    measuredCm !== null && activeRule?.minSizeCm !== undefined
      ? measuredCm >= activeRule.minSizeCm
      : null;

  return (
    <div className="panel-scroll">
      <div className="info-card">
        <h2>IA Reconnaissance &amp; Mesure caméra</h2>
        <p className="rule-detail">
          Prenez une photo avec un objet repère (carte bancaire, pièce) pour identifier l&apos;espèce
          et mesurer sa taille par calibration.
        </p>

        <div className="catch-actions-row" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="quick-spot-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera size={14} /> {photoDataUrl ? 'Changer la photo' : 'Prendre / choisir une photo'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handlePhotoUpload}
          />
        </div>
        {uploadError && <p className="inline-error" style={{ marginTop: 8 }}>{uploadError}</p>}
      </div>

      {photoDataUrl && (
        <>
          <div className="info-card">
            <h3>1. Reconnaissance d&apos;espèce</h3>
            <div className="filter-row" style={{ marginBottom: 8 }}>
              {(['all', 'fish', 'crustacean', 'shellfish', 'cephalopod'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`chip ${categoryHint === cat ? 'chip-active' : ''}`}
                  onClick={() => setCategoryHint(cat)}
                >
                  {cat === 'all'
                    ? 'Toutes'
                    : cat === 'fish'
                      ? 'Poissons'
                      : cat === 'crustacean'
                        ? 'Crustacés'
                        : cat === 'shellfish'
                          ? 'Coquillages'
                          : 'Céphalopodes'}
                </button>
              ))}
            </div>

            <label className="form-field" style={{ marginBottom: 8 }}>
              <span>Clé API Gemini optionnelle (sinon mode hors-ligne)</span>
              <input
                type="password"
                maxLength={120}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIza... (optionnel)"
              />
            </label>

            <button
              type="button"
              className="refresh-btn"
              disabled={identifying}
              onClick={handleIdentify}
            >
              <Sparkles size={15} />{' '}
              {identifying ? 'Analyse en cours...' : "Identifier l'espèce"}
            </button>

            {candidates.length > 0 && (
              <div className="species-zone-chips" style={{ marginTop: 8 }}>
                {candidates.map((c) => (
                  <button
                    key={c.species.id}
                    type="button"
                    className={`chip ${selectedSpeciesId === c.species.id ? 'chip-active' : ''}`}
                    onClick={() => setSelectedSpeciesId(c.species.id)}
                    title={c.reason}
                  >
                    {c.species.commonName}
                  </button>
                ))}
              </div>
            )}

            <label className="form-field" style={{ marginTop: 8 }}>
              <span>Espèce sélectionnée</span>
              <select
                value={selectedSpeciesId}
                onChange={(e) => setSelectedSpeciesId(e.target.value)}
              >
                <option value="">-- Sélectionner --</option>
                {envSpecies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.commonName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="info-card">
            <div className="catch-header-row">
              <h3>2. Mesure par calibration</h3>
              <button
                type="button"
                className="chip"
                onClick={() => setPoints([])}
                disabled={points.length === 0}
              >
                <RotateCcw size={13} /> Réinitialiser
              </button>
            </div>

            <div className="form-row-2" style={{ marginTop: 8 }}>
              <label className="form-field">
                <span>Objet repère</span>
                <select
                  value={presetId}
                  onChange={(e) => setPresetId(e.target.value as ReferencePreset['id'])}
                >
                  {REFERENCE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {presetId === 'custom' && (
                <label className="form-field">
                  <span>Longueur (cm)</span>
                  <input
                    type="number"
                    min="0.5"
                    max="500"
                    step="0.1"
                    value={customCm}
                    onChange={(e) => setCustomCm(e.target.value)}
                  />
                </label>
              )}
            </div>

            <p className="rule-detail" style={{ marginTop: 8 }}>
              <Ruler size={13} /> <strong>{stepPrompt}</strong>
            </p>

            <div className="measure-stage">
              <img
                ref={imgRef}
                src={photoDataUrl}
                alt="Calibration mesure"
                className="measure-photo"
                onClick={handleImageClick}
              />
              <svg className="measure-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                {points.length >= 2 && (
                  <line
                    x1={points[0].x * 100}
                    y1={points[0].y * 100}
                    x2={points[1].x * 100}
                    y2={points[1].y * 100}
                    stroke="#f59e0b"
                    strokeWidth="1.2"
                  />
                )}
                {points.length >= 4 && (
                  <line
                    x1={points[2].x * 100}
                    y1={points[2].y * 100}
                    x2={points[3].x * 100}
                    y2={points[3].y * 100}
                    stroke="#10b981"
                    strokeWidth="1.2"
                  />
                )}
                {points.map((pt, idx) => (
                  <circle
                    key={idx}
                    cx={pt.x * 100}
                    cy={pt.y * 100}
                    r="1.8"
                    fill={idx < 2 ? '#f59e0b' : '#10b981'}
                    stroke="#ffffff"
                    strokeWidth="0.6"
                  />
                ))}
              </svg>
            </div>

            {measuredCm !== null && (
              <div className="measure-result">
                <span className="size-badge">{measuredCm} cm estimés</span>
                {isCompliant !== null && (
                  <span className={`tag ${isCompliant ? 'tag-quota' : 'tag-warn'}`}>
                    {isCompliant ? (
                      <>
                        <CheckCircle2 size={13} /> Conforme (maille {activeRule?.minSizeCm} cm)
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={13} /> Sous la maille ({activeRule?.minSizeCm} cm) — à relâcher
                      </>
                    )}
                  </span>
                )}
              </div>
            )}

            {selectedSpecies && (
              <button
                type="button"
                className="locate-species-btn"
                onClick={handleSaveToLog}
              >
                Enregistrer dans le Carnet
              </button>
            )}
            {saveMessage && <p className="rule-detail">{saveMessage}</p>}
          </div>
        </>
      )}
    </div>
  );
}
