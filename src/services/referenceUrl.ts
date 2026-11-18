import type { ManifestSourceInfo, ZoneProperties } from '../../schema/types';

export interface ResolvedReference {
  href: string;
  isDirect: boolean;
}

/**
 * Vérifie qu'une chaîne est une URL HTTP(S) valide.
 */
export function isValidHttpUrl(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

function buildSearchUrl(query: string): string {
  const normalized = query.trim() || 'réglementation pêche maritime france';
  return `https://www.google.com/search?q=${encodeURIComponent(normalized)}`;
}

/**
 * Retourne toujours un lien ouvrable vers la référence d'une zone réglementaire :
 * l'URL officielle si elle est valide, sinon une recherche ciblée sur la référence ou la zone.
 */
export function resolveZoneReference(zone: ZoneProperties): ResolvedReference {
  const direct = isValidHttpUrl(zone.url);
  if (direct) {
    return { href: direct, isDirect: true };
  }

  const refText = zone.refReg?.trim() || zone.url?.trim();
  const query = refText
    ? refText
    : [zone.name, zone.source, 'réglementation pêche'].filter(Boolean).join(' ');

  return { href: buildSearchUrl(query), isDirect: false };
}

/**
 * Retourne toujours un lien ouvrable vers la source d'une règle ou alerte sanitaire.
 */
export function resolveSourceReference(
  sourceName: string,
  sourceUrl?: string,
  context?: string,
): ResolvedReference {
  const direct = isValidHttpUrl(sourceUrl);
  if (direct) {
    return { href: direct, isDirect: true };
  }

  const query = [sourceName, context, 'réglementation pêche'].filter(Boolean).join(' ');
  return { href: buildSearchUrl(query), isDirect: false };
}

/**
 * Retourne toujours un lien ouvrable vers une source du manifeste de données.
 */
export function resolveManifestSourceReference(source: ManifestSourceInfo): ResolvedReference {
  const direct = isValidHttpUrl(source.url);
  if (direct) {
    return { href: direct, isDirect: true };
  }
  if (source.datasetId) {
    return {
      href: `https://www.data.gouv.fr/fr/datasets/${encodeURIComponent(source.datasetId)}/`,
      isDirect: true,
    };
  }
  return { href: buildSearchUrl(`${source.name} data.gouv.fr`), isDirect: false };
}
