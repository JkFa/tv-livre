import { describe, expect, it } from 'vitest';
import type { Channel } from '../../shared/types.ts';
import { channelKey } from '../../src/lib/lineup.ts';
import { makeHealthSelector } from '../../src/lib/useHealth.ts';
import { pickZap, ZAP_MEMORY, ZAP_MIN_POOL, type ZapOptions } from '../../src/lib/zapear.ts';

const ch = (id: string, p: Partial<Channel> = {}): Channel => ({
  id, name: id, country: 'BR', categories: [], languages: ['por'], url: `https://x.com/${id}.m3u8`,
  kind: 'hls', status: 'online', sources: ['iptv-org'], ...p,
});
/** No teste, "toca aqui" = HLS sem bloqueio (sem depender das capacidades do Node). */
const playable = (c: Channel) => c.kind === 'hls' && c.cors !== false;
const sel = makeHealthSelector(new Map());
const opts = (o: Partial<ZapOptions> = {}): ZapOptions => ({ currentKey: null, playable, ...o });
const ids = (n: number, p: Partial<Channel> = {}, prefix = 'ok') => Array.from({ length: n }, (_, i) => ch(`${prefix}${i}`, p));

/** Sorteia `n` vezes com memória, como o hook faz. */
function zapMany(list: Channel[], n: number, s = sel, rnd?: () => number): Channel[] {
  const recent: string[] = [];
  const out: Channel[] = [];
  let current: string | null = null;
  for (let i = 0; i < n; i++) {
    const pick = pickZap(list, s, opts({ currentKey: current, recent, ...(rnd ? { rnd } : {}) }));
    if (!pick) break;
    out.push(pick);
    current = channelKey(pick);
    recent.unshift(current);
    recent.splice(ZAP_MEMORY);
  }
  return out;
}

describe('zapear', () => {
  it('10 zaps → 10 canais diferentes, todos no ar e que tocam aqui', () => {
    const list = [
      ...ids(12),
      ...ids(5, { status: 'offline' }, 'off'),
      ...ids(5, { kind: 'http' }, 'http'),
      ...ids(5, { cors: false }, 'cors'),
      ...ids(5, { status: 'online', fails: 1 }, 'inst'),
      ...ids(5, { status: 'desconhecido' }, 'nc'),
    ];
    const picks = zapMany(list, 10);
    expect(picks).toHaveLength(10);
    expect(new Set(picks.map((c) => c.id)).size).toBe(10);
    for (const c of picks) expect(c.id).toMatch(/^ok\d+$/);
  });

  it('com poucos canais no ar, junta os instáveis', () => {
    const list = [...ids(ZAP_MIN_POOL - 1), ...ids(3, { fails: 2 }, 'inst'), ...ids(3, { status: 'desconhecido' }, 'nc')];
    const seen = new Set(zapMany(list, 7).map((c) => c.id));
    expect([...seen].some((id) => id.startsWith('inst'))).toBe(true);
    expect([...seen].some((id) => id.startsWith('nc'))).toBe(false);
  });

  it('nunca sorteia canal que não toca no navegador, mesmo no ar', () => {
    const list = [ch('a'), ch('h1', { kind: 'http' }), ch('h2', { cors: false })];
    for (let i = 0; i < 20; i++) expect(pickZap(list, sel, opts({ currentKey: 'BR/x', rnd: Math.random }))?.id).toBe('a');
    expect(pickZap(list, sel, opts({ currentKey: 'BR/a' }))).toBeNull();
  });

  it('deixa por último o que não abriu neste navegador', () => {
    const list = ids(ZAP_MIN_POOL + 3);
    const failed = new Map(list.slice(0, ZAP_MIN_POOL + 2).map((c) => [channelKey(c), Date.now()]));
    const s = makeHealthSelector(failed);
    for (let i = 0; i < 10; i++) expect(pickZap(list, s, opts({ rnd: Math.random }))?.id).toBe(`ok${ZAP_MIN_POOL + 2}`);
    // se só sobrar o que falhou aqui, ainda sorteia (melhor que não zapear)
    expect(pickZap(list.slice(0, 2), s, opts())).not.toBeNull();
  });

  it('sem dado de saúde (lista antiga), mantém o comportamento de antes', () => {
    const list = [ch('a', { status: 'desconhecido' }), ch('b', { status: 'desconhecido' }), ch('c', { status: 'desconhecido', kind: 'http' })];
    const picks = new Set(Array.from({ length: 30 }, () => pickZap(list, sel, opts({ rnd: Math.random }))?.id));
    expect(picks).toEqual(new Set(['a', 'b']));
  });

  it('restrição extra (transmitindo) e determinismo do gerador', () => {
    const list = ids(6);
    expect(pickZap(list, sel, opts({ extra: (c) => c.id === 'ok3' }))?.id).toBe('ok3');
    expect(pickZap(list, sel, opts({ rnd: () => 0 }))?.id).toBe('ok0');
    expect(pickZap(list, sel, opts({ rnd: () => 0.99 }))?.id).toBe('ok5');
  });

  it('não repete os recentes enquanto houver alternativa', () => {
    const list = ids(ZAP_MIN_POOL + 1);
    const recent = list.slice(0, ZAP_MIN_POOL).map(channelKey);
    expect(pickZap(list, sel, opts({ recent, rnd: () => 0 }))?.id).toBe(`ok${ZAP_MIN_POOL}`);
    // todos recentes: sorteia assim mesmo
    expect(pickZap(list, sel, opts({ recent: list.map(channelKey) }))).not.toBeNull();
  });

  it('nenhum candidato → null', () => {
    expect(pickZap([ch('b', { status: 'offline' })], sel, opts())).toBeNull();
    expect(pickZap([], sel, opts())).toBeNull();
  });
});
