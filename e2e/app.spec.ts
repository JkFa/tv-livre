import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { Channel, DataIndex } from '../shared/types.ts';

// Roda tanto contra o build local (vite preview) quanto contra o site publicado (BASE_URL).

async function brChannels(request: APIRequest): Promise<Channel[]> {
  const res = await request.get('data/countries/BR.json');
  expect(res.ok(), 'data/countries/BR.json deve existir').toBeTruthy();
  return (await res.json()) as Channel[];
}
type APIRequest = APIRequestContext;

const playableHls = (c: Channel) => c.kind === 'hls' && c.cors !== false && !c.needsHeaders;

async function search(page: Page, text: string) {
  await page.getByRole('searchbox', { name: 'Buscar canal pelo nome' }).fill(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('channel-row').first()).toBeVisible();
});

test('abre o site, carrega os dados e mostra a lista do Brasil', async ({ page, request }) => {
  await expect(page).toHaveTitle(/TV Livre/);
  await expect(page.getByRole('heading', { name: /Televisão aberta/ })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'País' })).toHaveValue('BR');

  const br = await brChannels(request);
  await expect(page.getByTestId('result-count')).toContainText(`${br.length.toLocaleString('pt-BR')} canais`);

  const index = (await (await request.get('data/index.json')).json()) as DataIndex;
  expect(index.meta.total).toBeGreaterThan(1000);
  expect(index.countries.find((c) => c.code === 'BR')).toBeTruthy();
});

test('busca um canal pelo nome (sem diferenciar acentos)', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find((c) => /^[\p{L}\p{N} ]{5,}$/u.test(c.name)) ?? br[0]!;
  await search(page, target.name.toUpperCase());
  const rows = page.getByTestId('channel-row');
  await expect(rows.first()).toBeVisible();
  await expect(page.getByTestId('channel-list')).toContainText(target.name);

  await search(page, 'zzzz-nenhum-canal-assim');
  await expect(page.getByText('Nenhum canal encontrado')).toBeVisible();
});

test('player: quando o stream falha, explica a causa provável e oferece alternativas', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find(playableHls);
  test.skip(!target, 'sem canal HLS reproduzível no Brasil nos dados atuais');

  // Simula servidor fora do ar/bloqueado para este canal específico.
  await page.route(target!.url, (route) => route.abort('failed'));
  await search(page, target!.name);
  await page.getByTestId('channel-row').filter({ hasText: target!.name }).first().locator('.row-main').click();

  await expect(page.getByRole('heading', { name: target!.name, level: 2 })).toBeVisible();
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 40_000 });
  await expect(alert.getByRole('heading', { level: 3 })).toContainText(/fora do ar|bloqueio|CORS|não foi possível|demorou|formato/i);
  await expect(alert.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await expect(alert.getByRole('button', { name: /Copiar link para o VLC/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Tela cheia/ })).toBeVisible();
});

test('canal HTTP é sinalizado e oferece copiar o link para o VLC', async ({ page, context, request }) => {
  const br = await brChannels(request);
  const target = br.find((c) => c.kind === 'http');
  test.skip(!target, 'sem canal HTTP no Brasil nos dados atuais');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);

  await search(page, target!.name);
  await page.getByTestId('channel-row').filter({ hasText: target!.name }).first().locator('.row-main').click();
  await expect(page.getByText('Canal em HTTP: o navegador bloqueia')).toBeVisible();
  await page.getByRole('button', { name: /Copiar link para o VLC/ }).click();
  await expect(page.getByRole('button', { name: 'Link copiado!' })).toBeVisible();
});

test('YouTube incorporável usa o embed oficial (nocookie)', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find((c) => c.kind === 'youtube' && c.youtube?.embeddable);
  test.skip(!target, 'sem YouTube incorporável no Brasil nos dados atuais');
  await page.route('**/youtube-nocookie.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>embed</p>' }));

  await search(page, target!.name);
  await page.getByTestId('channel-row').filter({ hasText: target!.name }).first().locator('.row-main').click();
  const frame = page.locator('iframe[title^="YouTube"]');
  await expect(frame).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
  await expect(page.getByRole('link', { name: /Abrir no YouTube/ })).toBeVisible();
});

test('favoritos e recentes persistem no localStorage', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find((c) => c.kind === 'http' || c.kind === 'other') ?? br[0]!;
  await search(page, target.name);
  const row = page.getByTestId('channel-row').filter({ hasText: target.name }).first();
  await row.getByRole('button', { name: new RegExp(`Favoritar ${target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
  await row.locator('.row-main').click();

  await page.reload();
  await page.getByRole('tab', { name: /Favoritos/ }).click();
  await expect(page.getByTestId('channel-list')).toContainText(target.name);
  await page.getByRole('tab', { name: 'Recentes' }).click();
  await expect(page.getByTestId('channel-list')).toContainText(target.name);
});

test('o site funciona mesmo com localStorage indisponível', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'pt-BR' });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('SecurityError: armazenamento bloqueado');
      },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByTestId('channel-row').first()).toBeVisible();
  await page.getByRole('button', { name: /^Favoritar / }).first().click();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('lista virtualizada: milhares de canais, poucas linhas no DOM', async ({ page }) => {
  await page.getByRole('combobox', { name: 'País' }).selectOption('ALL');
  await expect(page.getByTestId('result-count')).toContainText(/^\d{1,3}(\.\d{3})+ canais/, { timeout: 60_000 });
  const rendered = await page.getByTestId('channel-row').count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(80);
});

test('página Sobre e recarregar rotas não gera 404', async ({ page }) => {
  await page.getByRole('link', { name: 'Sobre' }).click();
  await expect(page.getByRole('heading', { name: 'Sobre o TV Livre' })).toBeVisible();
  await expect(page.getByText('não hospeda, retransmite, grava nem passa por proxy')).toBeVisible();
  await expect(page.getByText('Pedir a remoção de um canal')).toBeVisible();

  const res = await page.reload();
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Sobre o TV Livre' })).toBeVisible();

  // um caminho inexistente também devolve a aplicação (404.html é cópia do index.html)
  const missing = await page.request.get('rota-que-nao-existe/', { failOnStatusCode: false });
  expect([200, 404]).toContain(missing.status());
  expect(await missing.text()).toContain('<div id="root">');
});

test('canal por link direto abre o player após recarregar', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find((c) => c.kind === 'http') ?? br[0]!;
  await page.goto(`./#/canal/BR/${encodeURIComponent(target.id)}`);
  await expect(page.getByRole('heading', { name: target.name, level: 2 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: target.name, level: 2 })).toBeVisible();
});
