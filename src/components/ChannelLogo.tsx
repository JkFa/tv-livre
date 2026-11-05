import { useState } from 'react';

interface Props {
  name: string;
  src?: string;
  size?: number;
}

/** Logo do canal com fallback para as iniciais quando a imagem não carrega. */
export function ChannelLogo({ name, src, size = 40 }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const showImg = src && failedSrc !== src;
  return (
    <span className="logo-tile" style={{ width: size, height: size }} aria-hidden="true">
      {showImg ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span className="logo-initials">{initials || 'TV'}</span>
      )}
    </span>
  );
}
