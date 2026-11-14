import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Channel } from '../../shared/types.ts';
import type { Candidate } from '../../scripts/lib/candidate.ts';
import type { OrgData } from '../../scripts/lib/iptvorg-types.ts';
import { mergeCandidates } from '../../scripts/lib/merge.ts';
import { assemble, buildIndex, toPublicChannel } from '../../scripts/lib/pipeline.ts';

const fixture = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
const freeTv = fixture('free-tv-sample.m3u8');
const org = JSON.parse(fixture('iptv-org-sample.json')) as OrgData;

const cand = (p: Partial<Candidate> & Pick<Candidate, 'name' | 'url'>): Candidate => ({
  id: p.name,
  country: 'BR',
  categories: [],
  languages: [],
  kind: 'hls',
  source: 'iptv-org',
  ...p,
});

describe('mergeCandidates', () => {
  it('remove duplicata por URL (mesmo http/https) e registra as duas fontes', () => {
    const { channels, stats } = mergeCandidates([
      cand({ name: 'Canal A', url: 'http://x.com/a.m3u8', source: 'iptv-org' }),
      cand({ name: 'Outro Nome', url: 'https://x.com/a.m3u8', source: 'free-tv' }),
    ]);
    expect(channels).toHaveLength(1);
    expect(channels[0]?.name).toBe('Outro Nome'); // Free-TV tem prioridade
    expect(channels[0]?.sources).toEqual(['free-tv', 'iptv-org']);
    expect(stats.duplicatesByUrl).toBe(1);
  });

  it('remove duplicata por nome normalizado + país, mas não entre países diferentes', () => {
    const { channels, stats } = mergeCandidates([
      cand({ name: 'Rede Globo HD', url: 'https://a.com/1.m3u8', source: 'free-tv' }),
      cand({ name: 'REDE GLOBO', url: 'https://b.com/2.m3u8', source: 'iptv-org' }),
      cand({ name: 'Rede Globo', url: 'https://c.com/3.m3u8', country: 'PT', source: 'iptv-org' }),
    ]);
    expect(channels.map((c) => `${c.country}:${c.url}`).sort()).toEqual(['BR:https://a.com/1.m3u8', 'PT:https://c.com/3.m3u8']);
    expect(stats.duplicatesByName).toBe(1);
  });

  it('entre duplicatas do iptv-org prefere HTTPS HLS, sem geo-bloqueio, a HTTP', () => {
    const { channels } = mergeCandidates([
      cand({ name: 'Canal X', url: 'http://a.com/x.m3u8', kind: 'http' }),
      cand({ name: 'Canal X', url: 'https://b.com/x.m3u8', kind: 'hls', geo: true }),
      cand({ name: 'Canal X', url: 'https://c.com/x.m3u8', kind: 'hls' }),
    ]);
    expect(channels).toHaveLength(1);
    expect(channels[0]?.url).toBe('https://c.com/x.m3u8');
  });

  it('gera ids únicos quando dois canais diferentes compartilham o id', () => {
    const { channels } = mergeCandidates([
      cand({ id: 'X.br', name: 'Canal X', url: 'https://a.com/1.m3u8' }),
      cand({ id: 'X.br', name: 'Canal Y', url: 'https://a.com/2.m3u8' }),
    ]);
    expect(channels.map((c) => c.id)).toEqual(['X.br', 'X.br~2']);
  });
});

