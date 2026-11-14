import type { Page } from '@playwright/test';
import type { Channel } from '../shared/types.ts';
import { deadStream, expect, search, test } from './fixtures.ts';

// Saúde dos canais: selos (no ar / instável / fora do ar), "não toca no navegador", qualidade, filtro "ocultar fora do ar"
// e o sinal local (canal que não abriu aqui desce na lista na próxima sessão). Canais de teste injetados na grade do Brasil.

const HOST = 'https://saude.tvlivre.test';
const canal = (id: string, name: string, p: Partial<Channel> = {}): Channel => ({
  id, name, country: 'BR', categories: ['news'], languages: ['por'], url: `${HOST}/${id}.m3u8`, kind: 'hls', status: 'online', sources: ['iptv-org'], ...p,
});
const OK = canal('zz-ok', 'Zeta Saude Ok', { resolution: '1080p', checked: 29_000_000 });
const INSTAVEL = canal('zz-instavel', 'Zeta Saude Instavel', { status: 'desconhecido', fails: 2 });
const FORA = canal('zz-fora', 'Zeta Saude Fora', { status: 'offline', fails: 5 });
const HTTP = canal('zz-http', 'Zeta Saude Http', { kind: 'http', url: 'http://saude.tvlivre.test/zz-http.m3u8' });
const HTTPS_OK = canal('zz-httpsok', 'Zeta Saude Upgrade', { kind: 'http', url: 'http://saude.tvlivre.test/zz-httpsok.m3u8', httpsOk: true });
const QUEBRA = canal('zz-quebra', 'Zeta Saude Quebra');
const TODOS = [FORA, INSTAVEL, HTTP, OK, HTTPS_OK, QUEBRA];

async function injetar(page: Page) {
  await page.route('**/data/countries/BR.json', async (r) => {
    const real = (await (await r.fetch()).json()) as Channel[];
    await r.fulfill({ json: [...TODOS, ...real] });
  });
  await page.route(`${HOST}/**`, deadStream);
}
const linha = (page: Page, nome: string) => page.getByTestId('channel-row').filter({ hasText: nome });
/** Ordem dos canais de teste na grade, lida só depois de a busca mostrar todos (allTextContents não espera nada). */
async function ordem(page: Page): Promise<string[]> {
  await expect(page.getByTestId('channel-row')).toHaveCount(TODOS.length);
  return page.getByTestId('channel-row').locator('.row-name').allTextContents();
}

test('selos: no ar, instável e fora do ar por forma e texto; qualidade; "não toca no navegador" para HTTP', async ({ page }) => {
  await injetar(page);
  await page.goto('./#/canais');
  await search(page, 'Zeta Saude');
  await expect(page.getByTestId('channel-row')).toHaveCount(6);
  await expect(linha(page, OK.name).locator('[data-saude]')).toHaveAttribute('data-saude', 'ok');
  await expect(linha(page, OK.name).getByTestId('selo-qualidade')).toHaveText('1080p');
  await expect(linha(page, INSTAVEL.name).locator('[data-saude]')).toHaveText('Instável');
  await expect(linha(page, FORA.name).locator('[data-saude]')).toHaveText('Fora do ar');
  // HTTP sem versão HTTPS: marcado, mesmo estando "no ar"; com a versão HTTPS confirmada no teste, não.
  // Só numa página HTTPS (o site publicado): o `vite preview` local é HTTP, onde não existe conteúdo misto.
  if ((await page.evaluate(() => location.protocol)) === 'https:') await expect(linha(page, HTTP.name).getByTestId('selo-nao-toca')).toBeVisible();
  else await expect(linha(page, HTTP.name).getByTestId('selo-nao-toca')).toHaveCount(0);
  await expect(linha(page, HTTPS_OK.name).getByTestId('selo-nao-toca')).toHaveCount(0);
  // ordem pela saúde: os fora do ar ficam no fim, mas continuam na lista
  const nomes = await ordem(page);
  expect(nomes.at(-1)).toBe(FORA.name);
  expect(nomes.indexOf(INSTAVEL.name)).toBeGreaterThan(nomes.indexOf(OK.name));
});

