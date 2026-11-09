/** Parte pura do roteador (sem DOM), fácil de testar. */
export type Route =
  /** Tela inicial. */
  | { name: 'home' }
  /** O aparelho: player + grade, sem canal escolhido. */
  | { name: 'watch' }
  | { name: 'about' }
  | { name: 'install' }
  /** Atalhos do app instalado (manifest): executam uma ação e abrem o aparelho (#/canais). */
  | { name: 'action'; action: 'zap' | 'favorites' | 'search' }
  | { name: 'channel'; country: string; id: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'canais') return { name: 'watch' };
  if (parts[0] === 'sobre') return { name: 'about' };
  if (parts[0] === 'instalar') return { name: 'install' };
  if (parts[0] === 'zapear') return { name: 'action', action: 'zap' };
  if (parts[0] === 'favoritos') return { name: 'action', action: 'favorites' };
  if (parts[0] === 'buscar') return { name: 'action', action: 'search' };
  if (parts[0] === 'canal' && parts[1] && parts[2]) {
    try {
      return { name: 'channel', country: decodeURIComponent(parts[1]), id: decodeURIComponent(parts.slice(2).join('/')) };
    } catch {
      return { name: 'home' };
    }
  }
  return { name: 'home' };
}

/**
 * Rota a partir do endereço inteiro. A página estática de um canal (`/tv-livre/canal/br/<slug>/`) leva no <head> o canal
 * (`<meta name="tvlivre:canal" content="BR/id">`): é ele que diz qual canal abrir, sem o app precisar conhecer slugs.
 * Um hash (#/...) sempre vence o caminho, então navegar dentro do app continua pelo hash.
 */
export function parseLocation(pathname: string, hash: string, base: string, canalMeta: string | null): Route {
  if (hash.replace(/^#/, '')) return parseHash(hash); // inclui '#/': o "Início" explícito não reabre o canal da página
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '');
  const parts = rest.split('/').filter(Boolean);
  if (parts[0] === 'canal' && parts.length === 3 && canalMeta) {
    const i = canalMeta.indexOf('/');
    const country = canalMeta.slice(0, i);
    const id = canalMeta.slice(i + 1);
    // o país do caminho tem de bater com o da página (proteção contra meta de outra página)
    if (i > 0 && id && country.toLowerCase() === (parts[1] ?? '').toLowerCase()) return { name: 'channel', country, id };
  }
  return parseHash(hash);
}

export function channelHref(country: string, id: string): string {
  return `#/canal/${encodeURIComponent(country)}/${encodeURIComponent(id)}`;
}
