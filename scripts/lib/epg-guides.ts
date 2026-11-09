/** Relaciona os canais da grade com o guia do iptv-org (guides.json). Sem rede: só dados e contas. */
import type { Channel } from '../../shared/types.ts';

export interface OrgGuide {
  channel: string | null;
  feed: string | null;
  site: string;
  site_id: string;
  site_name: string;
  lang: string;
}

/** O id da grade vira o id do canal no iptv-org: tira o sufixo de feed regional (`@Sul`) e o de duplicata (`~2`). */
export function orgChannelId(id: string): string {
  return id.replace(/~\d+$/, '').split('@')[0]!;
}

/** Guias por canal do iptv-org (um canal pode ter vários sites). */
export function guidesByChannel(guides: OrgGuide[]): Map<string, OrgGuide[]> {
  const map = new Map<string, OrgGuide[]>();
  for (const g of guides) {
    if (!g.channel) continue;
    (map.get(g.channel) ?? map.set(g.channel, []).get(g.channel)!).push(g);
  }
  return map;
}

export interface CoverageRow {
  country: string;
  /** Canais da grade no país (qualquer status). */
  grade: number;
  /** Canais no ar. */
  online: number;
  /** Canais no ar com guia. */
  onlineComGuia: number;
  /** Canais (qualquer status) com guia. */
  gradeComGuia: number;
  /** % de canais no ar com guia. */
  pct: number;
  /** Sites coletores necessários para cobrir os canais no ar, do que mais cobre ao que menos cobre. */
  sites: { site: string; canais: number }[];
}

/**
 * Cobertura por país. Cada canal com guia é atribuído ao site que cobre mais canais do país
 * (assim a lista de sites é a mais curta possível, em vez de listar todos os sites existentes).
 */
export function coverageByCountry(channels: Channel[], guides: Map<string, OrgGuide[]>, countries: string[]): CoverageRow[] {
  return countries.map((country) => {
    const list = channels.filter((c) => c.country === country);
    const online = list.filter((c) => c.status === 'online');
    const withGuide = (c: Channel) => guides.get(orgChannelId(c.id)) ?? [];

    const siteCount = new Map<string, number>();
    for (const c of online) for (const s of new Set(withGuide(c).map((g) => g.site))) siteCount.set(s, (siteCount.get(s) ?? 0) + 1);

    const chosen = new Map<string, number>();
    let covered = 0;
    for (const c of online) {
      const sites = [...new Set(withGuide(c).map((g) => g.site))];
      if (!sites.length) continue;
      covered++;
      const best = sites.sort((a, b) => (siteCount.get(b) ?? 0) - (siteCount.get(a) ?? 0) || a.localeCompare(b))[0]!;
      chosen.set(best, (chosen.get(best) ?? 0) + 1);
    }
    return {
      country,
      grade: list.length,
      online: online.length,
      onlineComGuia: covered,
      gradeComGuia: list.filter((c) => withGuide(c).length > 0).length,
      pct: online.length ? (covered / online.length) * 100 : 0,
      sites: [...chosen].map(([site, canais]) => ({ site, canais })).sort((a, b) => b.canais - a.canais || a.site.localeCompare(b.site)),
    };
  });
}
