import { isBrowserPlayable, type Channel } from '../../shared/types.ts';
import { STATUS_LABELS } from '../lib/labels.ts';

export function StatusDot({ status }: { status: Channel['status'] }) {
  return (
    <span className={`status status-${status}`} title={`Status: ${STATUS_LABELS[status]}`}>
      <i aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Selos curtos que explicam como o canal vai se comportar no navegador. */
export function ChannelBadges({ channel }: { channel: Channel }) {
  const playable = isBrowserPlayable(channel);
  return (
    <span className="badges">
      {channel.kind === 'youtube' && <span className="badge badge-yt">YouTube</span>}
      {channel.kind === 'http' && (
        <span className="badge badge-warn" title="Link HTTP: o navegador bloqueia. Use o VLC.">
          HTTP · VLC
        </span>
      )}
      {channel.kind === 'other' && (
        <span className="badge badge-warn" title="Formato que o navegador não reproduz. Use o VLC.">
          Outro formato · VLC
        </span>
      )}
      {channel.kind === 'hls' && !playable && (
        <span className="badge badge-warn" title="O servidor não libera reprodução em outros sites. Use o VLC.">
          Só no VLC
        </span>
      )}
      {channel.kind === 'youtube' && !playable && <span className="badge badge-warn">Abrir no YouTube</span>}
      {channel.geo && (
        <span className="badge" title="Pode funcionar apenas dentro do país de origem">
          Geo
        </span>
      )}
    </span>
  );
}
