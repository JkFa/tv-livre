import { describe, expect, it } from 'vitest';
import {
  aplicarAcesso, atualizarPico, contagemDo, ContadorPorIp, diaSP, estaMorta, gastarFicha, LimitadorJanela, novosContadores, origemPermitida, resumir, validarMensagem, virarDia,
} from '../src/nucleo.ts';

describe('validarMensagem', () => {
  it('aceita assistindo e navegando', () => {
    expect(validarMensagem('{"t":"estado","s":"assistindo","c":"globo-sp","p":"br"}')).toEqual({ s: 'assistindo', c: 'globo-sp', p: 'BR' });
    expect(validarMensagem('{"t":"estado","s":"navegando"}')).toEqual({ s: 'navegando' });
  });
  it('ignora lixo, tamanho excessivo e ids inválidos', () => {
    for (const x of ['', 'oi', '[]', 'null', '{"t":"x"}', '{"t":"estado","s":"assistindo"}', '{"t":"estado","s":"assistindo","c":"a b"}',
      '{"t":"estado","s":"assistindo","c":"<script>"}', '{"t":"estado","s":"assistindo","c":"ok","p":"BRASIL"}', 42, null]) {
      expect(validarMensagem(x)).toBeNull();
    }
    expect(validarMensagem(`{"t":"estado","s":"assistindo","c":"${'a'.repeat(300)}"}`)).toBeNull();
    expect(validarMensagem(`{"t":"estado","s":"assistindo","c":"${'a'.repeat(101)}"}`)).toBeNull();
  });
});

describe('resumir e regra de privacidade (≥ 3)', () => {
  const a = (c: string, p = 'BR') => ({ e: 'a' as const, c, p });
  const n = { e: 'n' as const };
  it('conta online, assistindo e por canal; só publica canais com 3 ou mais', () => {
    const r = resumir([a('x'), a('x'), a('x'), a('y'), a('y'), n, n]);
    expect(r.online).toBe(7);
    expect(r.assistindo).toBe(5);
    expect(r.top).toEqual([{ p: 'BR', c: 'x', n: 3 }]);
    expect(contagemDo(r, a('x'))).toBe(3);
    expect(contagemDo(r, a('y'))).toBeNull(); // 2 pessoas: não divulga
    expect(contagemDo(r, n)).toBeNull();
  });
  it('top 10 ordenado por contagem e desempate estável', () => {
    const lista = [];
    for (let i = 0; i < 12; i++) for (let k = 0; k < 3 + i; k++) lista.push(a(`c${String(i).padStart(2, '0')}`));
    const r = resumir(lista);
    expect(r.top).toHaveLength(10);
    expect(r.top[0]).toMatchObject({ c: 'c11', n: 14 });
    expect(r.top.at(-1)).toMatchObject({ c: 'c02', n: 5 });
  });
  it('mesmo id em países diferentes não se mistura', () => {
    const r = resumir([a('z', 'BR'), a('z', 'BR'), a('z', 'PT')], 2);
    expect(r.top).toEqual([{ p: 'BR', c: 'z', n: 2 }]);
  });
});

describe('contadores e dia em America/Sao_Paulo', () => {
  it('virada do dia usa o horário de São Paulo (UTC-3), não o UTC', () => {
    // 2026-11-10 02:30 UTC = 2026-11-09 23:30 em São Paulo; 03:10 UTC = 00:10 do dia 10 em São Paulo
    const antes = Date.UTC(2026, 10, 10, 2, 30);
    const depois = Date.UTC(2026, 10, 10, 3, 10);
    expect(diaSP(antes)).toBe('2026-11-09');
    expect(diaSP(depois)).toBe('2026-11-10');
    const c = novosContadores(antes);
    aplicarAcesso(c, antes);
    aplicarAcesso(c, antes);
    expect(c).toMatchObject({ total: 2, hoje: 2, dia: '2026-11-09' });
    expect(virarDia(c, antes + 1000)).toBe(false);
    aplicarAcesso(c, depois);
    expect(c).toMatchObject({ total: 3, hoje: 1, dia: '2026-11-10' });
  });
  it('pico só sobe e guarda a data', () => {
    const c = novosContadores(0);
    const t = Date.UTC(2026, 10, 9, 15);
    expect(atualizarPico(c, 5, t)).toBe(true);
    expect(atualizarPico(c, 4, t)).toBe(false);
    expect(atualizarPico(c, 5, t)).toBe(false);
    expect(c).toMatchObject({ pico: 5, picoEm: '2026-11-09' });
  });
});

describe('limites de abuso', () => {
  it('por IP: no máximo 10 conexões; sair libera', () => {
    const l = new ContadorPorIp(10);
    for (let i = 0; i < 10; i++) expect(l.entrar('1.1.1.1')).toBe(true);
    expect(l.entrar('1.1.1.1')).toBe(false);
    expect(l.entrar('2.2.2.2')).toBe(true);
    l.sair('1.1.1.1');
    expect(l.entrar('1.1.1.1')).toBe(true);
  });
  it('mensagens: rajada de 3 e depois 1 a cada 2 s', () => {
    let a = { f: 3, r: 0 };
    const gastar = (t: number) => {
      const x = gastarFicha(a, t);
      if (x) a = x;
      return !!x;
    };
    expect([gastar(0), gastar(10), gastar(20), gastar(30)]).toEqual([true, true, true, false]);
    expect(gastar(1500)).toBe(false);
    expect(gastar(2100)).toBe(true); // repôs 1 ficha
    expect(gastar(2200)).toBe(false);
    expect(gastar(60_000)).toBe(true); // muito tempo depois: volta a rajada
  });
  it('janela deslizante', () => {
    const j = new LimitadorJanela(2, 1000);
    expect([j.permitir('a', 0), j.permitir('a', 1), j.permitir('a', 2)]).toEqual([true, true, false]);
    expect(j.permitir('a', 1500)).toBe(true);
  });
  it('origem: produção só a lista; dev também localhost', () => {
    const lista = 'https://jkfa.github.io';
    expect(origemPermitida('https://jkfa.github.io', 'producao', lista)).toBe(true);
    expect(origemPermitida('https://evil.example', 'producao', lista)).toBe(false);
    expect(origemPermitida('http://localhost:5173', 'producao', lista)).toBe(false);
    expect(origemPermitida('http://localhost:5173', 'dev', lista)).toBe(true);
    expect(origemPermitida('http://localhost.evil.com', 'dev', lista)).toBe(false);
    expect(origemPermitida(null, 'dev', lista)).toBe(false);
  });
  it('conexão morta: > 150 s sem sinal', () => {
    expect(estaMorta(0, 150_000)).toBe(false);
    expect(estaMorta(0, 150_001)).toBe(true);
  });
});
