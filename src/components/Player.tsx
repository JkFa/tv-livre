import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Download, ExternalLink, Maximize, Minimize, Pause, PictureInPicture2, Play, Power,
  RotateCw, ShieldCheck, Star, Volume2, VolumeX, WifiOff,
} from 'lucide-react';
import type { Channel } from '../../shared/types.ts';
import { youtubeEmbedUrl } from '../../shared/youtube.ts';
import { copyText } from '../lib/clipboard.ts';
import { useGuide } from '../lib/epg.ts';
import { categoryLabel, countryFlag, countryName } from '../lib/labels.ts';
import { CAUSES, UNSUPPORTED, type UnsupportedWhy } from '../lib/messages.ts';
import { getMuted, markSwipeHintSeen, setMuted as saveMuted, swipeHintSeen } from '../lib/prefs.ts';
import { caps, isPlayableHere, unsupportedReason } from '../lib/playback.ts';
import { isTvNow } from '../lib/tvmode.ts';
import { canAllowInsecure, downloadM3u, platform, siteSettingsAddress, vlcHref } from '../lib/vlc.ts';
import { useMediaSession, useWakeLock } from '../lib/media.ts';
import { ChannelBadges, StatusMark } from './Badges.tsx';
import { ChannelLogo } from './ChannelLogo.tsx';
import { GuideStrip } from './Guide.tsx';
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
}

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [state, setState] = useState<StageState>({ phase: 'loading' });
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [muted, setMutedState] = useState(() => getMuted());
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
  }

  const picked = channel ? pickMode(channel) : null;
  const mode: Mode | null = channel ? (forced ? 'hls' : picked!.mode) : null;
  const hlsActive = mode === 'hls' && armed && online;
  const playing = hlsActive ? state.phase === 'playing' || state.phase === 'buffering' : mode === 'embed' && armed;

  useEffect(() => onPlayingChange(playing && !paused), [playing, paused, onPlayingChange]);

  useMediaSession(
    channel && armed ? { title: channel.name, artist: guide.now?.title ?? 'TV Livre', logo: channel.logo } : null,
    {
      play: () => void videoRef.current?.play(),
      pause: () => videoRef.current?.pause(),
      previous: () => onZap(-1),
      next: () => onZap(1),
    },
  );
  useWakeLock(hlsActive && state.phase === 'playing' && !paused);

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
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);
  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      saveMuted(!m);
      return !m;
    });
  }, []);

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

  const copyLink = useCallback(async () => {
    if (!channel) return;
    const ok = await copyText(channel.url);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2500);
  }, [channel]);

  // ---- gestos: deslizar troca de canal; a rolagem vertical continua livre (touch-action: pan-y) ----
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t || e.touches.length > 1) return (touchRef.current = null);
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
    if ((e.target as HTMLElement).closest('button, a, summary, details')) return;
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
  const embedUrl = armed ? youtubeEmbedUrl(channel.youtube) : null;
  const showSpinner = hlsActive && (state.phase === 'loading' || state.phase === 'reconnecting' || state.phase === 'buffering');
  const errorState = hlsActive && state.phase === 'error' ? state : null;
  const phaseAttr = !online && mode === 'hls' ? 'offline' : mode !== 'hls' ? mode : !armed ? 'ready' : state.phase;

  return (
    <div className="player" data-testid="player">
      <div
        className="stage"
        ref={wrapRef}
        data-phase={phaseAttr}
        data-controls={controlsOn || paused || !!errorState || !armed ? 'on' : 'off'}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onPointerUp={onPointerUp}
        onPointerMove={(e) => e.pointerType === 'mouse' && hlsActive && poke()}
        onFocus={() => poke()}
        onDoubleClick={() => void toggleFullscreen()}
      >
        {mode === 'hls' && <HlsStage channel={channel} force={forced} active={hlsActive} attempt={attempt} muted={muted} videoRef={videoRef} onState={setState} onPausedChange={setPaused} />}

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
        {!armed && (mode === 'hls' || mode === 'embed') && (
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

        {(mode === 'hls' || mode === 'embed') && armed && (
          <div className="controls">
            {mode === 'hls' && (
              <>
                <button type="button" className="ctl" onClick={togglePlay} aria-label={paused ? 'Tocar' : 'Pausar'}>
                  {paused ? <Play size={22} fill="currentColor" /> : <Pause size={22} fill="currentColor" />}
                </button>
                <button type="button" className="ctl" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Ativar o som' : 'Silenciar'}>
                  {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
                </button>
              </>
            )}
            <span className="ctl-spacer" />
            {mode === 'hls' && pipSupported && (
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

      <Dial {...props} channel={channel} onToggleFavorite={props.onToggleFavorite} />
      {!isTvNow() && <GuideStrip channel={channel} />}

      <div className="now">
        <span className="now-num num" aria-hidden="true">{props.number}</span>
        <div className="now-body">
          <h2>{channel.name}</h2>
          <p className="now-meta">
            <span>{countryFlagText(channel.country)}</span>
            {channel.categories[0] && <span>{categoryLabel(channel.categories[0])}</span>}
            <StatusMark status={channel.status} withText />
            <ChannelBadges channel={channel} />
          </p>
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
      <HttpSheet open={howOpen} onClose={() => setHowOpen(false)} />
    </div>
  );
}

const countryFlagText = (c: string) => `${countryFlag(c)} ${countryName(c)}`.trim();

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

function Dial({ channel, number, prev, next, onZap, isFavorite, onToggleFavorite }: Props & { channel: Channel }) {
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
      <button type="button" className="dial-side" onClick={() => onZap(1)} aria-label={next ? `Próximo canal: ${next.number} ${next.name}` : 'Próximo canal'} disabled={!next}>
        <span className="num">{next?.number ?? ''}</span>
        <ChevronRight size={22} aria-hidden="true" />
      </button>
    </div>
  );
}
