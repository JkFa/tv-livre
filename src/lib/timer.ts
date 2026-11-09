import { readString, writeString } from './storage.ts';

/** Timer de desligar: minutos, ou o fim do programa atual (só com guia de programação). */
export type OpcaoTimer = 15 | 30 | 60 | 90 | 'fim';
export const OPCOES_TIMER: OpcaoTimer[] = [15, 30, 60, 90, 'fim'];
/** O volume cai gradualmente nos últimos 10 s. */
export const RAMPA_MS = 10_000;

const KEY = 'tvlivre:timer-padrao';
export function getTimerPadrao(): OpcaoTimer | null {
  const v = readString(KEY);
  if (v === 'fim') return 'fim';
  const n = Number(v);
  return n === 15 || n === 30 || n === 60 || n === 90 ? n : null;
}
export const setTimerPadrao = (o: OpcaoTimer): void => writeString(KEY, String(o));

export const rotuloTimer = (o: OpcaoTimer): string => (o === 'fim' ? 'Fim do programa' : `${o} min`);

/** Instante (ms) em que o timer termina; null se "fim do programa" e não há programa (sem guia). */
export function fimDoTimer(agoraMs: number, o: OpcaoTimer, fimProgramaSeg?: number | null): number | null {
  if (o === 'fim') return fimProgramaSeg && fimProgramaSeg * 1000 > agoraMs ? fimProgramaSeg * 1000 : null;
  return agoraMs + o * 60_000;
}

/** 1 até faltarem 10 s; depois cai em linha reta até 0 no fim. */
export function volumeDoTimer(restanteMs: number): number {
  if (restanteMs >= RAMPA_MS) return 1;
  return Math.max(0, restanteMs / RAMPA_MS);
}

export interface PassoTimer {
  restanteMs: number;
  volume: number;
  terminou: boolean;
}
export function passoTimer(fimMs: number, agoraMs: number): PassoTimer {
  const restanteMs = Math.max(0, fimMs - agoraMs);
  return { restanteMs, volume: volumeDoTimer(restanteMs), terminou: restanteMs <= 0 };
}

/** "12:34" ou "1:02:03". */
export function formatarRestante(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
