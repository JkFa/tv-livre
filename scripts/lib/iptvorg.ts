import type { Candidate } from './candidate.ts';
import { classifyUrl } from './classify.ts';
import { isAdultCategory, looksAdultText } from './adult.ts';
import type { OrgData } from './iptvorg-types.ts';
import { canonCountry } from './normalize.ts';
import { parseYouTube } from './youtube.ts';

const GENERIC_FEED = /^(sd|hd|fhd|uhd|4k|main|default)$/i;

export interface OrgDerived {
  channelsById: Map<string, OrgData['channels'][number]>;
  blocked: Set<string>;
  /** Logo preferido por canal */
  logoByChannel: Map<string, string>;
}

export function deriveOrg(data: OrgData): OrgDerived {
  const channelsById = new Map(data.channels.map((c) => [c.id, c]));
  const blocked = new Set(data.blocklist.map((b) => b.channel));
  const best = new Map<string, { score: number; url: string }>();
  for (const l of data.logos) {
    if (!l.url?.startsWith('https://')) continue;
    const score = (l.in_use ? 1_000_000 : 0) + (l.feed === null ? 100_000 : 0) + (l.width || 0);
    const cur = best.get(l.channel);
    if (!cur || score > cur.score) best.set(l.channel, { score, url: l.url });
  }
  return { channelsById, blocked, logoByChannel: new Map([...best].map(([k, v]) => [k, v.url])) };
}

export function orgCandidates(
  data: OrgData,
  derived: OrgDerived,
  stats: { excludedAdult: number; excludedClosed: number; excludedNoChannel: number },
  today = new Date(),
): Candidate[] {
  const feedKey = (c: string, f: string) => `${c}/${f}`;
  const feeds = new Map(data.feeds.map((f) => [feedKey(f.channel, f.id), f]));
  const mainFeed = new Map<string, (typeof data.feeds)[number]>();
  for (const f of data.feeds) if (f.is_main || !mainFeed.has(f.channel)) mainFeed.set(f.channel, f);

  const out: Candidate[] = [];
  for (const s of data.streams) {
    if (!s.channel) {
      stats.excludedNoChannel++; // sem canal não há metadado para filtrar adultos nem definir país
      continue;
    }
    const ch = derived.channelsById.get(s.channel);
    if (!ch) {
      stats.excludedNoChannel++;
      continue;
    }
    const feed = s.feed ? feeds.get(feedKey(ch.id, s.feed)) : mainFeed.get(ch.id);
    const adult =
      ch.is_nsfw ||
      isAdultCategory(ch.categories) ||
      derived.blocked.has(ch.id) ||
      looksAdultText(ch.name) ||
      looksAdultText(s.title);
    if (adult) {
      stats.excludedAdult++;
      continue;
    }
    if (ch.closed && new Date(ch.closed) <= today) {
      stats.excludedClosed++;
      continue;
    }

    const kind = classifyUrl(s.url);
    const regional = s.feed && feed && !feed.is_main && !GENERIC_FEED.test(feed.name) && !GENERIC_FEED.test(feed.id);
    const name = regional ? `${ch.name} ${feed.name}` : ch.name;

    out.push({
      id: s.feed && regional ? `${ch.id}@${s.feed}` : ch.id,
      name,
      country: canonCountry(ch.country),
      categories: ch.categories,
      languages: feed?.languages ?? [],
      logo: derived.logoByChannel.get(ch.id),
      url: s.url,
      kind,
      source: 'iptv-org',
      quality: s.quality ?? undefined,
      geo: s.labels.includes('Geo-blocked') || undefined,
      needsHeaders: s.user_agent || s.referrer ? true : undefined,
      probeHeaders: s.user_agent || s.referrer ? { userAgent: s.user_agent ?? undefined, referrer: s.referrer ?? undefined } : undefined,
      youtube: kind === 'youtube' ? (parseYouTube(s.url) ?? undefined) : undefined,
    });
  }
  return out;
}
