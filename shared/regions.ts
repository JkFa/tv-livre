/**
 * Regiões usadas para agrupar países. A LISTA DE PAÍSES de cada região vem do iptv-org
 * (api/regions.json), gravada pelo pipeline em `CountrySummary.regions`; aqui ficam só quais
 * regiões mostramos, em que ordem e o nome em português.
 *
 * A fonte não divide o mundo de forma exclusiva: um país pode estar em duas regiões (RU, TR…
 * em Europa e Ásia) e alguns não estão em nenhuma (GB, MX, HK…). Mostramos assim mesmo:
 * pertencimento múltiplo, e "Sem região na fonte" para quem ficou de fora.
 */
export const REGIONS: readonly { code: string; label: string }[] = [
  { code: 'SOUTHAM', label: 'América do Sul' },
  { code: 'CENAMER', label: 'América Central' },
  { code: 'CARIB', label: 'Caribe' },
  { code: 'NAM', label: 'América do Norte' },
  { code: 'EUR', label: 'Europa' },
  { code: 'AFR', label: 'África' },
  { code: 'ASIA', label: 'Ásia' },
  { code: 'OCE', label: 'Oceania' },
];

/** Pseudo-região dos países que a fonte não colocou em nenhuma das regiões acima. */
export const NO_REGION = 'SEM';
export const NO_REGION_LABEL = 'Sem região na fonte';

export function regionLabel(code: string): string {
  if (code === NO_REGION) return NO_REGION_LABEL;
  return REGIONS.find((r) => r.code === code)?.label ?? code;
}

export interface GeoSource {
  countries: readonly { code: string; flag?: string }[];
  regions: readonly { code: string; countries: readonly string[] }[];
}

export interface CountryGeo {
  flag?: string;
  regions: string[];
}

/** Bandeira e regiões (na ordem de REGIONS) de cada país, tiradas dos dados do iptv-org. */
export function countryGeo(src: GeoSource): Map<string, CountryGeo> {
  const out = new Map<string, CountryGeo>();
  const get = (code: string) => out.get(code) ?? out.set(code, { regions: [] }).get(code)!;
  for (const c of src.countries) if (c.flag) get(c.code).flag = c.flag;
  const byCode = new Map(src.regions.map((r) => [r.code, r]));
  for (const { code } of REGIONS) {
    for (const c of byCode.get(code)?.countries ?? []) get(c).regions.push(code);
  }
  return out;
}
