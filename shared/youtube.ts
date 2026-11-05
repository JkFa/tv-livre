import type { YouTubeRef } from './types.ts';

/** URL do embed oficial (youtube-nocookie) ou null quando o YouTube não permite incorporar. */
export function youtubeEmbedUrl(ref: YouTubeRef | undefined): string | null {
  if (!ref?.embeddable || !ref.id) return null;
  const base = 'https://www.youtube-nocookie.com/embed/';
  if (ref.type === 'video') return `${base}${ref.id}?autoplay=1&rel=0`;
  if (ref.type === 'channel') return `${base}live_stream?channel=${ref.id}&autoplay=1&rel=0`;
  return null;
}
