/** Parte pura do roteador (sem DOM), fácil de testar. */
export type Route =
  | { name: 'home' }
  | { name: 'about' }
  | { name: 'channel'; country: string; id: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'sobre') return { name: 'about' };
  if (parts[0] === 'canal' && parts[1] && parts[2]) {
    try {
      return { name: 'channel', country: decodeURIComponent(parts[1]), id: decodeURIComponent(parts.slice(2).join('/')) };
    } catch {
      return { name: 'home' };
    }
  }
  return { name: 'home' };
}

export function channelHref(country: string, id: string): string {
  return `#/canal/${encodeURIComponent(country)}/${encodeURIComponent(id)}`;
}
