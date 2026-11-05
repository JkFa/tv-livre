import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Star } from 'lucide-react';
import type { Channel } from '../../shared/types.ts';
import { categoryLabel, countryName } from '../lib/labels.ts';
import { channelKey, formatNumber } from '../lib/lineup.ts';
import { ChannelBadges, StatusMark } from './Badges.tsx';

interface Props {
  channels: Channel[];
  numbers: Map<string, number>;
  selectedKey: string | null;
  showCountry: boolean;
  isFavorite: (c: Channel) => boolean;
  onToggleFavorite: (c: Channel) => void;
  onSelect: (c: Channel) => void;
  /** Conteúdo exibido quando a lista está vazia (mensagem + ações). */
  empty: React.ReactNode;
  loading: boolean;
}

const ROW_HEIGHT = 60;

/**
 * A "grade" de canais: uma tabela tipográfica. O número de grade é o elemento gráfico; o canal sintonizado
 * ganha o bloco de número preenchido com o acento. Virtualizada: só as linhas visíveis existem no DOM.
 */
export function ChannelList({ channels, numbers, selectedKey, showCountry, isFavorite, onToggleFavorite, onSelect, empty, loading }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- API do TanStack Virtual; o componente não depende de memoização
  const virtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // volta ao topo quando a lista muda de conteúdo (busca/filtro/aba)
  const firstKey = channels[0] ? channelKey(channels[0]) : '';
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [firstKey, channels.length]);

  if (loading && !channels.length) {
    return (
      <div className="list-scroll" aria-busy="true" aria-label="Carregando canais">
        {Array.from({ length: 9 }, (_, i) => (
          <div className="row row-skeleton" key={i} style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}>
            <span className="sk sk-num" />
            <span className="sk sk-name" style={{ width: `${48 + ((i * 17) % 38)}%` }} />
          </div>
        ))}
      </div>
    );
  }
  if (!channels.length) return <div className="list-empty" role="status">{empty}</div>;

  return (
    <div className="list-scroll" ref={scrollRef} data-testid="channel-list">
      <ul className="list-inner" style={{ height: virtualizer.getTotalSize() }} aria-label={`${channels.length} canais`}>
        {virtualizer.getVirtualItems().map((v) => {
          const ch = channels[v.index];
          if (!ch) return null;
          const key = channelKey(ch);
          const fav = isFavorite(ch);
          const selected = selectedKey === key;
          const sub = [showCountry ? countryName(ch.country) : '', ch.categories[0] ? categoryLabel(ch.categories[0]) : ''].filter(Boolean).join(' · ');
          return (
            <li
              key={key}
              className={`row${selected ? ' selected' : ''}${ch.status === 'offline' ? ' is-off' : ''}`}
              style={{ height: v.size, transform: `translateY(${v.start}px)` }}
              data-testid="channel-row"
            >
              <button type="button" className="row-main" onClick={() => onSelect(ch)} aria-current={selected ? 'true' : undefined}>
                <span className="row-num num" aria-hidden="true">{formatNumber(numbers.get(key))}</span>
                <span className="row-text">
                  <span className="row-name">{ch.name}</span>
                  <span className="row-meta">
                    <StatusMark status={ch.status} withText />
                    {sub && <span className="row-sub">{sub}</span>}
                    <ChannelBadges channel={ch} />
                  </span>
                </span>
              </button>
              <button
                type="button"
                className={`fav${fav ? ' on' : ''}`}
                aria-pressed={fav}
                aria-label={fav ? `Remover ${ch.name} dos favoritos` : `Favoritar ${ch.name}`}
                onClick={() => onToggleFavorite(ch)}
              >
                <Star size={20} fill={fav ? 'currentColor' : 'none'} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
