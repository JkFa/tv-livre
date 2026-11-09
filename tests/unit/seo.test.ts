import { describe, expect, it } from 'vitest';
import type { Channel } from '../../shared/types.ts';
import { parseLocation } from '../../src/lib/route-parse.ts';
import {
  applyTemplate, assignSlugs, channelDescription, channelLd, headBlock, isEligible, jsonLd, langCode, sitemapXml, slugify, type SeoPolicy,
} from '../../scripts/lib/seo.ts';

const ch = (o: Partial<Channel> & { id: string; name: string }): Channel => ({
  country: 'BR', categories: [], languages: ['por'], url: `https://x.example/${o.id}.m3u8`, kind: 'hls', status: 'online', sources: ['iptv-org'], ...o,
});
const policy: SeoPolicy = { indexar: 'free-tv-e-publicos', permitir: [], bloquear: [] };

describe('slugify', () => {
  it('sem acentos, minúsculo, hifens', () => {
    expect(slugify('Jornal Nacional HD!')).toBe('jornal-nacional-hd');
    expect(slugify('TV Cultura – São Paulo')).toBe('tv-cultura-sao-paulo');
    expect(slugify('A&E Brasil')).toBe('a-e-e-brasil'); // & vira "e"
    expect(slugify('  ¡¡¡  ')).toBe('canal');
    expect(slugify('x'.repeat(100)).length).toBeLessThanOrEqual(60);
  });
});

describe('assignSlugs', () => {
  const list = [ch({ id: 'Globo.br', name: 'Globo' }), ch({ id: 'Globo.br@SP', name: 'Globo' }), ch({ id: 'SBT.br', name: 'SBT' }), ch({ id: 'SBT.us', name: 'SBT', country: 'US' })];
  it('mesmo canal gera sempre o mesmo slug, em qualquer ordem', () => {
    const a = assignSlugs(list);
    const b = assignSlugs([...list].reverse());
    expect([...a].sort()).toEqual([...b].sort());
    expect(assignSlugs(list).get('BR/SBT.br')).toBe('sbt');
  });
  it('colisão no mesmo país: todos do grupo ganham o sufixo do id; país diferente não colide', () => {
    const m = assignSlugs(list);
    expect(m.get('BR/Globo.br')).toBe('globo-globo-br');
    expect(m.get('BR/Globo.br@SP')).toBe('globo-globo-br-sp');
    expect(m.get('US/SBT.us')).toBe('sbt');
    const porPais = [...m].map(([k, v]) => `${k.split('/')[0]}/${v}`);
    expect(new Set(porPais).size).toBe(m.size); // único dentro de cada país
  });
});

describe('isEligible (política)', () => {
  it('padrão: no ar e (Free-TV ou categoria pública)', () => {
    expect(isEligible(ch({ id: 'a', name: 'A', sources: ['free-tv'] }), policy)).toBe(true);
    expect(isEligible(ch({ id: 'a', name: 'A', sources: ['free-tv', 'iptv-org'] }), policy)).toBe(true);
    expect(isEligible(ch({ id: 'b', name: 'B', categories: ['education'] }), policy)).toBe(true);
    for (const c of ['public', 'legislative', 'religious']) expect(isEligible(ch({ id: 'b', name: 'B', categories: [c] }), policy)).toBe(true);
  });
  it('os demais não ganham página', () => {
    expect(isEligible(ch({ id: 'c', name: 'C', categories: ['news'] }), policy)).toBe(false);
    expect(isEligible(ch({ id: 'c', name: 'C', sources: ['iptv-org', 'free-tv'] }), policy)).toBe(false); // a fonte principal é a primeira
  });
  it('só canais no ar', () => {
    expect(isEligible(ch({ id: 'a', name: 'A', sources: ['free-tv'], status: 'desconhecido' }), policy)).toBe(false);
    expect(isEligible(ch({ id: 'a', name: 'A', sources: ['free-tv'], status: 'offline' }), policy)).toBe(false);
  });
  it('removidos a pedido nunca ganham página, nem com permitir', () => {
    const c = ch({ id: 'a', name: 'A', sources: ['free-tv'] });
    expect(isEligible(c, { ...policy, permitir: ['a'] }, { channelIds: ['a'] })).toBe(false);
    expect(isEligible(c, policy, { names: ['A'] })).toBe(false);
    expect(isEligible(c, policy, { hosts: ['x.example'] })).toBe(false);
  });
  it('permitir e bloquear (por id ou PAÍS/id); bloquear vence', () => {
    const c = ch({ id: 'n', name: 'N', categories: ['news'] });
    expect(isEligible(c, { ...policy, permitir: ['BR/n'] })).toBe(true);
    expect(isEligible(c, { ...policy, permitir: ['n'], bloquear: ['n'] })).toBe(false);
    expect(isEligible(ch({ id: 'a', name: 'A', sources: ['free-tv'] }), { ...policy, bloquear: ['BR/a'] })).toBe(false);
  });
  it('indexar "nenhum": só o que está em permitir', () => {
    const c = ch({ id: 'a', name: 'A', sources: ['free-tv'] });
    expect(isEligible(c, { indexar: 'nenhum', permitir: [], bloquear: [] })).toBe(false);
    expect(isEligible(c, { indexar: 'nenhum', permitir: ['a'], bloquear: [] })).toBe(true);
  });
});

