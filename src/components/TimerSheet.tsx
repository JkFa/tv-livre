import { Moon } from 'lucide-react';
import { formatarRestante, OPCOES_TIMER, rotuloTimer, type OpcaoTimer } from '../lib/timer.ts';
import { Sheet } from './Sheet.tsx';

interface Props {
  open: boolean;
  onClose: () => void;
  ativo: boolean;
  restanteMs: number;
  /** Última escolha (fica marcada). */
  padrao: OpcaoTimer | null;
  /** Há programa com horário de fim? Sem guia, "Fim do programa" não aparece. */
  temPrograma: boolean;
  onEscolher: (o: OpcaoTimer) => void;
  onCancelar: () => void;
}

export function TimerSheet({ open, onClose, ativo, restanteMs, padrao, temPrograma, onEscolher, onCancelar }: Props) {
  return (
    <Sheet id="timer" open={open} onClose={onClose} title="Timer de desligar" variant="modal">
      <div className="timer" data-testid="timer-sheet">
        <p>{ativo ? <>Desliga em <b data-testid="timer-restante">{formatarRestante(restanteMs)}</b>. O volume cai nos últimos 10 segundos.</> : 'A reprodução pausa sozinha. O volume cai aos poucos nos últimos 10 segundos.'}</p>
        <div className="seg seg-wrap" role="group" aria-label="Desligar em">
          {OPCOES_TIMER.filter((o) => o !== 'fim' || temPrograma).map((o) => (
            <button key={o} type="button" aria-pressed={padrao === o} onClick={() => { onEscolher(o); onClose(); }} data-testid={`timer-${o}`}>
              {rotuloTimer(o)}
            </button>
          ))}
        </div>
        {padrao && !ativo && <p className="muted small">Última escolha: {rotuloTimer(padrao)}.</p>}
        {ativo && (
          <button type="button" className="btn" onClick={() => { onCancelar(); onClose(); }} data-testid="timer-cancelar">
            <Moon size={18} aria-hidden="true" /> Cancelar o timer
          </button>
        )}
      </div>
    </Sheet>
  );
}
