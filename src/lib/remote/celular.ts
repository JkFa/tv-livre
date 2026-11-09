import { readSession, removeSession, writeSession } from '../storage.ts';

/** Dados do pareamento no celular. Ficam só no `sessionStorage` desta aba e nunca vão a servidor (o link usa o `#`). */
export interface Par {
  sessao: string;
  chaveRaw: string;
}
const CHAVE = 'tvlivre:controle-par';

/** `#/controle?s=…&k=…` → par, ou null. */
export function lerLink(hash: string): Par | null {
  const q = hash.split('?')[1];
  if (!q) return null;
  const p = new URLSearchParams(q);
  const sessao = p.get('s');
  const chaveRaw = p.get('k');
  return sessao && chaveRaw && /^[\w-]{10,64}$/.test(sessao) && /^[\w-]{20,64}$/.test(chaveRaw) ? { sessao, chaveRaw } : null;
}
export function lerPar(): Par | null {
  try {
    const x = JSON.parse(readSession(CHAVE) ?? 'null');
    return x && typeof x.sessao === 'string' && typeof x.chaveRaw === 'string' ? { sessao: x.sessao, chaveRaw: x.chaveRaw } : null;
  } catch {
    return null;
  }
}
export const salvarPar = (p: Par): void => writeSession(CHAVE, JSON.stringify(p));
export const limparPar = (): void => removeSession(CHAVE);

/** Nome curto do aparelho para a lista no computador ("Celular conectado · iPhone"). Só o tipo, nada de modelo. */
export function nomeDoAparelho(ua: string = navigator.userAgent): string {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  return 'Celular';
}
