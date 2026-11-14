import { describe, expect, it } from 'vitest';
import type { Channel } from '../../shared/types.ts';
import { diagnose } from '../../src/lib/diagnose.ts';
import { EMPTY_FILTERS, filterChannels, normalizeSearch, suggestAlternatives } from '../../src/lib/filter.ts';
import { parseHash } from '../../src/lib/route-parse.ts';

const ch = (p: Partial<Channel> & Pick<Channel, 'id' | 'name'>): Channel => ({
  country: 'BR', categories: [], languages: ['por'], url: `https://x.com/${p.id}.m3u8`,
  kind: 'hls', status: 'online', sources: ['free-tv'], ...p,
});

const list = [
  ch({ id: 'globo', name: 'Rede Globo', categories: ['general'] }),
  ch({ id: 'globonews', name: 'GloboNews', categories: ['news'] }),
  ch({ id: 'sp', name: 'TV São Paulo', categories: ['general'], status: 'offline' }),
  ch({ id: 'bbc', name: 'BBC News', country: 'GB', languages: ['eng'], categories: ['news'], kind: 'http' }),
  ch({ id: 'yt', name: 'Canal YouTube', kind: 'youtube', youtube: { type: 'handle', embeddable: false } }),
];

describe('busca e filtros', () => {
  it('busca sem acento e sem diferenciar caixa', () => {
    expect(filterChannels(list, { ...EMPTY_FILTERS, query: 'sao paulo' }).map((c) => c.id)).toEqual(['sp']);
    expect(normalizeSearch('  São-Paulo!! ')).toBe('sao paulo');
  });
  it('ordena por relevância: começa com > início de palavra', () => {
    expect(filterChannels(list, { ...EMPTY_FILTERS, query: 'globo' }).map((c) => c.id)).toEqual(['globonews', 'globo']);
  });
  it('exige todas as palavras da busca', () => {
    expect(filterChannels(list, { ...EMPTY_FILTERS, query: 'bbc globo' })).toEqual([]);
  });
  it('filtra por categoria, idioma e status', () => {
    expect(filterChannels(list, { ...EMPTY_FILTERS, category: 'news' }).map((c) => c.id)).toEqual(['globonews', 'bbc']);
    expect(filterChannels(list, { ...EMPTY_FILTERS, language: 'eng' }).map((c) => c.id)).toEqual(['bbc']);
    expect(filterChannels(list, { ...EMPTY_FILTERS, status: 'fora' }).map((c) => c.id)).toEqual(['sp']);
  });
  it('"só os que tocam no navegador" tira HTTP e YouTube sem embed', () => {
    expect(filterChannels(list, { ...EMPTY_FILTERS, playableOnly: true }).map((c) => c.id)).toEqual(['globo', 'globonews', 'sp']);
  });
});

describe('sugestões após falha', () => {
  it('sugere canais não offline que tocam no navegador, do mesmo país, sem repetir o atual', () => {
    const s = suggestAlternatives(list[1]!, list);
    expect(s.map((c) => c.id)).toEqual(['globo']); // sp está offline, bbc é de outro país/HTTP, yt não incorpora
  });
  it('prioriza online e mesma categoria', () => {
    const pool = [
      ch({ id: 'a', name: 'A', status: 'desconhecido', categories: ['news'] }),
      ch({ id: 'b', name: 'B', status: 'online', categories: ['sports'] }),
      ch({ id: 'c', name: 'C', status: 'online', categories: ['news'] }),
    ];
    expect(suggestAlternatives(ch({ id: 'x', name: 'X', categories: ['news'] }), pool).map((c) => c.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('diagnose (erros do hls.js)', () => {
  const base = { status: 'desconhecido', geo: undefined } as const;
  it('404 → offline; 403 → bloqueio geográfico; 5xx → offline', () => {
    expect(diagnose({ type: 'networkError', response: { code: 404 } }, base)).toBe('offline');
    expect(diagnose({ type: 'networkError', response: { code: 403 } }, base)).toBe('geo');
    expect(diagnose({ type: 'networkError', response: { code: 503 } }, base)).toBe('offline');
  });
  it('erro de rede sem resposta (code 0) → CORS, salvo quando já sabíamos que estava offline ou geo', () => {
    expect(diagnose({ type: 'networkError', response: { code: 0 } }, base)).toBe('cors');
    expect(diagnose({ type: 'networkError' }, { status: 'offline' })).toBe('offline');
    expect(diagnose({ type: 'networkError' }, { status: 'desconhecido', geo: true })).toBe('geo');
  });
  it('erro de mídia → formato não suportado', () => {
    expect(diagnose({ type: 'mediaError' }, base)).toBe('media');
  });
});

describe('rotas por hash', () => {
  it('interpreta canal, sobre e home; ignora lixo', () => {
    expect(parseHash('#/canal/BR/Rede%20Globo.br')).toEqual({ name: 'channel', country: 'BR', id: 'Rede Globo.br' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
    expect(parseHash('#/canais')).toEqual({ name: 'watch' });
    expect(parseHash('#/sobre')).toEqual({ name: 'about' });
    expect(parseHash('#/instalar')).toEqual({ name: 'install' });
    expect(parseHash('#/zapear')).toEqual({ name: 'action', action: 'zap' });
    expect(parseHash('#/favoritos')).toEqual({ name: 'action', action: 'favorites' });
    expect(parseHash('#/buscar')).toEqual({ name: 'action', action: 'search' });
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/canal/BR')).toEqual({ name: 'home' });
    expect(parseHash('#/canal/%E0%A4%A/x')).toEqual({ name: 'home' });
  });
});

describe('filtro "Começando agora"', () => {
  const list = [
    { id: 'a', name: 'A', country: 'BR', categories: [], languages: [], url: 'https://x/a.m3u8', kind: 'hls', status: 'online', sources: ['iptv-org'] },
    { id: 'b', name: 'B', country: 'BR', categories: [], languages: [], url: 'https://x/b.m3u8', kind: 'hls', status: 'online', sources: ['iptv-org'] },
  ] as Channel[];
  it('só deixa os canais que o guia diz que estão começando', () => {
    const ctx = { startingNow: (c: Channel) => c.id === 'b' };
    expect(filterChannels(list, { ...EMPTY_FILTERS, startingNow: true }, ctx).map((c) => c.id)).toEqual(['b']);
  });
  it('desligado não olha o guia; ligado sem guia não deixa ninguém passar', () => {
    expect(filterChannels(list, EMPTY_FILTERS, { startingNow: () => false })).toHaveLength(2);
    expect(filterChannels(list, { ...EMPTY_FILTERS, startingNow: true })).toEqual([]);
  });
});
