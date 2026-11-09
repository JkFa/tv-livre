import { useEffect, useRef, type RefObject } from 'react';
import type { HlsConfig, LoaderCallbacks, LoaderConfiguration, LoaderContext } from 'hls.js';
import type { Channel } from '../../shared/types.ts';
import { diagnose, type Cause, type HlsErrorLike } from '../lib/diagnose.ts';
import { buildPlan, caps as readCaps, isHttpUrl, setHttpOk, toHttps, type Engine, type Step } from '../lib/playback.ts';

export type StageState =
  | { phase: 'loading' }
  | { phase: 'buffering' }
  | { phase: 'playing' }
  | { phase: 'reconnecting' }
  | { phase: 'error'; cause: Cause; detail: string };

interface Props {
  channel: Pick<Channel, 'url' | 'status' | 'geo' | 'cors' | 'needsHeaders'>;
  /** "Tentar mesmo assim": tenta o hls.js mesmo com o aviso de CORS. */
  force?: boolean;
  /** Só carrega o vídeo depois de uma ação do usuário (ou quando o app já foi "ligado"). */
  active: boolean;
  /** Incrementa para tentar de novo. */
  attempt: number;
  muted: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onState: (s: StageState) => void;
  onPausedChange: (paused: boolean) => void;
  /** AirPlay: só HLS nativo (o AirPlay não funciona com MediaSource). Voltar a `false` restaura o motor anterior. */
  nativeOnly?: boolean;
  /** Motor da tentativa em uso (para o player saber se o AirPlay já pode abrir o seletor). */
  onEngine?: (e: Engine) => void;
}

const MAX_RECONNECTS = 3;

type HlsInstance = import('hls.js').default;

/**
 * Motor de reprodução HLS. Executa o plano de `lib/playback.ts`, uma tentativa depois da outra, sem o usuário ver:
 *  - hls.js onde há MediaSource; HLS nativo (<video src>) quando o servidor não manda CORS ou o hls.js não dá conta;
 *  - canal em HTTP: primeiro o mesmo endereço por HTTPS, depois HTTP direto (que só passa se o usuário liberou);
 *  - autoplay bloqueado não quebra a interface (o vídeo fica pausado e o usuário aperta play);
 *  - cai/volta a rede, ou o app volta do segundo plano → retoma sozinho.
 */
export function HlsStage({ channel, force = false, active, attempt, muted, videoRef, onState, onPausedChange, nativeOnly = false, onEngine }: Props) {
  const cb = useRef({ onState, onPausedChange, channel, onEngine });
  useEffect(() => {
    cb.current = { onState, onPausedChange, channel, onEngine };
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
  }, [muted, videoRef]);

  const url = channel.url;
  const cors = channel.cors;
  const needsHeaders = channel.needsHeaders;
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
    let wasPlayingBeforeHide = false;
    let steps: Step[] = [];
    let stepIdx = 0;
    const capsNow = readCaps();

    const step = (): Step | undefined => steps[stepIdx];
    const emit = (s: StageState) => {
      if (!disposed) cb.current.onState(s);
    };

    /** Falhas sem resposta do servidor, num canal HTTP dentro de página HTTPS, são o bloqueio de conteúdo misto. */
    const finalCause = (cause: Cause): Cause => {
      const ch = cb.current.channel;
      const blockedLike = cause === 'cors' || cause === 'media' || cause === 'unknown';
      if (isHttpUrl(url) && capsNow.pageSecure && !capsNow.httpOk && blockedLike) {
        return ch.status === 'offline' ? 'offline' : 'mixed';
      }
      return cause;
    };

    const fail = (cause: Cause, detail = '') => {
      if (disposed) return;
      clearTimeout(loadTimer);
      clearTimeout(bufferTimer);
      const cur = step();
      // Resposta real do servidor (404, 403…) ou lentidão no endereço original não melhora com outro motor.
      const stop = cause === 'device' || (!cur?.upgrade && (cause === 'offline' || cause === 'geo' || cause === 'timeout'));
      if (!started && !stop && stepIdx + 1 < steps.length) {
        stepIdx++;
        reconnects = 0;
        teardown();
        init();
        return;
      }
      hls?.stopLoad();
      const final = started ? cause : finalCause(cause);
      if (final === 'mixed') setHttpOk(false);
      emit({ phase: 'error', cause: final, detail });
    };
    const ready = () => {
      clearTimeout(loadTimer);
      clearTimeout(bufferTimer);
      started = true;
      reconnects = 0;
      if (step()?.insecure) setHttpOk(true); // HTTP puro tocou: o usuário liberou; lembramos para ir direto da próxima vez
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
      video.removeAttribute('src');
      video.load();
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
    // Só o HLS nativo usa o erro do <video> como falha de rede; no hls.js, quem trata é o próprio hls.js.
    const onVideoError = () => {
      if (step()?.engine !== 'native') return;
      if (started) reconnect('erro do vídeo');
      else fail('media', `video.error ${video.error?.code ?? ''}`);
    };

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('error', onVideoError);

    const startHls = (s: Step) => {
      if (!HlsCtor) return fail('unknown', 'hls.js indisponível');
      const Ctor = HlsCtor;
      const cfg: Partial<HlsConfig> = {
        manifestLoadingMaxRetry: 1,
        levelLoadingMaxRetry: 1,
        fragLoadingMaxRetry: 2,
        manifestLoadingTimeOut: 15_000,
        // reduz consumo em 4G: começa pela qualidade mais baixa que caiba na banda
        startLevel: -1,
        capLevelToPlayerSize: true,
      };
      if (s.upgrade) {
        // lista e trechos: qualquer endereço http: dentro da lista passa a https:
        const Base = Ctor.DefaultConfig.loader;
        cfg.loader = class UpgradeLoader extends Base {
          load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>) {
            context.url = toHttps(context.url);
            super.load(context, config, callbacks);
          }
        };
      }
      const inst = new Ctor(cfg);
      hls = inst;
      inst.on(Ctor.Events.ERROR, (_e, data) => {
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
      inst.on(Ctor.Events.MANIFEST_PARSED, () => void tryPlay());
      inst.loadSource(s.url);
      inst.attachMedia(video);
    };

    const init = () => {
      const s = step();
      if (disposed) return;
      if (!s) return fail('cors', 'sem forma de tocar neste navegador');
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => fail('timeout'), s.budgetMs);
      cb.current.onEngine?.(s.engine);
      if (s.engine === 'native') {
        video.src = s.url;
        void tryPlay();
        return;
      }
      startHls(s);
    };

    emit({ phase: 'loading' });
    (async () => {
      let mse: boolean;
      try {
        const mod = await import('hls.js');
        HlsCtor = mod.default;
        mse = HlsCtor.isSupported();
      } catch {
        mse = false; // sem hls.js ainda dá para tentar o HLS nativo
      }
      if (disposed) return;
      steps = buildPlan({ url, cors, needsHeaders: force ? false : needsHeaders }, { ...capsNow, mse }, { force, nativeOnly });
      if (!steps.length) return fail(mse ? 'cors' : 'media', mse ? 'sem forma de tocar neste canal' : 'Este navegador não suporta HLS');
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
      video.removeEventListener('error', onVideoError);
      teardown();
    };
  }, [url, cors, needsHeaders, force, active, attempt, videoRef, nativeOnly]);

  return <video ref={videoRef} playsInline muted={muted} preload="none" aria-label="Vídeo do canal" disablePictureInPicture={false} x-webkit-airplay="allow" />;
}
