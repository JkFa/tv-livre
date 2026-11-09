import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Channel, EpgEntry, EpgFile } from '../../shared/types.ts';

/**
 * Guia de programação ("Agora" e "A seguir"). Os arquivos data/epg/<PAÍS>.json são carregados sob demanda (só os
 * países em uso) e guardados aqui. Horários em epoch UTC (segundos); a conversão para o fuso de quem assiste é na tela.
 */
export interface Programa {
  start: number;
  stop: number;
  title: string;
  category?: string;
}

/** Guia com mais de 48 h é tratado como ausente (a coleta parou e a grade envelheceu). */
export const MAX_AGE_SEC = 48 * 3600;
/** "Começando agora": começou há até 10 min ou começa nos próximos 15. */
export const STARTED_WITHIN = 10 * 60;
export const STARTS_WITHIN = 15 * 60;

const files = new Map<string, EpgFile | null>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let version = 0;
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};

export const nowSec = (): number => Math.floor(Date.now() / 1000);

const key = (c: Pick<Channel, 'id' | 'country'>) => c.country;

function toPrograma(e: EpgEntry): Programa {
  return { start: e[0], stop: e[1], title: e[2], ...(e[3] ? { category: e[3] } : {}) };
}

/** Programas do canal, ordenados, ou null se não há guia válido para ele. */
function entries(ch: Pick<Channel, 'id' | 'country'>, t: number): EpgEntry[] | null {
  const f = files.get(key(ch));
  if (!f) return null;
  const gen = Date.parse(f.generatedAt);
  if (Number.isFinite(gen) && t - gen / 1000 > MAX_AGE_SEC) return null;
  return f.channels[ch.id] ?? null;
}

/** Programa no ar no instante `t` (epoch, s). Ignora entradas vencidas. */
export function agora(ch: Pick<Channel, 'id' | 'country'>, t: number = nowSec()): Programa | null {
  const list = entries(ch, t);
  const e = list?.find((x) => x[0] <= t && t < x[1]);
  return e ? toPrograma(e) : null;
}

/** Até `n` programas que começam depois de `t`. */
export function aSeguir(ch: Pick<Channel, 'id' | 'country'>, t: number = nowSec(), n = 1): Programa[] {
  const list = entries(ch, t);
  if (!list) return [];
  return list.filter((x) => x[0] > t).slice(0, n).map(toPrograma);
}

/** Programa que começou há pouco ou começa logo (para o filtro e o bloco "Começando agora"). */
export function comecandoAgora(ch: Pick<Channel, 'id' | 'country'>, t: number = nowSec()): Programa | null {
  const list = entries(ch, t);
  const e = list?.find((x) => (x[0] <= t && t - x[0] <= STARTED_WITHIN && t < x[1]) || (x[0] > t && x[0] - t <= STARTS_WITHIN));
  return e ? toPrograma(e) : null;
}

/** 0–1: quanto do programa já passou. */
export function progresso(p: Programa, t: number = nowSec()): number {
  return Math.min(1, Math.max(0, (t - p.start) / Math.max(1, p.stop - p.start)));
}

/** "20h00" no fuso de quem assiste. */
export function horaCurta(epoch: number): string {
  const d = new Date(epoch * 1000);
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}

export const faixaHoras = (p: Programa): string => `${horaCurta(p.start)}–${horaCurta(p.stop)}`;

export function hasEpg(country: string): boolean {
  return !!files.get(country);
}

/** Carrega o guia de um país (uma vez). Falha ou ausência = sem guia, sem erro para o resto do app. */
export function loadEpg(country: string, base: string = import.meta.env.BASE_URL): Promise<void> {
  if (files.has(country)) return Promise.resolve();
  let p = pending.get(country);
  if (!p) {
    p = fetch(`${base}data/epg/${encodeURIComponent(country)}.json`)
      .then(async (res) => (res.ok ? ((await res.json()) as EpgFile) : null))
      .catch(() => null)
      .then((f) => {
        files.set(country, f && f.channels && typeof f.channels === 'object' ? f : null);
        pending.delete(country);
        bump();
      });
    pending.set(country, p);
  }
  return p;
}

/** Só para testes. */
export function setEpgForTest(country: string, file: EpgFile | null): void {
  files.set(country, file);
  bump();
}
export function resetEpgForTest(): void {
  files.clear();
  pending.clear();
  bump();
}

/** Re-renderiza quando um guia termina de carregar. */
export function useEpgVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}

/** Carrega o guia dos países informados (os que o índice diz que têm guia). */
export function useEpgCountries(countries: string[], available: string[] | undefined): void {
  const k = countries.filter((c) => available?.includes(c)).sort().join(',');
  useEffect(() => {
    if (k) for (const c of k.split(',')) void loadEpg(c);
  }, [k]);
}

/**
 * Relógio do guia: devolve "agora" (s) e se atualiza sozinho no próximo limite (fim do programa ou começo do
 * seguinte) e a cada `stepMs` (para a barra de progresso). Sem polling agressivo: um único timer por uso.
 */
export function useGuideClock(boundaries: (number | undefined)[], stepMs = 30_000): number {
  const [t, setT] = useState(nowSec);
  const next = boundaries.filter((b): b is number => typeof b === 'number' && b > t).sort((a, b) => a - b)[0];
  useEffect(() => {
    const untilBoundary = next === undefined ? Infinity : Math.max(250, (next - Date.now() / 1000) * 1000 + 250);
    const id = setTimeout(() => setT(nowSec()), Math.min(stepMs, untilBoundary, 2 ** 30));
    return () => clearTimeout(id);
  }, [t, next, stepMs]);
  return t;
}

/** Tudo que a tela precisa de um canal: no ar, a seguir e o relógio. */
export function useGuide(ch: Channel | null): { now: Programa | null; next: Programa[]; t: number } {
  useEpgVersion();
  const t0 = nowSec();
  const first = ch ? agora(ch, t0) : null;
  const nx = ch ? aSeguir(ch, t0, 2) : [];
  const t = useGuideClock([first?.stop, nx[0]?.start]);
  return { now: ch ? agora(ch, t) : null, next: ch ? aSeguir(ch, t, 2) : [], t };
}
