import { Eye, MapPin } from 'lucide-react';
import { formatRegion, type Region } from '../lib/region.ts';

const nf = new Intl.NumberFormat('pt-BR');

interface Props {
  total: number | null;
  region: Region | null;
}

/** Bloco grande da tela inicial: total de acessos e de onde você está acessando. */
export function VisitStrip({ total, region }: Props) {
  if (total === null && !region) return null;
  return (
    <section className="visits" aria-label="Acessos ao site" data-testid="visitas-home">
      {total !== null && (
        <p className="visits-total">
          <span className="num" data-testid="visitas-total">{nf.format(total)}</span>
          <span className="visits-label">acessos ao site</span>
        </p>
      )}
      {region && (
        <p className="visits-region">
          <MapPin size={20} aria-hidden="true" />
          <span>
            <span className="visits-label">Você está acessando de</span>
            <strong data-testid="visitas-regiao">{formatRegion(region)}</strong>
          </span>
        </p>
      )}
    </section>
  );
}

/** Versão compacta, fixa no topo do computador em todas as páginas. */
export function VisitChip({ total, region }: Props) {
  if (total === null && !region) return null;
  return (
    <p className="visit-chip" data-testid="visitas-chip">
      {total !== null && (
        <span className="visit-chip-item">
          <Eye size={15} aria-hidden="true" />
          <b>{nf.format(total)}</b> acessos
        </span>
      )}
      {region && (
        <span className="visit-chip-item">
          <MapPin size={15} aria-hidden="true" />
          {formatRegion(region)}
        </span>
      )}
    </p>
  );
}
