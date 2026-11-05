import { isBrowserPlayable, type Channel, type DataIndex } from '../../shared/types.ts';
import { ChannelLogo } from './ChannelLogo.tsx';

interface Props {
  index: DataIndex;
  starters: Channel[];
  onPick: (c: Channel) => void;
}

const nf = new Intl.NumberFormat('pt-BR');

export function Welcome({ index, starters, onPick }: Props) {
  const { meta } = index;
  const picks = starters.filter((c) => c.status === 'online' && isBrowserPlayable(c)).slice(0, 8);
  const updated = new Date(meta.generatedAt);
  return (
    <div className="welcome">
      <h1>
        Televisão aberta, <em>sem cadastro.</em>
      </h1>
      <p className="lead">
        Escolha um canal na lista para assistir ao vivo. O TV Livre só organiza os links públicos: o vídeo vem direto da
        fonte original.
      </p>
      <dl className="stats">
        <div>
          <dt>Canais</dt>
          <dd>{nf.format(meta.total)}</dd>
        </div>
        <div>
          <dt>No ar</dt>
          <dd>{nf.format(meta.byStatus.online)}</dd>
        </div>
        <div>
          <dt>Países</dt>
          <dd>{nf.format(index.countries.length)}</dd>
        </div>
      </dl>
      {picks.length > 0 && (
        <>
          <h2>Para começar</h2>
          <ul className="starters">
            {picks.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onPick(c)}>
                  <ChannelLogo name={c.name} src={c.logo} size={36} />
                  <span>{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted small">
        Dados atualizados em {updated.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}. Fontes:{' '}
        {meta.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && ' e '}
            <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>
          </span>
        ))}
        .
      </p>
    </div>
  );
}
