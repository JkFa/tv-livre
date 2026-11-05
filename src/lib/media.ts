import { useEffect, useRef } from 'react';

const BASE = import.meta.env.BASE_URL;

interface Meta {
  title: string;
  artist: string;
  logo?: string;
}
interface Handlers {
  play: () => void;
  pause: () => void;
  previous: () => void;
  next: () => void;
}

/** Media Session: título na tela de bloqueio/notificação e botões de mídia mapeados para trocar de canal. */
export function useMediaSession(meta: Meta | null, handlers: Handlers): void {
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });
  const title = meta?.title;
  const artist = meta?.artist;
  const logo = meta?.logo;
  useEffect(() => {
    if (!('mediaSession' in navigator) || !title) return;
    const ms = navigator.mediaSession;
    try {
      const artwork: MediaImage[] = [];
      if (logo) artwork.push({ src: logo });
      artwork.push({ src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png' });
      ms.metadata = new MediaMetadata({ title, artist, album: 'Ao vivo', artwork });
      ms.setActionHandler('play', () => h.current.play());
      ms.setActionHandler('pause', () => h.current.pause());
      ms.setActionHandler('previoustrack', () => h.current.previous());
      ms.setActionHandler('nexttrack', () => h.current.next());
    } catch {
      /* ação não suportada neste navegador */
    }
    return () => {
      try {
        for (const a of ['play', 'pause', 'previoustrack', 'nexttrack'] as const) ms.setActionHandler(a, null);
      } catch {
        /* nada */
      }
    };
  }, [title, artist, logo]);
}

/** Mantém a tela ligada enquanto o vídeo toca (e reobtém o bloqueio ao voltar para a aba). */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelled) void s.release();
        else sentinel = s;
      } catch {
        /* bateria fraca ou sem permissão: segue sem */
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
