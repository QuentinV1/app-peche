import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Download,
  MapPin,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import type { CatchEntry, Species } from '../../schema/types';
import {
  compressImageToDataUrl,
  deleteCatch,
  importCatches,
  listCatches,
  saveCatch,
} from '../services/catchStore';
import { subscribeLocalDataChange } from '../services/cloudSync';

interface CatchLogPanelProps {
  species: Species[];
  defaultEnvironment: 'sea' | 'freshwater';
}

export function CatchLogPanel({ species, defaultEnvironment }: CatchLogPanelProps) {
  const [catches, setCatches] = useState<CatchEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [env, setEnv] = useState<'sea' | 'freshwater'>(defaultEnvironment);
  const [speciesId, setSpeciesId] = useState('');
  const [customSpecies, setCustomSpecies] = useState('');
  const [sizeCm, setSizeCm] = useState('');
  const [weightG, setWeightG] = useState('');
  const [released, setReleased] = useState(true);
  const [locationLabel, setLocationLabel] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    listCatches().then(setCatches).catch(() => {});
    const unsub = subscribeLocalDataChange(() => {
      listCatches().then(setCatches).catch(() => {});
    });
    return unsub;
  }, []);

  const envSpecies = useMemo(
    () => species.filter((s) => s.environment === 'both' || s.environment === env),
    [species, env],
  );

  const stats = useMemo(() => {
    const total = catches.length;
    const releasedCount = catches.filter((c) => c.released).length;
    const maxCm = catches.reduce((m, c) => (c.sizeCm && c.sizeCm > m ? c.sizeCm : m), 0);
    return { total, releasedCount, maxCm };
  }, [catches]);

  const handleGetGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Géolocalisation indisponible sur cet appareil.');
      return;
    }
    setGpsStatus('Acquisition GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        setCoords({ lat, lng });
        setGpsStatus(`GPS : ${lat}, ${lng}`);
      },
      () => {
        setGpsStatus('Position GPS refusée ou indisponible.');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setPhotoDataUrl(dataUrl);
    } catch {
      setFeedback("Impossible de traiter l'image sélectionnée.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosen = envSpecies.find((s) => s.id === speciesId);
    const speciesName = (chosen?.commonName ?? customSpecies).trim();
    if (!speciesName) {
      setFeedback("Veuillez sélectionner ou saisir le nom de l'espèce.");
      return;
    }

    const entry: CatchEntry = {
      id: `catch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      speciesId: chosen?.id,
      speciesName,
      environment: env,
      sizeCm: sizeCm ? Number(sizeCm) : undefined,
      weightG: weightG ? Number(weightG) : undefined,
      released,
      date: new Date().toISOString(),
      lat: coords?.lat,
      lng: coords?.lng,
      locationLabel: locationLabel.trim() || undefined,
      photoDataUrl,
      notes: notes.trim() || undefined,
    };

    await saveCatch(entry);
    setCatches(await listCatches());
    setShowForm(false);
    setSpeciesId('');
    setCustomSpecies('');
    setSizeCm('');
    setWeightG('');
    setLocationLabel('');
    setCoords(null);
    setGpsStatus(null);
    setPhotoDataUrl(undefined);
    setNotes('');
    setFeedback('Prise enregistrée dans le carnet local.');
  };

  const handleDelete = async (id: string) => {
    await deleteCatch(id);
    setCatches(await listCatches());
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(catches, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carnet-prises-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const imported = await importCatches(parsed);
      setCatches(await listCatches());
      setFeedback(`${imported} prise(s) importée(s).`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Erreur lors de l'import JSON.");
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="panel-scroll">
      <div className="info-card catch-stats-card">
        <div className="catch-header-row">
          <h2>Carnet de prises</h2>
          <button
            type="button"
            className="quick-spot-btn"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus size={15} /> {showForm ? 'Fermer' : 'Ajouter une prise'}
          </button>
        </div>

        <div className="catch-stats-grid">
          <div className="catch-stat">
            <strong>{stats.total}</strong>
            <span>Prises</span>
          </div>
          <div className="catch-stat">
            <strong>
              {stats.total > 0 ? Math.round((stats.releasedCount / stats.total) * 100) : 0}%
            </strong>
            <span>Relâchées</span>
          </div>
          <div className="catch-stat">
            <strong>{stats.maxCm > 0 ? `${stats.maxCm} cm` : '—'}</strong>
            <span>Record</span>
          </div>
        </div>

        <div className="catch-actions-row">
          <button
            type="button"
            className="chip"
            onClick={handleExport}
            disabled={catches.length === 0}
          >
            <Download size={13} /> Exporter JSON
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => importInputRef.current?.click()}
          >
            <Upload size={13} /> Importer JSON
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
        </div>
        {feedback && <p className="rule-detail">{feedback}</p>}
      </div>

      {showForm && (
        <form className="info-card catch-form" onSubmit={handleSubmit}>
          <h3>Nouvelle prise</h3>

          <div className="filter-row">
            <button
              type="button"
              className={`chip ${env === 'sea' ? 'chip-active' : ''}`}
              onClick={() => {
                setEnv('sea');
                setSpeciesId('');
              }}
            >
              Mer
            </button>
            <button
              type="button"
              className={`chip ${env === 'freshwater' ? 'chip-active' : ''}`}
              onClick={() => {
                setEnv('freshwater');
                setSpeciesId('');
              }}
            >
              Eau douce
            </button>
          </div>

          <label className="form-field">
            <span>Espèce</span>
            <select value={speciesId} onChange={(e) => setSpeciesId(e.target.value)}>
              <option value="">-- Choisir ou saisir ci-dessous --</option>
              {envSpecies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.commonName}
                </option>
              ))}
            </select>
          </label>

          {!speciesId && (
            <label className="form-field">
              <span>Autre espèce</span>
              <input
                type="text"
                maxLength={60}
                value={customSpecies}
                onChange={(e) => setCustomSpecies(e.target.value)}
                placeholder="Ex: Maquereau, Chevesne..."
              />
            </label>
          )}

          <div className="form-row-2">
            <label className="form-field">
              <span>Taille (cm)</span>
              <input
                type="number"
                min="1"
                max="500"
                step="0.5"
                value={sizeCm}
                onChange={(e) => setSizeCm(e.target.value)}
                placeholder="45"
              />
            </label>
            <label className="form-field">
              <span>Poids (g)</span>
              <input
                type="number"
                min="1"
                max="200000"
                step="10"
                value={weightG}
                onChange={(e) => setWeightG(e.target.value)}
                placeholder="1200"
              />
            </label>
          </div>

          <div className="filter-row">
            <button
              type="button"
              className={`chip ${released ? 'chip-active' : ''}`}
              onClick={() => setReleased(true)}
            >
              Relâché (No-kill)
            </button>
            <button
              type="button"
              className={`chip ${!released ? 'chip-active' : ''}`}
              onClick={() => setReleased(false)}
            >
              Conservé
            </button>
          </div>

          <label className="form-field">
            <span>Lieu / Spot</span>
            <input
              type="text"
              maxLength={80}
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="Ex: Pointe du Raz, Loire..."
            />
          </label>

          <div className="catch-actions-row">
            <button type="button" className="chip" onClick={handleGetGps}>
              <MapPin size={13} /> Ma position GPS
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera size={13} /> {photoDataUrl ? 'Changer photo' : 'Ajouter photo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
          </div>
          {gpsStatus && <p className="rule-detail">{gpsStatus}</p>}
          {photoDataUrl && (
            <img src={photoDataUrl} alt="Aperçu prise" className="catch-photo-preview" />
          )}

          <label className="form-field">
            <span>Notes</span>
            <input
              type="text"
              maxLength={240}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Leurre, marée, météo..."
            />
          </label>

          <button type="submit" className="refresh-btn">
            Enregistrer la prise
          </button>
        </form>
      )}

      <div className="cards-list">
        {catches.length === 0 && (
          <p className="empty-state">
            Aucune prise enregistrée pour le moment. Appuyez sur « Ajouter une prise » pour démarrer votre carnet.
          </p>
        )}
        {catches.map((c) => (
          <article key={c.id} className="rule-card">
            <div className="rule-card-header">
              <div>
                <h3>{c.speciesName}</h3>
                <span className="sci-name">
                  {new Date(c.date).toLocaleString('fr-FR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              <div className="catch-badges">
                {c.sizeCm !== undefined && <span className="size-badge">{c.sizeCm} cm</span>}
                {confirmDeleteId === c.id ? (
                  <>
                    <button
                      type="button"
                      className="session-btn session-btn-stop"
                      onClick={async () => {
                        await handleDelete(c.id);
                        setConfirmDeleteId(null);
                      }}
                    >
                      Suppr.
                    </button>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Annuler
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="icon-close"
                    onClick={() => setConfirmDeleteId(c.id)}
                    aria-label="Supprimer la prise"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="rule-meta">
              <span className="tag tag-zone">
                {c.environment === 'sea' ? 'Mer' : 'Eau douce'}
              </span>
              <span className={`tag ${c.released ? 'tag-quota' : 'tag-warn'}`}>
                {c.released ? 'Relâché' : 'Conservé'}
              </span>
              {c.weightG !== undefined && (
                <span className="tag tag-info">{c.weightG} g</span>
              )}
            </div>

            {(c.locationLabel || (c.lat !== undefined && c.lng !== undefined)) && (
              <p className="rule-detail">
                <MapPin size={12} />{' '}
                {c.locationLabel ?? 'Position'}{' '}
                {c.lat !== undefined && c.lng !== undefined ? `(${c.lat}, ${c.lng})` : ''}
              </p>
            )}
            {c.notes && <p className="rule-detail">{c.notes}</p>}
            {c.photoDataUrl && (
              <img src={c.photoDataUrl} alt={c.speciesName} className="catch-photo" />
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
