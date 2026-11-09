/** Compartilhar um canal: texto, link (página indexável quando existe, senão a rota #/canal/...) e a lista de páginas. */

export interface ShareInput {
  name: string;
  /** Número de grade já formatado ("07"). */
  number: string;
  /** Programa no ar agora, se houver guia. */
  program?: string | undefined;
  link: string;
}

/**
 * Sem guia:  📺 Tô assistindo {Nome} (canal {NN}) ao vivo no TV Livre: {link}
 * Com guia:  📺 Agora em {Nome}: {Programa} — {link}
 * `withLink: false` devolve o mesmo texto sem o link (o Telegram recebe o link à parte).
 */
export function shareText(p: ShareInput, withLink = true): string {
  const body = p.program ? `📺 Agora em ${p.name}: ${p.program}` : `📺 Tô assistindo ${p.name} (canal ${p.number}) ao vivo no TV Livre`;
  if (!withLink) return body;
  return p.program ? `${body} — ${p.link}` : `${body}: ${p.link}`;
}

/** Página indexável do canal quando existe; senão a rota por hash. Sem parâmetros de rastreamento. */
export function channelShareLink(ch: { id: string; country: string }, slug: string | undefined, siteBase: string): string {
  const base = siteBase.endsWith('/') ? siteBase : `${siteBase}/`;
  return slug ? `${base}canal/${ch.country.toLowerCase()}/${slug}/` : `${base}#/canal/${encodeURIComponent(ch.country)}/${encodeURIComponent(ch.id)}`;
}

export const whatsappUrl = (text: string): string => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const telegramUrl = (link: string, text: string): string => `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;

// ---- lista de páginas indexáveis (data/paginas/<PAÍS>.json: { id: slug }) ----
const paginas = new Map<string, Record<string, string>>();
const pending = new Map<string, Promise<void>>();

/** Carrega (uma vez) as páginas do país. Falha ou ausência = nenhuma página. */
export function loadPaginas(country: string, base: string = import.meta.env.BASE_URL): Promise<void> {
  if (paginas.has(country)) return Promise.resolve();
  let p = pending.get(country);
  if (!p) {
    p = fetch(`${base}data/paginas/${encodeURIComponent(country)}.json`)
      .then(async (r) => (r.ok ? ((await r.json()) as Record<string, string>) : ({} as Record<string, string>)))
      .catch(() => ({}) as Record<string, string>)
      .then((m) => {
        paginas.set(country, m && typeof m === 'object' ? m : {});
        pending.delete(country);
      });
    pending.set(country, p);
  }
  return p;
}

/** Leitura síncrona (o compartilhamento do sistema precisa acontecer no mesmo gesto do toque, sem esperar rede). */
export const peekSlug = (ch: { id: string; country: string }): string | undefined => paginas.get(ch.country)?.[ch.id];

export function resetPaginasForTest(): void {
  paginas.clear();
  pending.clear();
}
export function setPaginasForTest(country: string, m: Record<string, string>): void {
  paginas.set(country, m);
}
