import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ChevronDown, Download, Keyboard, Moon, Search, SlidersHorizontal, Sun, X } from 'lucide-react';
import type { Channel, DataIndex } from '../shared/types.ts';
import { About } from './components/About.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { ChannelList } from './components/ChannelList.tsx';
import { ALL_COUNTRIES, FilterSheet, activeFilterCount } from './components/FilterSheet.tsx';
import { InstallPage } from './components/InstallPage.tsx';
import { Mark, Wordmark } from './components/Mark.tsx';
import { MoreSheet } from './components/MoreSheet.tsx';
import { OfflineBar, Toast, UpdateBar } from './components/Notices.tsx';
import { Player, type Neighbor } from './components/Player.tsx';
import { ShortcutsDialog } from './components/ShortcutsDialog.tsx';
import { registerVisit, shouldCount } from './lib/counter.ts';
import { loadCountries, loadIndex } from './lib/data.ts';
import { compareForDisplay, EMPTY_FILTERS, filterChannels, suggestAlternatives, type Filters } from './lib/filter.ts';
import { categoryLabel, countryName, languageName, STATUS_LABELS } from './lib/labels.ts';
import { useFavorites, useRecents, type ChannelRef } from './lib/library.ts';
import { buildNumbers, channelKey, findByNumber, formatNumber, pickShuffle, stepChannel } from './lib/lineup.ts';
import { applyTheme, getLastChannel, getTheme, setLastChannel, setTheme, type ThemePref } from './lib/prefs.ts';
import { captureInstallPrompt, useInstall, useOnline } from './lib/pwa.ts';
import { channelHref, navigate, parseHash, useRoute } from './lib/router.ts';
import { readString, writeString } from './lib/storage.ts';
import { useShortcuts } from './lib/shortcuts.ts';
import { applyTv, getTvPref, resolveTv, setTvPref, type TvPref } from './lib/tvmode.ts';
import { useTvRemote } from './lib/tvremote.ts';

captureInstallPrompt();

type View = 'todos' | 'favoritos' | 'recentes';
const COUNTRY_KEY = 'tvlivre:pais';
const nf = new Intl.NumberFormat('pt-BR');

