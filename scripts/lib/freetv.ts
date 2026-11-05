import type { Candidate } from './candidate.ts';
import { classifyUrl } from './classify.ts';
import { looksAdultText } from './adult.ts';
import { parseM3U } from './m3u.ts';
import { canonCountry, slugify, stripMarkers } from './normalize.ts';
import { parseYouTube } from './youtube.ts';
import type { OrgChannel, OrgCountry, OrgFeed } from './iptvorg-types.ts';

export interface FreeTvContext {
  channelsById: Map<string, OrgChannel>;
  /** idioma(s) do feed principal por canal do iptv-org */
  languagesByChannel: Map<string, string[]>;
  countries: OrgCountry[];
  /** URLs (normalizadas) de streams de canais NSFW/bloqueados no iptv-org */
  badUrlKeys: Set<string>;
  blockedChannels: Set<string>;
  urlKey: (u: string) => string;
}

const GROUP_ALIASES: Record<string, string> = {
  uk: 'GB',
  usa: 'US',
  korea: 'KR',
  'north korea': 'KP',
  'trinidad': 'TT',
  'czech republic': 'CZ',
  'hong kong': 'HK',
  macau: 'MO',
  iran: 'IR',
  russia: 'RU',
  turkey: 'TR',
  'north macedonia': 'MK',
  moldova: 'MD',
  kosovo: 'XK',
  '日本 / japan': 'JP',
};

const GROUP_CATEGORY: [RegExp, string][] = [
  [/^news/i, 'news'],
  [/^business/i, 'business'],
  [/^weather/i, 'weather'],
  [/^documentar/i, 'documentary'],
  [/^music/i, 'music'],
  [/movies/i, 'movies'],
];

export function buildCountryResolver(countries: OrgCountry[]) {
  const codes = new Set(countries.map((c) => canonCountry(c.code)));
  codes.add('XK');
  const byName = new Map(countries.map((c) => [c.name.toLowerCase(), canonCountry(c.code)]));
  return function resolve(tvgCountry: string | undefined, tvgId: string | undefined, group: string | undefined): string | null {
    const direct = tvgCountry ? canonCountry(tvgCountry) : undefined;
    if (direct && codes.has(direct)) return direct;
    const suffix = tvgId?.match(/\.([a-z]{2})(?:@|$)/i)?.[1]?.toLowerCase();
    if (suffix) {
      const code = canonCountry(suffix);
      if (codes.has(code)) return code;
    }
    const g = group?.trim().toLowerCase();
    if (g) return GROUP_ALIASES[g] ?? byName.get(g) ?? null;
    return null;
  };
}

export function languagesByMainFeed(feeds: OrgFeed[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of feeds) {
    if (!f.languages?.length) continue;
    if (f.is_main || !map.has(f.channel)) map.set(f.channel, f.languages);
  }
  return map;
}

/** Converte a playlist do Free-TV em candidatos, já aplicando o filtro de conteúdo adulto. */
export function freeTvCandidates(
  playlist: string,
  ctx: FreeTvContext,
  stats: { excludedAdult: number; excludedInvalid: number },
): Candidate[] {
  const resolveCountry = buildCountryResolver(ctx.countries);
  const { entries, skipped } = parseM3U(playlist);
  stats.excludedInvalid += skipped.length;
  const out: Candidate[] = [];

  for (const e of entries) {
    const { name, markers } = stripMarkers(e.title || e.attrs['tvg-name'] || '');
    if (!name) {
      stats.excludedInvalid++;
      continue;
    }
    const tvgId = e.attrs['tvg-id'] || undefined;
    const org = tvgId ? ctx.channelsById.get(tvgId) : undefined;
    const group = e.attrs['group-title'];

    const adult =
      looksAdultText(name) ||
      looksAdultText(group ?? '') ||
      org?.is_nsfw === true ||
      org?.categories.includes('xxx') === true ||
      (tvgId !== undefined && ctx.blockedChannels.has(tvgId)) ||
      ctx.badUrlKeys.has(ctx.urlKey(e.url));
    if (adult) {
      stats.excludedAdult++;
      continue;
    }

    const kind = classifyUrl(e.url);
    const country = resolveCountry(e.attrs['tvg-country'], tvgId, group) ?? (org?.country ? canonCountry(org.country) : 'INT');
    const categories = new Set<string>(org?.categories ?? []);
    for (const [re, cat] of GROUP_CATEGORY) if (group && re.test(group)) categories.add(cat);

    let languages = tvgId ? (ctx.languagesByChannel.get(tvgId) ?? []) : [];
    if (!languages.length) {
      const c = ctx.countries.find((x) => canonCountry(x.code) === country);
      if (c && c.languages.length === 1) languages = [...c.languages];
    }

    out.push({
      id: tvgId ? tvgId : `${slugify(name)}.${country.toLowerCase()}`,
      name,
      country,
      categories: [...categories],
      languages,
      logo: e.attrs['tvg-logo']?.startsWith('https://') ? e.attrs['tvg-logo'] : undefined,
      url: e.url,
      kind,
      source: 'free-tv',
      geo: markers.includes('Ⓖ') || undefined, // Ⓖ
      youtube: kind === 'youtube' ? (parseYouTube(e.url) ?? undefined) : undefined,
      needsHeaders: e.options['http-user-agent'] || e.options['http-referrer'] ? true : undefined,
      probeHeaders:
        e.options['http-user-agent'] || e.options['http-referrer']
          ? { userAgent: e.options['http-user-agent'], referrer: e.options['http-referrer'] }
          : undefined,
    });
  }
  return out;
}
