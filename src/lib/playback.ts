import type { Channel } from '../../shared/types.ts';
import { readString, writeString } from './storage.ts';

/**
 * Plano de reprodução: a lista de tentativas, em ordem, que o player faz sozinho para um canal.
 * O usuário nunca escolhe motor, protocolo ou proxy; só vê o canal tocar (ou o motivo real de não tocar).
 *
 *  - HTTPS com CORS ........ hls.js (MSE); se falhar sem motivo claro, HLS nativo do navegador
 *  - HTTPS sem CORS ........ HLS nativo (o <video> não exige CORS); sem HLS nativo, só o VLC
 *  - HTTP numa página HTTPS . 1) o mesmo endereço por HTTPS  2) HTTP direto, que só funciona se o usuário
 *                             liberou "conteúdo não seguro" para este site (o navegador não deixa o site pedir isso)
 */

export type Engine = 'hlsjs' | 'native';

export interface Step {
  engine: Engine;
  /** Endereço que esta tentativa usa de fato (já com HTTPS, se for o caso). */
  url: string;
  /** Reescreve todo pedido (lista, trechos) de http: para https:. */
  upgrade: boolean;
  /** Tentativa em HTTP puro dentro de página HTTPS: só passa com a permissão do usuário. */
  insecure: boolean;
  /** Tempo máximo desta tentativa antes de passar para a próxima. */
  budgetMs: number;
}

export interface Caps {
  /** Há MediaSource (hls.js consegue tocar)? */
  mse: boolean;
  /** O <video> toca HLS sozinho (Safari, iPhone, Chrome e Edge recentes)? */
  nativeHls: boolean;
  /** A página está em HTTPS (então HTTP é "conteúdo misto")? */
  pageSecure: boolean;
  /** O usuário já liberou HTTP e vimos um canal HTTP tocar. */
  httpOk: boolean;
}

/** Capacidades do navegador: não mudam na sessão (o "HTTP liberado" é atualizado por setHttpOk). */
let cached: Caps | null = null;

const HTTP_OK_KEY = 'tvlivre:http-liberado';
export const getHttpOk = (): boolean => readString(HTTP_OK_KEY) === '1';
export const setHttpOk = (ok: boolean): void => {
  writeString(HTTP_OK_KEY, ok ? '1' : '0');
  if (cached) cached = { ...cached, httpOk: ok };
};

export function detectCaps(): Caps {
  // Sem navegador (testes unitários, pré-renderização): o comportamento conservador de antes.
  if (typeof window === 'undefined') return { mse: true, nativeHls: false, pageSecure: true, httpOk: false };
  let nativeHls = false;
  let mse = false;
  try {
    nativeHls = document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== '';
    mse = 'MediaSource' in window || 'ManagedMediaSource' in window;
  } catch {
    /* ambiente sem mídia: nada toca */
  }
  return { mse, nativeHls, pageSecure: window.location.protocol === 'https:', httpOk: getHttpOk() };
}

export const toHttps = (url: string): string => url.replace(/^http:/i, 'https:');
export const isHttpUrl = (url: string): boolean => /^http:/i.test(url);

const BUDGET = { direct: 22_000, upgrade: 7_000, insecure: 14_000 } as const;

export interface PlanOptions {
  /** "Tentar mesmo assim": ignora o aviso de CORS. */
  force?: boolean;
}

export function buildPlan(ch: Pick<Channel, 'url' | 'cors' | 'needsHeaders'>, caps: Caps, opts: PlanOptions = {}): Step[] {
  if (ch.needsHeaders && !opts.force) return [];
  const corsOk = ch.cors !== false || !!opts.force;
  const steps: Step[] = [];
  const add = (engine: Engine, url: string, kind: keyof typeof BUDGET, upgrade = false) => {
    if (engine === 'hlsjs' && !(caps.mse && corsOk)) return;
    if (engine === 'native' && !caps.nativeHls) return;
    steps.push({ engine, url, upgrade, insecure: kind === 'insecure', budgetMs: BUDGET[kind] });
  };

  if (isHttpUrl(ch.url) && caps.pageSecure) {
    const upgraded = () => {
      add('hlsjs', toHttps(ch.url), 'upgrade', true);
      add('native', toHttps(ch.url), 'upgrade');
    };
    const insecure = () => {
      add('hlsjs', ch.url, 'insecure');
      add('native', ch.url, 'insecure');
    };
    // Se já sabemos que o HTTP está liberado, ele vai primeiro (e evita esperar um HTTPS que não existe).
    if (caps.httpOk) {
      insecure();
      upgraded();
    } else {
      upgraded();
      insecure();
    }
    return steps;
  }

  add('hlsjs', ch.url, 'direct');
  add('native', ch.url, 'direct');
  return steps;
}

/** Em que ponto o canal não toca de jeito nenhum aqui, e por quê? `null` = dá para tentar. */
export function unsupportedReason(ch: Pick<Channel, 'url' | 'kind' | 'cors' | 'needsHeaders'>, caps: Caps, opts: PlanOptions = {}): 'headers' | 'format' | 'cors' | null {
  if (ch.needsHeaders && !opts.force) return 'headers';
  if (ch.kind === 'other') return 'format';
  if (buildPlan(ch, caps, opts).length === 0) return 'cors';
  return null;
}

/**
 * O canal deve ser oferecido como "toca aqui" (zapear, filtro "só os que tocam", selo)?
 * HTTP em página HTTPS só conta depois que o usuário liberou o HTTP e comprovamos que funciona.
 */
export function isPlayableHere(ch: Channel, caps: Caps): boolean {
  if (ch.kind === 'youtube') return ch.youtube?.embeddable === true;
  if (ch.kind === 'other' || ch.needsHeaders) return false;
  if (ch.kind === 'http' && caps.pageSecure && !caps.httpOk) return false;
  return ch.cors !== false ? caps.mse || caps.nativeHls : caps.nativeHls;
}

export function caps(): Caps {
  cached ??= detectCaps();
  return cached;
}
