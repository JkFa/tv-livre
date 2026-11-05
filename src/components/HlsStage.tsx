import { useEffect, useRef, type RefObject } from 'react';
import type { Channel } from '../../shared/types.ts';
import { diagnose, type Cause, type HlsErrorLike } from '../lib/diagnose.ts';

export type StageState =
  | { phase: 'loading' }
  | { phase: 'buffering' }
  | { phase: 'playing' }
  | { phase: 'reconnecting' }
  | { phase: 'error'; cause: Cause; detail: string };

interface Props {
  channel: Pick<Channel, 'url' | 'status' | 'geo'>;
  /** Só carrega o vídeo depois de uma ação do usuário (ou quando o app já foi "ligado"). */
  active: boolean;
  /** Incrementa para tentar de novo. */
  attempt: number;
  muted: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onState: (s: StageState) => void;
  onPausedChange: (paused: boolean) => void;
}

const LOAD_TIMEOUT_MS = 25_000;
const MAX_RECONNECTS = 3;

type HlsInstance = import('hls.js').default;

/**
 * Motor de reprodução HLS:
 *  - hls.js onde há MediaSource; HLS nativo (<video src>) no Safari do iPhone e similares;
 *  - autoplay bloqueado não quebra a interface (o vídeo fica pausado e o usuário aperta play);
 *  - cai/volta a rede, ou o app volta do segundo plano → retoma sozinho.
 */
export function HlsStage({ channel, active, attempt, muted, videoRef, onState, onPausedChange }: Props) {
  const cb = useRef({ onState, onPausedChange, channel });
  useEffect(() => {
    cb.current = { onState, onPausedChange, channel };
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
  }, [muted, videoRef]);

  const url = channel.url;
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return;

    let disposed = false;
    let hls: HlsInstance | null = null;
    let HlsCtor: typeof import('hls.js').default | null = null;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let bufferTimer: ReturnType<typeof setTimeout> | undefined;
    let started = false;
    let reconnects = 0;
    let mediaRecovered = false;
    let native = false;
    let wasPlayingBeforeHide = false;

    const emit = (s: StageState) => {
      if (!disposed) cb.current.onState(s);
    };
    const fail = (cause: Cause, detail = '') => {
      clearTimeout(loadTimer);
      clearTimeout(bufferTimer);
      if (!disposed) {
        hls?.stopLoad();
        emit({ phase: 'error', cause, detail });
      }
    };
    const ready = () => {
      clearTimeout(loadTimer);
      clearTimeout(bufferTimer);
      started = true;
      reconnects = 0;
      emit({ phase: 'playing' });
    };
    const tryPlay = () =>
      video.play().catch((e: unknown) => {
        // Autoplay barrado pelo navegador não é falha do canal: mostramos o vídeo pausado.
        if ((e as { name?: string })?.name === 'NotAllowedError') ready();
      });

    const teardown = () => {
      hls?.destroy();
      hls = null;
    };

    const reconnect = (why: string) => {
      if (disposed) return;
      if (!navigator.onLine) return fail('device', why);
      if (reconnects >= MAX_RECONNECTS) {
        return fail(diagnose({ type: 'networkError' }, cb.current.channel), `${why} (sem sucesso após ${MAX_RECONNECTS} tentativas)`);
      }
      reconnects++;
      emit({ phase: 'reconnecting' });
      teardown();
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(init, 1200 * reconnects);
    };

    const onWaiting = () => {
      clearTimeout(bufferTimer);
      bufferTimer = setTimeout(() => started && emit({ phase: 'buffering' }), 700);
    };
    const onPlaying = () => ready();
    const onPlay = () => cb.current.onPausedChange(false);
    const onPause = () => cb.current.onPausedChange(true);
    const onNativeError = () => (started ? reconnect('erro do vídeo') : fail('media', `video.error ${video.error?.code ?? ''}`));

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    const init = () => {
      if (disposed) return;
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => fail('timeout'), LOAD_TIMEOUT_MS);
      if (native) {
        video.src = url;
        void tryPlay();
        return;
      }
      if (!HlsCtor) return;
      const inst = new HlsCtor({
        manifestLoadingMaxRetry: 1,
        levelLoadingMaxRetry: 1,
        fragLoadingMaxRetry: 2,
        manifestLoadingTimeOut: 15_000,
        // reduz consumo em 4G: começa pela qualidade mais baixa que caiba na banda
        startLevel: -1,
        capLevelToPlayerSize: true,
      });
      hls = inst;
      inst.on(HlsCtor.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        const d = data as HlsErrorLike;
        if (!navigator.onLine) return started ? reconnect('sem internet') : fail('device', `${data.type} / ${data.details}`);
        if (started) {
          if (d.type === 'mediaError' && !mediaRecovered) {
            mediaRecovered = true;
            inst.recoverMediaError();
            return;
          }
          return reconnect(`${data.type} / ${data.details}`);
        }
        fail(diagnose(d, cb.current.channel), `${data.type} / ${data.details}`);
      });
      inst.on(HlsCtor.Events.MANIFEST_PARSED, () => void tryPlay());
      inst.loadSource(url);
      inst.attachMedia(video);
    };

    emit({ phase: 'loading' });
    (async () => {
      try {
        const mod = await import('hls.js');
        HlsCtor = mod.default;
      } catch {
        return fail('unknown', 'Não foi possível carregar o player (hls.js)');
      }
      if (disposed) return;
      if (!HlsCtor.isSupported() && video.canPlayType('application/vnd.apple.mpegurl')) {
        native = true;
        video.addEventListener('error', onNativeError);
      } else if (!HlsCtor.isSupported()) {
        return fail('media', 'Este navegador não suporta HLS');
      }
      init();
    })();

    // Volta do segundo plano: retoma a transmissão e pula para o ao vivo
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        wasPlayingBeforeHide = !video.paused;
        return;
      }
      if (!started || !wasPlayingBeforeHide) return;
      hls?.startLoad(-1);
      const live = hls?.liveSyncPosition;
      if (live && Number.isFinite(live)) video.currentTime = live;
      void tryPlay();
    };
    // Voltou a internet: se estávamos caídos, tenta de novo
    const onOnline = () => {
      if (disposed) return;
      reconnects = 0;
      if (started) reconnect('rede restabelecida');
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      disposed = true;
      clearTimeout(loadTimer);
      clearTimeout(reconnectTimer);
      clearTimeout(bufferTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('error', onNativeError);
      teardown();
      video.removeAttribute('src');
      video.load();
    };
  }, [url, active, attempt, videoRef]);

  return <video ref={videoRef} playsInline muted={muted} preload="none" aria-label="Vídeo do canal" disablePictureInPicture={false} />;
}
