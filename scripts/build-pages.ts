/**
 * Páginas estáticas indexáveis (rodar depois do `vite build`):
 *   dist/canal/<pais>/<slug>/index.html      uma por canal elegível (config/seo.json)
 *   dist/categoria/<slug>/index.html         lista de canais elegíveis por categoria
 *   dist/pais/<pais>/index.html              lista de canais elegíveis por país
 *   dist/og/<pais>/<slug>.png|.jpg           prévia 1200×630 de cada canal (número + nome, sem o logo do canal)
 *   dist/sitemap.xml
 *
 *   npx tsx scripts/build-pages.ts [--dist dist] [--no-og]
 * Usa o index.html do build como molde: as páginas carregam o mesmo app, que reconhece o caminho e abre o canal.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Channel, DataIndex, EpgFile } from '../shared/types.ts';
import { formatNumber, lineupOrder } from '../shared/lineup.ts';
import { categoryLabel, countryName, languageName } from '../src/lib/labels.ts';
import { renderOgImages, type OgJob } from './lib/og-image.ts';
import type { Removals } from './lib/removals.ts';
import {
  applyTemplate, assignSlugs, categorySlug, channelDescription, channelLd, esc, isEligible, langCode, sitemapXml, type PageMeta, type SeoPolicy, type SitemapUrl,
} from './lib/seo.ts';

const SITE = (process.env.SITE_URL ?? 'https://jkfa.github.io/tv-livre').replace(/\/$/, '');
const BASE = '/tv-livre';
const OG_BUDGET = 40 * 1024 * 1024;
const RELATED = 8;

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dist = resolve(opt('dist') ?? 'dist');
const log = (...m: unknown[]) => console.log('[páginas]', ...m);

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const write = (rel: string, content: string) => {
  const f = join(dist, rel);
  mkdirSync(join(f, '..'), { recursive: true });
  writeFileSync(f, content);
};

const index = readJson<DataIndex>(join(dist, 'data/index.json'));
const policy = readJson<SeoPolicy>(resolve('config/seo.json'));
const removals = readJson<Removals>(resolve('config/removals.json'));
const template = readFileSync(join(dist, 'index.html'), 'utf8');
const lastmod = index.meta.generatedAt.slice(0, 10);

interface Page {
  html?: string;
  ch: Channel;
  number: string;
  slug: string;
  path: string; // /canal/br/slug/
  url: string;
}

// ----- elegibilidade, números e slugs -----
const pages: Page[] = [];
const byCountry = new Map<string, Page[]>();
for (const { code } of index.countries) {
  const file = join(dist, 'data/countries', `${code}.json`);
  if (!existsSync(file)) continue;
  const all = readJson<Channel[]>(file);
  const numbers = new Map(lineupOrder(all).map((c, i) => [c.id, i + 1]));
  const eligible = all.filter((c) => isEligible(c, policy, removals));
  if (!eligible.length) continue;
  const slugs = assignSlugs(eligible);
  const list: Page[] = eligible
    .map((ch) => {
      const slug = slugs.get(`${ch.country}/${ch.id}`)!;
      const path = `/canal/${ch.country.toLowerCase()}/${slug}/`;
      return { ch, number: formatNumber(numbers.get(ch.id)), slug, path, url: `${SITE}${path}` };
    })
    .sort((a, b) => Number(a.number) - Number(b.number));
  byCountry.set(code, list);
  pages.push(...list);
}
log(`${pages.length} canais elegíveis em ${byCountry.size} países (política: ${policy.indexar})`);

// ----- guia do momento (só para a meta description) -----
const epgNow = (ch: Channel): string | undefined => {
  const f = join(dist, 'data/epg', `${ch.country}.json`);
  if (!existsSync(f)) return undefined;
  const e = (readJson<EpgFile>(f).channels[ch.id] ?? []).find((x) => x[0] <= Date.now() / 1000 && Date.now() / 1000 < x[1]);
  return e?.[2];
};

const linkList = (items: Page[]) => `<ul>${items.map((p) => `<li><a href="${BASE}${p.path}"><span class="num">${p.number}</span> ${esc(p.ch.name)}</a></li>`).join('')}</ul>`;
const nav = `<p class="seo-nav"><a href="${BASE}/">TV Livre</a> · <a href="${BASE}/#/canais">Todos os canais</a> · <a href="${BASE}/#/sobre">Sobre</a></p>`;

// ----- páginas de canal -----
const ogJobs: OgJob[] = [];
const OG_EXT = { current: 'png' as 'png' | 'jpg' };
for (const [code, list] of byCountry) {
  const pais = countryName(code);
  for (const p of list) {
    const cat = p.ch.categories[0];
    const lang = p.ch.languages[0];
    const description = channelDescription({
      name: p.ch.name, number: p.number, country: pais,
      ...(cat ? { category: categoryLabel(cat) } : {}), ...(lang ? { language: languageName(lang) } : {}),
      ...((): { program?: string } => { const g = epgNow(p.ch); return g ? { program: g } : {}; })(),
    });
    const related = list.filter((x) => x !== p && cat && x.ch.categories.includes(cat)).slice(0, RELATED);
    const ogRel = `/og/${code.toLowerCase()}/${p.slug}`;
    ogJobs.push({ number: p.number, name: p.ch.name, sub: `${pais}${cat ? ` · ${categoryLabel(cat)}` : ''}`, file: ogRel });
    const meta: PageMeta = {
      title: `${p.ch.name} ao vivo — canal ${p.number} | TV Livre`,
      description,
      canonical: p.url,
      image: `${SITE}${ogRel}.@EXT@`,
      imageAlt: `Canal ${p.number}, ${p.ch.name}, no TV Livre`,
      ld: channelLd({ name: p.ch.name, number: p.number, url: p.url, ...(lang ? { lang: langCode(lang) } : {}), description }),
      channelRef: `${p.ch.country}/${p.ch.id}`,
    };
    const body = `<main class="seo-page"><article>
<p class="seo-kicker">TV ao vivo · <a href="${BASE}/pais/${code.toLowerCase()}/">${esc(pais)}</a>${cat ? ` · <a href="${BASE}/categoria/${categorySlug(cat)}/">${esc(categoryLabel(cat))}</a>` : ''}</p>
<p class="seo-num num" aria-label="Canal ${p.number}">${p.number}</p>
<h1>${esc(p.ch.name)} ao vivo</h1>
<p>Canal ${p.number} da grade do TV Livre. País: ${esc(pais)}${lang ? `. Idioma: ${esc(languageName(lang))}` : ''}. Sem cadastro, sem anúncios e sem baixar nada: o vídeo vem direto da transmissão do canal.</p>
<p><a class="btn btn-accent" href="${BASE}/#/canal/${encodeURIComponent(p.ch.country)}/${encodeURIComponent(p.ch.id)}">Assistir agora</a></p>
${related.length ? `<h2>Mais canais${cat ? ` de ${esc(categoryLabel(cat))}` : ''} · ${esc(pais)}</h2>${linkList(related)}` : ''}
${nav}
</article></main>`;
    p.html = applyTemplate(template, meta, body);
  }
}

// ----- páginas de categoria e de país -----
const listingPage = (title: string, description: string, canonical: string, h1: string, items: Page[]) => {
  const meta: PageMeta = { title, description, canonical, image: `${SITE}/og.png`, imageAlt: 'TV Livre: o controle remoto da TV aberta', listing: true };
  return applyTemplate(template, meta, `<main class="seo-page"><article><h1>${esc(h1)}</h1><p>${esc(description)}</p>${linkList(items)}${nav}</article></main>`);
};
const listings: { rel: string; html: string }[] = [];
const byCat = new Map<string, Page[]>();
for (const p of pages) for (const c of p.ch.categories) (byCat.get(c) ?? byCat.set(c, []).get(c)!).push(p);
for (const [cat, items] of byCat) {
  const label = categoryLabel(cat);
  listings.push({
    rel: `categoria/${categorySlug(cat)}/`,
    html: listingPage(`Canais de ${label} ao vivo | TV Livre`, `${items.length} canais de ${label} ao vivo e grátis, de vários países, para assistir no navegador, sem cadastro.`, `${SITE}/categoria/${categorySlug(cat)}/`, `Canais de ${label} ao vivo`, items.slice(0, 300)),
  });
}
for (const [code, items] of byCountry) {
  const pais = countryName(code);
  listings.push({
    rel: `pais/${code.toLowerCase()}/`,
    html: listingPage(`TV ao vivo: ${pais} | TV Livre`, `${items.length} canais ao vivo e grátis do país: ${pais}. Direto no navegador, sem cadastro e sem anúncios.`, `${SITE}/pais/${code.toLowerCase()}/`, `TV ao vivo: ${pais}`, items),
  });
}

// ----- prévias (OG): PNG; se projetar mais de 40 MB, JPEG -----
let ogInfo = 'não geradas (--no-og)';
if (!args.includes('--no-og') && ogJobs.length) {
  const t0 = Date.now();
  const r = await renderOgImages(join(dist), ogJobs, { budgetBytes: OG_BUDGET });
  OG_EXT.current = r.format;
  ogInfo = `${ogJobs.length} imagens ${r.format.toUpperCase()}, ${(r.totalBytes / 1024 / 1024).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s${r.fellBack ? ` (PNG passaria de 40 MB: JPEG qualidade ${r.quality})` : ''}`;
}
const ext = args.includes('--no-og') ? 'png' : OG_EXT.current;

// ----- grava tudo -----
for (const [code, list] of byCountry) write(`data/paginas/${code}.json`, JSON.stringify(Object.fromEntries(list.map((p) => [p.ch.id, p.slug]))));
for (const p of pages) write(`${p.path.slice(1)}index.html`, p.html!.replaceAll('.@EXT@', `.${ext}`));
for (const l of listings) write(`${l.rel}index.html`, l.html);

const urls: SitemapUrl[] = [
  { loc: `${SITE}/`, lastmod },
  ...listings.map((l) => ({ loc: `${SITE}/${l.rel}`, lastmod })),
  ...pages.map((p) => ({ loc: p.url, lastmod })),
];
write('sitemap.xml', sitemapXml(urls));
const dirSize = (d: string): number => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? dirSize(join(d, e.name)) : statSync(join(d, e.name)).size), 0);
log(`${pages.length} páginas de canal, ${listings.length} de categoria/país, sitemap com ${urls.length} endereços`);
log(`prévias: ${ogInfo}`);
if (existsSync(join(dist, 'canal'))) log(`canal/: ${(dirSize(join(dist, 'canal')) / 1024 / 1024).toFixed(1)} MB de HTML`);
