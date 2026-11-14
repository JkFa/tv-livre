/**
 * Guia de TV e origem dos canais: lógica pura (sem DOM) para agrupar países por região e canais por assunto.
 * As regiões e as bandeiras vêm do index.json (iptv-org); um país pode estar em mais de uma região.
 */
import type { Channel, CountrySummary } from '../../shared/types.ts';
import { NO_REGION, REGIONS, regionLabel } from '../../shared/regions.ts';

export interface RegionCount {
  code: string;
  label: string;
  /** Quantos países da lista estão nesta região. */
  countries: number;
}

/** Regiões que têm algum país na lista, na ordem fixa, e "Sem região na fonte" no fim (se houver alguém sem região). */
export function regionCounts(countries: readonly CountrySummary[]): RegionCount[] {
  const out: RegionCount[] = [];
  for (const r of REGIONS) {
    const n = countries.filter((c) => c.regions?.includes(r.code)).length;
    if (n) out.push({ code: r.code, label: r.label, countries: n });
  }
  const none = countries.filter((c) => !c.regions?.length).length;
  if (none) out.push({ code: NO_REGION, label: regionLabel(NO_REGION), countries: none });
  return out;
}

/** Países de uma região (ou todos, com `region` vazio), dos com mais canais no ar para os com menos. */
export function countriesIn(countries: readonly CountrySummary[], region: string): CountrySummary[] {
  const inRegion = (c: CountrySummary) =>
    !region || (region === NO_REGION ? !c.regions?.length : (c.regions?.includes(region) ?? false));
  return countries.filter(inRegion).sort((a, b) => b.online - a.online || a.code.localeCompare(b.code));
}

/** Região inicial do seletor: a primeira região do país atual (ou "todas", se ele não tiver região). */
export function initialRegion(countries: readonly CountrySummary[], current: string): string {
  return countries.find((c) => c.code === current)?.regions?.[0] ?? '';
}

export interface GuideSection {
  /** ID de categoria do iptv-org; '' = canais sem assunto na fonte. */
  id: string;
  channels: Channel[];
  /** Quantos canais da seção estão no ar (último teste). */
  online: number;
}

/**
 * Canais por assunto. Um canal com várias categorias aparece em cada uma (é assim que a fonte o classifica).
 * Seções da maior para a menor; "Geral" e "sem assunto" vão para o fim, porque dizem pouco.
 * Dentro de cada seção, ordem pela saúde (`rank`), estável: empates mantêm a ordem da grade.
 */
export function guideSections(channels: readonly Channel[], rank: (c: Channel) => number): GuideSection[] {
  const by = new Map<string, Channel[]>();
  for (const ch of channels) {
    const cats = ch.categories.length ? ch.categories : [''];
    for (const id of cats) (by.get(id) ?? by.set(id, []).get(id)!).push(ch);
  }
  const weak = (id: string) => (id === '' ? 2 : id === 'general' ? 1 : 0);
  return [...by]
    .map(([id, list]) => ({
      id,
      channels: list.map((c, i) => ({ c, i, r: rank(c) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.c),
      online: list.filter((c) => c.status === 'online').length,
    }))
    .sort((a, b) => weak(a.id) - weak(b.id) || b.channels.length - a.channels.length || a.id.localeCompare(b.id));
}
