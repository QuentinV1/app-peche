import type { CatchEntry } from '../../schema/types';
import { CATCHES_STORE, getDb } from './dataStore';
import { pushCatchToCloud, removeCatchFromCloud } from './cloudSync';

export async function listCatches(): Promise<CatchEntry[]> {
  const db = await getDb();
  const all = (await db.getAll(CATCHES_STORE)) as CatchEntry[];
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveCatch(entry: CatchEntry): Promise<void> {
  const db = await getDb();
  await db.put(CATCHES_STORE, entry);
  pushCatchToCloud(entry).catch(() => {});
}

export async function deleteCatch(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(CATCHES_STORE, id);
  removeCatchFromCloud(id).catch(() => {});
}

export async function importCatches(entries: unknown): Promise<number> {
  if (!Array.isArray(entries)) {
    throw new Error('Format JSON invalide : un tableau de prises est attendu.');
  }
  const db = await getDb();
  const tx = db.transaction(CATCHES_STORE, 'readwrite');
  let count = 0;
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Partial<CatchEntry>;
    if (!item.id || !item.speciesName || !item.date) continue;
    const normalized: CatchEntry = {
      id: String(item.id),
      speciesId: item.speciesId ? String(item.speciesId) : undefined,
      speciesName: String(item.speciesName),
      environment: item.environment === 'freshwater' ? 'freshwater' : 'sea',
      sizeCm: typeof item.sizeCm === 'number' ? item.sizeCm : undefined,
      weightG: typeof item.weightG === 'number' ? item.weightG : undefined,
      released: Boolean(item.released),
      date: String(item.date),
      lat: typeof item.lat === 'number' ? item.lat : undefined,
      lng: typeof item.lng === 'number' ? item.lng : undefined,
      locationLabel: item.locationLabel ? String(item.locationLabel) : undefined,
      photoDataUrl: item.photoDataUrl ? String(item.photoDataUrl) : undefined,
      notes: item.notes ? String(item.notes) : undefined,
    };
    await tx.store.put(normalized);
    count += 1;
  }
  await tx.done;
  return count;
}

/**
 * Compresse une photo locale en DataURL léger (max 900px) pour le stockage IndexedDB.
 */
export async function compressImageToDataUrl(file: File, maxDim = 900): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Impossible de lire limage'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
