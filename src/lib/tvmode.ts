import { readString, writeString } from './storage.ts';
import { pickNext, type Dir } from './spatial.ts';

/**
 * Modo TV: interface de 3 metros controlada só pelo controle remoto (setas, OK, Voltar, números, teclas coloridas).
 * Liga sozinho em navegadores de TV (Samsung/Tizen, LG/webOS, Google TV, Fire TV, Chromecast) e pode ser
 * ligado ou desligado à mão (Mais → Modo TV, tecla T, ou ?tv=1 / ?tv=0 no endereço).
 */
export type TvPref = 'auto' | 'ligado' | 'desligado';

const KEY = 'tvlivre:modo-tv';
const TV_UA = /Tizen|Web0S|WebOS|SMART-?TV|NetCast|BRAVIA|HbbTV|CrKey|GoogleTV|AppleTV|AFT[A-Z]+|Android[^)]*\bTV\b/i;

export const detectTv = (ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean => TV_UA.test(ua);

export function getTvPref(): TvPref {
  const v = readString(KEY);
  return v === 'ligado' || v === 'desligado' ? v : 'auto';
}
export const setTvPref = (p: TvPref): void => writeString(KEY, p);

export const resolveTv = (pref: TvPref, detected: boolean = detectTv()): boolean => (pref === 'auto' ? detected : pref === 'ligado');

/**
 * O botão "Sair do modo TV" (sempre visível) aparece quando o modo foi ligado à mão (?tv=1, menu, tecla T, celular).
 * Em uma TV de verdade (detectada sozinha) fica escondido: o controle remoto não clica e o botão só taparia o vídeo.
 */
export const mostrarBotaoSair = (pref: TvPref, detected: boolean = detectTv()): boolean => resolveTv(pref, detected) && pref !== 'auto';

export function applyTv(on: boolean): void {
  document.documentElement.dataset.tv = on ? 'on' : 'off';
}
export const isTvNow = (): boolean => typeof document !== 'undefined' && document.documentElement.dataset.tv === 'on';

/** Antes do primeiro desenho: lê ?tv=1|0 (e some com ele do endereço) e aplica o modo, sem piscar. */
export function initTvMode(): void {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('tv');
    if (q !== null) {
      setTvPref(q === '0' || q === 'off' ? 'desligado' : q === 'auto' ? 'auto' : 'ligado');
      url.searchParams.delete('tv');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  } catch {
    /* sem URL/histórico: segue com a preferência salva */
  }
  applyTv(resolveTv(getTvPref()));
}

// ---------------- teclas do controle remoto ----------------
export type RemoteKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'chup' | 'chdown' | 'red' | 'green' | 'yellow' | 'blue' | 'info';

const BY_KEY: Record<string, RemoteKey> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok',
  Escape: 'back', GoBack: 'back', BrowserBack: 'back',
  ChannelUp: 'chup', ChannelDown: 'chdown', PageUp: 'chup', PageDown: 'chdown',
  ColorF0Red: 'red', ColorF1Green: 'green', ColorF2Yellow: 'yellow', ColorF3Blue: 'blue',
  Info: 'info', Guide: 'info',
};
// Tizen e webOS ainda mandam só o código numérico para várias teclas
const BY_CODE: Record<number, RemoteKey> = { 461: 'back', 10009: 'back', 427: 'chup', 428: 'chdown', 403: 'red', 404: 'green', 405: 'yellow', 406: 'blue', 457: 'info' };

export function remoteKey(e: Pick<KeyboardEvent, 'key' | 'keyCode'>): RemoteKey | null {
  return BY_KEY[e.key] ?? BY_CODE[e.keyCode] ?? null;
}

// ---------------- foco por setas ----------------
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function visible(el: HTMLElement): boolean {
  if (el.closest('[inert], [hidden]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none';
}

/** Move o foco para o vizinho na direção, dentro de `root`. Devolve o novo elemento (ou null se não há para onde ir). */
export function moveFocus(dir: Dir, root: ParentNode): HTMLElement | null {
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
  if (!items.length) return null;
  const active = document.activeElement as HTMLElement | null;
  const from = active && items.includes(active) ? active : null;
  if (!from) {
    items[0]?.focus();
    return items[0] ?? null;
  }
  const target = pickNext(
    from.getBoundingClientRect(),
    items.filter((i) => i !== from).map((ref) => ({ ref, box: ref.getBoundingClientRect() })),
    dir,
  );
  target?.focus();
  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return target;
}
