import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Channel, DataIndex } from '../shared/types.ts';
import { About } from './components/About.tsx';
import { ChannelList } from './components/ChannelList.tsx';
import { ALL_COUNTRIES, FilterBar } from './components/FilterBar.tsx';
import { Player } from './components/Player.tsx';
import { Welcome } from './components/Welcome.tsx';
import { loadCountries, loadIndex } from './lib/data.ts';
import { compareForDisplay, EMPTY_FILTERS, filterChannels, suggestAlternatives, type Filters } from './lib/filter.ts';
import { useFavorites, useRecents, type ChannelRef } from './lib/library.ts';
import { channelHref, navigate, useRoute } from './lib/router.ts';
import { readString, writeString } from './lib/storage.ts';

type Tab = 'todos' | 'favoritos' | 'recentes';
const COUNTRY_KEY = 'tvlivre:pais';
const nf = new Intl.NumberFormat('pt-BR');

export default function App() {
  const route = useRoute();
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [country, setCountry] = useState<string>(() => readString(COUNTRY_KEY) ?? 'BR');
  const [tab, setTab] = useState<Tab>('todos');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [store, setStore] = useState<Record<string, Channel[]>>({});
  const { favorites, isFavorite, toggle } = useFavorites();
  const { recents, push: pushRecent, clear: clearRecents } = useRecents();

  const deferredQuery = useDeferredValue(filters.query);

  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Erro ao carregar os dados'));
  }, []);

  // Se o país salvo não existir mais nos dados, volta para o Brasil.
  const effectiveCountry = useMemo(() => {
    if (!index || country === ALL_COUNTRIES) return country;
    return index.countries.some((c) => c.code === country) ? country : (index.countries[0]?.code ?? 'BR');
  }, [index, country]);

  const routeCountry = route.name === 'channel' ? route.country : null;

  // quais arquivos de país precisamos agora
  const needed = useMemo(() => {
    if (!index) return [] as string[];
    const set = new Set<string>();
    if (tab === 'todos') {
      if (effectiveCountry === ALL_COUNTRIES) index.countries.forEach((c) => set.add(c.code));
      else set.add(effectiveCountry);
    } else {
      const refs: ChannelRef[] = tab === 'favoritos' ? favorites : recents;
      refs.forEach((r) => set.add(r.country));
    }
    if (routeCountry) set.add(routeCountry);
    return [...set];
  }, [index, tab, effectiveCountry, favorites, recents, routeCountry]);

  const missing = needed.filter((c) => !(c in store));
  const missingKey = missing.join(',');
  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    const codes = missingKey.split(',');
    loadCountries(codes)
      .then((all) => {
        if (cancelled) return;
        const grouped: Record<string, Channel[]> = Object.fromEntries(codes.map((c) => [c, []]));
        for (const ch of all) (grouped[ch.country] ??= []).push(ch);
        setStore((s) => ({ ...s, ...grouped }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  const baseList = useMemo<Channel[]>(() => {
    if (tab === 'todos') {
      if (effectiveCountry === ALL_COUNTRIES) {
        return Object.values(store).flat().sort(compareForDisplay);
      }
      return store[effectiveCountry] ?? [];
    }
    const refs = tab === 'favoritos' ? favorites : recents;
    const out: Channel[] = [];
    for (const r of refs) {
      const found = store[r.country]?.find((c) => c.id === r.id);
      if (found) out.push(found);
    }
    return out;
  }, [tab, effectiveCountry, store, favorites, recents]);

  const visible = useMemo(
    () => filterChannels(baseList, { ...filters, query: deferredQuery }),
    [baseList, filters, deferredQuery],
  );

  const selected = useMemo(
    () => (route.name === 'channel' ? (store[route.country]?.find((c) => c.id === route.id) ?? null) : null),
    [route, store],
  );
  const selectedLoading = route.name === 'channel' && !selected && (route.country in store ? false : true);
  const selectedMissing = route.name === 'channel' && !selected && route.country in store;

  useEffect(() => {
    document.title = selected ? `${selected.name} — TV Livre` : route.name === 'about' ? 'Sobre — TV Livre' : 'TV Livre — TV aberta ao vivo';
  }, [selected, route.name]);

  const select = useCallback(
    (c: Channel) => {
      pushRecent(c);
      navigate(channelHref(c.country, c.id));
    },
    [pushRecent],
  );

  const changeCountry = (code: string) => {
    setCountry(code);
    writeString(COUNTRY_KEY, code);
    setTab('todos');
  };

  const suggestions = useMemo(
    () => (selected ? suggestAlternatives(selected, store[selected.country] ?? []) : []),
    [selected, store],
  );
  const starters = useMemo(() => (store[effectiveCountry] ?? baseList).slice(0, 60), [store, effectiveCountry, baseList]);

  const loading = missing.length > 0 && baseList.length === 0;
  const onlineCount = visible.filter((c) => c.status === 'online').length;

  const emptyText = loading
    ? 'Carregando canais…'
    : tab === 'favoritos'
      ? 'Você ainda não favoritou nenhum canal. Toque no ♡ de um canal para guardá-lo aqui.'
      : tab === 'recentes'
        ? 'Os canais que você assistir aparecem aqui.'
        : 'Nenhum canal encontrado com esses filtros.';

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/" aria-label="TV Livre, página inicial">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
            <path d="M11 4 16 9l5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="3" y="9" width="26" height="18" rx="5" fill="var(--accent)" />
            <rect x="6.5" y="12.5" width="14" height="11" rx="2.5" fill="var(--bg)" />
            <circle cx="25" cy="15" r="1.6" fill="var(--bg)" />
            <circle cx="25" cy="21" r="1.6" fill="var(--bg)" />
            <circle cx="13.5" cy="18" r="2.6" fill="var(--live)" />
          </svg>
          <span>
            TV <b>Livre</b>
          </span>
        </a>
        <nav aria-label="Principal">
          <a href="#/" aria-current={route.name !== 'about' ? 'page' : undefined}>Canais</a>
          <a href="#/sobre" aria-current={route.name === 'about' ? 'page' : undefined}>Sobre</a>
        </nav>
      </header>

      {route.name === 'about' ? (
        <main className="page">
          <About />
        </main>
      ) : loadError ? (
        <main className="page">
          <div className="notice" role="alert">
            <h1>Não foi possível carregar os canais</h1>
            <p>{loadError}</p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Recarregar</button>
          </div>
        </main>
      ) : !index ? (
        <main className="page">
          <p className="center muted" role="status">Carregando…</p>
        </main>
      ) : (
        <main className={`workspace${route.name === 'channel' ? ' has-player' : ''}`}>
          <aside className="sidebar" aria-label="Lista de canais">
            <div className="tabs" role="tablist">
              {(
                [
                  ['todos', 'Canais'],
                  ['favoritos', `Favoritos${favorites.length ? ` (${favorites.length})` : ''}`],
                  ['recentes', 'Recentes'],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>

            <div className="search">
              <input
                type="search"
                value={filters.query}
                onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                placeholder="Buscar canal pelo nome…"
                aria-label="Buscar canal pelo nome"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <FilterBar index={index} country={effectiveCountry} onCountry={changeCountry} filters={filters} onFilters={setFilters} />

            <div className="summary" aria-live="polite">
              <span data-testid="result-count">
                {loading ? 'Carregando…' : `${nf.format(visible.length)} canais`}
              </span>
              {!loading && visible.length > 0 && <span className="muted"> · {nf.format(onlineCount)} online</span>}
              {tab === 'recentes' && recents.length > 0 && (
                <button type="button" className="link-btn" onClick={clearRecents}>Limpar histórico</button>
              )}
            </div>

            <ChannelList
              channels={visible}
              selectedId={selected?.id ?? null}
              showCountry={effectiveCountry === ALL_COUNTRIES || tab !== 'todos'}
              isFavorite={isFavorite}
              onToggleFavorite={toggle}
              onSelect={select}
              empty={emptyText}
            />
          </aside>

          <section className="main-col">
            {selected ? (
              <Player
                key={`${selected.country}/${selected.id}`}
                channel={selected}
                isFavorite={isFavorite(selected)}
                onToggleFavorite={() => toggle(selected)}
                suggestions={suggestions}
                onPick={select}
              />
            ) : selectedLoading ? (
              <p className="center muted" role="status">Carregando canal…</p>
            ) : selectedMissing ? (
              <div className="notice" role="alert">
                <h2>Canal não encontrado</h2>
                <p>Este canal pode ter sido removido nas últimas atualizações. Escolha outro na lista.</p>
              </div>
            ) : (
              <Welcome index={index} starters={starters} onPick={select} />
            )}
          </section>
        </main>
      )}
    </div>
  );
}
