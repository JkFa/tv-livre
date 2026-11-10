/**
 * Cola entre o navegador e `Presenca`: instância única, início depois da carga + interação (ou 3 s), ciclo de vida da aba
 * e um "store" para o React. Sem serviço configurado (ou em localhost/automação) nada disto faz nada.
 */
import { useSyncExternalStore } from 'react';
import { Presenca, type Assistindo, type CanalLike, type Resumo, type SocketLike, NOME_CANAL } from './presenca.ts';
import { presencaAtiva, presencaBase, presencaWs } from './presenca-url.ts';
import { readSession, writeSession } from './storage.ts';

const CHAVE_ABA = 'tvlivre:presenca-aba';
const INICIO_MAX_MS = 3000;

let inst: Presenca | null = null;
let agendado = false;
let ultimo: Resumo | null = null;
const ouvintes = new Set<() => void>();

function publicar(r: Resumo | null): void {
  ultimo = r;
  for (const f of ouvintes) f();
}

/** Id aleatório DESTA aba (sessionStorage): só serve para as abas do mesmo navegador conversarem; nunca vai ao serviço. */
function idDaAba(): string {
  const salvo = readSession(CHAVE_ABA);
  if (salvo) return salvo;
  const novo = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  writeSession(CHAVE_ABA, novo);
  return novo;
}

function instancia(): Presenca | null {
  if (inst) return inst;
  const base = presencaBase();
  if (!base || !presencaAtiva() || typeof WebSocket === 'undefined') return null;
  inst = new Presenca({
    wsUrl: presencaWs(base),
    criarSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    criarCanal: () => (typeof BroadcastChannel === 'function' ? (new BroadcastChannel(NOME_CANAL) as unknown as CanalLike) : null),
    locks: typeof navigator !== 'undefined' && navigator.locks ? { request: (nome, cb) => navigator.locks.request(nome, cb) } : null,
    tabId: idDaAba(),
    visivel: () => document.visibilityState === 'visible',
    onResumo: publicar,
  });
  return inst;
}

/** Chamado uma vez pelo App. Conecta só depois da carga da página E de uma interação — ou, no máximo, 3 s depois. */
export function iniciarPresenca(): void {
  if (agendado) return;
  const p = instancia();
  if (!p) return;
  agendado = true;
  let feito = false;
  const eventos = ['pointerdown', 'keydown', 'touchstart'] as const;
  const arrancar = () => {
    if (feito) return;
    feito = true;
    for (const e of eventos) window.removeEventListener(e, arrancar, true);
    p.iniciar();
  };
  const aposCarga = () => {
    for (const e of eventos) window.addEventListener(e, arrancar, { capture: true, passive: true });
    setTimeout(arrancar, INICIO_MAX_MS);
  };
  if (document.readyState === 'complete') aposCarga();
  else window.addEventListener('load', aposCarga, { once: true });

  document.addEventListener('visibilitychange', () => p.visibilidade(document.visibilityState === 'visible'));
  // qualquer interação depois de a presença desistir (5 falhas seguidas) tenta de novo
  for (const e of eventos) window.addEventListener(e, () => p.interagir(), { capture: true, passive: true });
  window.addEventListener('pagehide', () => p.parar());
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && feito) p.iniciar(); // voltou do cache de páginas (bfcache)
  });
}

/** O que esta aba está tocando agora (null = nada). */
export function definirAssistindo(a: Assistindo): void {
  instancia()?.definir(a);
}

/** Último resumo do serviço, ou null (sem serviço, sem conexão ou ainda carregando): a interface simplesmente não mostra nada. */
export function usePresenca(): Resumo | null {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => ultimo,
    () => null,
  );
}
