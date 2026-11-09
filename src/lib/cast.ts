import type { Channel } from '../../shared/types.ts';
import { channelKey, formatNumber } from './lineup.ts';

/**
 * Transmitir para a TV (Chromecast/Google TV). O receptor do Chromecast é um app web: pede o vídeo com as mesmas
 * regras do hls.js, então só HLS em HTTPS, com CORS, sem cabeçalhos especiais. Nada de contornar (sem proxy).
 */
export function podeTransmitir(ch: Pick<Channel, 'kind' | 'url' | 'cors' | 'needsHeaders'>): boolean {
  return ch.kind === 'hls' && /^https:\/\//i.test(ch.url) && ch.cors !== false && ch.needsHeaders !== true;
}

/** Canal do YouTube: o embed oficial já tem o próprio botão de transmitir (não usamos o nosso). */
export const eYouTube = (ch: Pick<Channel, 'kind'>): boolean => ch.kind === 'youtube';

/**
 * Próximo/anterior canal que dá para transmitir, dando a volta na lista. Os que não dão ficam em `puladas`
 * (na ordem em que foram passados), para a tela avisar "canal X não pode ser transmitido, pulando".
 * Nunca para em canal fora do ar.
 */
export function proximoTransmissivel(
  list: readonly Channel[],
  currentKey: string | null,
  dir: 1 | -1,
): { canal: Channel | null; puladas: Channel[] } {
  const puladas: Channel[] = [];
  if (!list.length) return { canal: null, puladas };
  const start = currentKey ? list.findIndex((c) => channelKey(c) === currentKey) : -1;
  const origin = start === -1 ? (dir === 1 ? -1 : 0) : start;
  for (let i = 1; i <= list.length; i++) {
    const c = list[(((origin + dir * i) % list.length) + list.length) % list.length];
    if (!c || channelKey(c) === currentKey || c.status === 'offline') continue;
    if (podeTransmitir(c)) return { canal: c, puladas };
    puladas.push(c);
  }
  return { canal: null, puladas };
}

/** "Canal 12 não pode ser transmitido, pulando" (uma ou várias). */
export function avisoPulo(puladas: readonly Channel[], numeros: Map<string, number>): string {
  if (!puladas.length) return '';
  const nome = (c: Channel) => `${formatNumber(numeros.get(channelKey(c)))} ${c.name}`;
  if (puladas.length === 1) return `Canal ${nome(puladas[0]!)} não pode ser transmitido, pulando.`;
  return `${puladas.length} canais não podem ser transmitidos, pulando (${nome(puladas[0]!)} e outros).`;
}

export interface CastMedia {
  url: string;
  contentType: 'application/x-mpegURL';
  title: string;
  subtitle: string;
  /** Logo do canal só se for https; senão o ícone do app. */
  image: string;
}

/** Metadados enviados ao receptor: título "07 · Nome", subtítulo = programa atual ou país. */
export function castMedia(ch: Channel, numero: string, opts: { programa?: string | undefined; pais: string; iconUrl: string }): CastMedia {
  return {
    url: ch.url,
    contentType: 'application/x-mpegURL',
    title: `${numero} · ${ch.name}`,
    subtitle: opts.programa || opts.pais,
    image: ch.logo && /^https:\/\//i.test(ch.logo) ? ch.logo : opts.iconUrl,
  };
}

// ---------------- detecção do navegador ----------------
type NavLike = { userAgent?: string; brave?: unknown; userAgentData?: { brands?: { brand: string }[] } };

/** Chrome, Edge, Brave, Opera, Samsung Internet… (o SDK do Cast só existe no Chromium). */
export function eChromium(nav: NavLike = navigator as unknown as NavLike): boolean {
  const brands = nav.userAgentData?.brands?.map((b) => b.brand) ?? [];
  if (brands.some((b) => /chromium/i.test(b))) return true;
  const ua = nav.userAgent ?? '';
  return /Chrome\/|CriOS\//.test(ua) && !/Edge?\/12|Firefox|FxiOS/.test(ua) && !/iPhone|iPad|iPod/.test(ua);
}
export const eBrave = (nav: NavLike = navigator as unknown as NavLike): boolean => !!nav.brave;
