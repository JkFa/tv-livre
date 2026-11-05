import { Ellipsis, Search, Shuffle, Star, Tv } from 'lucide-react';

interface Props {
  view: 'todos' | 'favoritos' | 'recentes';
  onView: (v: 'todos' | 'favoritos') => void;
  onShuffle: () => void;
  onSearch: () => void;
  onMore: () => void;
}

/** Navegação ao alcance do polegar. O botão central (Zapear) é a ação principal do app. */
export function BottomNav({ view, onView, onShuffle, onSearch, onMore }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      <button type="button" aria-current={view === 'todos' ? 'page' : undefined} onClick={() => onView('todos')}>
        <Tv size={22} aria-hidden="true" />
        <span>Canais</span>
      </button>
      <button type="button" aria-current={view !== 'todos' ? 'page' : undefined} onClick={() => onView('favoritos')}>
        <Star size={22} aria-hidden="true" />
        <span>Favoritos</span>
      </button>
      <button type="button" className="zap-btn" onClick={onShuffle} data-testid="zapear">
        <Shuffle size={24} aria-hidden="true" />
        <span>Zapear</span>
      </button>
      <button type="button" onClick={onSearch}>
        <Search size={22} aria-hidden="true" />
        <span>Buscar</span>
      </button>
      <button type="button" onClick={onMore}>
        <Ellipsis size={22} aria-hidden="true" />
        <span>Mais</span>
      </button>
    </nav>
  );
}
