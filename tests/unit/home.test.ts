import { describe, expect, it } from 'vitest';
import type { Channel } from '../../shared/types.ts';
import { liveNow, parseChannelNumber, pickFeatured, topCategories, topCountries } from '../../src/lib/home.ts';
import type { Caps } from '../../src/lib/playback.ts';

const caps: Caps = { mse: true, nativeHls: false, pageSecure: true, httpOk: false };
const ch = (id: string, over: Partial<Channel> = {}): Channel => ({
  id, name: id, country: 'BR', categories: [], languages: ['por'], url: `https://x.test/${id}.m3u8`, kind: 'hls',
  status: 'online', sources: ['iptv-org'], ...over,
});

describe('liveNow', () => {
  it('só canais no ar que tocam aqui, curados primeiro', () => {
    const list = [
      ch('b'), ch('a', { status: 'offline' }), ch('c', { sources: ['free-tv'] }), ch('d', { kind: 'http', url: 'http://x.test/d.m3u8' }),
      ch('e', { cors: false }),
    ];
    expect(liveNow(list, 10, caps).map((c) => c.id)).toEqual(['c', 'b']);
  });
  it('respeita o limite', () => {
    expect(liveNow([ch('a'), ch('b'), ch('c')], 2, caps)).toHaveLength(2);
  });
});

describe('pickFeatured', () => {
  const list = [ch('a', { sources: ['free-tv'] }), ch('b', { sources: ['free-tv'] }), ch('c', { sources: ['free-tv'] })];
  it('prefere o canal que o usuário estava vendo', () => {
    expect(pickFeatured(list, list[2]!, new Date(), caps)).toEqual({ channel: list[2], resumed: true });
  });
  it('sem histórico, é estável no mesmo dia e anda no dia seguinte', () => {
    const d1 = new Date('2026-11-06T15:00:00');
    const d2 = new Date('2026-11-06T22:00:00');
    const d3 = new Date('2026-11-07T15:00:00');
    expect(pickFeatured(list, null, d1, caps)?.channel.id).toBe(pickFeatured(list, null, d2, caps)?.channel.id);
    expect(pickFeatured(list, null, d3, caps)?.channel.id).not.toBe(pickFeatured(list, null, d1, caps)?.channel.id);
    expect(pickFeatured(list, null, d1, caps)?.resumed).toBe(false);
  });
  it('nada no ar, nada em destaque', () => {
    expect(pickFeatured([ch('x', { status: 'offline' })], null, new Date(), caps)).toBeNull();
  });
});

describe('topCategories', () => {
  it('ordena por quantidade, "geral" fica de fora quando há outras', () => {
    const list = [ch('1', { categories: ['news', 'general'] }), ch('2', { categories: ['news'] }), ch('3', { categories: ['sports', 'general'] })];
    expect(topCategories(list, 5)).toEqual([{ id: 'news', count: 2 }, { id: 'sports', count: 1 }]);
    expect(topCategories(list, 1)).toHaveLength(1);
  });
});

describe('topCountries', () => {
  const index = {
    countries: [
      { code: 'US', count: 10, online: 8 }, { code: 'BR', count: 5, online: 2 }, { code: 'IT', count: 6, online: 5 }, { code: 'PT', count: 3, online: 1 },
    ],
  };
  it('o país atual vem primeiro, depois os com mais canais no ar', () => {
    expect(topCountries(index, 'BR', 3).map((c) => c.code)).toEqual(['BR', 'US', 'IT']);
  });
  it('país desconhecido: só os maiores', () => {
    expect(topCountries(index, 'ZZ', 2).map((c) => c.code)).toEqual(['US', 'IT']);
  });
});

describe('parseChannelNumber', () => {
  it('lê só dígitos, até 4', () => {
    expect(parseChannelNumber(' 07 ')).toBe(7);
    expect(parseChannelNumber('12345')).toBe(1234);
    expect(parseChannelNumber('abc')).toBeNull();
    expect(parseChannelNumber('0')).toBeNull();
  });
});
