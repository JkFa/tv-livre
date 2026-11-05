import type { StreamKind } from '../../shared/types.ts';
import { isYouTubeUrl } from './youtube.ts';

/**
 * Classifica um link pela URL (antes de qualquer teste de rede):
 *  - youtube: qualquer link do YouTube
 *  - http:    qualquer link http:// (o navegador bloqueia conteúdo misto numa página HTTPS)
 *  - hls:     https:// com manifesto .m3u8
 *  - other:   rtmp, rtsp, srt, páginas de Twitch/Dailymotion, https sem .m3u8…
 */
export function classifyUrl(raw: string): StreamKind {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'other';
  }
  if (isYouTubeUrl(raw)) return 'youtube';
  if (u.protocol === 'http:') return 'http';
  if (u.protocol === 'https:') return /\.m3u8?(?:$|[/?#;])/i.test(u.pathname + u.search) ? 'hls' : 'other';
  return 'other';
}
