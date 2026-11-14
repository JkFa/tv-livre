import type { DataIndex } from '../../shared/types.ts';
import type { Filters } from '../lib/filter.ts';
import { categoryLabel, countryName, languageName } from '../lib/labels.ts';
import { HEALTH_LABELS, type Health } from '../lib/health.ts';
import { Sheet } from './Sheet.tsx';

export const ALL_COUNTRIES = 'ALL';

interface Props {
  open: boolean;
  onClose: () => void;
  index: DataIndex;
  country: string;
  onCountry: (c: string) => void;
  filters: Filters;
  onFilters: (f: Filters) => void;
  resultCount: number;
  /** O serviço de presença está respondendo (só então a opção "Mais assistidos agora" aparece). */
  presencaOn?: boolean;
}

export function activeFilterCount(f: Filters): number {
  return [f.category, f.language, f.status].filter(Boolean).length + (f.hideOffline ? 1 : 0) + (f.playableOnly ? 1 : 0) + (f.startingNow ? 1 : 0) + (f.listen ? 1 : 0) + (f.trending ? 1 : 0);
}

export function FilterSheet({ open, onClose, index, country, onCountry, filters, onFilters, resultCount, presencaOn = false }: Props) {
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });
  const countries = [...index.countries].sort((a, b) => {
    if (a.code === 'BR') return -1;
    if (b.code === 'BR') return 1;
    return countryName(a.code).localeCompare(countryName(b.code), 'pt-BR');
  });
  const langs = [...index.languages].map((l) => ({ ...l, name: languageName(l.id) })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const clear = () => onFilters({ ...filters, category: '', language: '', status: '', hideOffline: false, playableOnly: false, startingNow: false, listen: false, trending: false });

  return (
    <Sheet
      id="filtros"
      open={open}
      onClose={onClose}
      title="País e filtros"
      footer={
        <>
          <button type="button" className="btn" onClick={clear} disabled={activeFilterCount(filters) === 0}>
            Limpar filtros
          </button>
          <button type="button" className="btn btn-accent" onClick={onClose}>
            Ver {resultCount.toLocaleString('pt-BR')} {resultCount === 1 ? 'canal' : 'canais'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>País</span>
        <select value={country} onChange={(e) => onCountry(e.target.value)}>
          <option value={ALL_COUNTRIES}>Todos os países</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {countryName(c.code)} ({c.count})
            </option>
          ))}
        </select>
      </label>

      <fieldset className="field">
        <legend>Categoria</legend>
        <div className="chips-pick">
          <button type="button" className="chip" aria-pressed={!filters.category} onClick={() => set({ category: '' })}>Todas</button>
          {index.categories
            .filter((c) => c.id !== 'xxx')
            .map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={filters.category === c.id} onClick={() => set({ category: filters.category === c.id ? '' : c.id })}>
                {categoryLabel(c.id)}
              </button>
            ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Idioma</span>
        <select value={filters.language} onChange={(e) => set({ language: e.target.value })}>
          <option value="">Todos</option>
          {langs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.count})
            </option>
          ))}
        </select>
      </label>

      <fieldset className="field">
        <legend>Status</legend>
        <div className="seg seg-saude">
          <button type="button" aria-pressed={!filters.status} onClick={() => set({ status: '' })}>Todos</button>
          {(['ok', 'instavel', 'nao-confirmado', 'fora'] as Health[]).map((s) => (
            <button key={s} type="button" aria-pressed={filters.status === s} onClick={() => set({ status: filters.status === s ? '' : s })}>
              {HEALTH_LABELS[s]}
            </button>
          ))}
        </div>
        <p className="field-note">Resultado do teste diário dos links, feito em servidores nos EUA: um canal pode tocar daqui mesmo marcado como fora do ar.</p>
      </fieldset>

      <label className="check">
        <input type="checkbox" checked={filters.hideOffline} onChange={(e) => set({ hideOffline: e.target.checked })} data-testid="filter-ocultar-fora" />
        <span>Ocultar canais fora do ar</span>
      </label>

      {presencaOn && (
        <label className="check">
          <input type="checkbox" checked={filters.trending} onChange={(e) => set({ trending: e.target.checked })} data-testid="filter-trending" />
          <span>Mais assistidos agora (só canais com 3 ou mais pessoas)</span>
        </label>
      )}

      {!!index.epg?.length && (
        <label className="check">
          <input type="checkbox" checked={filters.startingNow} onChange={(e) => set({ startingNow: e.target.checked })} data-testid="filter-starting" />
          <span>Começando agora (programas que acabaram de começar ou começam em 15 min)</span>
        </label>
      )}

      <label className="check">
        <input type="checkbox" checked={filters.listen} onChange={(e) => set({ listen: e.target.checked })} data-testid="filter-ouvir" />
        <span>Bom para ouvir (notícias, música, religião, esportes, educação)</span>
      </label>

      <label className="check">
        <input type="checkbox" checked={filters.playableOnly} onChange={(e) => set({ playableOnly: e.target.checked })} />
        <span>Só os que tocam no navegador</span>
      </label>
    </Sheet>
  );
}
