import { useEffect, useState } from 'react';
import { parseHash, type Route } from './route-parse.ts';

export { channelHref, parseHash, type Route } from './route-parse.ts';

/**
 * Roteamento por hash (#/...). Como o GitHub Pages só serve arquivos estáticos,
 * rotas por hash nunca geram 404 ao recarregar a página.
 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(hash: string): void {
  if (window.location.hash !== hash) window.location.hash = hash;
}
