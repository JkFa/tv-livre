import { isBrowserPlayable, type Channel } from '../../shared/types.ts';
import { STATUS_LABELS } from '../lib/labels.ts';

/**
 * Status por FORMA, não por cor (o acento é reservado): círculo cheio = no ar, anel = não confirmado, risco = fora do ar.
 */
export function StatusMark({ status, withText = false }: { status: Channel['status']; withText?: boolean }) {
  return (
    <span className={`status status-${status}`} title={`Status: ${STATUS_LABELS[status]}`}>
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false">
        {status === 'online' && <circle cx="6" cy="6" r="4.5" fill="currentColor" />}
        {status === 'desconhecido' && <circle cx="6" cy="6" r="3.7" fill="none" stroke="currentColor" strokeWidth="1.8" />}
        {status === 'offline' && <path d="M1.5 10.5 10.5 1.5" stroke="currentColor" strokeWidth="1.8" />}
      </svg>
      {withText ? STATUS_LABELS[status] : <span className="sr-only">{STATUS_LABELS[status]}</span>}
    </span>
  );
}

/** Selos curtos que explicam como o canal vai se comportar no navegador. */
export function ChannelBadges({ channel }: { channel: Channel }) {
  const playable = isBrowserPlayable(channel);
  return (
    <span className="badges">
      {channel.kind === 'youtube' && <span className="badge">YouTube</span>}
      {channel.kind === 'http' && (
        <span className="badge badge-warn" title="Link HTTP: o navegador bloqueia. Use o VLC.">HTTP · VLC</span>
      )}
      {channel.kind === 'other' && (
        <span className="badge badge-warn" title="Formato que o navegador não toca. Use o VLC.">Outro formato · VLC</span>
      )}
      {channel.kind === 'hls' && !playable && (
        <span className="badge badge-warn" title="O servidor não libera reprodução em outros sites. Use o VLC.">Só no VLC</span>
      )}
      {channel.kind === 'youtube' && !playable && <span className="badge badge-warn">Abrir no YouTube</span>}
      {channel.geo && (
        <span className="badge" title="Pode funcionar apenas dentro do país de origem">Por região</span>
      )}
    </span>
  );
}
