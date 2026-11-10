/**
 * Endereço do serviço de presença (Cloudflare Worker). Vem da variável de build `VITE_PRESENCA_URL`; sem ela o site
 * funciona como antes (só o contador do Abacus, sem "assistindo agora").
 * Em testes e desenvolvimento, `localStorage['tvlivre:presenca-teste']` aponta para um `wrangler dev` local e liga a
 * presença mesmo em localhost/automação (como `tvlivre:remote-broker` no controle remoto).
 */
import { readString } from './storage.ts';

export const CHAVE_PRESENCA_TESTE = 'tvlivre:presenca-teste';

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

/** Normaliza para `https://host` (ou `http://localhost:porta` só no modo de teste). Devolve null se inválido. */
export function normalizarBase(valor: string | null | undefined, permitirLocal: boolean): string | null {
  const v = (valor ?? '').trim().replace(/\/+$/, '');
  if (!v) return null;
  if (/^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(v)) return v;
  if (permitirLocal && LOCAL.test(v)) return v;
  return null;
}

export function presencaTeste(): string | null {
  return normalizarBase(readString(CHAVE_PRESENCA_TESTE), true);
}

/** Base HTTP(S) do serviço, ou null quando não há serviço configurado. */
export function presencaBase(): string | null {
  return presencaTeste() ?? normalizarBase(import.meta.env.VITE_PRESENCA_URL as string | undefined, false);
}

/** `https://x` → `wss://x/ws`; `http://localhost:8787` → `ws://localhost:8787/ws`. */
export function presencaWs(base: string): string {
  return `${base.replace(/^http/, 'ws')}/ws`;
}

/** Só visitas reais: site publicado, sem automação — ou o modo de teste explícito. */
export function presencaAtiva(loc: Pick<Location, 'hostname'> = window.location, webdriver = navigator.webdriver): boolean {
  if (presencaBase() === null) return false;
  if (presencaTeste() !== null) return true;
  return import.meta.env.PROD && loc.hostname === 'jkfa.github.io' && !webdriver;
}
