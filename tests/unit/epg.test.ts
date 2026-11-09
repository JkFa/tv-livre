import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EpgFile } from '../../shared/types.ts';
import { agora, aSeguir, comecandoAgora, faixaHoras, horaCurta, progresso, resetEpgForTest, setEpgForTest } from '../../src/lib/epg.ts';

const ch = { id: 'Globo.br', country: 'BR' };
const at = (iso: string) => Date.parse(iso) / 1000;
const file = (generatedAt: string, entries: EpgFile['channels'][string]): EpgFile => ({ generatedAt, channels: { 'Globo.br': entries } });

beforeEach(() => resetEpgForTest());
afterEach(() => vi.useRealTimers());

describe('agora / aSeguir', () => {
  const t0 = at('2026-11-09T22:00:00Z');
  const entries: EpgFile['channels'][string] = [
    [t0 - 3600, t0, 'Anterior'],
    [t0, t0 + 1800, 'Jornal', 'News'],
    [t0 + 1800, t0 + 5400, 'Novela'],
    [t0 + 5400, t0 + 7200, 'Filme'],
  ];
  beforeEach(() => setEpgForTest('BR', file('2026-11-09T21:00:00Z', entries)));

  it('acha o programa no ar (início inclusivo, fim exclusivo)', () => {
    expect(agora(ch, t0)?.title).toBe('Jornal');
    expect(agora(ch, t0 + 1799)?.title).toBe('Jornal');
    expect(agora(ch, t0 + 1800)?.title).toBe('Novela');
    expect(agora(ch, t0 + 1800)?.category).toBeUndefined();
  });
  it('a seguir devolve só os que ainda vão começar, em ordem', () => {
    expect(aSeguir(ch, t0).map((p) => p.title)).toEqual(['Novela']);
    expect(aSeguir(ch, t0, 5).map((p) => p.title)).toEqual(['Novela', 'Filme']);
    expect(aSeguir(ch, t0 + 7000, 3)).toEqual([]);
  });
  it('ignora entradas vencidas e canal sem guia', () => {
    expect(agora(ch, t0 + 99999)).toBeNull();
    expect(agora({ id: 'SBT.br', country: 'BR' }, t0)).toBeNull();
    expect(agora({ id: 'Globo.br', country: 'US' }, t0)).toBeNull();
    expect(aSeguir({ id: 'SBT.br', country: 'BR' }, t0)).toEqual([]);
  });
  it('arquivo com mais de 48 h é tratado como ausente', () => {
    setEpgForTest('BR', file('2026-11-07T21:00:00Z', entries));
    expect(agora(ch, t0)).toBeNull();
    expect(aSeguir(ch, t0)).toEqual([]);
    setEpgForTest('BR', file('2026-11-07T22:30:00Z', entries)); // 47,5 h: ainda vale
    expect(agora(ch, t0)?.title).toBe('Jornal');
  });
  it('virada de dia: programa que cruza a meia-noite local', () => {
    const noite = at('2026-11-10T02:30:00Z'); // 23h30 em Brasília (−03:00)
    setEpgForTest('BR', file('2026-11-10T01:00:00Z', [[noite - 1800, noite + 3600, 'Filme da noite'], [noite + 3600, noite + 7200, 'Madrugada']]));
    expect(agora(ch, noite + 1800)?.title).toBe('Filme da noite'); // 00h00 do dia seguinte, ainda o mesmo programa
    expect(aSeguir(ch, noite + 1800)[0]?.title).toBe('Madrugada');
  });
});

describe('comecandoAgora', () => {
  const t0 = at('2026-11-09T22:00:00Z');
  it('começou há até 10 min ou começa em até 15', () => {
    setEpgForTest('BR', file('2026-11-09T21:00:00Z', [[t0 - 600, t0 + 3000, 'Começou há 10'], [t0 + 3000, t0 + 6000, 'Depois']]));
    expect(comecandoAgora(ch, t0)?.title).toBe('Começou há 10');
    expect(comecandoAgora(ch, t0 + 1)).toBeNull(); // 10 min e 1 s: já passou
    expect(comecandoAgora(ch, t0 + 3000 - 900)?.title).toBe('Depois'); // começa em 15 min
    expect(comecandoAgora(ch, t0 + 3000 - 901)).toBeNull();
  });
  it('sem guia, nada', () => {
    expect(comecandoAgora(ch, t0)).toBeNull();
  });
});

describe('progresso e horas', () => {
  it('progresso limitado a 0–1', () => {
    const p = { start: 1000, stop: 2000, title: 'x' };
    expect(progresso(p, 1500)).toBe(0.5);
    expect(progresso(p, 500)).toBe(0);
    expect(progresso(p, 9999)).toBe(1);
  });
  it('mostra a hora no fuso de quem assiste, com zero à esquerda', () => {
    const d = new Date(2026, 10, 9, 8, 5, 0);
    expect(horaCurta(d.getTime() / 1000)).toBe('08h05');
    expect(faixaHoras({ start: d.getTime() / 1000, stop: d.getTime() / 1000 + 5400, title: 'x' })).toBe('08h05–09h35');
  });
  it('horário de verão: a duração em epoch não muda, a hora local sim (fuso da máquina)', () => {
    // 2027-03-14 02:00 em Nova York pula para 03:00; em epoch, 1 h depois de 01:30 EST é 03:30 EDT
    const antes = Date.UTC(2027, 2, 14, 6, 30) / 1000; // 01:30 EST
    const depois = antes + 3600; // 03:30 EDT
    const p = { start: antes, stop: depois, title: 'x' };
    expect(progresso(p, antes + 1800)).toBe(0.5);
  });
});
