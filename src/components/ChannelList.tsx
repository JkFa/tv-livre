import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Channel } from '../../shared/types.ts';
import { categoryLabel, countryFlag } from '../lib/labels.ts';
import { ChannelBadges, StatusDot } from './Badges.tsx';
import { ChannelLogo } from './ChannelLogo.tsx';

interface Props {
  channels: Channel[];
  selectedId: string | null;
  showCountry: boolean;
  isFavorite: (c: Channel) => boolean;
  onToggleFavorite: (c: Channel) => void;
  onSelect: (c: Channel) => void;
  empty: string;
}

const ROW_HEIGHT = 68;

/** Lista virtualizada: só as linhas visíveis existem no DOM, mesmo com milhares de canais. */
export function ChannelList({ channels, selectedId, showCountry, isFavorite, onToggleFavorite, onSelect, empty }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- API do TanStack Virtual; o componente é simples e não depende de memoização
  const virtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (!channels.length) {
    return (
      <div className="list-empty" role="status">
        {empty}
      </div>
    );
  }

  return (
    <div className="list-scroll" ref={scrollRef} data-testid="channel-list">
      <ul className="list-inner" style={{ height: virtualizer.getTotalSize() }} aria-label={`${channels.length} canais`}>
        {virtualizer.getVirtualItems().map((v) => {
          const ch = channels[v.index];
          if (!ch) return null;
          const fav = isFavorite(ch);
          return (
            <li
              key={`${ch.country}/${ch.id}`}
              className={`row${selectedId === ch.id ? ' selected' : ''}`}
              style={{ height: v.size, transform: `translateY(${v.start}px)` }}
              data-testid="channel-row"
            >
              <button type="button" className="row-main" onClick={() => onSelect(ch)} aria-current={selectedId === ch.id ? 'true' : undefined}>
                <ChannelLogo name={ch.name} src={ch.logo} />
                <span className="row-text">
                  <span className="row-name">{ch.name}</span>
                  <span className="row-meta">
                    <StatusDot status={ch.status} />
                    {showCountry && <span>{countryFlag(ch.country)}</span>}
                    {ch.categories[0] && <span className="row-cat">{categoryLabel(ch.categories[0])}</span>}
                    <ChannelBadges channel={ch} />
                  </span>
                </span>
              </button>
              <button
                type="button"
                className={`icon-btn fav${fav ? ' on' : ''}`}
                aria-pressed={fav}
                aria-label={fav ? `Remover ${ch.name} dos favoritos` : `Favoritar ${ch.name}`}
                onClick={() => onToggleFavorite(ch)}
              >
                {fav ? '♥' : '♡'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
