import { describe, expect, it } from 'vitest';
import type { Channel } from '../../shared/types.ts';
import { buildNumbers, findByNumber, formatNumber, lineupOrder, stepChannel } from '../../src/lib/lineup.ts';

const ch = (id: string, p: Partial<Channel> = {}): Channel => ({
  id, name: id, country: 'BR', categories: [], languages: ['por'], url: `https://x.com/${id}.m3u8`,
  kind: 'hls', status: 'online', sources: ['iptv-org'], ...p,
});

describe('grade (numeração de canais)', () => {
  const list = [
    ch('Zeta', { sources: ['iptv-org'] }),
    ch('Beta', { sources: ['free-tv'] }),
    ch('Alfa', { sources: ['iptv-org'] }),
    ch('Omega', { sources: ['free-tv'], status: 'offline' }),
  ];

  it('Free-TV primeiro, depois ordem alfabética; independe de status', () => {
    expect(lineupOrder(list).map((c) => c.id)).toEqual(['Beta', 'Omega', 'Alfa', 'Zeta']);
  });
  it('numera por país a partir de 1 e é estável quando a ordem de exibição muda', () => {
    const a = buildNumbers({ BR: list, PT: [ch('Lusa', { country: 'PT' })] });
    const b = buildNumbers({ BR: [...list].reverse(), PT: [ch('Lusa', { country: 'PT' })] });
    expect(a.get('BR/Beta')).toBe(1);
    expect(a.get('BR/Zeta')).toBe(4);
    expect(a.get('PT/Lusa')).toBe(1);
    expect([...a]).toEqual(expect.arrayContaining([...b]));
  });
  it('formata com dois dígitos e encontra pelo número', () => {
    expect(formatNumber(7)).toBe('07');
    expect(formatNumber(104)).toBe('104');
    expect(formatNumber(undefined)).toBe('--');
    const nums = buildNumbers({ BR: list });
    expect(findByNumber(list, nums, 3)?.id).toBe('Alfa');
    expect(findByNumber(list, nums, 99)).toBeNull();
  });
});

describe('zapear: próximo/anterior', () => {
  const list = [
    ch('a'),
    ch('b', { status: 'offline' }),
    ch('c', { kind: 'http' }), // não toca no navegador
    ch('d', { status: 'desconhecido' }),
    ch('e'),
  ];
  it('pula offline e canais que não tocam no navegador, dando a volta nas pontas', () => {
    expect(stepChannel(list, 'BR/a', 1)?.id).toBe('d');
    expect(stepChannel(list, 'BR/d', 1)?.id).toBe('e');
    expect(stepChannel(list, 'BR/e', 1)?.id).toBe('a');
    expect(stepChannel(list, 'BR/a', -1)?.id).toBe('e');
  });
  it('sem canal atual, começa pelo primeiro (próximo) ou pelo último (anterior)', () => {
    expect(stepChannel(list, null, 1)?.id).toBe('a');
    expect(stepChannel(list, null, -1)?.id).toBe('e');
  });
  it('se só há canais que não tocam no navegador, aceita esses (nunca offline)', () => {
    const only = [ch('x', { kind: 'http' }), ch('y', { status: 'offline' }), ch('z', { kind: 'http' })];
    expect(stepChannel(only, 'BR/x', 1)?.id).toBe('z');
  });
  it('lista vazia ou só com o canal atual → null', () => {
    expect(stepChannel([], null, 1)).toBeNull();
    expect(stepChannel([ch('a')], 'BR/a', 1)).toBeNull();
  });
});

