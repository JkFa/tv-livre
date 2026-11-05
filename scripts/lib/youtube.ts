import type { YouTubeRef } from '../../shared/types.ts';

const VIDEO_ID = /^[\w-]{11}$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const YT_HOSTS = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;

export function isYouTubeUrl(raw: string): boolean {
  try {
    return YT_HOSTS.test(new URL(raw).hostname);
  } catch {
    return false;
  }
}

/** Interpreta um link do YouTube. Só vídeo e channel/UC… têm embed oficial; @handle, /c/ e /user/ não. */
export function parseYouTube(raw: string): YouTubeRef | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!YT_HOSTS.test(u.hostname)) return null;

  const parts = u.pathname.split('/').filter(Boolean);
  const first = parts[0] ?? '';

  if (u.hostname.toLowerCase() === 'youtu.be') {
    return VIDEO_ID.test(first) ? { type: 'video', id: first, embeddable: true } : { type: 'other', embeddable: false };
  }
  const v = u.searchParams.get('v');
  if (first === 'watch' && v && VIDEO_ID.test(v)) return { type: 'video', id: v, embeddable: true };
  if ((first === 'live' || first === 'embed' || first === 'shorts') && VIDEO_ID.test(parts[1] ?? '')) {
    return { type: 'video', id: parts[1], embeddable: true };
  }
  if (first === 'channel' && CHANNEL_ID.test(parts[1] ?? '')) {
    return { type: 'channel', id: parts[1], embeddable: true };
  }
  if (first.startsWith('@') || first === 'c' || first === 'user') {
    return { type: 'handle', embeddable: false };
  }
  return { type: 'other', embeddable: false };
}
