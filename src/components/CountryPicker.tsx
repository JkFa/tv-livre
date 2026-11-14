import { useMemo, useState } from 'react';
import { Globe } from 'lucide-react';
import type { CountrySummary } from '../../shared/types.ts';
import { countriesIn, initialRegion, regionCounts } from '../lib/guia.ts';
import { countryFlag, countryName } from '../lib/labels.ts';

const nf = new Intl.NumberFormat('pt-BR');

interface Props {
  countries: readonly CountrySummary[];
  current: string;
  onCountry: (code: string) => void;
  /** Máximo de países mostrados por região (o resto fica atrás de "Todos os países"). Sem limite = todos. */
  limit?: number;
  onAllCountries?: () => void;
  /** Prefixo dos ids (o seletor aparece na home e no guia). */
  idPrefix: string;
}

/**
 * Escolha de país em dois passos: região (chips) e país (bandeira + nome + quantos no ar).
 * Regiões e bandeiras vêm dos dados do iptv-org; um país pode aparecer em mais de uma região.
 */
export function CountryPicker({ countries, current, onCountry, limit, onAllCountries, idPrefix }: Props) {
  const regions = useMemo(() => regionCounts(countries), [countries]);
  const [region, setRegion] = useState(() => initialRegion(countries, current));
  const list = useMemo(() => countriesIn(countries, region), [countries, region]);
  const shown = limit ? list.slice(0, limit) : list;
  const hidden = countries.length - shown.length;

  return (
    <div className="country-picker">
      <div className="chips-pick region-chips" role="group" aria-label="Região" data-testid={`${idPrefix}-regioes`}>
        <button type="button" className="chip" aria-pressed={region === ''} onClick={() => setRegion('')}>
          Todas <span className="chip-n num">{nf.format(countries.length)}</span>
        </button>
        {regions.map((r) => (
          <button key={r.code} type="button" className="chip" aria-pressed={region === r.code} onClick={() => setRegion(r.code)} data-regiao={r.code}>
            {r.label} <span className="chip-n num">{nf.format(r.countries)}</span>
          </button>
        ))}
      </div>
      <ul className="countries" aria-label="Países" data-testid={`${idPrefix}-paises`}>
        {shown.map((c) => {
          const flag = countryFlag(c.code);
          return (
            <li key={c.code}>
              <button type="button" className="country" aria-pressed={c.code === current} onClick={() => onCountry(c.code)} data-pais={c.code}>
                <span className="country-code" aria-hidden="true">
                  {c.code === 'INT' ? <Globe size={24} /> : flag ? <span className="flag flag-lg">{flag}</span> : <span className="num">{c.code}</span>}
                </span>
                <span className="country-body">
                  <span className="country-name">{countryName(c.code)}</span>
                  <span className="muted">{nf.format(c.online)} no ar</span>
                </span>
              </button>
            </li>
          );
        })}
        {onAllCountries && hidden > 0 && (
          <li>
            <button type="button" className="country country-all" onClick={onAllCountries}>
              <span className="country-code num">+{nf.format(hidden)}</span>
              <span className="country-body"><span className="country-name">Todos os países</span><span className="muted">buscar no mundo</span></span>
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
