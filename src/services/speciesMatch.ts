import type { SanitaryAlert, Species, ZoneProperties } from '../../schema/types';
import { normalizeText } from './geoAdmin';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Construit la liste des termes de recherche normalisés pour une espèce.
 */
export function buildSpeciesTerms(species: Species): string[] {
  const rawTerms = new Set<string>();
  const baseName = species.commonName.replace(/\([^)]*\)/g, ' ').trim();
  if (baseName) rawTerms.add(baseName);

  const parenMatches = species.commonName.matchAll(/\(([^)]+)\)/g);
  for (const m of parenMatches) {
    if (m[1]?.trim()) rawTerms.add(m[1].trim());
  }

  rawTerms.add(species.scientificName);
  for (const alias of species.aliases) {
    rawTerms.add(alias);
  }

  const normalized = new Set<string>();
  for (const t of rawTerms) {
    const n = normalizeText(t);
    if (n.length >= 3) normalized.add(n);
  }
  return Array.from(normalized);
}

/**
 * Vérifie si un texte normalisé mentionne l'un des termes de l'espèce (frontières de mots).
 */
export function matchesSpeciesText(text: string, terms: string[]): boolean {
  const norm = normalizeText(text);
  if (!norm || terms.length === 0) return false;
  return terms.some((term) => {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}($|[^a-z0-9])`);
    return pattern.test(norm);
  });
}

export function zoneMatchesSpecies(zone: ZoneProperties, species: Species): boolean {
  const terms = buildSpeciesTerms(species);
  const haystack = [zone.name, zone.resume, ...(zone.themes ?? [])].filter(Boolean).join(' ');
  return matchesSpeciesText(haystack, terms);
}

export function alertMatchesSpecies(alert: SanitaryAlert, species: Species): boolean {
  const terms = buildSpeciesTerms(species);
  const haystack = [...alert.speciesAffected, alert.reason ?? ''].filter(Boolean).join(' ');
  return matchesSpeciesText(haystack, terms);
}
