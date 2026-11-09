import { Moon, Pause, Play, SkipBack, SkipForward, Tv } from 'lucide-react';
import type { Channel } from '../../shared/types.ts';
import { formatarRestante } from '../lib/timer.ts';

interface Props {
  canal: Channel;
  numero: string;
  programa?: string | undefined;
  /** Já houve toque para tocar (autoplay só depois de uma ação do usuário). */
  armed: boolean;
  tocando: boolean;
  conectando: boolean;
  onPlayPause: () => void;
  onAnterior: () => void;
  onProximo: () => void;
  onTimer: () => void;
  timerAtivo: boolean;
  restanteMs: number;
  onVoltarVideo: () => void;
}

/** Tela do Rádio: número gigante, nome, programa e a luz de transmissão da marca. O vídeo fica oculto. */
export function RadioScreen(p: Props) {
  return (
    <div className="radio-screen" data-testid="radio-screen" data-tocando={p.tocando ? 'on' : 'off'}>
      <p className="radio-kicker"><span className="radio-luz" aria-hidden="true" /> {p.tocando ? 'No ar, só áudio' : p.conectando ? 'Conectando…' : 'Rádio'}</p>
      <span className="radio-num num" aria-hidden="true">{p.numero}</span>
      <h3 className="radio-nome">{p.canal.name}</h3>
      {p.programa && <p className="radio-prog" data-testid="radio-programa">{p.programa}</p>}
      <div className="radio-ctl">
        <button type="button" className="btn btn-icon" onClick={p.onAnterior} aria-label="Canal anterior"><SkipBack size={24} aria-hidden="true" /></button>
        <button type="button" className="btn btn-accent btn-icon radio-play" onClick={p.onPlayPause} aria-label={p.armed && p.tocando ? 'Pausar' : 'Tocar'} data-testid="radio-play">
          {p.armed && p.tocando ? <Pause size={30} fill="currentColor" aria-hidden="true" /> : <Play size={30} fill="currentColor" aria-hidden="true" />}
        </button>
        <button type="button" className="btn btn-icon" onClick={p.onProximo} aria-label="Próximo canal"><SkipForward size={24} aria-hidden="true" /></button>
      </div>
      <div className="btn-row">
        <button type="button" className="btn" onClick={p.onTimer} aria-pressed={p.timerAtivo} data-testid="radio-timer">
          <Moon size={18} aria-hidden="true" /> {p.timerAtivo ? `Desliga em ${formatarRestante(p.restanteMs)}` : 'Timer'}
        </button>
        <button type="button" className="btn" onClick={p.onVoltarVideo} data-testid="radio-video">
          <Tv size={18} aria-hidden="true" /> Voltar ao vídeo
        </button>
      </div>
    </div>
  );
}
