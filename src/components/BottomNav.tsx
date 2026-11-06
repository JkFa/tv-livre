import { Ellipsis, House, Search, Shuffle, Tv } from 'lucide-react';

export type Section = 'home' | 'watch' | 'doc';

interface Props {
  section: Section;
  onHome: () => void;
  onWatch: () => void;
  onShuffle: () => void;
  onSearch: () => void;
  onMore: () => void;
}

/** Navegação ao alcance do polegar. O botão central (Zapear) é a ação principal do app. */
export function BottomNav({ section, onHome, onWatch, onShuffle, onSearch, onMore }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      <button type="button" aria-current={section === 'home' ? 'page' : undefined} onClick={onHome}>
        <House size={22} aria-hidden="true" />
        <span>Início</span>
      </button>
      <button type="button" aria-current={section === 'watch' ? 'page' : undefined} onClick={onWatch}>
        <Tv size={22} aria-hidden="true" />
        <span>Canais</span>
      </button>
      <button type="button" className="zap-btn" onClick={onShuffle} data-testid="zapear">
        <Shuffle size={24} aria-hidden="true" />
        <span>Zapear</span>
      </button>
      <button type="button" onClick={onSearch}>
        <Search size={22} aria-hidden="true" />
        <span>Buscar</span>
      </button>
      <button type="button" aria-current={section === 'doc' ? 'page' : undefined} onClick={onMore}>
        <Ellipsis size={22} aria-hidden="true" />
        <span>Mais</span>
      </button>
    </nav>
  );
}
