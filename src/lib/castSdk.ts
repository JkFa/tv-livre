/* eslint-disable @typescript-eslint/no-explicit-any -- o SDK do Google Cast não tem tipos oficiais; falamos com ele por duck typing */
import type { CastMedia } from './cast.ts';

/**
 * Google Cast (Chromecast/Google TV) com o Default Media Receiver. O SDK do Google **só é baixado quando o usuário
 * toca em "Transmitir"** (ou ao recarregar com uma transmissão que ele mesmo começou): nenhum script de terceiros
 * é carregado na abertura do site.
 */
export const SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
export const FLAG_ATIVO = 'tvlivre:transmitindo';

export type EstadoCast = 'sem-aparelho' | 'disponivel' | 'conectando' | 'conectado';
export interface InfoCast {
  estado: EstadoCast;
  aparelho: string | null;
  volume: number;
  mudo: boolean;
}
export type ResultadoCarga = { ok: true } | { ok: false; codigo: string };

const w = (): any => window as any;
let sdk: Promise<boolean> | null = null;
let iniciado = false;
const ouvintes = new Set<(i: InfoCast) => void>();

/** Baixa o SDK uma única vez. Resolve `false` se o navegador/rede não deixar (extensão, Brave sem Media Router, offline). */
export function carregarSdk(): Promise<boolean> {
  if (w().cast?.framework && w().chrome?.cast) return Promise.resolve(true);
  sdk ??= new Promise<boolean>((resolve) => {
    const fim = (ok: boolean) => {
      if (!ok) sdk = null; // permite tentar de novo
      resolve(ok);
    };
    const timer = setTimeout(() => fim(false), 15_000);
    w().__onGCastApiAvailable = (ok: boolean) => {
      clearTimeout(timer);
      fim(ok && !!w().cast?.framework);
    };
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onerror = () => {
      clearTimeout(timer);
      fim(false);
    };
    document.head.appendChild(s);
  });
  return sdk;
}

const ctx = (): any => w().cast.framework.CastContext.getInstance();
const sessao = (): any => ctx().getCurrentSession();

function estadoDe(castState: string): EstadoCast {
  return castState === 'CONNECTED' ? 'conectado' : castState === 'CONNECTING' ? 'conectando' : castState === 'NO_DEVICES_AVAILABLE' ? 'sem-aparelho' : 'disponivel';
}

export function infoAtual(): InfoCast {
  if (!w().cast?.framework) return { estado: 'disponivel', aparelho: null, volume: 1, mudo: false };
  const c = ctx();
  const s = sessao();
  return {
    estado: estadoDe(c.getCastState()),
    aparelho: s?.getCastDevice?.()?.friendlyName ?? null,
    volume: typeof s?.getVolume === 'function' ? (s.getVolume() ?? 1) : 1,
    mudo: !!s?.isMute?.(),
  };
}
const avisar = () => ouvintes.forEach((l) => l(infoAtual()));

/** Configura o contexto (idempotente). Só depois de `carregarSdk()`. */
export function iniciarCast(): void {
  if (iniciado || !w().cast?.framework) return;
  iniciado = true;
  const f = w().cast.framework;
  ctx().setOptions({
    receiverApplicationId: w().chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: w().chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED, // retoma a sessão ao recarregar a página
  });
  ctx().addEventListener(f.CastContextEventType.CAST_STATE_CHANGED, avisar);
  ctx().addEventListener(f.CastContextEventType.SESSION_STATE_CHANGED, avisar);
}

export function assinar(l: (i: InfoCast) => void): () => void {
  ouvintes.add(l);
  return () => void ouvintes.delete(l);
}

/** Abre o seletor de aparelhos do Chrome. Resolve quando há sessão ou o usuário cancela. */
export async function abrirSeletor(): Promise<void> {
  try {
    await ctx().requestSession();
  } catch {
    /* cancelado ou sem aparelho: o estado já reflete */
  }
  avisar();
}

/** Manda o canal para o receptor. Cada troca de canal é um novo `loadMedia`. */
export async function carregarMidia(m: CastMedia): Promise<ResultadoCarga> {
  const s = sessao();
  if (!s) return { ok: false, codigo: 'SESSION_ERROR' };
  const c = w().chrome.cast;
  const media = new c.media.MediaInfo(m.url, m.contentType);
  media.streamType = c.media.StreamType.LIVE;
  const meta = new c.media.GenericMediaMetadata();
  meta.title = m.title;
  meta.subtitle = m.subtitle;
  meta.images = [new c.Image(m.image)];
  media.metadata = meta;
  const req = new c.media.LoadRequest(media);
  req.autoplay = true;
  try {
    const err = await s.loadMedia(req); // undefined = sucesso; senão o código do erro
    return err ? { ok: false, codigo: String(err) } : { ok: true };
  } catch (e) {
    return { ok: false, codigo: typeof e === 'string' ? e : ((e as { code?: string })?.code ?? 'LOAD_FAILED') };
  }
}

export function parar(): void {
  try {
    ctx().endCurrentSession(true);
  } catch {
    /* já encerrada */
  }
  avisar();
}

export async function definirVolume(v: number): Promise<void> {
  try {
    await sessao()?.setVolume(Math.min(1, Math.max(0, v)));
  } catch {
    /* receptor ocupado */
  }
  avisar();
}
export async function definirMudo(m: boolean): Promise<void> {
  try {
    await sessao()?.setMute(m);
  } catch {
    /* receptor ocupado */
  }
  avisar();
}
