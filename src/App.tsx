import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ChevronDown, Download, Keyboard, LogOut, Moon, Search, SlidersHorizontal, Smartphone, Sun, Tv, X } from 'lucide-react';
import type { Channel, DataIndex } from '../shared/types.ts';
import { About } from './components/About.tsx';
import { BottomNav, type Section } from './components/BottomNav.tsx';
import { ChannelList } from './components/ChannelList.tsx';
import { Home } from './components/Home.tsx';
import { ALL_COUNTRIES, FilterSheet, activeFilterCount } from './components/FilterSheet.tsx';
import { InstallPage } from './components/InstallPage.tsx';
import { Mark, Wordmark } from './components/Mark.tsx';
import { AnuncioAssistindo, EmAltaTv, VisitChip } from './components/Visits.tsx';
import { MoreSheet } from './components/MoreSheet.tsx';
import { OfflineBar, Toast, UpdateBar } from './components/Notices.tsx';
import { Player, type Neighbor } from './components/Player.tsx';
import { ShareSheet, type ShareData } from './components/ShareSheet.tsx';
import { ShortcutsDialog } from './components/ShortcutsDialog.tsx';
import { SmartTvSheet } from './components/SmartTvSheet.tsx';
import { avisoPulo, podeTransmitir, proximoTransmissivel } from './lib/cast.ts';
import { readTotal, registerVisit, shouldCount } from './lib/counter.ts';
import { definirAssistindo, iniciarPresenca, usePresenca } from './lib/presenca-browser.ts';
import { emAlta as calcularEmAlta, mapaMaisAssistidos } from './lib/presenca-ui.ts';
import { loadCountries, loadCountry, loadIndex } from './lib/data.ts';
import { agora, comecandoAgora, nowSec, useEpgCountries, useEpgVersion, useGuideClock } from './lib/epg.ts';
import { compareForDisplay, EMPTY_FILTERS, filterChannels, suggestAlternatives, type Filters } from './lib/filter.ts';
import { categoryLabel, countryName, languageName, STATUS_LABELS } from './lib/labels.ts';
import { useFavorites, useRecents, type ChannelRef } from './lib/library.ts';
import { buildNumbers, channelKey, findByNumber, formatNumber, pickShuffle, stepChannel } from './lib/lineup.ts';
import { getModoAudio, setModoAudio, type ModoAudio } from './lib/modo.ts';
import { applyTheme, getLastChannel, getTheme, isDarkNow, setLastChannel, setTheme, type ThemePref } from './lib/prefs.ts';
import { captureInstallPrompt, useInstall, useOnline } from './lib/pwa.ts';
import { channelHref, navigate, parseHash, useRoute } from './lib/router.ts';
import { readString, writeString } from './lib/storage.ts';
import { fetchRegion, type Region } from './lib/region.ts';
import { channelShareLink, loadPaginas, peekSlug, shareText } from './lib/share.ts';
import { sendPlayerValue, useShortcuts } from './lib/shortcuts.ts';
import { applyTv, getTvPref, mostrarBotaoSair, resolveTv, setTvPref, type TvPref } from './lib/tvmode.ts';
import { useCast } from './lib/useCast.ts';
import type { Acoes } from './lib/remote/acoes.ts';
import { VERSAO as VERSAO_CONTROLE, type Estado as EstadoRemoto } from './lib/remote/protocolo.ts';
import { useControleRemoto } from './lib/remote/useControleRemoto.ts';
import { ControleSheet } from './components/ControleSheet.tsx';
import { programaAgora } from './lib/programa.ts';
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
  const [sheet, setSheet] = useState<null | 'filters' | 'more' | 'help' | 'tv' | 'share' | 'controle'>(null);
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [theme, setThemeState] = useState<ThemePref>(() => getTheme());
  const [toast, setToast] = useState<string | null>(null);
  const [visits, setVisits] = useState<number | null>(null);
  const presenca = usePresenca();
  const [region, setRegion] = useState<Region | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [tvPref, setTvPrefState] = useState<TvPref>(() => getTvPref());
  const [guideOpen, setGuideOpen] = useState(false);
  const [modo, setModoState] = useState<ModoAudio>(() => getModoAudio());
  const [focusReq, setFocusReq] = useState(0);
  const tv = resolveTv(tvPref);
  const cast = useCast(tv);
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

  /** Cada folha só fecha a si mesma: o evento `close` assíncrono de uma folha que acabou de fechar não pode fechar a próxima. */
  const closeSheet = useCallback((which: 'filters' | 'more' | 'help' | 'tv' | 'share' | 'controle') => setSheet((s) => (s === which ? null : s)), []);

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
    // visita real: conta uma vez por sessão; ambiente local, testes e automação só leem o total
    void (shouldCount() ? registerVisit() : readTotal()).then(setVisits);
    void fetchRegion().then(setRegion);
    iniciarPresenca(); // "assistindo agora": só liga com o serviço configurado, no site publicado, depois de carregar + interagir (ou 3 s)
  }, []);

  const effectiveCountry = useMemo(() => {
    if (!index || country === ALL_COUNTRIES) return country;
    return index.countries.some((c) => c.code === country) ? country : (index.countries[0]?.code ?? 'BR');
  }, [index, country]);

  const routeCountry = route.name === 'channel' ? route.country : null;
  const isHome = route.name === 'home';
  const isDoc = route.name === 'about' || route.name === 'install';
  // a tela inicial mostra a grade de um país só (nunca o mundo todo, mesmo que "todos os países" esteja salvo)
  const homeCountry = useMemo(() => {
    if (!index) return 'BR';
    if (effectiveCountry !== ALL_COUNTRIES) return effectiveCountry;
    return index.countries.some((c) => c.code === 'BR') ? 'BR' : (index.countries[0]?.code ?? 'BR');
  }, [index, effectiveCountry]);

  // países dos canais "em alta agora" (a vitrine precisa deles carregados para achar o canal)
  const paisesEmAlta = presenca?.top.slice(0, 5).map((t) => t.p).join(',') ?? '';

  // quais arquivos de país são necessários agora
  const needed = useMemo(() => {
    if (!index) return [] as string[];
    const set = new Set<string>();
    if (isHome) {
      set.add(homeCountry);
      recents.slice(0, 6).forEach((r) => set.add(r.country));
      favorites.slice(0, 6).forEach((r) => set.add(r.country));
      paisesEmAlta.split(',').filter(Boolean).forEach((c) => set.add(c));
    } else if (view === 'todos') {
      if (effectiveCountry === ALL_COUNTRIES) index.countries.forEach((c) => set.add(c.code));
      else set.add(effectiveCountry);
    } else {
      const refs: ChannelRef[] = view === 'favoritos' ? favorites : recents;
      refs.forEach((r) => set.add(r.country));
    }
    if (routeCountry) set.add(routeCountry);
    if (last) set.add(last.country);
    return [...set];
  }, [index, isHome, homeCountry, view, effectiveCountry, favorites, recents, routeCountry, last, paisesEmAlta]);

  useEpgCountries(needed, index?.epg);
  const epgVersion = useEpgVersion();
  const guideTick = useGuideClock([], filters.startingNow ? 60_000 : 3_600_000);

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

  const maisAssistidos = useMemo(() => mapaMaisAssistidos(presenca), [presenca]);
  // sem serviço de presença, "Mais assistidos agora" não existe: se estava marcado, deixa de valer
  const filtros = presenca || !filters.trending ? filters : { ...filters, trending: false };
  const visible = useMemo(
    () => {
      const t = nowSec();
      return filterChannels(baseList, { ...filtros, query: deferredQuery }, { startingNow: (c) => !!comecandoAgora(c, t), assistindo: maisAssistidos });
    },
    // epgVersion e guideTick: o filtro "Começando agora" depende do guia carregado e do relógio
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseList, filtros, deferredQuery, epgVersion, guideTick, maisAssistidos],
  );

  const routeSelected = useMemo(
    () => (route.name === 'channel' ? (store[route.country]?.find((c) => c.id === route.id) ?? null) : null),
    [route, store],
  );
  // ---- mini-player: quem sai do canal com o vídeo TOCANDO continua assistindo. O canal fica "ancorado" e o mesmo <Player>
  // (o mesmo <video>) segue montado: na grade (#/canais) ele continua no lugar; nas outras telas vira uma janela fixa.
  // Não vale no Modo TV nem transmitindo para a TV (lá sair do canal continua como antes).
  const [docked, setDocked] = useState<Channel | null>(null);
  const [prevRouteSelected, setPrevRouteSelected] = useState<Channel | null>(null);
  if (routeSelected !== prevRouteSelected) {
    setPrevRouteSelected(routeSelected);
    if (routeSelected) setDocked(routeSelected);
    else setDocked(route.name !== 'channel' && armed && playing && !tv && !cast.conectado ? prevRouteSelected : null);
  }
  const selected = routeSelected ?? (route.name !== 'channel' && !tv ? docked : null);
  const selectedKey = selected ? channelKey(selected) : null;
  const isWorkspace = !isHome && !isDoc;
  const miniOn = !isWorkspace && !!selected;

  // "assistindo agora": só conta com um canal na tela (ou no mini-player) E o vídeo realmente tocando (pausa, erro e sair do player = navegando)
  const assistindoId = selected && playing ? selected.id : null;
  const assistindoPais = selected?.country ?? '';
  useEffect(() => {
    definirAssistindo(assistindoId ? { c: assistindoId, p: assistindoPais } : null);
  }, [assistindoId, assistindoPais]);
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
      // transmitindo para a TV: só canais que o Chromecast consegue abrir; os outros são pulados com aviso
      if (cast.conectado) {
        const { canal, puladas } = proximoTransmissivel(zapList, selectedKey, dir);
        if (puladas.length) say(avisoPulo(puladas, numbers));
        if (canal) tune(canal);
        else say('Nenhum outro canal desta lista pode ser transmitido.');
        return;
      }
      const next = stepChannel(zapList, selectedKey, dir);
      if (next) tune(next);
      else say('Nenhum outro canal disponível nessa lista.');
    },
    [zapList, selectedKey, tune, say, cast.conectado, numbers],
  );
  const shuffle = useCallback(() => {
    if (!index) return;
    const pool = visible.length ? visible : baseList;
    if (!pool.length && missingKey) {
      pendingZap.current = true; // dados ainda carregando: sorteia assim que chegarem
      return;
    }
    const castPool = (l: Channel[]) => (cast.conectado ? l.filter(podeTransmitir) : l);
    const pick = pickShuffle(castPool(pool), selectedKey) ?? pickShuffle(castPool(baseList), selectedKey);
    if (pick) tune(pick);
    else say('Nenhum canal no ar com esses filtros. Tente limpar os filtros.');
  }, [index, visible, baseList, missingKey, selectedKey, tune, say, cast.conectado]);

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
  /** Sai da tela inicial e das páginas de texto para o aparelho (player + grade); dentro dele não mexe no endereço. */
  const goWatch = useCallback(() => {
    const n = parseHash(window.location.hash).name;
    if (n !== 'channel' && n !== 'watch') navigate('#/canais');
  }, []);
  const focusSearch = useCallback(() => {
    goWatch();
    setView('todos');
    requestAnimationFrame(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    });
  }, [goWatch]);

  // ---- Modo TV: a grade vira um painel sobre o vídeo em tela cheia, aberto e fechado pelo controle remoto ----
  const changeTvPref = useCallback((p: TvPref) => {
    setTvPref(p);
    setTvPrefState(p);
    setGuideOpen(false);
  }, []);
  useEffect(() => {
    applyTv(tv);
  }, [tv]);
  const saidaVisivel = tv && mostrarBotaoSair(tvPref);
  useEffect(() => {
    document.documentElement.toggleAttribute('data-tv-saida', saidaVisivel);
  }, [saidaVisivel]);
  const guideShown = tv && guideOpen;
  const openGuide = useCallback(() => {
    setGuideOpen(true);
    setFocusReq((n) => n + 1);
  }, []);
  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, []);

  // ---- compartilhar: Web Share API quando existe; senão a folha (WhatsApp, Telegram, copiar) ou, na TV, o QR code ----
  // a lista de páginas do país carrega antes (ao sintonizar), porque o compartilhamento do sistema precisa acontecer no mesmo gesto do toque
  const selectedCountry = selected?.country;
  useEffect(() => {
    if (selectedCountry) void loadPaginas(selectedCountry);
  }, [selectedCountry]);
  const startShare = useCallback(() => {
    if (!selected) return say('Sintonize um canal para compartilhar.');
    const link = channelShareLink(selected, peekSlug(selected), new URL(import.meta.env.BASE_URL, window.location.origin).href);
    const input = { name: selected.name, number: formatNumber(numbers.get(channelKey(selected))), program: agora(selected)?.title, link };
    const data: ShareData = { name: selected.name, link, text: shareText(input), textNoLink: shareText(input, false) };
    setShareData(data);
    if (!tv && typeof navigator.share === 'function') {
      navigator.share({ title: selected.name, text: data.text }).catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setSheet('share'); // recusou: usa a folha
      });
      return;
    }
    setSheet('share');
  }, [selected, numbers, tv, say]);
  const changeModo = useCallback((m: ModoAudio) => {
    setModoAudio(m);
    setModoState(m);
  }, []);

  // ---- controle pelo celular (este aparelho é o "receptor"): os comandos chamam as MESMAS ações do teclado e da TV ----
  const [midia, setMidia] = useState<{ tocando: boolean; mudo: boolean; volume: number; erro?: string | undefined }>({ tocando: false, mudo: false, volume: 1 });
  const tuneById = useCallback(
    (id: string, pais?: string) => {
      const achar = (l: Channel[] | undefined) => l?.find((c) => c.id === id);
      const local = (pais ? achar(store[pais]) : undefined) ?? Object.values(store).map(achar).find(Boolean);
      if (local) return tune(local);
      if (pais) void loadCountry(pais).then((l) => { const c = achar(l); if (c) tuneRef.current(c); }).catch(() => undefined);
    },
    [store, tune],
  );
  const acoesRemoto: Acoes = {
    proximo: () => zap(1),
    anterior: () => zap(-1),
    numero: tuneNumber,
    canalId: tuneById,
    zapear: shuffle,
    volume: (v) => sendPlayerValue('volume', v),
    mudo: (m) => sendPlayerValue('mudo', m),
    pausa: () => sendPlayerValue('tocar', false),
    play: () => {
      setArmed(true);
      sendPlayerValue('tocar', true);
    },
    favoritar: () => selected && toggle(selected),
    buscar: (texto) => {
      goWatch();
      setView('todos');
      setFilters((f) => ({ ...f, query: texto }));
    },
    tela: (cheia) => changeTvPref(cheia ? 'ligado' : 'desligado'), // layout de janela inteira (o navegador não deixa tela cheia por comando remoto)
  };
  const programa = selected ? programaAgora(selected)?.title : undefined;
  const estadoRemoto: EstadoRemoto = {
    canal: selected
      ? { id: selected.id, numero: formatNumber(numbers.get(channelKey(selected))), nome: selected.name, pais: selected.country, ...(selected.logo?.startsWith('https://') ? { logo: selected.logo } : {}) }
      : null,
    tocando: midia.tocando,
    mudo: midia.mudo,
    volume: midia.volume,
    favorito: selected ? isFavorite(selected) : false,
    modoTV: tv,
    versao: VERSAO_CONTROLE,
    ...(midia.erro ? { erro: midia.erro } : {}),
    ...(programa ? { programaAtual: programa } : {}),
  };
  const controle = useControleRemoto({ acoes: acoesRemoto, estado: estadoRemoto, aoComando: () => say('📱 controle') });
  const { ativar: ativarControle } = controle;
  /** O clique (ou a tecla C) que abre a folha é um gesto do usuário: libera o som que o navegador exige para tocar sozinho depois. */
  const abrirControle = useCallback(() => {
    setArmed(true);
    setSheet('controle');
    void ativarControle();
  }, [ativarControle]);

  const digits = useShortcuts({
    zap,
    shuffle,
    focusSearch,
    toggleHelp: () => setSheet((s) => (s === 'help' ? null : 'help')),
    tuneNumber,
    toggleTv: () => changeTvPref(tv ? 'desligado' : 'ligado'),
    share: startShare,
    toggleRadio: () => changeModo(modo === 'radio' ? 'normal' : 'radio'),
    controle: abrirControle,
  });
  useTvRemote({
    enabled: tv && !isDoc && !!index,
    screen: isHome ? 'home' : 'watch',
    guideOpen: guideShown,
    digits,
    openGuide,
    closeGuide,
    zap,
    shuffle,
    toggleFavorite: () => selected && toggle(selected),
    openFilters: () => setSheet('filters'),
    ...(mostrarBotaoSair(tvPref) ? { exit: () => changeTvPref('desligado') } : {}),
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
      navigate('#/canais');
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
    // páginas estáticas de categoria/país: o título indexado fica como está
    if (route.name === 'home' && !window.location.hash && document.querySelector('meta[name="tvlivre:estatica"]')) return;
    // na página estática do canal (/canal/br/slug/) o título é o mesmo que o Google indexou
    const staticRef = document.querySelector<HTMLMetaElement>('meta[name="tvlivre:canal"]')?.content;
    document.title = selected
      ? staticRef === `${selected.country}/${selected.id}`
        ? `${selected.name} ao vivo — canal ${formatNumber(numbers.get(channelKey(selected)))} | TV Livre`
        : `${formatNumber(numbers.get(channelKey(selected)))} ${selected.name} — TV Livre`
      : route.name === 'about'
        ? 'Sobre — TV Livre'
        : route.name === 'install'
          ? 'Instalar — TV Livre'
          : route.name === 'watch'
            ? 'Canais — TV Livre'
            : 'TV Livre — TV aberta ao vivo';
  }, [selected, route.name, numbers]);

  const changeCountry = (code: string) => {
    setCountry(code);
    writeString(COUNTRY_KEY, code);
    setView('todos');
  };

  const neighbor = (dir: 1 | -1): Neighbor | null => {
    const c = cast.conectado ? proximoTransmissivel(zapList, selectedKey, dir).canal : stepChannel(zapList, selectedKey, dir);
    return c ? { number: formatNumber(numbers.get(channelKey(c))), name: c.name } : null;
  };
  const emAlta = useMemo(() => calcularEmAlta(presenca, store), [presenca, store]);
  const suggestions = useMemo(() => (selected ? suggestAlternatives(selected, store[selected.country] ?? []) : []), [selected, store]);

  const loading = !!missingKey && baseList.length === 0;

  // ---- tela inicial ----
  const homeChannels = useMemo(() => store[homeCountry] ?? [], [store, homeCountry]);
  const homeLoading = !(homeCountry in store);
  const resolve = useCallback(
    (refs: ChannelRef[]) => {
      const out: Channel[] = [];
      for (const r of refs) {
        const found = store[r.country]?.find((c) => c.id === r.id);
        if (found) out.push(found);
        if (out.length >= 6) break;
      }
      return out;
    },
    [store],
  );
  const homeRecents = useMemo(() => (isHome ? resolve(recents) : []), [isHome, resolve, recents]);
  const homeFavorites = useMemo(() => (isHome ? resolve(favorites) : []), [isHome, resolve, favorites]);
  const tuneHomeNumber = useCallback(
    (n: number) => {
      const c = findByNumber(homeChannels, numbers, n);
      if (c) tune(c);
      else say(`Não existe canal ${formatNumber(n)} na grade de ${countryName(homeCountry)}.`);
    },
    [homeChannels, numbers, homeCountry, tune, say],
  );
  const openCategory = (id: string) => {
    if (effectiveCountry !== homeCountry) changeCountry(homeCountry);
    setFilters({ ...EMPTY_FILTERS, category: id });
    setView('todos');
    navigate('#/canais');
  };
  const onlineCount = visible.filter((c) => c.status === 'online').length;
  const nFilters = activeFilterCount(filters);
  const countryLabel = effectiveCountry === ALL_COUNTRIES ? 'Todos os países' : countryName(effectiveCountry);
  const query = filters.query.trim();

  const clearAll = () => setFilters({ ...EMPTY_FILTERS });
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.category) chips.push({ label: categoryLabel(filters.category), clear: () => setFilters({ ...filters, category: '' }) });
  if (filters.language) chips.push({ label: languageName(filters.language), clear: () => setFilters({ ...filters, language: '' }) });
  if (filters.status) chips.push({ label: STATUS_LABELS[filters.status], clear: () => setFilters({ ...filters, status: '' }) });
  if (filters.startingNow) chips.push({ label: 'Começando agora', clear: () => setFilters({ ...filters, startingNow: false }) });
  if (filters.listen) chips.push({ label: 'Bom para ouvir', clear: () => setFilters({ ...filters, listen: false }) });
  if (filtros.trending) chips.push({ label: 'Mais assistidos agora', clear: () => setFilters({ ...filters, trending: false }) });
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
  const section: Section = isHome ? 'home' : isDoc ? 'doc' : 'watch';

  const iosBar = showIosBar && (
    <div className="bar bar-install">
      <Download size={18} aria-hidden="true" />
      <span>Instale: <b>Compartilhar</b> e depois <b>Adicionar à Tela de Início</b>.</span>
      <a href="#/instalar" className="link-btn">Como fazer</a>
      <button type="button" className="icon-btn" onClick={install.dismiss} aria-label="Dispensar convite de instalação"><X size={18} /></button>
    </div>
  );

  return (
    <div className="app" data-doc={isDoc ? '' : undefined} data-mini={miniOn ? 'on' : undefined}>
      <header className="topbar">
        <a className="brand" href="#/" aria-label="TV Livre, início">
          <Mark size={30} />
          <Wordmark />
        </a>
        <nav className="topnav" aria-label="Principal">
          <a href="#/" aria-current={isHome ? 'page' : undefined}>Início</a>
          <a href="#/canais" aria-current={!isDoc && !isHome ? 'page' : undefined}>Canais</a>
          <a href="#/instalar" aria-current={route.name === 'install' ? 'page' : undefined}>Instalar</a>
          <a href="#/sobre" aria-current={route.name === 'about' ? 'page' : undefined}>Sobre</a>
        </nav>
        <div className="top-actions">
          <AnuncioAssistindo presenca={presenca} />
          <VisitChip total={visits} region={region} presenca={presenca} />
          {showInstallBtn && (
            <button type="button" className="btn btn-sm btn-outline" onClick={() => void install.prompt()}>
              <Download size={16} aria-hidden="true" /> Instalar
            </button>
          )}
          <button type="button" className="icon-btn desktop-only" onClick={abrirControle} aria-label="Controlar pelo celular" title="Controlar pelo celular (C)" data-testid="topbar-controle">
            <Smartphone size={20} />
          </button>
          <button type="button" className="icon-btn desktop-only" onClick={() => setSheet('tv')} aria-label="Assistir na Smart TV" title="Assistir na Smart TV" data-testid="topbar-smarttv">
            <Tv size={20} />
          </button>
          <button type="button" className="icon-btn desktop-only" onClick={() => setSheet('help')} aria-label="Atalhos do teclado" title="Atalhos (?)">
            <Keyboard size={20} />
          </button>
          {/* visível também no celular (antes só no computador): um toque alterna claro e escuro */}
          <button
            type="button"
            className="icon-btn"
            onClick={() => changeTheme(isDarkNow(theme) ? 'claro' : 'escuro')}
            aria-label={isDarkNow(theme) ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
            title={isDarkNow(theme) ? 'Tema claro' : 'Tema escuro'}
            data-testid="alternar-tema"
          >
            {isDarkNow(theme) ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
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
      ) : isHome ? (
        <>
          {iosBar}
          <Home
            index={index}
            country={homeCountry}
            channels={homeChannels}
            loading={homeLoading}
            numbers={numbers}
            resume={resumeChannel}
            recents={homeRecents}
            favorites={homeFavorites}
            digits={digits}
            visits={visits}
            presenca={presenca}
            emAlta={emAlta}
            region={region}
            tv={tv}
            onTune={tune}
            onPower={power}
            onShuffle={shuffle}
            onNumber={tuneHomeNumber}
            onCategory={openCategory}
            onCountry={changeCountry}
            onAllCountries={() => {
              changeCountry(ALL_COUNTRIES);
              navigate('#/canais');
            }}
            onFavorites={() => {
              setView('favoritos');
              navigate('#/canais');
            }}
            onTv={() => changeTvPref('ligado')}
          />
        </>
      ) : null}

      {/* O player mora SEMPRE neste mesmo lugar da árvore: trocar de tela não o desmonta (o stream não reinicia) e nunca há dois.
          Fora da grade ele só existe se há um canal ancorado, e aí o CSS o transforma no mini-player (data-mini). */}
      {index && !loadError && (isWorkspace || miniOn) && (
        <div className="workspace" id={isWorkspace ? 'conteudo' : undefined} role={isWorkspace ? 'main' : undefined} data-mini={miniOn ? 'on' : undefined}>
          <section className="tv" aria-label={miniOn ? 'Mini-player' : 'Televisão'}>
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
                assistindoCanal={presenca?.meu ?? null}
                digits={digits}
                onShare={startShare}
                cast={cast}
                onAviso={say}
                onMidia={setMidia}
                modo={modo}
                onModo={changeModo}
                mini={miniOn}
                onExpand={() => selected && navigate(channelHref(selected.country, selected.id))}
                onClose={() => setDocked(null)}
              />
            )}
            {isWorkspace && iosBar}
          </section>

          {isWorkspace && (
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

            {tv && <EmAltaTv presenca={presenca} emAlta={emAlta.slice(0, 3)} numeros={(c) => formatNumber(numbers.get(channelKey(c)))} onSelect={(c) => { tune(c); closeGuide(); }} />}
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
                <span className="tv-foot-actions">
                  <button type="button" className="link-btn" onClick={abrirControle} data-testid="tv-controle">Controlar pelo celular</button>
                  <button type="button" className="link-btn" onClick={startShare} data-testid="tv-share">Abrir no celular (QR)</button>
                  <button type="button" className="link-btn" onClick={() => changeTvPref('desligado')}>Sair do modo TV</button>
                </span>
              </footer>
            )}
          </aside>
          )}
        </div>
      )}

      {saidaVisivel && (
        <button type="button" className="tv-exit" onClick={() => changeTvPref('desligado')} data-testid="tv-sair" title="Sair do modo TV (T ou Esc)">
          <LogOut size={20} aria-hidden="true" /> Sair do modo TV <kbd>T</kbd>
        </button>
      )}

      <BottomNav
        section={section}
        onHome={() => navigate('#/')}
        onWatch={() => {
          goWatch();
          setView('todos');
        }}
        onShuffle={shuffle}
        onSearch={focusSearch}
        onMore={() => setSheet('more')}
      />

      {index && (
        <FilterSheet
          open={sheet === 'filters'}
          onClose={() => closeSheet('filters')}
          index={index}
          country={effectiveCountry}
          onCountry={changeCountry}
          filters={filters}
          onFilters={setFilters}
          resultCount={visible.length}
          presencaOn={!!presenca}
        />
      )}
      <SmartTvSheet open={sheet === 'tv'} onClose={() => closeSheet('tv')} numero={selected ? formatNumber(numbers.get(channelKey(selected))) : null} />
      <MoreSheet open={sheet === 'more'} onClose={() => closeSheet('more')} onSmartTv={() => setSheet('tv')} onControle={abrirControle} modo={modo} onModo={changeModo} theme={theme} onTheme={changeTheme} onShortcuts={() => setSheet('help')} tvPref={tvPref} onTvPref={changeTvPref} dataDate={dataDate} />
      <ShortcutsDialog open={sheet === 'help'} onClose={() => closeSheet('help')} />
      <ControleSheet open={sheet === 'controle'} onClose={() => closeSheet('controle')} controle={controle} tv={tv} />
      <ShareSheet open={sheet === 'share'} onClose={() => closeSheet('share')} data={shareData} tv={tv} />

      {needRefresh && !updateDismissed && (
        <UpdateBar playing={playing} onUpdate={() => void updateServiceWorker(true)} onDismiss={() => setUpdateDismissed(true)} />
      )}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
