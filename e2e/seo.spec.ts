import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Páginas estáticas indexáveis (geradas por `npm run build:pages` depois do build) e sitemap.

/** Primeira página de canal listada no sitemap: [caminho relativo ao site, slug]. */
async function firstChannelPage(request: APIRequestContext): Promise<{ path: string }> {
  const res = await request.get('sitemap.xml');
  expect(res.ok(), 'sitemap.xml deve existir (npm run build:pages)').toBeTruthy();
  const loc = /<loc>[^<]*\/tv-livre\/(canal\/[a-z]{2,3}\/[^<]+\/)<\/loc>/.exec(await res.text());
  expect(loc, 'o sitemap precisa listar ao menos uma página de canal').toBeTruthy();
  return { path: loc![1]! };
}

test('sitemap.xml é válido, com lastmod, e o robots.txt aponta para ele', async ({ request }) => {
  const xml = await (await request.get('sitemap.xml')).text();
  expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  const urls = xml.match(/<url>/g)?.length ?? 0;
  expect(urls).toBeGreaterThan(10);
  expect(xml.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)).toHaveLength(urls);
  expect(xml).toMatch(/<loc>https:\/\/jkfa\.github\.io\/tv-livre\/<\/loc>/);
  expect(xml).toMatch(/\/tv-livre\/categoria\/[a-z-]+\/<\/loc>/);
  expect(xml).toMatch(/\/tv-livre\/pais\/[a-z]{2}\/<\/loc>/);
  const robots = await (await request.get('robots.txt')).text();
  expect(robots).toContain('Sitemap: https://jkfa.github.io/tv-livre/sitemap.xml');
});

test('página de canal: título, metas, Open Graph e JSON-LD corretos; o app abre o player no canal certo', async ({ page, request }) => {
  const { path } = await firstChannelPage(request);
  await page.goto(`./${path}`);
  await expect(page).toHaveTitle(/ ao vivo — canal \d+ \| TV Livre$/); // continua assim depois que o app carrega
  const title = await page.title();
  const name = title.replace(/ ao vivo — canal \d+ \| TV Livre$/, '');
  const n = /canal (\d+)/.exec(title)![1]!;

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://jkfa.github.io/tv-livre/${path}`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', new RegExp(`^Assista ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ao vivo, grátis e sem cadastro: canal ${n} da grade do TV Livre\\.`));
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'pt_BR');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/tv-livre\/og\/[a-z]{2,3}\/[^/]+\.(png|jpg)$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld).toMatchObject({ '@type': 'TelevisionChannel', name, broadcastChannelId: n });

  // com JS: o app reconheceu o caminho e abriu o player neste canal
  await expect(page.getByTestId('player')).toBeVisible();
  await expect(page.locator('.dial-now .dial-name')).toHaveText(name);

  // a imagem de prévia existe
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  const img = await request.get(new URL(og!).pathname.replace(/^\/tv-livre\//, ''));
  expect(img.ok()).toBeTruthy();
  expect(img.headers()['content-type']).toMatch(/image\//);

  // navegar dentro do app continua pelo hash e o "Início" leva à tela inicial (não reabre o canal)
  await page.getByRole('link', { name: 'Início', exact: true }).first().click();
  await expect(page.getByTestId('home-ligar')).toBeVisible();
});

test.describe('sem JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('o conteúdo do canal já está na página: nome, número, país, "Assistir agora" e canais relacionados', async ({ page, request }) => {
    const { path } = await firstChannelPage(request);
    await page.goto(`./${path}`);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText('ao vivo');
    await expect(page.locator('.seo-num')).toHaveText(/^\d+$/);
    await expect(page.getByText(/País:/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Assistir agora' })).toHaveAttribute('href', /\/tv-livre\/#\/canal\/[A-Z]{2,3}\//);
    expect(await page.locator('.seo-page a[href^="/tv-livre/"]').count()).toBeGreaterThan(3);
  });
});

test('página de categoria e de país listam canais e linkam para as páginas de canal', async ({ page, request }) => {
  const xml = await (await request.get('sitemap.xml')).text();
  const cat = /tv-livre\/(categoria\/[a-z-]+\/)<\/loc>/.exec(xml)![1]!;
  const pais = /tv-livre\/(pais\/[a-z]{2}\/)<\/loc>/.exec(xml)![1]!;
  for (const p of [cat, pais]) {
    await page.goto(`./${p}`);
    await expect(page).toHaveTitle(/\| TV Livre$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://jkfa.github.io/tv-livre/${p}`);
  }
});

test.describe('service worker e as páginas estáticas', () => {
  test.use({ serviceWorkers: 'allow' });
  test('com o SW ativo a página continua sendo a do canal (não vira o index.html) e uma versão nova aparece na recarga', async ({ page, request, browserName }) => {
    test.skip(browserName !== 'chromium', 'SW validado no Chromium');
    test.skip(!!process.env.BASE_URL, 'edita o dist local; não roda contra o site publicado');
    const { path } = await firstChannelPage(request);
    const file = join(process.cwd(), 'dist', path, 'index.html');
    const original = readFileSync(file, 'utf8');
    try {
      await page.goto(`./${path}`);
      await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state);
      await page.reload(); // agora o SW controla a página
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await expect(page.locator('meta[name="tvlivre:canal"]')).toHaveCount(1); // o SW não trocou por index.html do app

      writeFileSync(file, original.replace(/(<meta name="description" content=")/, '$1VERSÃO NOVA · '));
      await page.reload();
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /^VERSÃO NOVA · /); // rede primeiro: não fica velha
    } finally {
      writeFileSync(file, original);
    }
  });
});