describe('metas e JSON-LD', () => {
  const desc = channelDescription({ name: 'TV Cultura', number: '07', country: 'Brasil', language: 'Português', category: 'Cultura', program: 'Jornal "da" Cultura & Cia' });
  it('descrição com país, idioma, categoria e programa do momento', () => {
    expect(desc).toContain('canal 07');
    expect(desc).toContain('País: Brasil');
    expect(desc).toContain('Categoria: Cultura');
    expect(desc).toContain('Idioma: Português');
    expect(desc).toContain('Agora: Jornal "da" Cultura & Cia.');
    expect(channelDescription({ name: 'X', number: '01', country: 'Brasil' })).not.toContain('Agora');
  });
  const meta = { title: 'TV Cultura ao vivo — canal 07 | TV Livre', description: desc, canonical: 'https://s.example/canal/br/tv-cultura/', image: 'https://s.example/og/br/tv-cultura.png', imageAlt: 'alt', channelRef: 'BR/Cultura.br', ld: channelLd({ name: 'TV Cultura', number: '07', url: 'https://s.example/canal/br/tv-cultura/', lang: langCode('por'), description: desc }) };
  it('head completo: title, canonical, Open Graph pt_BR, Twitter Card, canal e JSON-LD', () => {
    const h = headBlock(meta);
    expect(h).toContain('<title>TV Cultura ao vivo — canal 07 | TV Livre</title>');
    expect(h).toContain('<link rel="canonical" href="https://s.example/canal/br/tv-cultura/" />');
    expect(h).toContain('property="og:locale" content="pt_BR"');
    for (const p of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt']) expect(h).toContain(`property="${p}"`);
    for (const n of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) expect(h).toContain(`name="${n}"`);
    expect(h).toContain('content="summary_large_image"');
    expect(h).toContain('<meta name="tvlivre:canal" content="BR/Cultura.br" />');
    expect(h).toContain('Agora: Jornal &quot;da&quot; Cultura &amp; Cia.');
  });
  it('JSON-LD TelevisionChannel válido, sem fechar o <script> por dentro', () => {
    const m = /<script type="application\/ld\+json">(.*)<\/script>/.exec(headBlock(meta));
    const ld = JSON.parse(m![1]!);
    expect(ld).toMatchObject({ '@context': 'https://schema.org', '@type': 'TelevisionChannel', name: 'TV Cultura', broadcastChannelId: '07', inLanguage: 'pt' });
    expect(ld).not.toHaveProperty('providerMobileData');
    expect(jsonLd({ a: '</script><b>' })).not.toContain('</script>');
  });
  it('applyTemplate troca o head genérico e põe o conteúdo em #root', () => {
    const tpl = '<!doctype html><html><head><title>Geral</title><meta name="description" content="geral" /><link rel="canonical" href="x" /><meta property="og:title" content="g" /><meta name="twitter:card" content="g" /><meta name="theme-color" content="#000" /></head><body><div id="root"></div></body></html>';
    const html = applyTemplate(tpl, meta, '<h1>Oi</h1>');
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html).toContain('<div id="root"><h1>Oi</h1></div>');
    expect(html).not.toContain('Geral');
    expect(() => applyTemplate('<html></html>', meta, '')).toThrow();
  });
});

describe('sitemap', () => {
  it('XML válido, com lastmod e caracteres escapados', () => {
    const xml = sitemapXml([{ loc: 'https://s.example/', lastmod: '2026-11-09' }, { loc: 'https://s.example/canal/br/a&b/', lastmod: '2026-11-09' }]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml.match(/<lastmod>2026-11-09<\/lastmod>/g)).toHaveLength(2);
    expect(xml).toContain('a&amp;b');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });
});

describe('parseLocation (página estática de canal + hash)', () => {
  const B = '/tv-livre/';
  it('o caminho /canal/<pais>/<slug>/ abre o canal indicado pela página', () => {
    expect(parseLocation('/tv-livre/canal/br/tv-cultura/', '', B, 'BR/Cultura.br')).toEqual({ name: 'channel', country: 'BR', id: 'Cultura.br' });
    expect(parseLocation('/tv-livre/canal/br/tv-cultura/', '#', B, 'BR/a/b')).toEqual({ name: 'channel', country: 'BR', id: 'a/b' });
  });
  it('o hash sempre vence o caminho (navegar dentro do app) e as rotas # continuam iguais', () => {
    expect(parseLocation('/tv-livre/canal/br/x/', '#/canais', B, 'BR/x')).toEqual({ name: 'watch' });
    expect(parseLocation('/tv-livre/canal/br/x/', '#/', B, 'BR/x')).toEqual({ name: 'home' });
    expect(parseLocation('/tv-livre/', '#/canal/BR/a', B, null)).toEqual({ name: 'channel', country: 'BR', id: 'a' });
    expect(parseLocation('/tv-livre/', '#/zapear', B, null)).toEqual({ name: 'action', action: 'zap' });
    expect(parseLocation('/tv-livre/', '#/sobre', B, null)).toEqual({ name: 'about' });
    expect(parseLocation('/tv-livre/', '', B, null)).toEqual({ name: 'home' });
  });
  it('sem a meta da página, ou com país diferente, cai na tela inicial', () => {
    expect(parseLocation('/tv-livre/canal/br/x/', '', B, null)).toEqual({ name: 'home' });
    expect(parseLocation('/tv-livre/canal/br/x/', '', B, 'US/x')).toEqual({ name: 'home' });
    expect(parseLocation('/tv-livre/categoria/news/', '', B, 'BR/x')).toEqual({ name: 'home' });
  });
});
