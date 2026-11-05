import type { Channel, DataIndex, DataMeta, FacetCount, Source, Status, StreamKind } from '../../shared/types.ts';
import type { BuildStats } from './candidate.ts';
import { freeTvCandidates, languagesByMainFeed } from './freetv.ts';
import { deriveOrg, orgCandidates } from './iptvorg.ts';
import type { OrgData } from './iptvorg-types.ts';
import { mergeCandidates, type Merged, type MergeStats } from './merge.ts';
import { normalizeUrl } from './normalize.ts';
import { isRemoved, type Removals } from './removals.ts';

export interface AssembleResult {
  channels: Merged[];
  stats: BuildStats & MergeStats;
}

/** Une as duas fontes: filtra adultos/encerrados, remove duplicatas e registra a origem de cada canal. */
export function assemble(freeTvPlaylist: string, org: OrgData, today = new Date(), removals: Removals = {}): AssembleResult {
  const derived = deriveOrg(org);
  const stats: BuildStats = {
    excludedAdult: 0,
    excludedClosed: 0,
    excludedNoChannel: 0,
    excludedInvalid: 0,
    excludedRemoved: 0,
    fromFreeTv: 0,
    fromIptvOrg: 0,
  };

  // URLs de streams de canais adultos/bloqueados: se o Free-TV apontar para elas, também são excluídas.
  const badUrlKeys = new Set<string>();
  for (const s of org.streams) {
    const ch = s.channel ? derived.channelsById.get(s.channel) : undefined;
    if (ch && (ch.is_nsfw || ch.categories.includes('xxx') || derived.blocked.has(ch.id))) badUrlKeys.add(normalizeUrl(s.url));
  }

  const free = freeTvCandidates(
    freeTvPlaylist,
    {
      channelsById: derived.channelsById,
      languagesByChannel: languagesByMainFeed(org.feeds),
      countries: org.countries,
      badUrlKeys,
      blockedChannels: derived.blocked,
      urlKey: normalizeUrl,
    },
    stats,
  );
  const fromOrg = orgCandidates(org, derived, stats, today);
  stats.fromFreeTv = free.length;
  stats.fromIptvOrg = fromOrg.length;

  const all = [...free, ...fromOrg].filter((c) => {
    const removed = isRemoved(c, removals);
    if (removed) stats.excludedRemoved++;
    return !removed;
  });
  const { channels, stats: mstats } = mergeCandidates(all);
  return { channels, stats: { ...stats, ...mstats } };
}

export function toPublicChannel(m: Merged, status: Status): Channel {
  // remove campos internos (source, probeHeaders) e valores vazios para enxugar o JSON
  const { source: _source, probeHeaders: _headers, ...rest } = m;
  void _source;
  void _headers;
  const ch: Channel = { ...rest, status };
  for (const k of ['logo', 'quality', 'geo', 'cors', 'needsHeaders', 'youtube'] as const) {
    if (ch[k] === undefined || ch[k] === false) delete ch[k];
  }
  if (rest.cors === false) ch.cors = false;
  return ch;
}

const STATUS_ORDER: Record<Status, number> = { online: 0, desconhecido: 1, offline: 2 };

export function sortChannels(list: Channel[]): Channel[] {
  return [...list].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.sources[0] === b.sources[0] ? 0 : a.sources[0] === 'free-tv' ? -1 : 1) ||
      a.name.localeCompare(b.name, 'pt-BR'),
  );
}

export function buildIndex(channels: Channel[], generatedAt: string, sources: DataMeta['sources']): { index: DataIndex; byCountry: Map<string, Channel[]> } {
  const byCountry = new Map<string, Channel[]>();
  const cats = new Map<string, number>();
  const langs = new Map<string, number>();
  const bySource: Record<Source, number> = { 'free-tv': 0, 'iptv-org': 0 };
  const byStatus: Record<Status, number> = { online: 0, offline: 0, desconhecido: 0 };
  const byKind: Record<StreamKind, number> = { hls: 0, youtube: 0, http: 0, other: 0 };
  let inBoth = 0;

  for (const ch of channels) {
    (byCountry.get(ch.country) ?? byCountry.set(ch.country, []).get(ch.country)!).push(ch);
    for (const c of ch.categories) cats.set(c, (cats.get(c) ?? 0) + 1);
    for (const l of ch.languages) langs.set(l, (langs.get(l) ?? 0) + 1);
    bySource[ch.sources[0] ?? 'iptv-org']++;
    byStatus[ch.status]++;
    byKind[ch.kind]++;
    if (ch.sources.length > 1) inBoth++;
  }
  const facet = (m: Map<string, number>): FacetCount[] =>
    [...m].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  for (const [k, v] of byCountry) byCountry.set(k, sortChannels(v));

  const index: DataIndex = {
    meta: { schema: 1, generatedAt, total: channels.length, bySource, byStatus, byKind, inBothSources: inBoth, sources },
    countries: [...byCountry].map(([code, list]) => ({
      code,
      count: list.length,
      online: list.filter((c) => c.status === 'online').length,
    })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    categories: facet(cats),
    languages: facet(langs),
  };
  return { index, byCountry };
}
