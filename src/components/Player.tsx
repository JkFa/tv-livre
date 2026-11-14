import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Airplay, Cast, ChevronLeft, ChevronRight, Download, ExternalLink, Maximize, Maximize2, Minimize, Pause, PictureInPicture2, Play, Power,
  RotateCw, ScreenShare, Share2, ShieldCheck, Shuffle, Star, Volume1, Volume2, VolumeX, WifiOff, X,
} from 'lucide-react';
import { MIN_PUBLICO, textoCanal } from '../lib/presenca-ui.ts';
import type { Channel } from '../../shared/types.ts';
import { youtubeEmbedUrl } from '../../shared/youtube.ts';
import { castMedia, podeTransmitir } from '../lib/cast.ts';
import { copyText } from '../lib/clipboard.ts';
import { useGuide } from '../lib/epg.ts';
import { diagnoseCast } from '../lib/diagnose.ts';
import type { CastController } from '../lib/useCast.ts';
import { programaAgora, temGuia } from '../lib/programa.ts';
import { ConsumoSessao, conexaoFraca, dicaDadosDispensada, dispensarDicaDados, type InfoConsumo, type ModoAudio } from '../lib/modo.ts';
import { getTimerPadrao, type OpcaoTimer } from '../lib/timer.ts';
import { useSleepTimer } from '../lib/useSleepTimer.ts';
import { useAirPlay, useRemotePlayback } from '../lib/transporte.ts';
import { categoryLabel, countryName } from '../lib/labels.ts';
import { CAUSAS_CAST, CAUSES, UNSUPPORTED, type UnsupportedWhy } from '../lib/messages.ts';
import { getMuted, getVolume, markSwipeHintSeen, setMuted as saveMuted, setVolume as saveVolume, swipeHintSeen } from '../lib/prefs.ts';
import { clearLocalFailure, recordLocalFailure } from '../lib/local-failures.ts';
import { applySlider, sliderValue, toggleMuted, VOLUME_STEP, volumeIcon, volumeSettable, type Sound } from '../lib/volume.ts';
import { caps, isPlayableHere, unsupportedReason, type Engine } from '../lib/playback.ts';
import { isTvNow } from '../lib/tvmode.ts';
import { canAllowInsecure, downloadM3u, platform, siteSettingsAddress, vlcHref } from '../lib/vlc.ts';
import { useMediaSession, useWakeLock } from '../lib/media.ts';
import { ChannelBadges, CountryTag, StatusMark } from './Badges.tsx';
import { CastPanel, type CastErro } from './CastPanel.tsx';
import { ChannelLogo } from './ChannelLogo.tsx';
import { GuideStrip } from './Guide.tsx';
import { DataTip } from './DataTip.tsx';
import { ModeBar } from './ModeBar.tsx';
import { RadioScreen } from './RadioScreen.tsx';
import { TimerSheet } from './TimerSheet.tsx';
import { HlsStage, type StageState } from './HlsStage.tsx';
import { Sheet } from './Sheet.tsx';
import { Mark } from './Mark.tsx';
import { TestCard } from './TestCard.tsx';
import type { Cause } from '../lib/diagnose.ts';

export interface Neighbor {
  number: string;
  name: string;
}

interface Props {
  channel: Channel | null;
  number: string;
  /** Canal para retomar quando nada está sintonizado (último assistido). */
  resume: { number: string; name: string } | null;
  /** Já houve uma ação do usuário: pode carregar vídeo. */
  armed: boolean;
  onArm: () => void;
  onPower: () => void;
  online: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onZap: (dir: 1 | -1) => void;
  prev: Neighbor | null;
  next: Neighbor | null;
  suggestions: Channel[];
  onPick: (c: Channel) => void;
  onPlayingChange: (playing: boolean) => void;
  digits: string;
  onShare: () => void;
  /** Transmissão para Chromecast/Google TV (o SDK só é baixado quando o usuário toca em Transmitir). */
  cast: CastController;
  /** Avisos curtos (toast). */
  onAviso: (msg: string) => void;
  /** Estado da mídia para o controle remoto pelo celular. */
  onMidia?: (m: { tocando: boolean; mudo: boolean; volume: number; erro?: string | undefined }) => void;
  /** Normal, Econômico ou Rádio (preferência `tvlivre:modo-audio`). */
  modo: ModoAudio;
  onModo: (m: ModoAudio) => void;
  /** Quantas pessoas assistem ESTE canal agora (o serviço só informa com 3 ou mais; null = não mostrar). */
  assistindoCanal?: number | null;
  /** Mini-player: o MESMO player (mesmo <video>), reduzido a uma janela fixa enquanto o usuário navega por outras telas. */
  mini?: boolean;
  onExpand?: () => void;
  onClose?: () => void;
  /** Zapear (sorteio único de lib/zapear.ts); no mini-player o sorteado entra na própria janela. */
  onShuffle?: () => void;
}

/** Soma dos bytes reais dos trechos baixados nesta sessão (vale para todos os canais até recarregar a página). */
const consumoSessao = new ConsumoSessao();

type Mode = 'hls' | 'embed' | 'youtube-link' | 'unsupported';

function pickMode(ch: Channel): { mode: Mode; why?: UnsupportedWhy } {
  if (ch.kind === 'youtube') return { mode: ch.youtube?.embeddable ? 'embed' : 'youtube-link' };
  // HTTP, falta de CORS etc. não são mais "não toca": o HlsStage tenta HTTPS, HLS nativo e HTTP em sequência.
  const why = unsupportedReason(ch, caps());
  return why ? { mode: 'unsupported', why } : { mode: 'hls' };
}

type FsVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitSetPresentationMode?: (m: string) => void;
  webkitPresentationMode?: string;
  webkitSupportsPresentationMode?: (m: string) => boolean;
};

