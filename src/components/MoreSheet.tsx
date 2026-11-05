import { Download, Info, Keyboard } from 'lucide-react';
import type { ThemePref } from '../lib/prefs.ts';
import { Sheet } from './Sheet.tsx';

interface Props {
  open: boolean;
  onClose: () => void;
  theme: ThemePref;
  onTheme: (t: ThemePref) => void;
  onShortcuts: () => void;
  dataDate?: string;
}

export function MoreSheet({ open, onClose, theme, onTheme, onShortcuts, dataDate }: Props) {
  return (
    <Sheet id="mais" open={open} onClose={onClose} title="Mais">
      <ul className="menu">
        <li>
          <a href="#/instalar" onClick={onClose}>
            <Download size={22} aria-hidden="true" /> Instalar o aplicativo
          </a>
        </li>
        <li>
          <a href="#/sobre" onClick={onClose}>
            <Info size={22} aria-hidden="true" /> Sobre, fontes e remoção de canais
          </a>
        </li>
        <li className="menu-desktop">
          <button type="button" onClick={() => { onClose(); onShortcuts(); }}>
            <Keyboard size={22} aria-hidden="true" /> Atalhos do teclado
          </button>
        </li>
      </ul>
      <fieldset className="field">
        <legend>Tema</legend>
        <div className="seg">
          {(['auto', 'claro', 'escuro'] as const).map((t) => (
            <button key={t} type="button" aria-pressed={theme === t} onClick={() => onTheme(t)}>
              {t === 'auto' ? 'Automático' : t === 'claro' ? 'Claro' : 'Escuro'}
            </button>
          ))}
        </div>
      </fieldset>
      {dataDate && <p className="muted small">Lista de canais atualizada em {dataDate}.</p>}
    </Sheet>
  );
}
