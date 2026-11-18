export interface DroughtSummary {
  departmentCode: string;
  maxLevel: string;
  zonesCount: number;
  sourceUrl: string;
}

export interface FreshwaterSpeciesSummary {
  speciesNames: string[];
  stationsCount: number;
}

/**
 * Interroge l'API publique VigiEau pour connaître le niveau de restriction sécheresse d'un département.
 */
export async function fetchDepartmentDroughtStatus(
  deptCode: string,
): Promise<DroughtSummary | null> {
  if (!navigator.onLine || !deptCode) return null;
  try {
    const res = await fetch(
      `https://api.vigieau.gouv.fr/api/zones?departement=${encodeURIComponent(deptCode)}&profil=particulier`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ niveauGravite?: string }>;
    if (!Array.isArray(data) || data.length === 0) {
      return {
        departmentCode: deptCode,
        maxLevel: 'Vigilance / Aucune restriction active',
        zonesCount: 0,
        sourceUrl: `https://vigieau.gouv.fr/`,
      };
    }
    const order = ['crise', 'alerte_renforcee', 'alerte', 'vigilance'];
    let best = 'vigilance';
    for (const z of data) {
      const lvl = (z.niveauGravite ?? '').toLowerCase();
      if (order.includes(lvl) && order.indexOf(lvl) < order.indexOf(best)) {
        best = lvl;
      }
    }
    return {
      departmentCode: deptCode,
      maxLevel: best.replace(/_/g, ' '),
      zonesCount: data.length,
      sourceUrl: 'https://vigieau.gouv.fr/',
    };
  } catch {
    return null;
  }
}

/**
 * Interroge l'API Hub'Eau Poissons (état piscicole) pour lister les espèces observées dans un département.
 */
export async function fetchDepartmentFishInventory(
  deptCode: string,
): Promise<FreshwaterSpeciesSummary | null> {
  if (!navigator.onLine || !deptCode) return null;
  try {
    const res = await fetch(
      `https://hubeau.eaufrance.fr/api/v1/etat_piscicole/observations?code_departement=${encodeURIComponent(deptCode)}&size=30`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Array<{ nom_commun_taxon?: string; code_station?: string }>;
    };
    const rows = json.data ?? [];
    const names = new Set<string>();
    const stations = new Set<string>();
    for (const row of rows) {
      if (row.nom_commun_taxon) names.add(row.nom_commun_taxon);
      if (row.code_station) stations.add(row.code_station);
    }
    return {
      speciesNames: Array.from(names).slice(0, 10),
      stationsCount: stations.size,
    };
  } catch {
    return null;
  }
}
