import { describe, expect, it } from 'vitest';
import type { Channel, CountrySummary } from '../../shared/types.ts';
import { countriesIn, guideSections, initialRegion, regionCounts } from '../../src/lib/guia.ts';

const countries: CountrySummary[] = [
  { code: 'BR', count: 300, online: 140, flag: '🇧🇷', regions: ['SOUTHAM'] },
  { code: 'RU', count: 500, online: 300, flag: '🇷🇺', regions: ['EUR', 'ASIA'] },
  { code: 'IN', count: 800, online: 590, flag: '🇮🇳', regions: ['ASIA'] },
  { code: 'MX', count: 200, online: 100, flag: '🇲🇽' },
  { code: 'INT', count: 50, online: 40 },
];

describe('regiões no seletor', () => {
  it('conta países por região (pertencimento múltiplo) e junta os sem região no fim', () => {
    expect(regionCounts(countries)).toEqual([
      { code: 'SOUTHAM', label: 'América do Sul', countries: 1 },
      { code: 'EUR', label: 'Europa', countries: 1 },
      { code: 'ASIA', label: 'Ásia', countries: 2 },
      { code: 'SEM', label: 'Sem região na fonte', countries: 2 },
    ]);
  });

  it('país de duas regiões aparece nas duas; lista ordenada por canais no ar', () => {
    expect(countriesIn(countries, 'ASIA').map((c) => c.code)).toEqual(['IN', 'RU']);
    expect(countriesIn(countries, 'EUR').map((c) => c.code)).toEqual(['RU']);
    expect(countriesIn(countries, 'SEM').map((c) => c.code)).toEqual(['MX', 'INT']);
    expect(countriesIn(countries, '')).toHaveLength(5);
  });

  it('região inicial é a do país atual', () => {
    expect(initialRegion(countries, 'RU')).toBe('EUR');
    expect(initialRegion(countries, 'MX')).toBe('');
    expect(initialRegion(countries, 'ZZ')).toBe('');
  });
});

describe('guia por assunto', () => {
  const ch = (id: string, categories: string[], p: Partial<Channel> = {}): Channel => ({
    id, name: id, country: 'BR', categories, languages: [], url: `https://x/${id}`, kind: 'hls', status: 'online', sources: ['iptv-org'], ...p,
  });
  const list = [
    ch('a', ['news']),
    ch('b', ['news', 'sports'], { status: 'offline' }),
    ch('c', ['news']),
    ch('d', []),
    ch('e', ['general']),
    ch('f', ['general']),
    ch('g', ['general']),
  ];

  it('agrupa por categoria (canal em várias aparece em cada), geral e sem assunto no fim', () => {
    const s = guideSections(list, () => 0);
    expect(s.map((x) => x.id)).toEqual(['news', 'sports', 'general', '']);
    expect(s[0]!.channels.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(s[0]!.online).toBe(2);
    expect(s[1]!.channels.map((c) => c.id)).toEqual(['b']);
  });

  it('ordena pela saúde sem tirar ninguém', () => {
    const s = guideSections(list, (c) => (c.status === 'offline' ? 4 : 0));
    expect(s[0]!.channels.map((c) => c.id)).toEqual(['a', 'c', 'b']);
  });
});
