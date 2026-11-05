import { useState } from 'react';
import type { DataIndex, Status } from '../../shared/types.ts';
import type { Filters } from '../lib/filter.ts';
import { categoryLabel, countryFlag, countryName, languageName, STATUS_LABELS } from '../lib/labels.ts';

export const ALL_COUNTRIES = 'ALL';

interface Props {
  index: DataIndex;
  country: string;
  onCountry: (c: string) => void;
  filters: Filters;
  onFilters: (f: Filters) => void;
}

export function FilterBar({ index, country, onCountry, filters, onFilters }: Props) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });

  const countries = [...index.countries].sort((a, b) => {
    if (a.code === 'BR') return -1;
    if (b.code === 'BR') return 1;
    return countryName(a.code).localeCompare(countryName(b.code), 'pt-BR');
  });
  const activeCount = [filters.category, filters.language, filters.status].filter(Boolean).length + (filters.playableOnly ? 1 : 0);

  return (
    <div className="filters">
      <label className="field field-country">
        <span>País</span>
        <select value={country} onChange={(e) => onCountry(e.target.value)} aria-label="País">
          <option value={ALL_COUNTRIES}>🌍 Todos os países</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {countryFlag(c.code)} {countryName(c.code)} ({c.count})
            </option>
          ))}
        </select>
      </label>

      <button type="button" className="btn btn-ghost filters-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Filtros{activeCount ? ` (${activeCount})` : ''}
      </button>

      <div className={`filters-more${open ? ' open' : ''}`}>
        <label className="field">
          <span>Categoria</span>
          <select value={filters.category} onChange={(e) => set({ category: e.target.value })} aria-label="Categoria">
            <option value="">Todas</option>
            {index.categories
              .filter((c) => c.id !== 'xxx')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryLabel(c.id)} ({c.count})
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Idioma</span>
          <select value={filters.language} onChange={(e) => set({ language: e.target.value })} aria-label="Idioma">
            <option value="">Todos</option>
            {[...index.languages]
              .map((l) => ({ ...l, name: languageName(l.id) }))
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.count})
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={filters.status} onChange={(e) => set({ status: e.target.value as Status | '' })} aria-label="Status">
            <option value="">Todos</option>
            {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]} ({index.meta.byStatus[s]})
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.playableOnly} onChange={(e) => set({ playableOnly: e.target.checked })} />
          <span>Só os que tocam no navegador</span>
        </label>
        {activeCount > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => onFilters({ ...filters, category: '', language: '', status: '', playableOnly: false })}>
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
