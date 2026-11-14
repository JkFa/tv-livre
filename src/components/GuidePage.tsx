import { useMemo, useState } from 'react';
import { ArrowRight, Globe, Shuffle } from 'lucide-react';
import type { Channel, DataIndex } from '../../shared/types.ts';
import { agora, hasEpg, useEpgVersion, useGuideClock } from '../lib/epg.ts';
import { guideSections } from '../lib/guia.ts';
import { categoryLabel, countryFlag, countryName } from '../lib/labels.ts';
import { channelKey, formatNumber } from '../lib/lineup.ts';
import { useHealth } from '../lib/useHealth.ts';
import { CountryTag, StatusMark } from './Badges.tsx';
import { CountryPicker } from './CountryPicker.tsx';
import { ProgressBar } from './Guide.tsx';

const nf = new Intl.NumberFormat('pt-BR');
/** Cartões por assunto antes do "Ver todos": o guia é para olhar de relance, a grade completa fica em Canais. */
const PER_SECTION = 8;

interface Props {
  index: DataIndex;
  country: string;
  channels: readonly Channel[];
  loading: boolean;
  numbers: Map<string, number>;
  selectedKey: string | null;
  onTune: (c: Channel) => void;
  onCountry: (code: string) => void;
  /** Abre a grade completa do país filtrada por assunto. */
  onCategory: (id: string) => void;
  /** Zapear dentro do país do guia. */
  onZap: () => void;
}

/**
 * Guia de TV: os canais de um país organizados por assunto, com origem (bandeira + país), saúde e o programa
 * de agora quando o país tem guia de programação. País e região escolhidos no topo.
 */
export function GuidePage(p: Props) {
  const { index, country, channels, numbers } = p;
  const health = useHealth();
  const sections = useMemo(() => guideSections(channels, health.rank), [channels, health]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const epgVersion = useEpgVersion();
  const t = useGuideClock([], 60_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- epgVersion avisa que o guia do país terminou de carregar
  const withEpg = useMemo(() => hasEpg(country), [country, epgVersion]);
  const summary = index.countries.find((c) => c.code === country);
  const flag = countryFlag(country);

  return (
    <main className="home guia" id="conteudo">
      <div className="wrap">
        <header className="guia-head">
          <p className="kicker"><span className="live-dot" aria-hidden="true" /> Guia de TV</p>
          <h1 id="guia-h1">
            {country === 'INT' ? <Globe size={30} aria-hidden="true" className="inline-icon" /> : flag && <span className="flag" aria-hidden="true">{flag} </span>}
            {countryName(country)}
          </h1>
          <p className="lead">
            {summary ? <>{nf.format(summary.count)} canais, {nf.format(summary.online)} no ar, organizados por assunto.</> : 'Canais organizados por assunto.'}
            {' '}TV aberta de {nf.format(index.countries.length)} países: troque de país abaixo.
            {withEpg && ' Com programação ao vivo.'}
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-accent" onClick={p.onZap} data-testid="guia-zapear">
              <Shuffle size={20} aria-hidden="true" /> Zapear em {countryName(country)}
            </button>
          </div>
        </header>

        <section className="sec" aria-labelledby="h-guia-paises">
          <div className="sec-head"><h2 id="h-guia-paises">Países por região</h2></div>
          <CountryPicker countries={index.countries} current={country} onCountry={p.onCountry} idPrefix="guia" />
        </section>

        {p.loading ? (
          <p className="center muted" role="status">Sintonizando…</p>
        ) : (
          <>
            <nav className="guia-assuntos" aria-label="Assuntos">
              <ul className="chips-pick">
                {sections.map((s) => (
                  <li key={s.id}><button type="button" className="chip" onClick={() => document.getElementById(`guia-${s.id || 'sem'}`)?.scrollIntoView({ block: 'start' })}>{s.id ? categoryLabel(s.id) : 'Sem assunto'} <span className="chip-n num">{nf.format(s.channels.length)}</span></button></li>
                ))}
              </ul>
            </nav>

            {sections.map((s) => {
              const id = `guia-${s.id || 'sem'}`;
              const expanded = open.has(s.id);
              const shown = expanded ? s.channels : s.channels.slice(0, PER_SECTION);
              return (
                <section key={s.id} className="sec guia-sec" aria-labelledby={`${id}-h`} id={id} data-testid="guia-secao" data-assunto={s.id}>
                  <div className="sec-head">
                    <h2 id={`${id}-h`}>{s.id ? categoryLabel(s.id) : 'Sem assunto na fonte'}</h2>
                    <span className="muted small">{nf.format(s.channels.length)} canais · {nf.format(s.online)} no ar</span>
                  </div>
                  <ul className="tiles guia-cards">
                    {shown.map((c) => {
                      const key = channelKey(c);
                      const prog = withEpg ? agora(c, t) : null;
                      const q = health.quality(c);
                      const block = health.block(c);
                      return (
                        <li key={key}>
                          <button type="button" className="tile guia-card" onClick={() => p.onTune(c)} aria-current={p.selectedKey === key ? 'true' : undefined} data-testid="guia-card" data-saude={health.health(c)}>
                            <span className="tile-num num">{formatNumber(numbers.get(key))}</span>
                            <span className="tile-body">
                              <span className="tile-name">{c.name}</span>
                              {prog && (
                                <span className="tile-prog guia-prog">
                                  <span className="guia-prog-title">Agora: {prog.title}</span>
                                  <ProgressBar p={prog} t={t} />
                                </span>
                              )}
                              <span className="tile-meta">
                                <StatusMark channel={c} withText />
                                <CountryTag code={c.country} short />
                                {q && <span className="badge">{q}</span>}
                                {(block || health.failedHere(c)) && <span className="badge badge-warn">{block ? 'Não toca no navegador' : 'Não abriu aqui'}</span>}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {s.channels.length > PER_SECTION && (
                    <div className="guia-more">
                      <button type="button" className="link-btn" onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} aria-expanded={expanded}>
                        {expanded ? 'Mostrar menos' : `Mostrar os ${nf.format(s.channels.length)}`}
                      </button>
                      {s.id && (
                        <button type="button" className="link-btn" onClick={() => p.onCategory(s.id)}>
                          Abrir na grade <ArrowRight size={14} aria-hidden="true" className="inline-icon" />
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>
    </main>
  );
}
