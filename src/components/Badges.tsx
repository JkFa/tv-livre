import { Globe } from 'lucide-react';
import type { Channel } from '../../shared/types.ts';
import { countryFlag, countryName } from '../lib/labels.ts';
import { BLOCK_TEXT, browserBlock, channelHealth, HEALTH_LABELS, qualityLabel } from '../lib/health.ts';
import { channelKey } from '../lib/lineup.ts';
import { useLocalFailures } from '../lib/local-failures.ts';
import { caps, isPlayableHere } from '../lib/playback.ts';

const HEALTH_TITLE = {
  ok: 'Respondeu no último teste diário dos links.',
  instavel: 'Falhou nos últimos testes diários (1 ou 2 vezes seguidas). Pode estar com problema ou bloqueado só para o servidor de teste, nos EUA.',
  fora: 'Falhou em 3 ou mais testes diários seguidos (ou o link não existe mais). Ainda pode tocar daqui: o teste roda nos EUA.',
  'nao-confirmado': 'Ainda sem resultado do teste diário dos links.',
} as const;

/**
 * Status por FORMA, não por cor (o acento é reservado): círculo cheio = no ar, meio círculo = instável,
 * anel = não confirmado, risco = fora do ar.
 */
export function StatusMark({ channel, withText = false }: { channel: Channel; withText?: boolean }) {
  const h = channelHealth(channel);
  return (
    <span className={`status status-${h}`} title={`${HEALTH_LABELS[h]}: ${HEALTH_TITLE[h]}`} data-saude={h}>
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false">
        {h === 'ok' && <circle cx="6" cy="6" r="4.5" fill="currentColor" />}
        {h === 'instavel' && (
          <>
            <circle cx="6" cy="6" r="3.7" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M6 1.4a4.6 4.6 0 0 0 0 9.2z" fill="currentColor" />
          </>
        )}
        {h === 'nao-confirmado' && <circle cx="6" cy="6" r="3.7" fill="none" stroke="currentColor" strokeWidth="1.8" />}
        {h === 'fora' && <path d="M1.5 10.5 10.5 1.5" stroke="currentColor" strokeWidth="1.8" />}
      </svg>
      {withText ? HEALTH_LABELS[h] : <span className="sr-only">{HEALTH_LABELS[h]}</span>}
    </span>
  );
}

/** Selos curtos que explicam como o canal vai se comportar no navegador. */
export function ChannelBadges({ channel }: { channel: Channel }) {
  const failures = useLocalFailures();
  const block = browserBlock(channel, caps());
  const quality = qualityLabel(channel);
  const failedHere = failures.has(channelKey(channel));
  return (
    <span className="badges">
      {failedHere && (
        <span className="badge badge-warn" title="Este canal não abriu neste aparelho nos últimos 7 dias. Ele aparece mais abaixo na lista só para você." data-testid="selo-falhou-aqui">
          Não abriu aqui
        </span>
      )}
      {block && (
        <span className="badge badge-warn" title={BLOCK_TEXT[block]} data-testid="selo-nao-toca">
          Não toca no navegador
        </span>
      )}
      {channel.kind === 'youtube' && <span className="badge">YouTube</span>}
      {channel.kind === 'youtube' && !isPlayableHere(channel, caps()) && <span className="badge badge-warn">Abrir no YouTube</span>}
      {quality && (
        <span className="badge" title={channel.resolution ? 'Maior resolução anunciada pelo canal no último teste' : 'Qualidade informada pela lista de origem'} data-testid="selo-qualidade">
          {quality}
        </span>
      )}
      {channel.geo && (
        <span className="badge" title="Pode funcionar apenas dentro do país de origem">Por região</span>
      )}
    </span>
  );
}

/** Origem do canal: bandeira (dos dados de origem) + nome do país. Internacional ganha um globo; país sem bandeira na fonte, só o nome. */
export function CountryTag({ code, short = false }: { code: string; short?: boolean }) {
  const flag = countryFlag(code);
  const name = countryName(code);
  return (
    <span className="country-tag" data-testid="pais-canal" data-pais={code} title={short ? name : undefined}>
      {code === 'INT' ? <Globe size={13} aria-hidden="true" className="country-globe" /> : flag && <span className="flag" aria-hidden="true">{flag}</span>}
      {short ? <span className="sr-only">{name}</span> : <span>{name}</span>}
    </span>
  );
}
