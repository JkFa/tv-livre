import { Eye, MapPin } from 'lucide-react';
import type { Channel } from '../../shared/types.ts';
import { fmtNum, textoAssistindo, useAnuncio, type EmAlta } from '../lib/presenca-ui.ts';
import type { Resumo } from '../lib/presenca.ts';
import { formatRegion, type Region } from '../lib/region.ts';

const nf = new Intl.NumberFormat('pt-BR');

interface Props {
  total: number | null;
  region: Region | null;
  /** Resumo do serviço de presença (null = sem serviço: a tela fica como antes). */
  presenca?: Resumo | null;
}

/** Bloco grande da tela inicial: total de acessos e de onde você está acessando. */
export function VisitStrip({ total, region, presenca = null }: Props) {
  const acessos = presenca?.acessos ?? total;
  if (acessos === null && !region && !presenca) return null;
  return (
    <section className="visits" aria-label="Acessos ao site" data-testid="visitas-home" data-live={presenca && presenca.assistindo > 0 ? '' : undefined}>
      {presenca && presenca.assistindo > 0 && (
        <p className="visits-live" data-testid="assistindo-home">
          <span className="live-dot" aria-hidden="true" />
          <span className="num" key={presenca.assistindo}>{fmtNum(presenca.assistindo)}</span>
          <span className="visits-label">assistindo agora</span>
        </p>
      )}
      {acessos !== null && (
        <p className="visits-total">
          <span className="num" data-testid="visitas-total">{nf.format(acessos)}</span>
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
export function VisitChip({ total, region, presenca = null }: Props) {
  const acessos = presenca?.acessos ?? total;
  if (acessos === null && !region && !presenca) return null;
  return (
    <p className="visit-chip" data-testid="visitas-chip">
      {presenca && presenca.assistindo > 0 && (
        <span className="visit-chip-item visit-chip-live" data-testid="assistindo-total">
          <span className="live-dot" aria-hidden="true" />
          <b key={presenca.assistindo}>{fmtNum(presenca.assistindo)}</b> assistindo agora
        </span>
      )}
      {acessos !== null && (
        <span className="visit-chip-item">
          <Eye size={15} aria-hidden="true" />
          <b>{nf.format(acessos)}</b> acessos
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

/**
 * ÚNICA região `aria-live` do "assistindo agora": o leitor de tela ouve no máximo uma atualização a cada 30 s e só do total.
 * Os números visíveis (topo, início) não são regiões vivas, para não repetir o anúncio.
 */
export function AnuncioAssistindo({ presenca }: { presenca: Resumo | null }) {
  const texto = useAnuncio(presenca && presenca.assistindo > 0 ? textoAssistindo(presenca.assistindo) : '');
  return (
    <span className="sr-only" aria-live="polite" role="status" data-testid="assistindo-anuncio">
      {texto}
    </span>
  );
}

/**
 * Modo TV: faixa no topo da grade com SÓ o total assistindo e a lista "Em alta agora". Tudo são botões, então o
 * controle remoto (setas/OK) chega em cada canal pelo mesmo foco espacial do resto da grade.
 */
export function EmAltaTv({ presenca, emAlta, numeros, onSelect }: { presenca: Resumo | null; emAlta: readonly EmAlta[]; numeros: (c: Channel) => string; onSelect: (c: Channel) => void }) {
  if (!presenca || (presenca.assistindo === 0 && !emAlta.length)) return null;
  return (
    <section className="tv-emalta" aria-label="Assistindo agora" data-testid="tv-emalta">
      <p className="tv-emalta-total">
        <span className="live-dot" aria-hidden="true" />
        <b className="num">{fmtNum(presenca.assistindo)}</b> assistindo agora
      </p>
      {emAlta.length > 0 && (
        <>
          <h3 className="tv-emalta-titulo">Em alta agora</h3>
          <ul className="tv-emalta-lista">
            {emAlta.map(({ channel, n }) => (
              <li key={`${channel.country}/${channel.id}`}>
                <button type="button" className="tv-emalta-item" onClick={() => onSelect(channel)}>
                  <span className="num">{numeros(channel)}</span>
                  <span className="tv-emalta-nome">{channel.name}</span>
                  <span className="tv-emalta-n">{fmtNum(n)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
