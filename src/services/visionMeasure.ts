import type { Species, SpeciesCategory } from '../../schema/types';

export interface Point2D {
  x: number;
  y: number;
}

export interface ReferencePreset {
  id: 'card' | 'coin2' | 'coin1' | 'custom';
  label: string;
  cm: number;
}

export const REFERENCE_PRESETS: ReferencePreset[] = [
  { id: 'card', label: 'Carte bancaire (8,56 cm)', cm: 8.56 },
  { id: 'coin2', label: 'Pièce 2 € (2,58 cm)', cm: 2.575 },
  { id: 'coin1', label: 'Pièce 1 € (2,33 cm)', cm: 2.325 },
  { id: 'custom', label: 'Objet personnalisé (cm)', cm: 10 },
];

export function pixelDistance(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function computeMeasuredCm(
  refA: Point2D,
  refB: Point2D,
  refLengthCm: number,
  fishA: Point2D,
  fishB: Point2D,
): number | null {
  const refPx = pixelDistance(refA, refB);
  const fishPx = pixelDistance(fishA, fishB);
  if (refPx <= 0 || fishPx <= 0 || refLengthCm <= 0) return null;
  const cm = (fishPx / refPx) * refLengthCm;
  return Number(cm.toFixed(1));
}

export interface RecognitionCandidate {
  species: Species;
  confidence: 'high' | 'medium' | 'offline';
  reason: string;
}

export async function identifySpeciesFromPhoto(
  dataUrl: string,
  speciesList: Species[],
  environment: 'sea' | 'freshwater',
  categoryHint: 'all' | SpeciesCategory,
  apiKey?: string,
): Promise<RecognitionCandidate[]> {
  const candidates = speciesList.filter((s) => {
    const envOk = s.environment === 'both' || s.environment === environment;
    const catOk = categoryHint === 'all' || s.category === categoryHint;
    return envOk && catOk;
  });

  const key = (apiKey || (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || '').trim();
  if (key && navigator.onLine && dataUrl.startsWith('data:image/')) {
    try {
      const base64 = dataUrl.split(',')[1];
      const mimeType = dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/jpeg';
      const catalogText = candidates
        .map((s) => `${s.id}: ${s.commonName} (${s.scientificName})`)
        .join('\n');

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Identifie l'espèce marine ou d'eau douce sur cette photo parmi la liste suivante et réponds uniquement en JSON {"speciesId":"...","reason":"..."} :\n${catalogText}`,
                  },
                  { inline_data: { mime_type: mimeType, data: base64 } },
                ],
              },
            ],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(12_000),
        },
      );
      if (res.ok) {
        const json = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText) as { speciesId?: string; reason?: string };
          const matched = candidates.find((s) => s.id === parsed.speciesId);
          if (matched) {
            return [
              {
                species: matched,
                confidence: 'high',
                reason: parsed.reason || 'Identifié par Gemini Vision',
              },
              ...candidates
                .filter((s) => s.id !== matched.id)
                .slice(0, 3)
                .map((s) => ({
                  species: s,
                  confidence: 'medium' as const,
                  reason: 'Autre espèce proche',
                })),
            ];
          }
        }
      }
    } catch {
      // Fallback silencieux vers la sélection hors-ligne
    }
  }

  return candidates.slice(0, 6).map((s) => ({
    species: s,
    confidence: 'offline',
    reason: `Suggestion ${environment === 'sea' ? 'mer' : 'eau douce'} (mode hors-ligne)`,
  }));
}
