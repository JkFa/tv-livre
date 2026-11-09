import { Download, Info, Keyboard, Tv } from 'lucide-react';
import type { ThemePref } from '../lib/prefs.ts';
import type { TvPref } from '../lib/tvmode.ts';
import { Sheet } from './Sheet.tsx';

interface Props {
  open: boolean;
  onClose: () => void;
  theme: ThemePref;
  onTheme: (t: ThemePref) => void;
  onShortcuts: () => void;
  /** Abre "Assistir na Smart TV" (endereço e número do canal em letras grandes). */
  onSmartTv: () => void;
  tvPref: TvPref;
  onTvPref: (p: TvPref) => void;
  dataDate?: string;
}

export function MoreSheet({ open, onClose, theme, onTheme, onShortcuts, onSmartTv, tvPref, onTvPref, dataDate }: Props) {
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
        <li>
          <button type="button" onClick={() => { onClose(); onSmartTv(); }} data-testid="more-smarttv">
            <Tv size={22} aria-hidden="true" /> Assistir na Smart TV
          </button>
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
      <fieldset className="field">
        <legend>Modo TV</legend>
        <div className="seg">
          {(['auto', 'ligado', 'desligado'] as const).map((t) => (
            <button key={t} type="button" aria-pressed={tvPref === t} onClick={() => onTvPref(t)}>
              {t === 'auto' ? 'Automático' : t === 'ligado' ? 'Ligado' : 'Desligado'}
            </button>
          ))}
        </div>
        <p className="muted small">Tela cheia e navegação só pelo controle remoto (setas, OK, Voltar, números). Liga sozinho em navegadores de TV.</p>
      </fieldset>
      {dataDate && <p className="muted small">Lista de canais atualizada em {dataDate}.</p>}
    </Sheet>
  );
}
