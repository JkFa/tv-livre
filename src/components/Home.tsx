import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Keyboard, Monitor, Power, Shuffle, Smartphone, Star, Tv } from 'lucide-react';
import type { Channel, DataIndex } from '../../shared/types.ts';
import { comecandoAgora, nowSec, useEpgVersion, useGuideClock } from '../lib/epg.ts';
import { liveNow, parseChannelNumber, pickFeatured, topCategories, topCountries } from '../lib/home.ts';
import { categoryLabel, countryName } from '../lib/labels.ts';
import { channelKey, formatNumber } from '../lib/lineup.ts';
import { StatusMark } from './Badges.tsx';
import { Mark, Wordmark } from './Mark.tsx';
import { VisitStrip } from './Visits.tsx';
import { fmtNum, type EmAlta } from '../lib/presenca-ui.ts';
import type { Resumo } from '../lib/presenca.ts';
import type { Region } from '../lib/region.ts';
import { TestCard } from './TestCard.tsx';

const nf = new Intl.NumberFormat('pt-BR');

interface Props {
  index: DataIndex;
  /** País cuja grade a tela mostra (nunca "todos": evita baixar o mundo inteiro só para a vitrine). */
  country: string;
  channels: readonly Channel[];
  loading: boolean;
  numbers: Map<string, number>;
  resume: Channel | null;
  recents: readonly Channel[];
  favorites: readonly Channel[];
  /** Números que o usuário está digitando no teclado (mostrados na tela). */
  digits: string;
  /** Total de acessos ao site e região de quem acessa (null enquanto carregam ou se o serviço falhar). */
  visits: number | null;
  region: Region | null;
  /** Serviço de presença: total assistindo, recordes e o que está "em alta agora" (null = sem serviço). */
  presenca?: Resumo | null;
  emAlta?: readonly EmAlta[];
  tv: boolean;
  onTune: (c: Channel) => void;
  onPower: () => void;
  onShuffle: () => void;
  onNumber: (n: number) => void;
  onCategory: (id: string) => void;
  onCountry: (code: string) => void;
  onAllCountries: () => void;
  onFavorites: () => void;
  onTv: () => void;
}

/**
 * Tela inicial: a TV desligada na sala. Uma ação principal (ligar), a vitrine do que está no ar,
 * e portas de entrada (número, assunto, país). Nada aqui toca vídeo nem baixa mais do que a grade do país.
 */
