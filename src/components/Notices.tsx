import { RefreshCw, WifiOff, X } from 'lucide-react';

export function OfflineBar() {
  return (
    <div className="bar bar-offline" role="status">
      <WifiOff size={18} aria-hidden="true" />
      <span>Sem internet. Seus favoritos continuam aqui, mas para assistir é preciso conexão.</span>
    </div>
  );
}

export function UpdateBar({ onUpdate, onDismiss, playing }: { onUpdate: () => void; onDismiss: () => void; playing: boolean }) {
  return (
    <div className="bar bar-update" role="status">
      <RefreshCw size={18} aria-hidden="true" />
      <span>{playing ? 'Tem versão nova. Atualizar vai interromper o canal.' : 'Tem versão nova do TV Livre.'}</span>
      <button type="button" className="btn btn-accent btn-sm" onClick={onUpdate}>Atualizar</button>
      <button type="button" className="icon-btn" onClick={onDismiss} aria-label="Agora não"><X size={18} /></button>
    </div>
  );
}

export function Toast({ children }: { children: React.ReactNode }) {
  return <div className="toast" role="status">{children}</div>;
}
