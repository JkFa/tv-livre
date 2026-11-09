import { expect, test } from './fixtures.ts';

// Tema: o padrão é o claro (mesmo com o sistema no escuro) e o ícone de alternar aparece também no celular.

const CLARO = 'rgb(239, 230, 210)'; // --bg claro (#efe6d2)
const ESCURO = 'rgb(21, 17, 14)'; // --bg escuro (#15110e)
const fundo = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const tema = (page: import('@playwright/test').Page) => page.locator('html').getAttribute('data-theme');
const corDaBarra = (page: import('@playwright/test').Page) => page.locator('meta[name="theme-color"]').getAttribute('content');

test.describe('com o sistema no escuro', () => {
  test.use({ colorScheme: 'dark' });

  test('sem escolha salva a página abre no tema CLARO', async ({ page }) => {
    await page.goto('./#/canais');
    expect(await tema(page)).toBe('light');
    expect(await fundo(page)).toBe(CLARO);
    expect(await corDaBarra(page)).toBe('#efe6d2');
  });

  test('quem escolheu "escuro" continua no escuro', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tvlivre:tema', 'escuro'));
    await page.goto('./#/canais');
    expect(await tema(page)).toBe('dark');
    expect(await fundo(page)).toBe(ESCURO);
  });

  test('quem escolheu "automático" segue o sistema (aqui, escuro)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tvlivre:tema', 'auto'));
    await page.goto('./#/canais');
    expect(await tema(page)).toBe('auto');
    expect(await fundo(page)).toBe(ESCURO);
  });
});

test('"automático" no sistema claro fica claro', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tvlivre:tema', 'auto'));
  await page.goto('./#/canais');
  expect(await fundo(page)).toBe(CLARO);
});

test('o ícone de claro/escuro está sempre visível (celular e computador) e alterna e lembra a escolha', async ({ page }) => {
  await page.goto('./#/canais');
  const botao = page.getByTestId('alternar-tema');
  await expect(botao).toBeVisible();
  const caixa = (await botao.boundingBox())!;
  expect(caixa.width).toBeGreaterThanOrEqual(44);
  expect(caixa.height).toBeGreaterThanOrEqual(44);
  const largura = page.viewportSize()!.width;
  expect(caixa.x).toBeGreaterThanOrEqual(0);
  expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura); // cabe na barra, sem estourar a tela
  await expect(botao).toHaveAccessibleName('Mudar para o tema escuro');

  await botao.click();
  expect(await tema(page)).toBe('dark');
  expect(await fundo(page)).toBe(ESCURO);
  expect(await corDaBarra(page)).toBe('#15110e');
  await expect(botao).toHaveAccessibleName('Mudar para o tema claro');
  expect(await page.evaluate(() => localStorage.getItem('tvlivre:tema'))).toBe('escuro');

  await page.reload(); // lembra a escolha, sem piscar no claro
  expect(await tema(page)).toBe('dark');
  await page.getByTestId('alternar-tema').click();
  expect(await tema(page)).toBe('light');
  expect(await page.evaluate(() => localStorage.getItem('tvlivre:tema'))).toBe('claro');
});

test('a barra do topo não estoura no celular estreito (360 px) com o ícone de tema', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'só faz sentido no celular');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('./#/canais');
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra).toBeLessThanOrEqual(0);
  await expect(page.getByTestId('alternar-tema')).toBeVisible();
  await expect(page.locator('.brand')).toBeVisible();
});