const SWIPE_MIN = 56;
const EDGE = 24; // as bordas da tela pertencem aos gestos do sistema (voltar)

export function Player(props: Props) {
  const { channel, armed, online, onArm, onZap, onPlayingChange } = props;
  const mini = props.mini === true;
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [state, setState] = useState<StageState>({ phase: 'loading' });
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [muted, setMutedState] = useState(() => getMuted());
  const [volume, setVolume] = useState(() => getVolume());
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const [forced, setForced] = useState(false);
  const [copied, setCopied] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [controlsOn, setControlsOn] = useState(true);
  const [isFull, setIsFull] = useState(false);
  const [pipOn, setPipOn] = useState(false);
  const [landscapeHint, setLandscapeHint] = useState(false);
  const [infoNonce, setInfoNonce] = useState(0);
  const guide = useGuide(channel);
  const [swipeHint, setSwipeHint] = useState(() => !swipeHintSeen() && window.matchMedia('(pointer: coarse)').matches);
  const [castErro, setCastErro] = useState<CastErro | null>(null);
  const [braveOpen, setBraveOpen] = useState(false);
  const [castTentativa, setCastTentativa] = useState(0);
  const [nativeOnly, setNativeOnly] = useState(false);
  const [engine, setEngine] = useState<Engine | null>(null);
  const pickerPendente = useRef(false);
  const numeroRef = useRef(props.number);
  useEffect(() => {
    numeroRef.current = props.number;
  });
  const cast = props.cast;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [info, setInfo] = useState<InfoConsumo | null>(null);
  const [sessaoMB, setSessaoMB] = useState(() => consumoSessao.totalMB);
  const [timerOpen, setTimerOpen] = useState(false);
  const [dica, setDica] = useState(() => conexaoFraca() && !dicaDadosDispensada());
  useEffect(() => {
    if (dica) dispensarDicaDados(); // "uma vez": não volta por 30 dias, mesmo sem o usuário agir
  }, [dica]);
  useEffect(() => {
    const id = setInterval(() => setSessaoMB(consumoSessao.totalMB), 2000);
    return () => clearInterval(id);
  }, []);

  // Troca de canal: o mesmo elemento <video> e a mesma tela cheia continuam; só o estado do canal reinicia.
  const channelId = channel ? `${channel.country}/${channel.id}` : '';
  const [prevChannelId, setPrevChannelId] = useState(channelId);
  if (prevChannelId !== channelId) {
    setPrevChannelId(channelId);
    setState({ phase: 'loading' });
    setPaused(false);
    setAttempt(0);
    setForced(false);
    setCopied(false);
    setInfo(null);
  }

  const picked = channel ? pickMode(channel) : null;
  const mode: Mode | null = channel ? (forced ? 'hls' : picked!.mode) : null;
  // Rádio só existe para canais de vídeo HLS (o YouTube não separa o áudio)
  const radio = props.modo === 'radio' && mode === 'hls';
  const modoEfetivo: ModoAudio = mode === 'hls' ? props.modo : 'normal';
  const mediaEl = (): HTMLMediaElement | null => (radio ? audioRef.current : videoRef.current);
  // transmitindo para a TV: o vídeo local para (nada é baixado no celular) e o celular vira controle remoto
  const castOn = cast.conectado && !!channel;
  const castable = channel ? podeTransmitir(channel) : false;
  const hlsActive = mode === 'hls' && armed && online && !castOn;
  const playing = castOn || (hlsActive ? state.phase === 'playing' || state.phase === 'buffering' : mode === 'embed' && armed);

  // AirPlay (Safari) e Remote Playback: o <video> diz se há destino; AirPlay exige HLS nativo, então trocamos o motor
  const videoLive = mode === 'hls' && armed && online && !castOn;
  const airplay = useAirPlay(videoRef, videoLive, channelId);
  const remote = useRemotePlayback(videoRef, videoLive && engine === 'native' && state.phase === 'playing', channelId);
  const [airplayJaAtivo, setAirplayJaAtivo] = useState(false);
  if (airplay.ativo !== airplayJaAtivo) {
    setAirplayJaAtivo(airplay.ativo);
    if (!airplay.ativo) setNativeOnly(false); // saiu do AirPlay: volta ao motor anterior (hls.js)
  }
  useEffect(() => {
    if (pickerPendente.current && engine === 'native' && state.phase === 'playing') {
      pickerPendente.current = false;
      airplay.seletor(); // o navegador pode exigir novo toque; o segundo toque já abre direto
    }
  }, [engine, state.phase, airplay]);
  const onAirPlay = () => {
    if (engine === 'native') return airplay.seletor();
    pickerPendente.current = true; // o seletor abre assim que o HLS nativo estiver tocando
    setNativeOnly(true);
  };

  // cada troca de canal durante a transmissão é um novo loadMedia
  useEffect(() => {
    if (!castOn || !channel || !castable) return;
    let vivo = true;
    void (async () => {
      setCastErro(null);
      const r = await cast.transmitir(
        castMedia(channel, numeroRef.current, {
          programa: programaAgora(channel)?.title,
          pais: countryName(channel.country),
          iconUrl: new URL(`${import.meta.env.BASE_URL}icons/icon-512.png`, window.location.href).href,
        }),
      );
      if (!vivo || r.ok) return;
      const causa = diagnoseCast(r.codigo, channel);
      const msg = CAUSAS_CAST[causa] ?? CAUSES[causa];
      setCastErro({ title: msg.title, text: msg.text, detalhe: r.codigo });
    })();
    return () => {
      vivo = false;
    };
    // só reage à troca de canal/sessão; o resto é lido no momento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castOn, channelId, castable, castTentativa]);

  useEffect(() => onPlayingChange(playing && !paused), [playing, paused, onPlayingChange]);

  // sinal local (só deste navegador, 7 dias): o canal não abriu → desce na lista na próxima sessão; tocou → sai do registro.
  // Sem internet não é culpa do canal, então não conta.
  const errCause = hlsActive && state.phase === 'error' ? state.cause : null;
  const tocou = hlsActive && state.phase === 'playing';
  useEffect(() => {
    if (!channelId) return;
    if (tocou) clearLocalFailure(channelId);
    else if (errCause && errCause !== 'device' && online) recordLocalFailure(channelId);
  }, [channelId, tocou, errCause, online]);

  // volume do usuário (celular ou teclado); o timer de desligar baixa o volume em cima dele e o restaura
  useEffect(() => {
    volumeRef.current = volume;
    const apply = () => {
      for (const el of [videoRef.current, audioRef.current]) if (el && Math.abs(el.volume - volumeRef.current) > 0.005) el.volume = volumeRef.current;
    };
    apply();
    // O WebKit, ao começar a tocar, às vezes volta o volume para 100% e ignora o que foi atribuído naquele instante:
    // por isso o volume é reaplicado quando a fase muda (state.phase) e conferido de novo logo depois.
    const timers = [setTimeout(apply, 400), setTimeout(apply, 1500)];
    return () => timers.forEach(clearTimeout);
  }, [volume, mode, radio, state.phase]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  const erroMidia = hlsActive && state.phase === 'error' ? CAUSES[state.cause].title : undefined;
  const { onMidia } = props;
  useEffect(() => onMidia?.({ tocando: playing && !paused, mudo: muted, volume, erro: erroMidia }), [onMidia, playing, paused, muted, volume, erroMidia]);

  useMediaSession(
    channel && armed ? { title: channel.name, artist: guide.now?.title ?? 'TV Livre', logo: channel.logo } : null,
    {
      play: () => void mediaEl()?.play(),
      pause: () => mediaEl()?.pause(),
      previous: () => onZap(-1),
      next: () => onZap(1),
    },
  );
  // Rádio: a tela pode apagar, então não seguramos o Wake Lock
  useWakeLock(hlsActive && state.phase === 'playing' && !paused && !radio);

  // timer de desligar: pausa no fim e baixa o volume nos últimos 10 s
  const timer = useSleepTimer({
    volume: (v) => {
      for (const el of [videoRef.current, audioRef.current]) if (el) el.volume = v * volumeRef.current;
    },
    fim: () => {
      videoRef.current?.pause();
      audioRef.current?.pause();
      if (cast.conectado) cast.parar();
    },
  });
  const programaAtual = channel ? programaAgora(channel) : null;

  // ---- controles: mostrar/esconder ----
  const poke = useCallback(() => {
    setControlsOn(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsOn(false), 3200);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  // ---- tela cheia, PiP, orientação ----
  useEffect(() => {
    const on = () => setIsFull(document.fullscreenElement === wrapRef.current || (videoRef.current as FsVideo | null)?.webkitPresentationMode === 'fullscreen');
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const on = () => setPipOn(document.pictureInPictureElement === v || (v as FsVideo).webkitPresentationMode === 'picture-in-picture');
    v.addEventListener('enterpictureinpicture', on);
    v.addEventListener('leavepictureinpicture', on);
    return () => {
      v.removeEventListener('enterpictureinpicture', on);
      v.removeEventListener('leavepictureinpicture', on);
    };
  }, [mode, channel?.id]);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    let t: ReturnType<typeof setTimeout> | undefined;
    const on = () => {
      const phone = window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
      if (mq.matches && phone && playing && !document.fullscreenElement) {
        setLandscapeHint(true);
        clearTimeout(t);
        t = setTimeout(() => setLandscapeHint(false), 6000);
      } else setLandscapeHint(false);
    };
    mq.addEventListener('change', on);
    return () => {
      mq.removeEventListener('change', on);
      clearTimeout(t);
    };
  }, [playing]);

  const toggleFullscreen = useCallback(async () => {
    const el = wrapRef.current;
    const v = videoRef.current as FsVideo | null;
    setLandscapeHint(false);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        screen.orientation?.unlock?.();
      } else if (el?.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
        (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => undefined);
      } else if (v?.webkitEnterFullscreen) {
        v.webkitEnterFullscreen(); // iPhone: só o <video> pode ir para tela cheia
      }
    } catch {
      /* o navegador recusou: nada a fazer */
    }
  }, []);

  const pipSupported =
    typeof document !== 'undefined' &&
    (document.pictureInPictureEnabled === true || !!(document.createElement('video') as FsVideo).webkitSupportsPresentationMode?.('picture-in-picture'));
  const togglePip = useCallback(async () => {
    const v = videoRef.current as FsVideo | null;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v.requestPictureInPicture) await v.requestPictureInPicture();
      else v.webkitSetPresentationMode?.(v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
    } catch {
      /* sem suporte para essa transmissão */
    }
  }, []);

  const togglePlay = useCallback(() => {
    const v = radio ? audioRef.current : videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, [radio]);
  /** Volume e mudo mudam juntos e ficam salvos (`tvlivre:volume`, `tvlivre:mudo`) para a próxima sessão. */
  const applySound = useCallback((s: Sound) => {
    volumeRef.current = s.volume;
    mutedRef.current = s.muted;
    setVolume(s.volume);
    setMutedState(s.muted);
    saveVolume(s.volume);
    saveMuted(s.muted);
  }, []);
  const toggleMute = useCallback(() => applySound(toggleMuted({ volume: volumeRef.current, muted: mutedRef.current })), [applySound]);
  const onSlider = useCallback(
    (value: number) => {
      applySound(applySlider({ volume: volumeRef.current, muted: mutedRef.current }, value));
      poke();
    },
    [applySound, poke],
  );

  // atalhos de teclado que dependem do player chegam por eventos do documento (ver useShortcuts)
  useEffect(() => {
    const onCmd = (e: Event) => {
      const cmd = (e as CustomEvent<string>).detail;
      if (cmd === 'fullscreen') void toggleFullscreen();
      else if (cmd === 'mute') toggleMute();
      else if (cmd === 'pip') void togglePip();
      else if (cmd === 'playpause') togglePlay();
      else if (cmd === 'info') setInfoNonce((n) => n + 1);
    };
    document.addEventListener('tvlivre:cmd', onCmd);
    return () => document.removeEventListener('tvlivre:cmd', onCmd);
  }, [toggleFullscreen, toggleMute, togglePip, togglePlay]);

  // comandos com valor (controle remoto pelo celular): volume, mudo explícito e tocar/pausar
  useEffect(() => {
    const onCmdV = (e: Event) => {
      const { cmd, valor } = (e as CustomEvent<{ cmd: string; valor: number | boolean }>).detail;
      if (cmd === 'volume' && typeof valor === 'number') {
        const v = Math.min(1, Math.max(0, valor));
        applySound({ volume: v, muted: v > 0 ? false : mutedRef.current });
      } else if (cmd === 'mudo' && typeof valor === 'boolean') {
        applySound({ volume: volumeRef.current, muted: valor });
      } else if (cmd === 'tocar') {
        const el = radio ? audioRef.current : videoRef.current;
        if (valor === true) void el?.play().catch(() => undefined);
        else el?.pause();
      }
    };
    document.addEventListener('tvlivre:cmdv', onCmdV);
    return () => document.removeEventListener('tvlivre:cmdv', onCmdV);
  }, [radio, applySound]);

  const copyLink = useCallback(async () => {
    if (!channel) return;
    const ok = await copyText(channel.url);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2500);
  }, [channel]);

  // ---- gestos: deslizar troca de canal; a rolagem vertical continua livre (touch-action: pan-y) ----
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    // arrastar o controle de volume não é deslizar para trocar de canal
    if (!t || e.touches.length > 1 || (e.target as HTMLElement).closest('input')) return (touchRef.current = null);
    const w = window.innerWidth;
    touchRef.current = t.clientX < EDGE || t.clientX > w - EDGE ? null : { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current;
    touchRef.current = null;
    const t = e.changedTouches[0];
    if (!s || !t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - s.t < 700) {
      if (swipeHint) {
        markSwipeHintSeen();
        setSwipeHint(false);
      }
      onZap(dx < 0 ? 1 : -1);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, summary, details, input')) return;
    if (mini) return props.onExpand?.(); // no mini-player, tocar na imagem volta para o player grande
    if (e.pointerType === 'mouse') {
      if (hlsActive && state.phase !== 'error') togglePlay();
      poke();
    } else if (e.pointerType === 'touch') {
      if (controlsOn) setControlsOn(false);
      else poke();
    }
  };

  // ---------- sem canal: tela de ajuste ----------
  if (!channel || !mode) {
    return (
      <div className="player">
        <div className="stage stage-idle" data-phase="idle">
          <TestCard />
          <div className="idle-panel">
            <p className="idle-kicker">Sem sinal</p>
            <button type="button" className="btn btn-accent btn-xl" onClick={props.onPower}>
              <Power size={22} aria-hidden="true" />
              {props.resume ? `Voltar ao canal ${props.resume.number}` : 'Ligar a TV'}
            </button>
            {props.resume && <p className="idle-sub">{props.resume.name}</p>}
            {!props.resume && <p className="idle-sub">Escolha um canal na grade ou aperte Zapear.</p>}
          </div>
          {props.digits && (
            <div className="digits" role="status">
              <span className="num">{props.digits}</span>
              <small>Enter para sintonizar</small>
            </div>
          )}
        </div>
      </div>
    );
  }

  const why = forced ? undefined : picked!.why;
  const embedUrl = armed && !castOn ? youtubeEmbedUrl(channel.youtube) : null;
  const castBotao = mode === 'hls' && castable && cast.botao;
  const onCast = () => (cast.brave && !cast.sdkPronto ? setBraveOpen(true) : void cast.iniciar());
  const showSpinner = hlsActive && (state.phase === 'loading' || state.phase === 'reconnecting' || state.phase === 'buffering');
  const errorState = hlsActive && state.phase === 'error' ? state : null;
  const phaseAttr = !online && mode === 'hls' ? 'offline' : mode !== 'hls' ? mode : !armed ? 'ready' : state.phase;
  const miniCover =
    !online && mode === 'hls' ? 'Sem internet'
    : errorState || mode === 'unsupported' || mode === 'youtube-link' ? 'Sem sinal'
    : showSpinner ? (state.phase === 'reconnecting' ? 'Reconectando…' : 'Carregando…')
    : radio ? 'Rádio'
    : null;

  return (
    <div className="player" data-testid="player" data-mini={mini ? 'on' : undefined}>
      <div
        className="stage"
        ref={wrapRef}
        data-phase={phaseAttr}
        data-radio={radio ? 'on' : undefined}
        data-midia={radio ? 'audio' : 'video'}
        data-bitrate={info?.bitrate ?? undefined}
        data-nivel-audio={info?.audioOnly ? 'on' : undefined}
        data-controls={controlsOn || paused || !!errorState || !armed ? 'on' : 'off'}
        onTouchStart={mini ? undefined : onTouchStart}
        onTouchEnd={mini ? undefined : onTouchEnd}
        onPointerUp={onPointerUp}
        onPointerMove={(e) => e.pointerType === 'mouse' && hlsActive && poke()}
        onFocus={() => poke()}
        onDoubleClick={mini ? undefined : () => void toggleFullscreen()}
      >
        {mode === 'hls' && <HlsStage channel={channel} force={forced} active={hlsActive} attempt={attempt} muted={muted} videoRef={videoRef} onState={setState} onPausedChange={setPaused} nativeOnly={nativeOnly} onEngine={setEngine} modo={modoEfetivo} audioRef={audioRef} onInfo={setInfo} onBytes={(n) => consumoSessao.add(n)} />}

        {mode === 'embed' && embedUrl && (
          <iframe
            title={`YouTube: ${channel.name}`}
            src={embedUrl}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}

        {/* canal sintonizado, ainda sem toque: pôster com o botão de tocar */}
        {!armed && !radio && (mode === 'hls' || mode === 'embed') && (
          <div className="poster">
            <TestCard dim />
            <button type="button" className="play-big" onClick={onArm} aria-label={`Tocar ${channel.name}`}>
              <Play size={34} aria-hidden="true" fill="currentColor" />
            </button>
          </div>
        )}

        {!online && mode === 'hls' && armed && (
          <Problem title={CAUSES.device.title} text={CAUSES.device.text} icon={<WifiOff size={22} aria-hidden="true" />} />
        )}

        {showSpinner && (
          <div className="status-chip" role="status">
            <span className="spinner" aria-hidden="true" />
            {state.phase === 'reconnecting' ? 'Reconectando…' : state.phase === 'buffering' ? 'Carregando…' : 'Conectando ao canal…'}
          </div>
        )}

        {errorState && online && errorState.cause === 'mixed' && (
          <HttpPanel
            channel={channel}
            copied={copied}
            onCopy={copyLink}
            onRetry={() => { setState({ phase: 'loading' }); setAttempt((n) => n + 1); }}
            onHow={() => setHowOpen(true)}
            suggestions={props.suggestions}
            onPick={props.onPick}
          />
        )}

        {errorState && online && errorState.cause !== 'mixed' && (
          <Problem
            tone="error"
            title={CAUSES[errorState.cause as Cause].title}
            text={CAUSES[errorState.cause as Cause].text}
            detail={errorState.detail}
            actions={
              <>
                <VlcOpen channel={channel} />
                <button type="button" className="btn" onClick={() => { setState({ phase: 'loading' }); setAttempt((n) => n + 1); }}>
                  <RotateCw size={18} aria-hidden="true" /> Tentar de novo
                </button>
              </>
            }
            extra={<CopyLine copied={copied} onCopy={copyLink} />}
            suggestions={props.suggestions}
            onPick={props.onPick}
          />
        )}

        {mode === 'youtube-link' && (
          <Problem
            title="O YouTube não deixa tocar esse canal aqui"
            text="Essa transmissão não pode ser exibida dentro de outros sites. Abra direto no YouTube."
            actions={
              <a className="btn btn-accent" href={channel.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={18} aria-hidden="true" /> Abrir no YouTube
              </a>
            }
            suggestions={props.suggestions}
            onPick={props.onPick}
          />
        )}

        {mode === 'unsupported' && why && (
          <Problem
            title={UNSUPPORTED[why].title}
            text={UNSUPPORTED[why].text}
            actions={
              <>
                <VlcOpen channel={channel} />
                {(why === 'cors' || why === 'headers') && (
                  <button type="button" className="btn" onClick={() => setForced(true)}>
                    Tentar mesmo assim
                  </button>
                )}
              </>
            }
            extra={<CopyLine copied={copied} onCopy={copyLink} />}
            suggestions={props.suggestions}
            onPick={props.onPick}
          />
        )}

        {radio && !errorState && online && !castOn && (
          <RadioScreen
            canal={channel}
            numero={props.number}
            programa={programaAtual?.title}
            armed={armed}
            tocando={state.phase === 'playing' && !paused}
            conectando={armed && (state.phase === 'loading' || state.phase === 'reconnecting')}
            onPlayPause={armed ? togglePlay : onArm}
            onAnterior={() => onZap(-1)}
            onProximo={() => onZap(1)}
            onTimer={() => setTimerOpen(true)}
            timerAtivo={timer.ativo}
            restanteMs={timer.restanteMs}
            onVoltarVideo={() => props.onModo('normal')}
          />
        )}

        {(castOn || airplay.ativo || remote.ativo) && (
          <CastPanel
            canal={channel}
            numero={props.number}
            aparelho={castOn ? cast.aparelho : null}
            tipo={castOn ? 'cast' : airplay.ativo ? 'airplay' : 'remote'}
            {...(castOn ? { volume: { valor: cast.volume, mudo: cast.mudo, onVolume: (v: number) => void cast.definirVolume(v), onMudo: () => void cast.definirMudo(!cast.mudo) } } : {})}
            naoTransmite={castOn && !castable}
            erro={castOn ? castErro : null}
            onParar={castOn ? cast.parar : airplay.ativo ? airplay.seletor : remote.seletor}
            onProximo={() => onZap(1)}
            onTentar={() => setCastTentativa((n) => n + 1)}
          />
        )}

        {cast.falhou && !castOn && (
          <div className="status-chip" role="status">Não foi possível carregar o Chromecast. Confira a internet e se o navegador não bloqueia o Google Cast.</div>
        )}

        {/* vinheta de troca: nasce a cada canal novo (key) e some sozinha por CSS */}
        {armed && (mode === 'embed' || (mode === 'hls' && online && !errorState)) && (
          <div className="osd" key={channel.id} aria-hidden="true">
            <span className="osd-num num">{props.number}</span>
            <span className="osd-name">
              {channel.name}
              {guide.now && <small className="osd-prog">{guide.now.title}</small>}
            </span>
          </div>
        )}
        <span className="sr-only" role="status" aria-live="polite">{armed ? `Canal ${props.number}, ${channel.name}` : ''}</span>

        {props.digits && (
          <div className="digits" role="status">
            <span className="num">{props.digits}</span>
            <small>Enter para sintonizar</small>
          </div>
        )}

        {isTvNow() && armed && <GuideStrip channel={channel} overlay nonce={infoNonce} />}

        {swipeHint && armed && playing && (
          <div className="swipe-hint" aria-hidden="true">
            <ChevronLeft size={18} /> deslize para trocar de canal <ChevronRight size={18} />
          </div>
        )}

        {landscapeHint && (
          <button type="button" className="landscape-hint btn btn-accent" onClick={() => void toggleFullscreen()}>
            <Maximize size={18} aria-hidden="true" /> Tela cheia
          </button>
        )}

        {/* mini-player: os painéis do player grande ficam escondidos (CSS); um rótulo curto diz o que está acontecendo */}
        {mini && miniCover && <p className="mini-cover" role="status">{miniCover}</p>}

        {(mode === 'hls' || mode === 'embed') && armed && (
          <div className="controls">
            {mode === 'hls' && (
              <>
                <button type="button" className="ctl" onClick={togglePlay} aria-label={paused ? 'Tocar' : 'Pausar'}>
                  {paused ? <Play size={22} fill="currentColor" /> : <Pause size={22} fill="currentColor" />}
                </button>
                <VolumeControl volume={volume} muted={muted} onToggle={toggleMute} onSlider={onSlider} />
              </>
            )}
            <span className="ctl-spacer" />
            {castBotao && (
              <button type="button" className="ctl" onClick={onCast} aria-pressed={castOn} aria-label={castOn ? 'Transmitindo para a TV' : 'Transmitir para a TV'} title="Transmitir para a TV" data-testid="cast-btn" disabled={cast.carregando}>
                <Cast size={22} />
              </button>
            )}
            {mode === 'hls' && airplay.disponivel && (
              <button type="button" className="ctl" onClick={onAirPlay} aria-pressed={airplay.ativo} aria-label="AirPlay" title="AirPlay" data-testid="airplay-btn">
                <Airplay size={22} />
              </button>
            )}
            {mode === 'hls' && remote.disponivel && !airplay.disponivel && (
              <button type="button" className="ctl" onClick={() => void remote.seletor()} aria-pressed={remote.ativo} aria-label="Enviar para outra tela" title="Enviar para outra tela" data-testid="remote-btn">
                <ScreenShare size={22} />
              </button>
            )}
            {mode === 'hls' && !radio && pipSupported && (
              <button type="button" className="ctl" onClick={() => void togglePip()} aria-pressed={pipOn} aria-label="Imagem sobre imagem">
                <PictureInPicture2 size={22} />
              </button>
            )}
            <button type="button" className="ctl" onClick={() => void toggleFullscreen()} aria-label={isFull ? 'Sair da tela cheia' : 'Tela cheia'}>
              {isFull ? <Minimize size={22} /> : <Maximize size={22} />}
            </button>
          </div>
        )}
      </div>

      {mini ? (
        <div className="mini-bar" data-testid="mini-player">
          <p className="mini-title">
            <span className="num" aria-hidden="true">{props.number}</span>
            <span className="mini-name">{channel.name}</span>
          </p>
          <div className="mini-ctls">
            {mode === 'hls' && hlsActive && (
              <>
                <button type="button" className="ctl" onClick={togglePlay} aria-label={paused ? 'Tocar' : 'Pausar'}>
                  {paused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
                </button>
                <VolumeControl volume={volume} muted={muted} onToggle={toggleMute} onSlider={onSlider} />
              </>
            )}
            <span className="ctl-spacer" />
            {props.onShuffle && (
              <button type="button" className="ctl" onClick={props.onShuffle} aria-label="Zapear: sortear outro canal aqui no mini-player" title="Zapear" data-testid="mini-zapear">
                <Shuffle size={20} />
              </button>
            )}
            <button type="button" className="ctl" onClick={props.onExpand} aria-label={`Expandir: voltar ao canal ${props.number} ${channel.name}`} title="Expandir" data-testid="mini-expandir">
              <Maximize2 size={20} />
            </button>
            <button type="button" className="ctl" onClick={props.onClose} aria-label="Fechar o mini-player e parar o canal" title="Fechar" data-testid="mini-fechar">
              <X size={20} />
            </button>
          </div>
        </div>
      ) : (
        <>
      <Dial {...props} channel={channel} onToggleFavorite={props.onToggleFavorite} />
      {props.assistindoCanal != null && props.assistindoCanal >= MIN_PUBLICO && (
        <p className="watching" data-testid="assistindo-canal">
          <span className="live-dot" aria-hidden="true" />
          {textoCanal(props.assistindoCanal)}
        </p>
      )}
      {!isTvNow() && <GuideStrip channel={channel} />}
      {dica && props.modo === 'normal' && (
        <DataTip onEscolher={(m) => { setDica(false); props.onModo(m); }} onDispensar={() => setDica(false)} />
      )}
      <ModeBar
        modo={props.modo}
        onModo={props.onModo}
        disponivel={mode === 'hls'}
        info={info}
        sessaoMB={sessaoMB}
        timerAtivo={timer.ativo}
        restanteMs={timer.restanteMs}
        onTimer={() => setTimerOpen(true)}
      />

      <div className="now">
        <span className="now-num num" aria-hidden="true">{props.number}</span>
        <div className="now-body">
          <h2>{channel.name}</h2>
          <p className="now-meta">
            <CountryTag code={channel.country} />
            {channel.categories[0] && <span>{categoryLabel(channel.categories[0])}</span>}
            <StatusMark channel={channel} withText />
            <ChannelBadges channel={channel} />
          </p>
          {mode === 'embed' && cast.suportado && (
            <p className="now-note" data-testid="cast-youtube">Para transmitir para a TV, use o botão de transmitir do próprio vídeo do YouTube.</p>
          )}
          {mode === 'embed' && (
            <p className="now-note">
              O vídeo não aparece?{' '}
              <a href={channel.youtube?.id && channel.youtube.type === 'video' ? `https://www.youtube.com/watch?v=${channel.youtube.id}` : channel.url} target="_blank" rel="noopener noreferrer">
                Abrir no YouTube
              </a>
            </p>
          )}
          {mode === 'hls' && state.phase === 'playing' && !isPlayableHere(channel, caps()) && (
            <p className="now-note">Tocou mesmo com sinal de bloqueio. Pode ficar instável.</p>
          )}
        </div>
        <ChannelLogo name={channel.name} src={channel.logo} size={56} />
      </div>
        </>
      )}
      <HttpSheet open={howOpen} onClose={() => setHowOpen(false)} />
      <TimerSheet
        open={timerOpen}
        onClose={() => setTimerOpen(false)}
        ativo={timer.ativo}
        restanteMs={timer.restanteMs}
        padrao={getTimerPadrao()}
        temPrograma={temGuia() && !!programaAtual}
        onEscolher={(o: OpcaoTimer) => timer.iniciar(o, programaAtual?.stop)}
        onCancelar={timer.cancelar}
      />
      <BraveCastSheet open={braveOpen} onClose={() => setBraveOpen(false)} onContinuar={() => { setBraveOpen(false); void cast.iniciar(); }} />
    </div>
  );
}

/**
 * Som: o ícone alterna o mudo (e devolve o volume de antes); o controle deslizante vai de 0 a 100 e funciona com mouse, toque
 * e teclado (setas, Home/End). Onde o navegador não deixa o site mudar o volume (iPhone/iPad), fica só o botão de mudo.
 */
function VolumeControl({ volume, muted, onToggle, onSlider }: { volume: number; muted: boolean; onToggle: () => void; onSlider: (value: number) => void }) {
  const sound = { volume, muted };
  const icon = volumeIcon(sound);
  const value = sliderValue(sound);
  return (
    <>
      <button type="button" className="ctl" onClick={onToggle} aria-pressed={muted} aria-label={muted ? 'Ativar o som' : 'Silenciar'} title={muted ? 'Ativar o som (M)' : 'Silenciar (M)'}>
        {icon === 'off' ? <VolumeX size={22} /> : icon === 'low' ? <Volume1 size={22} /> : <Volume2 size={22} />}
      </button>
      {volumeSettable() && (
        <input
          type="range"
          className="vol"
          min={0}
          max={100}
          step={VOLUME_STEP}
          value={value}
          onChange={(e) => onSlider(Number(e.target.value))}
          aria-label="Volume"
          aria-valuetext={muted ? 'Mudo' : `${value}%`}
          data-testid="volume"
        />
      )}
    </>
  );
}


/** Abre o canal no VLC sem copiar nada: celular por link direto; computador por um .m3u de um clique. */
function VlcOpen({ channel, variant = 'accent' }: { channel: Channel; variant?: 'accent' | 'plain' }) {
  if (isTvNow()) return null; // TV não tem VLC para abrir: a saída é trocar de canal
  const href = vlcHref(channel);
  const cls = variant === 'accent' ? 'btn btn-accent' : 'btn';
  if (href) {
    return (
      <a className={cls} href={href} data-testid="vlc-open">
        <ExternalLink size={18} aria-hidden="true" /> Abrir no VLC
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={() => downloadM3u(channel)} data-testid="vlc-open">
      <Download size={18} aria-hidden="true" /> Abrir no VLC
    </button>
  );
}

/** Brave: o Media Router (Cast) vem desligado. Explica como ligar e só então oferece transmitir. */
function BraveCastSheet({ open, onClose, onContinuar }: { open: boolean; onClose: () => void; onContinuar: () => void }) {
  return (
    <Sheet id="brave-cast" open={open} onClose={onClose} title="Transmitir no Brave" variant="modal"
      footer={<button type="button" className="btn btn-accent" onClick={onContinuar} data-testid="brave-continuar"><Cast size={18} aria-hidden="true" /> Já liguei, transmitir</button>}>
      <div className="howto" data-testid="brave-passos">
        <p>O Brave vem com o Chromecast desligado. Para ligar, uma vez só:</p>
        <ol>
          <li>Abra <code>brave://settings/extensions</code>.</li>
          <li>Ative <b>Media Router</b> (Roteador de mídia).</li>
          <li>Volte aqui, recarregue a página e toque em <b>Transmitir</b> de novo.</li>
        </ol>
        <p className="howto-note">Seu celular e a TV precisam estar na mesma rede Wi-Fi.</p>
      </div>
    </Sheet>
  );
}

/** Caminho manual, para quem prefere colar o link ou não tem o app configurado. */
function CopyLine({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  if (isTvNow()) return null;
  return (
    <p className="vlc-alt">
      Prefere colar no VLC?{' '}
      <button type="button" className="link-btn" onClick={onCopy}>
        {copied ? 'Link copiado' : 'Copiar link'}
      </button>
      {platform() === 'desktop' && ' · O botão acima baixa um arquivo .m3u; abra-o com o VLC.'}
    </p>
  );
}

interface HttpPanelProps {
  channel: Channel;
  copied: boolean;
  onCopy: () => void;
  onRetry: () => void;
  onHow: () => void;
  suggestions: Channel[];
  onPick: (c: Channel) => void;
}

/**
 * O canal só transmite em HTTP e o navegador bloqueia (conteúdo misto). O site não consegue liberar isso sozinho;
 * só o usuário, nas configurações do site, e só em navegadores de computador baseados em Chromium.
 */
function HttpPanel({ channel, copied, onCopy, onRetry, onHow, suggestions, onPick }: HttpPanelProps) {
  const tvMode = isTvNow();
  const canAllow = canAllowInsecure() && !tvMode;
  return (
    <Problem
      title={CAUSES.mixed.title}
      text={
        tvMode
          ? 'O navegador da TV bloqueia esse tipo de link. Troque de canal com ▲ ▼ ou abra a grade com OK.'
          : canAllow
          ? 'O navegador bloqueia esse tipo de link. Libere uma vez para o TV Livre e ele toca aqui, ou abra no VLC.'
          : 'O navegador bloqueia esse tipo de link e não tem opção para liberar. O VLC abre o canal direto, sem copiar nada.'
      }
      icon={<ShieldCheck size={22} aria-hidden="true" />}
      actions={
        canAllow ? (
          <>
            <button type="button" className="btn btn-accent" onClick={onHow} data-testid="http-how">
              <ShieldCheck size={18} aria-hidden="true" /> Liberar HTTP
            </button>
            <VlcOpen channel={channel} variant="plain" />
          </>
        ) : (
          <>
            <VlcOpen channel={channel} />
            <button type="button" className={tvMode ? 'btn btn-accent' : 'btn'} onClick={onRetry}>
              <RotateCw size={18} aria-hidden="true" /> Tentar de novo
            </button>
          </>
        )
      }
      extra={<CopyLine copied={copied} onCopy={onCopy} />}
      suggestions={suggestions}
      onPick={onPick}
    />
  );
}

/** Passo a passo para permitir "Conteúdo não seguro" só para este site (Chrome, Edge, Brave, Opera no computador). */
function HttpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copiedAddr, setCopiedAddr] = useState(false);
  const addr = siteSettingsAddress();
  const copyAddr = async () => {
    if (!addr) return;
    const ok = await copyText(addr);
    setCopiedAddr(ok);
    if (ok) setTimeout(() => setCopiedAddr(false), 2500);
  };
  return (
    <Sheet
      id="liberar-http"
      open={open}
      onClose={onClose}
      title="Liberar canais em HTTP"
      variant="modal"
      footer={
        <button type="button" className="btn btn-accent" onClick={() => window.location.reload()} data-testid="http-reload">
          <RotateCw size={18} aria-hidden="true" /> Já liberei, recarregar
        </button>
      }
    >
      <div className="howto" data-testid="http-steps">
        <p>O navegador só deixa um site seguro tocar vídeo sem criptografia se você permitir. São 15 segundos, uma vez só:</p>
        <ol>
          <li>Clique no ícone à esquerda do endereço, na barra do navegador (cadeado ou controles).</li>
          <li>Abra <b>Configurações do site</b>.</li>
          <li>Em <b>Conteúdo não seguro</b>, escolha <b>Permitir</b>.</li>
          <li>Volte aqui e toque em <b>Já liberei, recarregar</b>. O canal volta sozinho.</li>
        </ol>
        {addr && (
          <p>
            Atalho: cole <code>{addr}</code> na barra de endereço{' '}
            <button type="button" className="link-btn" onClick={copyAddr}>
              {copiedAddr ? 'Copiado' : 'Copiar atalho'}
            </button>
          </p>
        )}
        <p className="howto-note">
          Vale só para este site e dá para desfazer no mesmo lugar. O vídeo desses canais trafega sem criptografia, então
          quem controla a sua rede consegue ver o que você assiste. Se preferir não liberar, o botão <b>Abrir no VLC</b> serve
          para qualquer canal.
        </p>
      </div>
    </Sheet>
  );
}

interface ProblemProps {
  title: string;
  text: string;
  detail?: string;
  tone?: 'error';
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  extra?: React.ReactNode;
  suggestions?: Channel[];
  onPick?: (c: Channel) => void;
}

function Problem({ title, text, detail, tone, icon, actions, extra, suggestions, onPick }: ProblemProps) {
  return (
    <div className="problem" role={tone === 'error' ? 'alert' : undefined} data-testid="problem">
      <Mark size={28} />
      <h3>{icon} {title}</h3>
      <p>{text}</p>
      {detail && <p className="tech">Detalhe técnico: {detail}</p>}
      {actions && <div className="btn-row">{actions}</div>}
      {extra}
      {!!suggestions?.length && onPick && (
        <div className="alternatives">
          <h4>Tente outro canal</h4>
          <ul>
            {suggestions.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onPick(c)}>{c.name}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Dial({ channel, number, prev, next, onZap, isFavorite, onToggleFavorite, onShare, onShuffle }: Props & { channel: Channel }) {
  return (
    <div className="dial" role="group" aria-label="Controle de canais">
      <button type="button" className="dial-side" onClick={() => onZap(-1)} aria-label={prev ? `Canal anterior: ${prev.number} ${prev.name}` : 'Canal anterior'} disabled={!prev}>
        <ChevronLeft size={22} aria-hidden="true" />
        <span className="num">{prev?.number ?? ''}</span>
      </button>
      <div className="dial-now" aria-hidden="true">
        <span className="num">{number}</span>
        <span className="dial-name">{channel.name}</span>
      </div>
      <button type="button" className={`dial-fav${isFavorite ? ' on' : ''}`} onClick={onToggleFavorite} aria-pressed={isFavorite} aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} title={isFavorite ? 'Remover dos favoritos' : 'Favoritar'}>
        <Star size={22} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
      <button type="button" className="dial-share" onClick={onShare} aria-label="Compartilhar este canal" title="Compartilhar (S)" data-testid="share-btn">
        <Share2 size={20} aria-hidden="true" />
      </button>
      <button type="button" className="dial-zap" onClick={onShuffle} disabled={!onShuffle} aria-label="Zapear: sortear um canal no ar" title="Zapear (Z)" data-testid="player-zapear">
        <Shuffle size={20} aria-hidden="true" />
      </button>
      <button type="button" className="dial-side" onClick={() => onZap(1)} aria-label={next ? `Próximo canal: ${next.number} ${next.name}` : 'Próximo canal'} disabled={!next}>
        <span className="num">{next?.number ?? ''}</span>
        <ChevronRight size={22} aria-hidden="true" />
      </button>
    </div>
  );
}
