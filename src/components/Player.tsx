import { useCallback, useEffect, useRef, useState } from 'react';
import { isBrowserPlayable, type Channel } from '../../shared/types.ts';
import { youtubeEmbedUrl } from '../../shared/youtube.ts';
import { copyText } from '../lib/clipboard.ts';
import { diagnose, type Cause, type HlsErrorLike } from '../lib/diagnose.ts';
import { categoryLabel, countryFlag, countryName } from '../lib/labels.ts';
import { ChannelBadges, StatusDot } from './Badges.tsx';
import { ChannelLogo } from './ChannelLogo.tsx';

type Phase = 'loading' | 'playing' | 'error';
type Mode = 'hls' | 'embed' | 'youtube-link' | 'unsupported';
type UnsupportedWhy = 'http' | 'format' | 'cors' | 'headers';

const CAUSES: Record<Cause, { title: string; text: string }> = {
  offline: {
    title: 'O canal parece estar fora do ar',
    text: 'O servidor respondeu que o endereço não existe mais ou está com problemas. Transmissões gratuitas mudam de endereço com frequência.',
  },
  geo: {
    title: 'Provável bloqueio geográfico',
    text: 'O servidor recusou o acesso. Muitos canais só podem ser vistos dentro do país de origem.',
  },
  cors: {
    title: 'Bloqueio do navegador (CORS) ou servidor inacessível',
    text: 'O servidor não autoriza a reprodução dentro de outros sites ou não respondeu. O mesmo link costuma funcionar no VLC.',
  },
  media: {
    title: 'Formato de vídeo não suportado',
    text: 'O navegador não conseguiu decodificar o vídeo desta transmissão. Tente o VLC.',
  },
  timeout: {
    title: 'O canal demorou demais para responder',
    text: 'O servidor pode estar sobrecarregado, fora do ar ou bloqueando seu acesso.',
  },
  unknown: {
    title: 'Não foi possível reproduzir este canal',
    text: 'A transmissão falhou por um motivo que o navegador não detalhou. Pode estar offline ou bloqueada.',
  },
};

const UNSUPPORTED: Record<UnsupportedWhy, { title: string; text: string }> = {
  http: {
    title: 'Canal em HTTP: o navegador bloqueia',
    text: 'Este canal usa um endereço HTTP sem criptografia. Por segurança, o navegador não permite carregá-lo dentro de uma página HTTPS (conteúdo misto). Abra o link no VLC.',
  },
  format: {
    title: 'Formato incompatível com o navegador',
    text: 'Este link não é um fluxo HLS por HTTPS que o navegador consiga tocar. Abra o link no VLC.',
  },
  cors: {
    title: 'O servidor não libera este canal para outros sites',
    text: 'Nosso teste mostrou que o servidor não envia os cabeçalhos CORS necessários, então o navegador bloquearia a reprodução. No VLC costuma funcionar.',
  },
  headers: {
    title: 'O canal exige cabeçalhos que o navegador não envia',
    text: 'A origem pede um User-Agent ou Referer específico. Isso só é possível em players como o VLC.',
  },
};

function pickMode(ch: Channel): { mode: Mode; why?: UnsupportedWhy } {
  if (ch.kind === 'youtube') return { mode: ch.youtube?.embeddable ? 'embed' : 'youtube-link' };
  if (ch.kind === 'http') return { mode: 'unsupported', why: 'http' };
  if (ch.kind === 'other') return { mode: 'unsupported', why: 'format' };
  if (ch.needsHeaders) return { mode: 'unsupported', why: 'headers' };
  if (ch.cors === false) return { mode: 'unsupported', why: 'cors' };
  return { mode: 'hls' };
}

interface Props {
  channel: Channel;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  suggestions: Channel[];
  onPick: (c: Channel) => void;
}

