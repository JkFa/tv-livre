import { describe, expect, it } from 'vitest';
import type { Channel } from '../../shared/types.ts';
import { browserBlock, channelHealth, healthRank, qualityLabel } from '../../src/lib/health.ts';
import { EMPTY_FILTERS, filterChannels } from '../../src/lib/filter.ts';
import { isPlayableHere, type Caps } from '../../src/lib/playback.ts';
import { LOCAL_FAILURE_TTL_MS, pruneFailures, withFailure, withoutFailure } from '../../src/lib/local-failures.ts';

const ch = (p: Partial<Channel>): Channel => ({
  id: p.id ?? 'x', name: p.name ?? 'X', country: 'BR', categories: [], languages: [], url: 'https://a/x.m3u8',
  kind: 'hls', status: 'online', sources: ['iptv-org'], ...p,
});
const CHROME: Caps = { mse: true, nativeHls: false, pageSecure: true, httpOk: false };
const SAFARI: Caps = { mse: true, nativeHls: true, pageSecure: true, httpOk: false };

describe('saúde do canal', () => {
  it('falhas seguidas: 0 = no ar, 1–2 = instável, 3+ (offline) = fora do ar; sem teste = não confirmado', () => {
    expect(channelHealth({ status: 'online' })).toBe('ok');
    expect(channelHealth({ status: 'desconhecido', fails: 1 })).toBe('instavel');
    expect(channelHealth({ status: 'desconhecido', fails: 2 })).toBe('instavel');
    expect(channelHealth({ status: 'offline', fails: 3 })).toBe('fora');
    expect(channelHealth({ status: 'offline' })).toBe('fora'); // link morto (404/DNS) ou dados antigos sem `fails`
    expect(channelHealth({ status: 'desconhecido' })).toBe('nao-confirmado');
  });

  it('ordem: no ar → não confirmado → instável → falhou aqui → fora do ar', () => {
    const ok = ch({});
    expect(healthRank(ok, false)).toBeLessThan(healthRank(ch({ status: 'desconhecido' }), false));
    expect(healthRank(ch({ status: 'desconhecido' }), false)).toBeLessThan(healthRank(ch({ status: 'desconhecido', fails: 1 }), false));
    expect(healthRank(ch({ status: 'desconhecido', fails: 1 }), false)).toBeLessThan(healthRank(ok, true));
    expect(healthRank(ok, true)).toBeLessThan(healthRank(ch({ status: 'offline' }), false));
  });

  it('qualidade: a resolução medida vence a da fonte; valores estranhos não viram selo', () => {
    expect(qualityLabel({ resolution: '1080p', quality: '720p' })).toBe('1080p');
    expect(qualityLabel({ quality: '576i' })).toBe('576i');
    expect(qualityLabel({ quality: 'HD' })).toBeNull();
    expect(qualityLabel({})).toBeNull();
  });
});

describe('não toca no navegador', () => {
  it('HTTP numa página HTTPS é bloqueado, a menos que a versão HTTPS tenha respondido ou o usuário tenha liberado o HTTP', () => {
    const http = ch({ kind: 'http', url: 'http://a/x.m3u8' });
    expect(browserBlock(http, CHROME)).toBe('http');
    expect(browserBlock({ ...http, status: 'offline' }, CHROME)).toBe('http'); // independe de estar no ar
    expect(browserBlock({ ...http, httpsOk: true }, CHROME)).toBeNull();
    expect(browserBlock(http, { ...CHROME, httpOk: true })).toBeNull();
    expect(isPlayableHere(http, CHROME)).toBe(false);
    expect(isPlayableHere({ ...http, httpsOk: true }, CHROME)).toBe(true);
  });

  it('sem CORS só toca com HLS nativo; cabeçalhos e outros formatos nunca', () => {
    expect(browserBlock(ch({ cors: false }), CHROME)).toBe('cors');
    expect(browserBlock(ch({ cors: false }), SAFARI)).toBeNull();
    expect(browserBlock(ch({ needsHeaders: true }), SAFARI)).toBe('headers');
    expect(browserBlock(ch({ kind: 'other' }), SAFARI)).toBe('format');
    expect(browserBlock(ch({}), CHROME)).toBeNull();
  });
});

describe('lista: sinaliza e reordena, nunca remove sem o usuário pedir', () => {
  const list = [
    ch({ id: 'fora', name: 'A', status: 'offline', fails: 4 }),
    ch({ id: 'inst', name: 'B', status: 'desconhecido', fails: 1 }),
    ch({ id: 'ok1', name: 'C' }),
    ch({ id: 'nc', name: 'D', status: 'desconhecido' }),
    ch({ id: 'ok2', name: 'E' }),
  ];
  it('ordena pela saúde mantendo a ordem original dentro de cada faixa, sem tirar ninguém', () => {
    expect(filterChannels(list, EMPTY_FILTERS).map((c) => c.id)).toEqual(['ok1', 'ok2', 'nc', 'inst', 'fora']);
  });
  it('canal que falhou neste navegador desce, mas fica acima dos fora do ar', () => {
    const rank = (c: Channel) => healthRank(c, c.id === 'ok1');
    expect(filterChannels(list, EMPTY_FILTERS, { rank }).map((c) => c.id)).toEqual(['ok2', 'nc', 'inst', 'ok1', 'fora']);
  });
  it('"Ocultar fora do ar" (opcional) e o filtro de status', () => {
    expect(filterChannels(list, { ...EMPTY_FILTERS, hideOffline: true }).map((c) => c.id)).not.toContain('fora');
    expect(filterChannels(list, { ...EMPTY_FILTERS, status: 'instavel' }).map((c) => c.id)).toEqual(['inst']);
    expect(filterChannels(list, { ...EMPTY_FILTERS, status: 'fora', hideOffline: true }).map((c) => c.id)).toEqual(['fora']);
  });
  it('com busca, relevância primeiro e saúde como desempate', () => {
    const l = [ch({ id: 'x1', name: 'Rede Sul', status: 'offline' }), ch({ id: 'x2', name: 'Rede Norte' }), ch({ id: 'x3', name: 'Nova Rede' })];
    expect(filterChannels(l, { ...EMPTY_FILTERS, query: 'rede' }).map((c) => c.id)).toEqual(['x2', 'x1', 'x3']);
  });
});

describe('falhas locais (7 dias, só neste navegador)', () => {
  const now = 1_800_000_000_000;
  it('registra, remove e expira depois de 7 dias', () => {
    const r = withFailure({}, 'BR/a', now);
    expect(r).toEqual({ 'BR/a': now });
    expect(withoutFailure(r, 'BR/a')).toEqual({});
    expect(pruneFailures({ 'BR/a': now - LOCAL_FAILURE_TTL_MS + 1000, 'BR/b': now - LOCAL_FAILURE_TTL_MS - 1 }, now)).toEqual({ 'BR/a': now - LOCAL_FAILURE_TTL_MS + 1000 });
  });
  it('ignora lixo e limita o tamanho', () => {
    expect(pruneFailures(null, now)).toEqual({});
    expect(pruneFailures([1, 2], now)).toEqual({});
    expect(pruneFailures({ 'BR/a': 'ontem', 'sem-pais': now, 'BR/b': now + 3_600_000 }, now)).toEqual({});
    const muitos = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`BR/c${i}`, now - i]));
    const p = pruneFailures(muitos, now);
    expect(Object.keys(p)).toHaveLength(200);
    expect(p['BR/c0']).toBe(now); // mantém as mais recentes
  });
});