describe('assemble — dados reais das duas fontes', () => {
  const { channels, stats } = assemble(freeTv, org, new Date('2026-11-05'));
  const byId = (id: string) => channels.find((c) => c.id === id);

  it('usa o link do Free-TV e registra as duas fontes quando o canal está em ambas', () => {
    const sbt = byId('SBTNacional.br');
    expect(sbt?.sources[0]).toBe('free-tv');
    expect(sbt?.kind).toBe('youtube');
    expect(sbt?.youtube?.id).toBe('ABVQXgr2LW4');
    expect(sbt?.name).toBe('SBT'); // sem o marcador Ⓨ
  });

  it('inclui canais só do iptv-org com metadados (país, categoria, idioma, logo)', () => {
    const only = channels.filter((c) => c.sources.length === 1 && c.sources[0] === 'iptv-org');
    expect(only.length).toBeGreaterThan(0);
    for (const c of only) expect(c.country).toMatch(/^[A-Z]{2}$/);
  });

  it('exclui canais adultos pelos metadados (is_nsfw) e encerrados', () => {
    expect(byId('Retroclub.ar')).toBeUndefined();
    expect(byId('123tv.de')).toBeUndefined();
    expect(stats.excludedAdult).toBeGreaterThan(0);
    expect(stats.excludedClosed).toBeGreaterThan(0);
  });

  it('unifica UK/GB no mesmo país', () => {
    const countries = new Set(channels.map((c) => c.country));
    expect(countries.has('UK')).toBe(false);
    expect(countries.has('GB')).toBe(true);
  });

  it('não tem URLs nem (nome+país) repetidos', () => {
    const urls = channels.map((c) => c.url.replace(/^https?:\/\//, ''));
    expect(new Set(urls).size).toBe(urls.length);
    const ids = channels.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('respeita a lista de remoções', () => {
    const r = assemble(freeTv, org, new Date('2026-11-05'), { channelIds: ['SBTNacional.br'], names: ['Record News'] });
    expect(r.channels.find((c) => c.id === 'SBTNacional.br')).toBeUndefined();
    expect(r.channels.find((c) => c.name === 'Record News')).toBeUndefined();
    expect(r.stats.excludedRemoved).toBeGreaterThanOrEqual(2);
  });

  it('exclui um link do Free-TV que aponte para stream de canal adulto do iptv-org', () => {
    const adultStream = org.streams.find((s) => s.channel === 'Retroclub.ar');
    expect(adultStream).toBeDefined();
    const playlist = `#EXTM3U\n#EXTINF:-1 tvg-id="Inocente.ar" tvg-country="AR" group-title="Argentina",Canal Inocente\n${adultStream!.url}\n`;
    expect(assemble(playlist, org, new Date('2026-11-05')).channels.find((c) => c.id === 'Inocente.ar')).toBeUndefined();
  });
});

describe('índice por país', () => {
  it('conta por fonte, status e tipo, e separa por país', () => {
    const mk = (id: string, country: string, status: Channel['status'], kind: Channel['kind'], sources: Channel['sources']): Channel => ({
      id, name: id, country, categories: ['news'], languages: ['por'], url: `https://x/${id}`, kind, status, sources,
    });
    const { index, byCountry } = buildIndex(
      [mk('a', 'BR', 'online', 'hls', ['free-tv', 'iptv-org']), mk('b', 'BR', 'offline', 'http', ['iptv-org']), mk('c', 'PT', 'desconhecido', 'youtube', ['free-tv'])],
      '2026-01-01T00:00:00Z',
      [],
    );
    expect(index.meta.total).toBe(3);
    expect(index.meta.bySource).toEqual({ 'free-tv': 2, 'iptv-org': 1 });
    expect(index.meta.byStatus).toEqual({ online: 1, offline: 1, desconhecido: 1 });
    expect(index.meta.inBothSources).toBe(1);
    expect(index.countries).toEqual([
      { code: 'BR', count: 2, online: 1 },
      { code: 'PT', count: 1, online: 0 },
    ]);
    expect(byCountry.get('BR')?.[0]?.id).toBe('a'); // online primeiro
  });

  it('grava bandeira e regiões da fonte só quando existem', () => {
    const ch: Channel = { id: 'a', name: 'a', country: 'BR', categories: [], languages: [], url: 'https://x/a', kind: 'hls', status: 'online', sources: ['iptv-org'] };
    const { index } = buildIndex([ch, { ...ch, id: 'b', url: 'https://x/b', country: 'INT' }], '2026-01-01T00:00:00Z', [], new Map([['BR', { flag: '🇧🇷', regions: ['SOUTHAM'] }]]));
    expect(index.countries).toEqual([
      { code: 'BR', count: 1, online: 1, flag: '🇧🇷', regions: ['SOUTHAM'] },
      { code: 'INT', count: 1, online: 1 },
    ]);
  });

  it('toPublicChannel remove campos internos', () => {
    const [m] = mergeCandidates([cand({ name: 'X', url: 'https://x.com/a.m3u8', probeHeaders: { userAgent: 'u' } })]).channels;
    const pub = toPublicChannel(m!, 'online');
    expect(pub).not.toHaveProperty('probeHeaders');
    expect(pub).not.toHaveProperty('source');
    expect(pub.status).toBe('online');
  });
});
