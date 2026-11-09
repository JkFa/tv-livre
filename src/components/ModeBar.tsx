import { Moon } from 'lucide-react';
import { ConsumoSessao, MODOS, ROTULO_MODO, textoConsumo, type InfoConsumo, type ModoAudio } from '../lib/modo.ts';
import { formatarRestante } from '../lib/timer.ts';

interface Props {
  modo: ModoAudio;
  onModo: (m: ModoAudio) => void;
  /** Canal HLS (os modos Econômico e Rádio não existem para o YouTube). */
  disponivel: boolean;
  info: InfoConsumo | null;
  sessaoMB: number;
  timerAtivo: boolean;
  restanteMs: number;
  onTimer: () => void;
}

/** Seletor de modos + consumo honesto + timer, sempre abaixo do dial. */
export function ModeBar({ modo, onModo, disponivel, info, sessaoMB, timerAtivo, restanteMs, onTimer }: Props) {
  const t = textoConsumo(modo, info, sessaoMB);
  return (
    <div className="modebar" data-testid="modebar">
      <div className="modebar-row">
        <div className="seg" role="group" aria-label="Modo de áudio e dados">
          {MODOS.map((m) => (
            <button key={m} type="button" aria-pressed={modo === m} onClick={() => onModo(m)} data-testid={`modo-${m}`}>
              {ROTULO_MODO[m]}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-sm" onClick={onTimer} aria-pressed={timerAtivo} data-testid="timer-btn" aria-label={timerAtivo ? `Timer de desligar: faltam ${formatarRestante(restanteMs)}` : 'Timer de desligar'}>
          <Moon size={16} aria-hidden="true" /> {timerAtivo ? formatarRestante(restanteMs) : 'Timer'}
        </button>
      </div>
      {disponivel ? (
        <p className="modebar-info muted" data-testid="consumo">
          {t.linha}
          {t.aviso && <span className="modebar-aviso" data-testid="consumo-aviso"> {t.aviso}</span>}
        </p>
      ) : (
        <p className="modebar-info muted" data-testid="consumo">Econômico e Rádio só funcionam em canais de vídeo HLS; este canal usa o YouTube.</p>
      )}
    </div>
  );
}

export { ConsumoSessao };