export function Player({ channel, isFavorite, onToggleFavorite, suggestions, onPick }: Props) {
  const { mode, why } = pickMode(channel);
  const [forced, setForced] = useState(false);
  const effectiveMode: Mode = forced ? 'hls' : mode;

  const containerRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [cause, setCause] = useState<Cause>('unknown');
  const [detail, setDetail] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    if (effectiveMode !== 'hls') return;
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let hls: { destroy(): void } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fail = (c: Cause, d = '') => {
      if (disposed) return;
      clearTimeout(timer);
      setCause(c);
      setDetail(d);
      setPhase('error');
    };
    const ready = () => {
      if (disposed) return;
      clearTimeout(timer);
      setPhase('playing');
    };
    const tryPlay = () =>
      video.play().catch((e: unknown) => {
        // Autoplay bloqueado não é falha do canal: o usuário aperta play nos controles.
        if ((e as { name?: string })?.name === 'NotAllowedError') ready();
      });
    const onNativeError = () => fail('media', `video.error ${video.error?.code ?? ''}`);

    video.addEventListener('loadeddata', ready);
    video.addEventListener('playing', ready);

    (async () => {
      let Hls: typeof import('hls.js').default;
      try {
        Hls = (await import('hls.js')).default;
      } catch {
        return fail('unknown', 'Não foi possível carregar o player (hls.js)');
      }
      if (disposed) return;
      timer = setTimeout(() => fail('timeout'), 25_000);
      if (Hls.isSupported()) {
        const inst = new Hls({
          manifestLoadingMaxRetry: 1,
          levelLoadingMaxRetry: 1,
          fragLoadingMaxRetry: 2,
          manifestLoadingTimeOut: 15_000,
        });
        hls = inst;
        inst.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) fail(diagnose(data as HlsErrorLike, channel), `${data.type} / ${data.details}`);
        });
        inst.on(Hls.Events.MANIFEST_PARSED, () => void tryPlay());
        inst.loadSource(channel.url);
        inst.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.addEventListener('error', onNativeError);
        video.src = channel.url;
        void tryPlay();
      } else {
        fail('media', 'Este navegador não suporta HLS');
      }
    })();

    return () => {
      disposed = true;
      clearTimeout(timer);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('playing', ready);
      video.removeEventListener('error', onNativeError);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [effectiveMode, channel, attempt]);

  useEffect(() => {
    const on = () => setIsFull(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen) void el.requestFullscreen();
    else (videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null)?.webkitEnterFullscreen?.();
  }, []);

  const copyLink = useCallback(async () => {
    const ok = await copyText(channel.url);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2500);
  }, [channel.url]);

  const retry = () => {
    setPhase('loading');
    setAttempt((n) => n + 1);
  };

  const embedUrl = youtubeEmbedUrl(channel.youtube);
  const ytWatch = channel.youtube?.id && channel.youtube.type === 'video' ? `https://www.youtube.com/watch?v=${channel.youtube.id}` : channel.url;

  return (
    <section className="player" ref={containerRef} aria-label={`Player: ${channel.name}`}>
      <header className="player-head">
        <ChannelLogo name={channel.name} src={channel.logo} size={48} />
        <div className="player-title">
          <h2>{channel.name}</h2>
          <p>
            <span>
              {countryFlag(channel.country)} {countryName(channel.country)}
            </span>
            {channel.categories[0] && <span>· {categoryLabel(channel.categories[0])}</span>}
            <StatusDot status={channel.status} />
            <ChannelBadges channel={channel} />
          </p>
        </div>
        <div className="player-actions">
          <button
            type="button"
            className={`icon-btn${isFavorite ? ' on' : ''}`}
            onClick={onToggleFavorite}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            title={isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
          >
            {isFavorite ? '♥' : '♡'}
          </button>
          <button type="button" className="icon-btn" onClick={toggleFullscreen} aria-label={isFull ? 'Sair da tela cheia' : 'Tela cheia'} title="Tela cheia">
            {isFull ? '⤡' : '⛶'}
          </button>
        </div>
      </header>

      <div className="stage" data-phase={effectiveMode === 'hls' ? phase : effectiveMode}>
        {effectiveMode === 'hls' && (
          <>
            <video ref={videoRef} controls playsInline autoPlay onDoubleClick={toggleFullscreen} aria-label={`Vídeo de ${channel.name}`} />
            {phase === 'loading' && (
              <div className="overlay" role="status">
                <span className="spinner" aria-hidden="true" />
                Conectando ao canal…
              </div>
            )}
            {phase === 'error' && (
              <div className="overlay overlay-error" role="alert">
                <h3>{CAUSES[cause].title}</h3>
                <p>{CAUSES[cause].text}</p>
                {detail && <p className="tech">Detalhe técnico: {detail}</p>}
                <div className="btn-row">
                  <button type="button" className="btn" onClick={retry}>
                    Tentar novamente
                  </button>
                  <button type="button" className="btn btn-primary" onClick={copyLink}>
                    {copied ? 'Link copiado!' : 'Copiar link para o VLC'}
                  </button>
                </div>
                <Alternatives items={suggestions} onPick={onPick} />
              </div>
            )}
          </>
        )}

        {effectiveMode === 'embed' && embedUrl && (
          <iframe
            title={`YouTube: ${channel.name}`}
            src={embedUrl}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}

        {effectiveMode === 'youtube-link' && (
          <div className="overlay overlay-static">
            <h3>Este canal do YouTube não pode ser incorporado</h3>
            <p>O YouTube não permite exibir esta transmissão dentro de outros sites. Abra diretamente no YouTube.</p>
            <div className="btn-row">
              <a className="btn btn-primary" href={channel.url} target="_blank" rel="noopener noreferrer">
                Abrir no YouTube ↗
              </a>
            </div>
            <Alternatives items={suggestions} onPick={onPick} />
          </div>
        )}

        {effectiveMode === 'unsupported' && why && (
          <div className="overlay overlay-static">
            <h3>{UNSUPPORTED[why].title}</h3>
            <p>{UNSUPPORTED[why].text}</p>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={copyLink}>
                {copied ? 'Link copiado!' : 'Copiar link para o VLC'}
              </button>
              {why === 'cors' && (
                <button type="button" className="btn" onClick={() => setForced(true)}>
                  Tentar mesmo assim
                </button>
              )}
            </div>
            <details className="vlc-help">
              <summary>Como abrir no VLC</summary>
              <ol>
                <li>Copie o link com o botão acima.</li>
                <li>No VLC, abra <b>Mídia → Abrir fluxo de rede</b> (Ctrl+N).</li>
                <li>Cole o link e clique em <b>Reproduzir</b>.</li>
              </ol>
            </details>
            <Alternatives items={suggestions} onPick={onPick} />
          </div>
        )}
      </div>

      {effectiveMode === 'embed' && (
        <p className="player-foot">
          O vídeo não aparece? <a href={ytWatch} target="_blank" rel="noopener noreferrer">Abrir no YouTube ↗</a>
        </p>
      )}
      {effectiveMode === 'hls' && phase === 'playing' && !isBrowserPlayable(channel) && (
        <p className="player-foot">Este canal tocou, mesmo com sinal de bloqueio. Pode ser instável.</p>
      )}
    </section>
  );
}

function Alternatives({ items, onPick }: { items: Channel[]; onPick: (c: Channel) => void }) {
  if (!items.length) return null;
  return (
    <div className="alternatives">
      <h4>Experimente outro canal</h4>
      <ul>
        {items.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onPick(c)}>
              <ChannelLogo name={c.name} src={c.logo} size={28} />
              <span>{c.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
