/** Páginas indexáveis: política de elegibilidade, slugs estáveis, metas, JSON-LD e sitemap. Funções puras (sem disco nem rede). */
import type { Channel } from '../../shared/types.ts';
import { categoryLabel, CATEGORY_LABELS } from '../../src/lib/labels.ts';
import { isRemoved, type Removals } from './removals.ts';

export interface SeoPolicy {
  indexar: 'free-tv-e-publicos' | 'nenhum';
  permitir: string[];
  bloquear: string[];
}

export const PUBLIC_CATEGORIES = ['public', 'education', 'legislative', 'religious'];

const matches = (list: string[], ch: Pick<Channel, 'id' | 'country'>) => list.includes(ch.id) || list.includes(`${ch.country}/${ch.id}`);

/** Este canal ganha página indexável? Só no ar, nunca removido a pedido, e conforme a política. */
export function isEligible(ch: Channel, policy: SeoPolicy, removals: Removals = {}): boolean {
  if (ch.status !== 'online') return false;
  if (isRemoved({ id: ch.id, url: ch.url, name: ch.name }, removals)) return false;
  if (matches(policy.bloquear, ch)) return false;
  if (matches(policy.permitir, ch)) return true;
  if (policy.indexar === 'free-tv-e-publicos') return ch.sources[0] === 'free-tv' || ch.categories.some((c) => PUBLIC_CATEGORIES.includes(c));
  return false;
}

/** "Jornal Nacional HD!" → "jornal-nacional-hd". Sem acentos, minúsculo, hifens. */
export function slugify(text: string): string {
  const s = text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s || 'canal';
}

/**
 * Slug por canal dentro de cada país: o nome normalizado; se dois canais do mesmo país dão o mesmo slug,
 * todos do grupo ganham o sufixo do id (assim o resultado não depende da ordem). Chave do mapa: `PAÍS/id`.
 */
export function assignSlugs(channels: readonly Channel[]): Map<string, string> {
  const groups = new Map<string, Channel[]>();
  for (const c of channels) {
    const k = `${c.country}/${slugify(c.name)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
  }
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const [k, list] of groups) {
    const base = k.slice(k.indexOf('/') + 1);
    for (const c of [...list].sort((a, b) => a.id.localeCompare(b.id))) {
      let slug = list.length === 1 ? base : `${base}-${slugify(c.id)}`;
      for (let n = 2; taken.has(`${c.country}/${slug}`); n++) slug = `${base}-${slugify(c.id)}-${n}`;
      taken.add(`${c.country}/${slug}`);
      out.set(`${c.country}/${c.id}`, slug);
    }
  }
  return out;
}

export const categorySlug = (id: string): string => slugify(categoryLabel(id));
export const knownCategories = (): string[] => Object.keys(CATEGORY_LABELS);

const LANG2: Record<string, string> = {
  por: 'pt', eng: 'en', spa: 'es', fra: 'fr', deu: 'de', ita: 'it', rus: 'ru', ara: 'ar', hin: 'hi', zho: 'zh', jpn: 'ja',
  kor: 'ko', tur: 'tr', nld: 'nl', pol: 'pl', ukr: 'uk', swe: 'sv', ell: 'el', heb: 'he', ron: 'ro', ces: 'cs', hun: 'hu',
};
/** ISO 639-3 (iptv-org) → código curto para `inLanguage` (ex.: por → pt). Desconhecido passa como está. */
export const langCode = (iso3: string): string => LANG2[iso3] ?? iso3;

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON dentro de <script>: impede fechar a tag por dentro. */
export const jsonLd = (o: unknown): string => JSON.stringify(o).replace(/</g, '\\u003c');

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  image: string;
  imageAlt: string;
  /** JSON-LD já montado (objeto). */
  ld?: unknown;
  /** Para a página de canal: `PAÍS/id`, lido pelo app para abrir o player no canal certo. */
  channelRef?: string;
  /** Página de lista (categoria/país): o app não troca o título dela. */
  listing?: boolean;
}

/** Bloco de <head> com título, descrição, canonical, Open Graph e Twitter Card (pt_BR). */
export function headBlock(m: PageMeta): string {
  const lines = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<link rel="canonical" href="${esc(m.canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="TV Livre" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${esc(m.canonical)}" />`,
    `<meta property="og:image" content="${esc(m.image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(m.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${esc(m.image)}" />`,
  ];
  if (m.listing) lines.push(`<meta name="tvlivre:estatica" content="listagem" />`);
  if (m.channelRef) lines.push(`<meta name="tvlivre:canal" content="${esc(m.channelRef)}" />`);
  if (m.ld) lines.push(`<script type="application/ld+json">${jsonLd(m.ld)}</script>`);
  return lines.join('\n    ');
}

/** Troca o <head> genérico do index.html do app pelo da página e coloca o conteúdo estático dentro de #root. */
export function applyTemplate(template: string, m: PageMeta, bodyHtml: string): string {
  let html = template
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi, '');
  if (!html.includes('<div id="root"></div>')) throw new Error('template sem <div id="root"></div>');
  html = html.replace('<meta name="theme-color"', `${headBlock(m)}\n    <meta name="theme-color"`);
  return html.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`);
}

export function channelDescription(p: { name: string; number: string; country: string; language?: string; category?: string; program?: string }): string {
  const parts = [`Assista ${p.name} ao vivo, grátis e sem cadastro: canal ${p.number} da grade do TV Livre.`];
  const facts = [`País: ${p.country}`, p.category && `Categoria: ${p.category}`, p.language && `Idioma: ${p.language}`].filter(Boolean);
  if (facts.length) parts.push(`${facts.join('. ')}.`);
  if (p.program) parts.push(`Agora: ${p.program}.`);
  return parts.join(' ');
}

export function channelLd(p: { name: string; number: string; url: string; lang?: string; description: string }): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'TelevisionChannel',
    name: p.name,
    broadcastChannelId: p.number,
    ...(p.lang ? { inLanguage: p.lang } : {}),
    url: p.url,
    description: p.description,
  };
}

export interface SitemapUrl {
  loc: string;
  lastmod: string;
}

export function sitemapXml(urls: SitemapUrl[]): string {
  const rows = urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
}
