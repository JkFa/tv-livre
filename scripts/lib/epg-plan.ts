/** Monta o channels.xml (formato do iptv-org/epg) só com os canais da nossa grade que têm guia. */
import type { Channel } from '../../shared/types.ts';
import { orgChannelId, type OrgGuide } from './epg-guides.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface PlanItem {
  /** `Channel.id` da grade: vira o `xmltv_id`, então o XMLTV já sai com os nossos ids. */
  id: string;
  country: string;
  name: string;
  site: string;
  site_id: string;
  lang: string;
}

/**
 * Para cada canal (não "fora do ar") com guia, escolhe um único site: o que cobre mais canais do mesmo país
 * (menos sites = menos requisições). `allowSites` restringe a sites que sabemos que funcionam; vazio = todos.
 */
export function planGuides(channels: Channel[], guides: Map<string, OrgGuide[]>, countries: string[], allowSites: string[] = []): PlanItem[] {
  const allow = new Set(allowSites);
  const items: PlanItem[] = [];
  for (const country of countries) {
    const list = channels.filter((c) => c.country === country && c.status !== 'offline');
    const options = (c: Channel) => (guides.get(orgChannelId(c.id)) ?? []).filter((g) => !allow.size || allow.has(g.site));
    const siteCount = new Map<string, number>();
    for (const c of list) for (const s of new Set(options(c).map((g) => g.site))) siteCount.set(s, (siteCount.get(s) ?? 0) + 1);
    for (const c of list) {
      const opts = options(c);
      if (!opts.length) continue;
      const best = [...opts].sort(
        (a, b) => (siteCount.get(b.site) ?? 0) - (siteCount.get(a.site) ?? 0) || a.site.localeCompare(b.site) || a.site_id.localeCompare(b.site_id),
      )[0]!;
      items.push({ id: c.id, country, name: c.name, site: best.site, site_id: best.site_id, lang: best.lang });
    }
  }
  return items;
}

export function channelsXml(items: PlanItem[]): string {
  const lines = items.map(
    (i) => `  <channel site="${esc(i.site)}" site_id="${esc(i.site_id)}" lang="${esc(i.lang)}" xmltv_id="${esc(i.id)}">${esc(i.name)}</channel>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<channels>\n${lines.join('\n')}\n</channels>\n`;
}
