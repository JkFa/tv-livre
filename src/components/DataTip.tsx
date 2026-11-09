import { Radio, X } from 'lucide-react';
import type { ModoAudio } from '../lib/modo.ts';

interface Props {
  onEscolher: (m: ModoAudio) => void;
  onDispensar: () => void;
}

/** Convite discreto (uma vez; dispensável; não volta por 30 dias) para quem está com dados limitados. */
export function DataTip({ onEscolher, onDispensar }: Props) {
  return (
    <div className="datatip" role="region" aria-label="Economizar dados" data-testid="datatip">
      <Radio size={18} aria-hidden="true" />
      <span>Sua conexão parece limitada. Economize dados:</span>
      <button type="button" className="link-btn" onClick={() => onEscolher('economico')}>Econômico</button>
      <button type="button" className="link-btn" onClick={() => onEscolher('radio')}>Rádio</button>
      <button type="button" className="icon-btn" onClick={onDispensar} aria-label="Dispensar sugestão"><X size={18} /></button>
    </div>
  );
}
