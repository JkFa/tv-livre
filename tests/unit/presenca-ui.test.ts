import { describe, expect, it } from 'vitest';
import type { Channel } from '../../shared/types.ts';
import { EMPTY_FILTERS, filterChannels } from '../../src/lib/filter.ts';
import { dataExtenso, emAlta, mapaMaisAssistidos, paisesFaltando, textoAssistindo, textoCanal } from '../../src/lib/presenca-ui.ts';
import type { Resumo } from '../../src/lib/presenca.ts';

const canal = (id: string, country = 'BR', status: Channel['status'] = 'online'): Channel =>
  ({ id, name: `Canal ${id}`, country, status, categories: [], languages: [], sources: ['free-tv'] }) as unknown as Channel;
const resumo = (top: Resumo['top'], over: Partial<Resumo> = {}): Resumo => ({ online: 50, assistindo: 30, top, meu: null, acessos: 1000, hoje: 90, pico: 40, picoEm: '2026-11-09', ...over });

describe('mapa e vitrine "Em alta"', () => {
  const r = resumo([{ c: 'a', p: 'BR', n: 12 }, { c: 'b', p: 'PT', n: 7 }, { c: 'c', p: 'BR', n: 2 }, { c: 'd', p: 'BR', n: 5 }]);
  it('mapa só com canais de 3 ou mais pessoas (segunda trava da privacidade)', () => {
    expect([...mapaMaisAssistidos(r)]).toEqual([['BR/a', 12], ['PT/b', 7], ['BR/d', 5]]);
    expect(mapaMaisAssistidos(null).size).toBe(0);
  });
  it('resolve os canais conhecidos, pula offline e desconhecidos, respeita o limite', () => {
    const store = { BR: [canal('a'), canal('d', 'BR', 'offline')], PT: [canal('b', 'PT')] };
    const out = emAlta(r, store);
    expect(out.map((x) => [x.channel.id, x.n])).toEqual([['a', 12], ['b', 7]]);
    expect(emAlta(r, store, 1)).toHaveLength(1);
    expect(emAlta(null, store)).toEqual([]);
  });
  it('países do topo que ainda não foram carregados', () => {
    expect(paisesFaltando(r, { BR: [] })).toEqual(['PT']);
    expect(paisesFaltando(null, {})).toEqual([]);
  });
});

describe('filtro "Mais assistidos agora"', () => {
  const lista = [canal('a'), canal('b', 'PT'), canal('x'), canal('d')];
  const mapa = new Map([['BR/a', 12], ['PT/b', 7], ['BR/d', 5]]);
  it('só os do topo, do mais para o menos assistido', () => {
    const out = filterChannels(lista, { ...EMPTY_FILTERS, trending: true }, { assistindo: mapa });
    expect(out.map((c) => c.id)).toEqual(['a', 'b', 'd']);
  });
  it('desligado, não altera nada; ligado sem serviço, não mostra nada (nunca inventa)', () => {
    expect(filterChannels(lista, EMPTY_FILTERS, { assistindo: mapa })).toHaveLength(4);
    expect(filterChannels(lista, { ...EMPTY_FILTERS, trending: true })).toEqual([]);
  });
});

describe('textos', () => {
  it('pluraliza e formata em pt-BR', () => {
    expect(textoAssistindo(1)).toBe('1 pessoa assistindo agora');
    expect(textoAssistindo(1234)).toBe('1.234 pessoas assistindo agora');
    expect(textoCanal(23)).toBe('23 assistindo este canal');
    expect(dataExtenso('2026-11-09')).toBe('9 de novembro de 2026');
    expect(dataExtenso('lixo')).toBe('');
  });
});
