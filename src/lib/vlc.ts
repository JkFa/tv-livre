import type { Channel } from '../../shared/types.ts';

export type Platform = 'android' | 'ios' | 'desktop';
export type BrowserFamily = 'chrome' | 'edge' | 'brave' | 'opera' | 'firefox' | 'safari' | 'other';

export function platform(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  // iPadOS 13+ se apresenta como Mac, mas tem tela de toque
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

export function browserFamily(): BrowserFamily {
  const ua = navigator.userAgent;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands?.map((b) => b.brand) ?? [];
  if (brands.includes('Brave') || (navigator as Navigator & { brave?: unknown }).brave) return 'brave';
  if (/Edg\//.test(ua) || brands.includes('Microsoft Edge')) return 'edge';
  if (/OPR\//.test(ua) || brands.includes('Opera')) return 'opera';
  if (/Firefox|FxiOS/.test(ua)) return 'firefox';
  if (/Chrome|CriOS|Chromium/.test(ua)) return 'chrome';
  if (/Safari/.test(ua)) return 'safari';
  return 'other';
}

/** O navegador tem a opção "Conteúdo não seguro → Permitir" por site? (só Chromium no computador) */
export function canAllowInsecure(): boolean {
  if (platform() !== 'desktop') return false;
  const b = browserFamily();
  return b === 'chrome' || b === 'edge' || b === 'brave' || b === 'opera';
}

const SCHEME: Partial<Record<BrowserFamily, string>> = { chrome: 'chrome', edge: 'edge', brave: 'brave', opera: 'opera' };

/** Endereço da página de configurações do site (não dá para abrir por link: precisa ser colado na barra). */
export function siteSettingsAddress(): string | null {
  const scheme = SCHEME[browserFamily()];
  if (!scheme || !canAllowInsecure()) return null;
  return `${scheme}://settings/content/siteDetails?site=${encodeURIComponent(window.location.origin)}`;
}

/**
 * Link que abre o canal direto no VLC do celular, sem copiar nada:
 *  - Android: intent do Android dirigido ao pacote do VLC (se faltar, o Chrome leva à Play Store);
 *  - iPhone/iPad: esquema x-callback do VLC para iOS.
 * No computador não existe link universal: usamos o arquivo .m3u (ver `m3uBlobUrl`).
 */
export function vlcHref(ch: Pick<Channel, 'url' | 'name'>, p: Platform = platform()): string | null {
  const m = /^(https?):\/\/([^#]*)/i.exec(ch.url);
  if (!m) return null;
  const [, proto = 'http', rest = ''] = m;
  if (p === 'android') {
    const scheme = proto.toLowerCase();
    return `intent://${rest}#Intent;scheme=${scheme};action=android.intent.action.VIEW;type=video/*;package=org.videolan.vlc;S.title=${encodeURIComponent(ch.name)};end`;
  }
  if (p === 'ios') return `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(ch.url)}`;
  return null;
}

/** Playlist .m3u de um canal só: o VLC (e a maioria dos players) abre com dois cliques, sem copiar e colar. */
export function m3uText(ch: Pick<Channel, 'url' | 'name'>): string {
  const title = ch.name.replace(/[\r\n,]+/g, ' ');
  return `#EXTM3U\n#EXTINF:-1,${title}\n${ch.url}\n`;
}

export function m3uFileName(ch: Pick<Channel, 'name'>): string {
  const slug = ch.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'canal'}.m3u`;
}

/** Baixa o .m3u do canal. */
export function downloadM3u(ch: Pick<Channel, 'url' | 'name'>): void {
  const blob = new Blob([m3uText(ch)], { type: 'audio/x-mpegurl' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = m3uFileName(ch);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