test('"Ocultar canais fora do ar" começa desligado, esconde quando ligado e a escolha fica salva', async ({ page }) => {
  await injetar(page);
  await page.goto('./#/canais');
  await search(page, 'Zeta Saude');
  await expect(linha(page, FORA.name)).toBeVisible();
  await page.getByRole('button', { name: /^Filtros/ }).click();
  const folha = page.getByRole('dialog', { name: 'País e filtros' });
  const opcao = folha.getByTestId('filter-ocultar-fora');
  await expect(opcao).not.toBeChecked();
  await opcao.check();
  await page.keyboard.press('Escape');
  await expect(linha(page, FORA.name)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remover filtro Sem os fora do ar' })).toBeVisible();
  await page.reload();
  await search(page, 'Zeta Saude');
  await expect(page.getByTestId('channel-row')).toHaveCount(5);
  await page.getByRole('button', { name: 'Remover filtro Sem os fora do ar' }).click();
  await expect(linha(page, FORA.name)).toBeVisible();
});

test('filtro de status mostra só os instáveis', async ({ page }) => {
  await injetar(page);
  await page.goto('./#/canais');
  await page.getByRole('button', { name: /^Filtros/ }).click();
  const folha = page.getByRole('dialog', { name: 'País e filtros' });
  await folha.getByRole('button', { name: 'Instável', exact: true }).click();
  await page.keyboard.press('Escape');
  await search(page, 'Zeta Saude');
  await expect(page.getByTestId('channel-row')).toHaveCount(1);
  await expect(linha(page, INSTAVEL.name)).toBeVisible();
});

test('canal que não abriu neste navegador: selo na hora, desce na lista na próxima sessão e sai do registro se tocar', async ({ page }) => {
  await injetar(page);
  await page.goto('./#/canais');
  await search(page, 'Zeta Saude');
  const antes = await ordem(page);
  expect(antes.indexOf(QUEBRA.name)).toBeLessThan(antes.indexOf(INSTAVEL.name));
  await linha(page, QUEBRA.name).locator('.row-main').click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 40_000 }); // o servidor responde 404
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tvlivre:falhas') ?? '{}')))).toEqual(['BR/zz-quebra']);
  // o selo aparece na hora no player e na grade (no celular a grade fica abaixo do painel de erro: volta para a lista)
  await expect(page.getByTestId('player').getByTestId('selo-falhou-aqui')).toHaveCount(1);
  await page.goto('./#/canais');
  await search(page, QUEBRA.name);
  await expect(linha(page, QUEBRA.name).getByTestId('selo-falhou-aqui')).toBeVisible();
  await search(page, 'Zeta Saude');
  // a ordem desta sessão não muda sob o dedo do usuário…
  await expect.poll(() => ordem(page)).toEqual(antes);
  // …na próxima, ele fica abaixo dos instáveis e acima dos fora do ar
  await page.goto('./#/canais');
  await page.reload();
  await search(page, 'Zeta Saude');
  const depois = await ordem(page);
  expect(depois.indexOf(QUEBRA.name)).toBeGreaterThan(depois.indexOf(INSTAVEL.name));
  expect(depois.indexOf(QUEBRA.name)).toBeLessThan(depois.indexOf(FORA.name));
  expect(depois).toHaveLength(antes.length); // nunca some da lista
});

test('falha local vence em 7 dias e é ignorada depois disso', async ({ page }) => {
  await page.addInitScript(() => {
    const velho = Date.now() - 8 * 24 * 3600 * 1000;
    localStorage.setItem('tvlivre:falhas', JSON.stringify({ 'BR/zz-quebra': velho }));
  });
  await injetar(page);
  await page.goto('./#/canais');
  await search(page, 'Zeta Saude');
  await expect(linha(page, QUEBRA.name)).toBeVisible();
  await expect(linha(page, QUEBRA.name).getByTestId('selo-falhou-aqui')).toHaveCount(0);
});

test('sem os dados novos (arquivo antigo) a grade funciona como antes', async ({ page }) => {
  await page.route('**/data/countries/BR.json', async (r) => {
    const real = (await (await r.fetch()).json()) as Channel[];
    const campos = ['fails', 'checked', 'latency', 'resolution', 'httpsOk'];
    await r.fulfill({ json: real.map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !campos.includes(k)))) });
  });
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto('./#/canais');
  await expect(page.getByTestId('channel-row').first()).toBeVisible();
  await expect(page.locator('[data-saude="instavel"]')).toHaveCount(0);
  expect(erros).toEqual([]);
});
