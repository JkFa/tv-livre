import { readJson, readString, writeJson, writeString } from './storage.ts';
import type { ChannelRef } from './library.ts';
import { parseVolume, serializeVolume } from './volume.ts';

// As chaves de favoritos, recentes e país (tvlivre:favoritos / :recentes / :pais) seguem em library.ts e App.tsx.
const LAST_KEY = 'tvlivre:ultimo';
const THEME_KEY = 'tvlivre:tema';
const MUTED_KEY = 'tvlivre:mudo';
const VOLUME_KEY = 'tvlivre:volume';
const HIDE_OFFLINE_KEY = 'tvlivre:ocultar-fora';
const INSTALL_KEY = 'tvlivre:instalar-dispensado';
const SWIPE_HINT_KEY = 'tvlivre:dica-deslizar';

export type ThemePref = 'auto' | 'claro' | 'escuro';

export function getLastChannel(): ChannelRef | null {
  const v = readJson<Partial<ChannelRef> | null>(LAST_KEY, null);
  return v && typeof v.id === 'string' && typeof v.country === 'string' ? { id: v.id, country: v.country } : null;
}
export const setLastChannel = (ref: ChannelRef): void => void writeJson(LAST_KEY, ref);

/** O padrão é o tema claro; "escuro" e "automático" (segue o sistema) só valem se o usuário os escolheu. */
export function getTheme(): ThemePref {
  const v = readString(THEME_KEY);
  return v === 'escuro' || v === 'auto' ? v : 'claro';
}

/** O tema que está na tela agora é o escuro? ("auto" segue o sistema.) */
export const isDarkNow = (pref: ThemePref): boolean => pref === 'escuro' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  root.dataset.theme = pref === 'claro' ? 'light' : pref === 'escuro' ? 'dark' : 'auto';
  const dark = pref === 'escuro' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#15110e' : '#efe6d2');
}
export function setTheme(pref: ThemePref): void {
  writeString(THEME_KEY, pref);
  applyTheme(pref);
}

export const getMuted = (): boolean => readString(MUTED_KEY) === '1';
export const setMuted = (m: boolean): void => writeString(MUTED_KEY, m ? '1' : '0');

/** Volume do player, de 0 a 1 (salvo como inteiro de 0 a 100). Sem valor salvo: volume máximo. */
export const getVolume = (): number => parseVolume(readString(VOLUME_KEY));
export const setVolume = (v: number): void => writeString(VOLUME_KEY, serializeVolume(v));

/** "Ocultar canais fora do ar": desligado por padrão (eles ficam no fim da lista). */
export const getHideOffline = (): boolean => readString(HIDE_OFFLINE_KEY) === '1';
export const setHideOffline = (on: boolean): void => writeString(HIDE_OFFLINE_KEY, on ? '1' : '0');

/** O convite de instalação dispensado só volta depois de 30 dias. */
export function installDismissed(now = Date.now()): boolean {
  const at = Number(readString(INSTALL_KEY));
  return Number.isFinite(at) && at > 0 && now - at < 30 * 24 * 3600 * 1000;
}
export const dismissInstall = (): void => writeString(INSTALL_KEY, String(Date.now()));

export const swipeHintSeen = (): boolean => readString(SWIPE_HINT_KEY) === '1';
export const markSwipeHintSeen = (): void => writeString(SWIPE_HINT_KEY, '1');