export function Home(p: Props) {
  const { index, country, channels, loading, numbers } = p;
  const [nudge, setNudge] = useState(0);
  const [numText, setNumText] = useState('');
  const primary = useRef<HTMLButtonElement>(null);

  // Na TV o foco começa no botão principal: o controle remoto chega nele sem procurar.
  useEffect(() => {
    if (p.tv) primary.current?.focus();
  }, [p.tv]);

  const featured = useMemo(() => pickFeatured(channels, p.resume, new Date(), undefined, nudge), [channels, p.resume, nudge]);
  const live = useMemo(() => liveNow(channels, 8), [channels]);
  // "Começando agora": programas que acabaram de começar ou começam em 15 min (só com guia carregado)
  const epgVersion = useEpgVersion();
  const guideTick = useGuideClock([], 60_000);
  const starting = useMemo(() => {
    const t = nowSec();
    const out: { c: Channel; title: string }[] = [];
    for (const c of channels) {
      if (c.status === 'offline') continue;
      const p = comecandoAgora(c, t);
      if (p) out.push({ c, title: p.title });
    }
    out.sort((a, b) => Number(b.c.status === 'online') - Number(a.c.status === 'online'));
    return out.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, epgVersion, guideTick]);
  const cats = useMemo(() => topCategories(channels, 8), [channels]);
  const countries = useMemo(() => topCountries(index, country, 12), [index, country]);
  const num = (c: Channel) => formatNumber(numbers.get(channelKey(c)));
  const countryLabel = countryName(country);
  const { byStatus, total } = index.meta;
  const updated = new Date(index.meta.generatedAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  const shownDigits = p.digits;

  const go = (e: FormEvent) => {
    e.preventDefault();
    const n = parseChannelNumber(numText);
    if (n) p.onNumber(n);
  };

  return (
    <main className="home" id="conteudo">
      <div className="wrap">
        <section className="hero" aria-labelledby="home-h1">
          <div className="hero-copy">
            <p className="home-brand">
              <Mark size={34} />
              <Wordmark />
            </p>
            <p className="kicker"><span className="live-dot" aria-hidden="true" /> Ao vivo, de graça</p>
            <h1 id="home-h1">Zapeie a TV aberta do mundo.</h1>
            <p className="lead">
              {nf.format(total)} canais de {index.countries.length} países, direto no navegador. Sem cadastro, sem anúncios, sem instalar nada.
            </p>
            <div className="hero-actions">
              <button ref={primary} type="button" className="btn btn-accent btn-xl" onClick={p.onPower} data-testid="home-ligar">
                <Power size={22} aria-hidden="true" />
                {p.resume ? `Continuar: ${num(p.resume)} ${p.resume.name}` : 'Ligar a TV'}
              </button>
              <a className="btn btn-xl" href="#/canais" data-testid="home-canais">Ver todos os canais</a>
            </div>
          </div>

          <div className="hero-set">
            {featured ? (
              <button
                type="button"
                className="hero-screen"
                onClick={() => p.onTune(featured.channel)}
                data-testid="home-destaque"
              >
                <TestCard />
                <span className="sr-only">Assistir canal</span>
                <span className="hs-osd">
                  <span className="hs-num num">{num(featured.channel)}</span>
                  <span className="hs-name">{featured.channel.name}</span>
                </span>
                <span className="hs-play" aria-hidden="true"><ArrowRight size={28} /></span>
                {shownDigits && (
                  <span className="digits" aria-hidden="true">
                    <span className="num">{shownDigits}</span>
                    <small>Enter para ir</small>
                  </span>
                )}
              </button>
            ) : (
              <div className="hero-screen" aria-hidden="true">
                <TestCard dim />
                <span className="hs-osd"><span className="hs-name">{loading ? 'Sintonizando…' : 'Sem sinal por aqui'}</span></span>
              </div>
            )}
            <div className="hero-caption">
              <span className="muted">
                {featured ? (featured.resumed ? 'Você estava aqui' : 'Sugestão de hoje') : 'Em destaque'}
                {featured && <> · {featured.channel.name}</>}
              </span>
              {live.length > 1 && (
                <button type="button" className="link-btn" onClick={() => setNudge((n) => n + 1)}>
                  <Shuffle size={14} aria-hidden="true" className="inline-icon" /> Outro canal
                </button>
              )}
            </div>
          </div>

          <form className="gofield" onSubmit={go}>
            <label htmlFor="go-num">Sabe o número do canal? <span className="muted">(grade de {countryLabel})</span></label>
            <div className="gofield-row">
              <input
                id="go-num"
                className="num"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoComplete="off"
                placeholder="07"
                value={numText}
                onChange={(e) => setNumText(e.target.value.replace(/\D/g, ''))}
              />
              <button type="submit" className="btn" disabled={!parseChannelNumber(numText)}>Ir</button>
            </div>
          </form>
        </section>

        <dl className="stats" aria-label="A TV Livre em números">
          <div><dt>canais</dt><dd className="num">{nf.format(total)}</dd></div>
          <div><dt>no ar agora</dt><dd className="num">{nf.format(byStatus.online)}</dd></div>
          <div><dt>países</dt><dd className="num">{nf.format(index.countries.length)}</dd></div>
          <div><dt>curados pelo Free-TV</dt><dd className="num">{nf.format(index.meta.bySource['free-tv'])}</dd></div>
        </dl>
        <VisitStrip total={p.visits} region={p.region} presenca={p.presenca ?? null} />
        <p className="stats-note muted small">Lista conferida a cada dia. Última em {updated}.</p>

        {!!p.emAlta?.length && (
          <Rail title="Em alta agora">
            {p.emAlta.map(({ channel, n: quantos }) => <Tile key={channelKey(channel)} c={channel} n={num(channel)} onTune={p.onTune} showCountry={channel.country !== country} watching={quantos} />)}
          </Rail>
        )}

        {p.recents.length > 0 && (
          <Rail title="Vistos há pouco">
            {p.recents.map((c) => <Tile key={channelKey(c)} c={c} n={num(c)} onTune={p.onTune} showCountry={c.country !== country} />)}
          </Rail>
        )}

        {p.favorites.length > 0 && (
          <Rail
            title="Seus favoritos"
            action={<button type="button" className="link-btn" onClick={p.onFavorites}>Ver todos <ArrowRight size={14} aria-hidden="true" className="inline-icon" /></button>}
          >
            {p.favorites.map((c) => <Tile key={channelKey(c)} c={c} n={num(c)} onTune={p.onTune} showCountry={c.country !== country} star />)}
          </Rail>
        )}

        {starting.length > 0 && (
          <Rail title={`Começando agora · ${countryLabel}`}>
            {starting.map(({ c, title }) => <Tile key={channelKey(c)} c={c} n={num(c)} onTune={p.onTune} prog={title} />)}
          </Rail>
        )}

        <Rail
          title={`No ar agora · ${countryLabel}`}
          action={<a className="link-btn" href="#/canais">Ver os {nf.format(channels.length)} canais <ArrowRight size={14} aria-hidden="true" className="inline-icon" /></a>}
          busy={loading}
        >
          {loading
            ? Array.from({ length: 8 }, (_, i) => (
                <li key={i} className="tile tile-skeleton" aria-hidden="true"><span className="sk sk-num" /><span className="sk sk-name" style={{ width: `${55 + ((i * 17) % 35)}%` }} /></li>
              ))
            : live.length
              ? live.map((c) => <Tile key={channelKey(c)} c={c} n={num(c)} onTune={p.onTune} />)
              : [<li key="none" className="rail-empty muted">Nenhum canal confirmado no ar em {countryLabel} agora. Veja a lista completa ou escolha outro país abaixo.</li>]}
        </Rail>

        {cats.length > 0 && (
          <section className="sec" aria-labelledby="h-assuntos">
            <div className="sec-head"><h2 id="h-assuntos">Por assunto</h2><span className="muted small">em {countryLabel}</span></div>
            <ul className="cats">
              {cats.map((c) => (
                <li key={c.id}>
                  <button type="button" className="cat" onClick={() => p.onCategory(c.id)}>
                    <span className="cat-name">{categoryLabel(c.id)}</span>
                    <span className="cat-count num">{nf.format(c.count)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="sec" aria-labelledby="h-paises">
          <div className="sec-head"><h2 id="h-paises">Outros países</h2></div>
          <ul className="countries">
            {countries.map((c) => (
              <li key={c.code}>
                <button type="button" className="country" aria-pressed={c.code === country} onClick={() => p.onCountry(c.code)}>
                  <span className="country-code num">{c.code}</span>
                  <span className="country-body">
                    <span className="country-name">{countryName(c.code)}</span>
                    <span className="muted">{nf.format(c.online)} no ar</span>
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="country country-all" onClick={p.onAllCountries}>
                <span className="country-code num">+{nf.format(Math.max(index.countries.length - countries.length, 0))}</span>
                <span className="country-body"><span className="country-name">Todos os países</span><span className="muted">buscar no mundo</span></span>
              </button>
            </li>
          </ul>
        </section>

        <section className="sec ways" aria-labelledby="h-jeitos">
          <div className="sec-head"><h2 id="h-jeitos">Em qualquer tela</h2></div>
          <ul className="ways-grid">
            <li>
              <Smartphone size={26} aria-hidden="true" />
              <h3>No celular</h3>
              <p>Deslize o vídeo para trocar de canal. Instale como aplicativo e abra com um toque.</p>
              <a className="link-btn" href="#/instalar">Como instalar</a>
            </li>
            <li>
              <Tv size={26} aria-hidden="true" />
              <h3>Na televisão</h3>
              <p>Abra este endereço no navegador da TV e use o controle remoto: setas, OK e os números.</p>
              <button type="button" className="link-btn" onClick={p.onTv}>Testar o Modo TV</button>
            </li>
            <li>
              <Monitor size={26} aria-hidden="true" />
              <h3>No computador</h3>
              <p>Tudo pelo teclado: setas trocam de canal, Z zapeia, / busca e os números vão direto ao canal.</p>
              <span className="muted small"><Keyboard size={14} aria-hidden="true" className="inline-icon" /> Aperte <kbd>?</kbd> para ver os atalhos</span>
            </li>
          </ul>
        </section>

        <footer className="home-foot">
          <p className="promise">
            <Star size={16} aria-hidden="true" className="inline-icon" /> O TV Livre <strong>não hospeda vídeo</strong>: seu navegador se conecta direto à
            fonte de cada canal. Sem proxy, sem anúncios, sem cadastro.
          </p>
          <nav aria-label="Rodapé">
            <a href="#/sobre">Sobre, fontes e remoção de canais</a>
            <a href="#/instalar">Instalar</a>
            <a href="https://github.com/JkFa/tv-livre" target="_blank" rel="noopener noreferrer">Código aberto</a>
          </nav>
        </footer>
      </div>
    </main>
  );
}

function Rail({ title, action, busy = false, children }: { title: string; action?: ReactNode; busy?: boolean; children: ReactNode }) {
  const id = `h-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className="sec" aria-labelledby={id} aria-busy={busy || undefined}>
      <div className="sec-head"><h2 id={id}>{title}</h2>{action}</div>
      <ul className="tiles">{children}</ul>
    </section>
  );
}

function Tile({ c, n, onTune, showCountry = false, star = false, prog, watching }: { c: Channel; n: string; onTune: (c: Channel) => void; showCountry?: boolean; star?: boolean; prog?: string; watching?: number }) {
  const cat = c.categories[0] ? categoryLabel(c.categories[0]) : null;
  const meta = [cat, showCountry ? countryName(c.country) : null].filter(Boolean).join(' · ');
  return (
    <li>
      <button type="button" className="tile" onClick={() => onTune(c)}>
        <span className="tile-num num">{n}</span>
        <span className="tile-body">
          <span className="tile-name">{c.name}</span>
          {prog && <span className="tile-prog">{prog}</span>}
          {watching !== undefined && (
            <span className="tile-watching" data-testid="em-alta-contagem">
              <span className="live-dot" aria-hidden="true" />
              {fmtNum(watching)} assistindo
            </span>
          )}
          <span className="tile-meta">
            <StatusMark status={c.status} withText={c.status !== 'online'} />
            {star && <Star size={13} aria-hidden="true" className="tile-star" />}
            {meta && <span className="tile-sub">{meta}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}
