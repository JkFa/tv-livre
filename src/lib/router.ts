import { useEffect, useState } from 'react';
import { parseLocation, type Route } from './route-parse.ts';

export { channelHref, parseHash, parseLocation, type Route } from './route-parse.ts';

/**
 * Roteamento por hash (#/...). Como o GitHub Pages só serve arquivos estáticos,
 * rotas por hash nunca geram 404 ao recarregar a página.
 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => currentRoute());
  useEffect(() => {
    const on = () => setRoute(currentRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** Rota do endereço atual: hash do app ou página estática de canal (ver parseLocation). */
export function currentRoute(): Route {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="tvlivre:canal"]')?.content ?? null;
  return parseLocation(window.location.pathname, window.location.hash, import.meta.env.BASE_URL, meta);
}

export function navigate(hash: string): void {
  if (window.location.hash !== hash) window.location.hash = hash;
}