export default function App() {
  const route = useRoute();
  const online = useOnline();
  const install = useInstall();
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [country, setCountry] = useState<string>(() => readString(COUNTRY_KEY) ?? 'BR');
  const [view, setView] = useState<View>('todos');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [store, setStore] = useState<Record<string, Channel[]>>({});
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sheet, setSheet] = useState<null | 'filters' | 'more' | 'help'>(null);
  const [theme, setThemeState] = useState<ThemePref>(() => getTheme());
  const [toast, setToast] = useState<string | null>(null);
  const [visits, setVisits] = useState<number | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [tvPref, setTvPrefState] = useState<TvPref>(() => getTvPref());
  const [guideOpen, setGuideOpen] = useState(false);
  const [focusReq, setFocusReq] = useState(0);
  const tv = resolveTv(tvPref);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingZap = useRef(false);
  const tuneRef = useRef<(c: Channel) => void>(() => undefined);
  const last = useMemo(() => getLastChannel(), []);

  const { favorites, isFavorite, toggle } = useFavorites();
  const { recents, push: pushRecent, clear: clearRecents } = useRecents();
  const deferredQuery = useDeferredValue(filters.query);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // confere se há versão nova a cada hora, sem recarregar nada sozinho
      if (reg) setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });

  const say = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ---- carga inicial: índice + contador de acessos ----
  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Erro ao carregar os dados'));
    if (shouldCount()) void registerVisit().then(setVisits);
  }, []);

  const effectiveCountry = useMemo(() => {
    if (!index || country === ALL_COUNTRIES) return country;
    return index.countries.some((c) => c.code === country) ? country : (index.countries[0]?.code ?? 'BR');
  }, [index, country]);

  const routeCountry = route.name === 'channel' ? route.country : null;

  // quais arquivos de país são necessários agora
  const needed = useMemo(() => {
    if (!index) return [] as string[];
    const set = new Set<string>();
    if (view === 'todos') {
      if (effectiveCountry === ALL_COUNTRIES) index.countries.forEach((c) => set.add(c.code));
      else set.add(effectiveCountry);
    } else {
      const refs: ChannelRef[] = view === 'favoritos' ? favorites : recents;
      refs.forEach((r) => set.add(r.country));
    }
    if (routeCountry) set.add(routeCountry);
    if (last) set.add(last.country);
    return [...set];
  }, [index, view, effectiveCountry, favorites, recents, routeCountry, last]);

  const missingKey = needed.filter((c) => !(c in store)).join(',');
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
        if (pendingZap.current && all.length) {
          pendingZap.current = false;
          const pick = pickShuffle(all.filter((c) => c.country === (codes[0] ?? '')), null);
          if (pick) tuneRef.current(pick);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  const numbers = useMemo(() => buildNumbers(store), [store]);

  const baseList = useMemo<Channel[]>(() => {
    if (view === 'todos') {
      return effectiveCountry === ALL_COUNTRIES ? Object.values(store).flat().sort(compareForDisplay) : (store[effectiveCountry] ?? []);
    }
    const refs = view === 'favoritos' ? favorites : recents;
    const out: Channel[] = [];
    for (const r of refs) {
      const found = store[r.country]?.find((c) => c.id === r.id);
      if (found) out.push(found);
    }
    return out;
  }, [view, effectiveCountry, store, favorites, recents]);

  const visible = useMemo(() => filterChannels(baseList, { ...filters, query: deferredQuery }), [baseList, filters, deferredQuery]);

  const selected = useMemo(
    () => (route.name === 'channel' ? (store[route.country]?.find((c) => c.id === route.id) ?? null) : null),
    [route, store],
  );
  const selectedKey = selected ? channelKey(selected) : null;
  const selectedLoading = route.name === 'channel' && !selected && !(route.country in store);
  const selectedMissing = route.name === 'channel' && !selected && route.country in store;

  const resumeChannel = useMemo(() => (last ? (store[last.country]?.find((c) => c.id === last.id) ?? null) : null), [last, store]);

  // ---- sintonizar / zapear ----
  const tune = useCallback(
    (c: Channel) => {
      setArmed(true);
      pushRecent(c);
      setLastChannel({ id: c.id, country: c.country });
      navigate(channelHref(c.country, c.id));
    },
    [pushRecent],
  );
  useEffect(() => {
    tuneRef.current = tune;
  });

  const zapList = visible.length ? visible : baseList;
  const zap = useCallback(
    (dir: 1 | -1) => {
      const next = stepChannel(zapList, selectedKey, dir);
      if (next) tune(next);
      else say('Nenhum outro canal disponível nessa lista.');
    },
    [zapList, selectedKey, tune, say],
  );
  const shuffle = useCallback(() => {
    if (!index) return;
    const pool = visible.length ? visible : baseList;
    if (!pool.length && missingKey) {
      pendingZap.current = true; // dados ainda carregando: sorteia assim que chegarem
      return;
    }
    const pick = pickShuffle(pool, selectedKey) ?? pickShuffle(baseList, selectedKey);
    if (pick) tune(pick);
    else say('Nenhum canal no ar com esses filtros. Tente limpar os filtros.');
  }, [index, visible, baseList, missingKey, selectedKey, tune, say]);

  const tuneNumber = useCallback(
    (n: number) => {
      const list = effectiveCountry === ALL_COUNTRIES ? baseList : (store[effectiveCountry] ?? []);
      const c = findByNumber(list, numbers, n);
      if (c) tune(c);
      else say(`Não existe canal ${formatNumber(n)} nessa grade.`);
    },
    [effectiveCountry, baseList, store, numbers, tune, say],
  );

  const power = useCallback(() => {
    if (resumeChannel) tune(resumeChannel);
    else shuffle();
  }, [resumeChannel, tune, shuffle]);

  // ---- foco na busca / navegação ----
  const goHome = useCallback(() => {
    if (parseHash(window.location.hash).name === 'about' || parseHash(window.location.hash).name === 'install') navigate('#/');
  }, []);
  const focusSearch = useCallback(() => {
    goHome();
    setView('todos');
    requestAnimationFrame(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    });
  }, [goHome]);

  const isDoc = route.name === 'about' || route.name === 'install';

  // ---- Modo TV: a grade vira um painel sobre o vídeo em tela cheia, aberto e fechado pelo controle remoto ----
  const changeTvPref = useCallback((p: TvPref) => {
    setTvPref(p);
    setTvPrefState(p);
    setGuideOpen(false);
  }, []);
  useEffect(() => {
    applyTv(tv);
  }, [tv]);
  const guideShown = tv && guideOpen;
  const openGuide = useCallback(() => {
    setGuideOpen(true);
    setFocusReq((n) => n + 1);
  }, []);
  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, []);

  const digits = useShortcuts({
    zap,
    shuffle,
    focusSearch,
    toggleHelp: () => setSheet((s) => (s === 'help' ? null : 'help')),
    tuneNumber,
    toggleTv: () => changeTvPref(tv ? 'desligado' : 'ligado'),
  });
  useTvRemote({
    enabled: tv && !isDoc && !!index,
    guideOpen: guideShown,
    digits,
    openGuide,
    closeGuide,
    zap,
    shuffle,
    toggleFavorite: () => selected && toggle(selected),
    openFilters: () => setSheet('filters'),
    searchGuide: () => {
      openGuide();
      requestAnimationFrame(() => searchRef.current?.focus());
    },
  });

  // atalhos do app instalado (#/zapear, #/favoritos, #/buscar): executam e voltam para a home
  useEffect(() => {
    const handle = () => {
      const r = parseHash(window.location.hash);
      if (r.name !== 'action') return;
      navigate('#/');
      if (r.action === 'favorites') setView('favoritos');
      if (r.action === 'search') focusSearch();
      if (r.action === 'zap') shuffle();
    };
    handle();
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, [focusSearch, shuffle]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const changeTheme = (t: ThemePref) => {
    setTheme(t);
    setThemeState(t);
  };

  useEffect(() => {
    document.title = selected
      ? `${formatNumber(numbers.get(channelKey(selected)))} ${selected.name} — TV Livre`
      : route.name === 'about'
        ? 'Sobre — TV Livre'
        : route.name === 'install'
          ? 'Instalar — TV Livre'
          : 'TV Livre — TV aberta ao vivo';
  }, [selected, route.name, numbers]);

  const changeCountry = (code: string) => {
    setCountry(code);
    writeString(COUNTRY_KEY, code);
    setView('todos');
  };

  const neighbor = (dir: 1 | -1): Neighbor | null => {
    const c = stepChannel(zapList, selectedKey, dir);
    return c ? { number: formatNumber(numbers.get(channelKey(c))), name: c.name } : null;
  };
  const suggestions = useMemo(() => (selected ? suggestAlternatives(selected, store[selected.country] ?? []) : []), [selected, store]);

  const loading = !!missingKey && baseList.length === 0;
  const onlineCount = visible.filter((c) => c.status === 'online').length;
  const nFilters = activeFilterCount(filters);
  const countryLabel = effectiveCountry === ALL_COUNTRIES ? 'Todos os países' : countryName(effectiveCountry);
  const query = filters.query.trim();

  const clearAll = () => setFilters({ ...EMPTY_FILTERS });
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.category) chips.push({ label: categoryLabel(filters.category), clear: () => setFilters({ ...filters, category: '' }) });
  if (filters.language) chips.push({ label: languageName(filters.language), clear: () => setFilters({ ...filters, language: '' }) });
  if (filters.status) chips.push({ label: STATUS_LABELS[filters.status], clear: () => setFilters({ ...filters, status: '' }) });
  if (filters.playableOnly) chips.push({ label: 'Só no navegador', clear: () => setFilters({ ...filters, playableOnly: false }) });

  const empty = (
    <>
      {view === 'favoritos' && !favorites.length ? (
        <p>Nenhum favorito ainda. Toque na estrela de um canal para guardá-lo aqui.</p>
      ) : view === 'recentes' && !recents.length ? (
        <p>Os canais que você assistir aparecem aqui.</p>
      ) : query ? (
        <>
          <p>Nada com “{query}” em {countryLabel}.</p>
          <div className="btn-row">
            {effectiveCountry !== ALL_COUNTRIES && view === 'todos' && (
              <button type="button" className="btn" onClick={() => changeCountry(ALL_COUNTRIES)}>Procurar em todos os países</button>
            )}
            <button type="button" className="btn" onClick={() => setFilters({ ...filters, query: '' })}>Limpar busca</button>
          </div>
        </>
      ) : (
        <>
          <p>Nenhum canal com esses filtros.</p>
          <div className="btn-row">
            <button type="button" className="btn" onClick={clearAll}>Limpar filtros</button>
          </div>
        </>
      )}
    </>
  );

  const dataDate = index ? new Date(index.meta.generatedAt).toLocaleDateString('pt-BR', { dateStyle: 'long' }) : undefined;
  const showInstallBtn = install.kind === 'prompt' && !install.dismissed && !playing;
  const showIosBar = install.kind === 'ios' && !install.dismissed && !playing && !isDoc;

  return (
    <div className="app" data-doc={isDoc ? '' : undefined}>
      <header className="topbar">
        <a className="brand" href="#/" aria-label="TV Livre, início">
          <Mark size={30} />
          <Wordmark />
        </a>
        <nav className="topnav" aria-label="Principal">
          <a href="#/" aria-current={!isDoc ? 'page' : undefined}>Canais</a>
          <a href="#/instalar" aria-current={route.name === 'install' ? 'page' : undefined}>Instalar</a>
          <a href="#/sobre" aria-current={route.name === 'about' ? 'page' : undefined}>Sobre</a>
        </nav>
        <div className="top-actions">
          {showInstallBtn && (
            <button type="button" className="btn btn-sm btn-outline" onClick={() => void install.prompt()}>
              <Download size={16} aria-hidden="true" /> Instalar
            </button>
          )}
          <button type="button" className="icon-btn desktop-only" onClick={() => setSheet('help')} aria-label="Atalhos do teclado" title="Atalhos (?)">
            <Keyboard size={20} />
          </button>
          <button
            type="button"
            className="icon-btn desktop-only"
            onClick={() => changeTheme(document.documentElement.dataset.theme === 'light' || (document.documentElement.dataset.theme === 'auto' && !window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'escuro' : 'claro')}
            aria-label="Alternar tema claro e escuro"
          >
            {theme === 'claro' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches) ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>
      </header>

      {!online && <OfflineBar />}

      {isDoc ? (
        <main className="page" id="conteudo">
          {route.name === 'about' ? <About visits={visits} /> : <InstallPage />}
        </main>
      ) : loadError ? (
        <main className="page">
          <div className="notice" role="alert">
            <h1>Não deu para carregar os canais</h1>
            <p>{online ? loadError : 'Você está sem internet e esta é a primeira vez que abre o app neste aparelho.'}</p>
            <button type="button" className="btn btn-accent" onClick={() => window.location.reload()}>Tentar de novo</button>
          </div>
        </main>
      ) : !index ? (
        <main className="page">
          <p className="center muted" role="status">Sintonizando…</p>
        </main>
      ) : (
        <main className="workspace" id="conteudo">
          <section className="tv" aria-label="Televisão">
            {selectedMissing ? (
              <div className="player">
                <div className="stage stage-idle" data-phase="idle">
                  <div className="idle-panel">
                    <p className="idle-kicker">Canal não encontrado</p>
                    <p className="idle-sub">Esse canal pode ter saído da lista nas últimas atualizações. Escolha outro na grade ou aperte Zapear.</p>
                    <button type="button" className="btn btn-accent btn-xl" onClick={shuffle}>Zapear</button>
                  </div>
                </div>
              </div>
            ) : selectedLoading ? (
              <div className="player">
                <div className="stage stage-idle" data-phase="idle"><p className="idle-kicker" role="status">Sintonizando…</p></div>
              </div>
            ) : (
              <Player
                channel={selected}
                number={selected ? formatNumber(numbers.get(channelKey(selected))) : '--'}
                resume={resumeChannel ? { number: formatNumber(numbers.get(channelKey(resumeChannel))), name: resumeChannel.name } : null}
                armed={armed}
                onArm={() => setArmed(true)}
                onPower={power}
                online={online}
                isFavorite={selected ? isFavorite(selected) : false}
                onToggleFavorite={() => selected && toggle(selected)}
                onZap={zap}
                prev={selected ? neighbor(-1) : null}
                next={selected ? neighbor(1) : null}
                suggestions={suggestions}
                onPick={tune}
                onPlayingChange={setPlaying}
                digits={digits}
              />
            )}
            {showIosBar && (
              <div className="bar bar-install">
                <Download size={18} aria-hidden="true" />
                <span>Instale: <b>Compartilhar</b> e depois <b>Adicionar à Tela de Início</b>.</span>
                <a href="#/instalar" className="link-btn">Como fazer</a>
                <button type="button" className="icon-btn" onClick={install.dismiss} aria-label="Dispensar convite de instalação"><X size={18} /></button>
              </div>
            )}
          </section>

          <aside className="grade" aria-label="Grade de canais" inert={tv && !guideShown} data-open={guideShown ? 'true' : undefined}>
            <div className="grade-head">
              <div className="seg seg-tabs" role="tablist" aria-label="Lista">
                {(
                  [
                    ['todos', 'Canais'],
                    ['favoritos', `Favoritos${favorites.length ? ` (${favorites.length})` : ''}`],
                    ['recentes', 'Recentes'],
                  ] as [View, string][]
                ).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="search-row">
                <label className="search">
                  <Search size={20} aria-hidden="true" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={filters.query}
                    onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                    placeholder="Buscar canal pelo nome"
                    aria-label="Buscar canal pelo nome"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="search"
                  />
                  {filters.query && (
                    <button type="button" className="icon-btn" aria-label="Limpar busca" onClick={() => { setFilters({ ...filters, query: '' }); searchRef.current?.focus(); }}>
                      <X size={18} />
                    </button>
                  )}
                </label>
                <button type="button" className="btn btn-filters" onClick={() => setSheet('filters')} aria-label={`Filtros${nFilters ? `, ${nFilters} ativos` : ''}`}>
                  <SlidersHorizontal size={20} aria-hidden="true" />
                  {nFilters > 0 && <b className="count">{nFilters}</b>}
                </button>
              </div>

              <div className="ctx-row">
                <button type="button" className="ctx-country" onClick={() => setSheet('filters')} aria-label={`País: ${countryLabel}. Alterar`}>
                  {countryLabel} <ChevronDown size={16} aria-hidden="true" />
                </button>
                <span className="ctx-count" aria-live="polite">
                  <span data-testid="result-count">{loading ? 'Carregando…' : `${nf.format(visible.length)} ${visible.length === 1 ? 'canal' : 'canais'}`}</span>
                  {!loading && visible.length > 0 && <span className="muted"> · {nf.format(onlineCount)} no ar</span>}
                </span>
                {view === 'recentes' && recents.length > 0 && (
                  <button type="button" className="link-btn" onClick={clearRecents}>Limpar histórico</button>
                )}
              </div>

              {chips.length > 0 && (
                <ul className="chips" aria-label="Filtros ativos">
                  {chips.map((c) => (
                    <li key={c.label}>
                      <button type="button" className="chip chip-on" onClick={c.clear} aria-label={`Remover filtro ${c.label}`}>
                        {c.label} <X size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                  {chips.length > 1 && (
                    <li><button type="button" className="link-btn" onClick={clearAll}>Limpar tudo</button></li>
                  )}
                </ul>
              )}
            </div>

            <ChannelList
              channels={visible}
              numbers={numbers}
              selectedKey={selectedKey}
              showCountry={effectiveCountry === ALL_COUNTRIES || view !== 'todos'}
              isFavorite={isFavorite}
              onToggleFavorite={toggle}
              onSelect={(c) => {
                tune(c);
                if (tv) closeGuide();
              }}
              empty={empty}
              loading={loading}
              rowHeight={tv ? 84 : 60}
              focusRequest={focusReq}
            />
            {tv && (
              <footer className="tv-foot">
                <ul className="tv-keys" aria-label="Teclas do controle remoto">
                  <li><kbd>▲▼</kbd> mover</li>
                  <li><kbd>OK</kbd> assistir</li>
                  <li><kbd>Voltar</kbd> fechar</li>
                  <li><kbd className="k-red">●</kbd> favoritar</li>
                  <li><kbd className="k-green">●</kbd> zapear</li>
                  <li><kbd className="k-yellow">●</kbd> buscar</li>
                  <li><kbd className="k-blue">●</kbd> filtros</li>
                </ul>
                <button type="button" className="link-btn" onClick={() => changeTvPref('desligado')}>Sair do modo TV</button>
              </footer>
            )}
          </aside>
        </main>
      )}

      <BottomNav
        view={view}
        onDoc={isDoc}
        onView={(v) => { goHome(); setView(v); }}
        onShuffle={() => { goHome(); shuffle(); }}
        onSearch={focusSearch}
        onMore={() => setSheet('more')}
      />

      {index && (
        <FilterSheet
          open={sheet === 'filters'}
          onClose={() => setSheet(null)}
          index={index}
          country={effectiveCountry}
          onCountry={changeCountry}
          filters={filters}
          onFilters={setFilters}
          resultCount={visible.length}
        />
      )}
      <MoreSheet open={sheet === 'more'} onClose={() => setSheet(null)} theme={theme} onTheme={changeTheme} onShortcuts={() => setSheet('help')} tvPref={tvPref} onTvPref={changeTvPref} dataDate={dataDate} />
      <ShortcutsDialog open={sheet === 'help'} onClose={() => setSheet(null)} />

      {needRefresh && !updateDismissed && (
        <UpdateBar playing={playing} onUpdate={() => void updateServiceWorker(true)} onDismiss={() => setUpdateDismissed(true)} />
      )}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
