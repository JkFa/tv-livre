import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { Channel } from '../shared/types.ts';
import { expect, test, tuneByLink } from './fixtures.ts';

// Volume (controle deslizante, mudo, teclado, persistência) e mini-player persistente, com vídeo de fixture servido localmente.

const HOST = 'https://fixtures.tvlivre.test';
const DIR = join(process.cwd(), 'tests', 'fixtures', 'hls');
const canal = (id: string, name: string): Channel => ({
  id, name, country: 'BR', categories: ['news'], languages: ['por'], url: `${HOST}/${id}/master.m3u8`, kind: 'hls', status: 'online', sources: ['free-tv'],
});
const MULTI = canal('multi', 'Fixture Multi');
const SIMPLES = canal('simples', 'Fixture Simples');
const CORS = { 'access-control-allow-origin': '*' };

/** Injeta os canais de fixture na grade do Brasil e serve as listas/trechos; devolve a lista de arquivos pedidos. */
async function preparar(page: Page): Promise<string[]> {
  const pedidos: string[] = [];
  await page.route('**/data/countries/BR.json', async (r) => {
    const real = (await (await r.fetch()).json()) as Channel[];
    await r.fulfill({ json: [MULTI, SIMPLES, ...real] });
  });
  await page.route(`${HOST}/**`, (r) => {
    const path = new URL(r.request().url()).pathname.replace(/^\//, '');
    pedidos.push(path);
    const [dir, ...rest] = path.split('/');
    try {
      const body = readFileSync(join(DIR, dir === 'multi' ? 'multi' : 'simples', rest.join('/')));
      return r.fulfill({ status: 200, body, headers: { ...CORS, 'content-type': path.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' } });
    } catch {
      return r.fulfill({ status: 404, headers: CORS, body: 'nope' });
    }
  });
  return pedidos;
}

const stage = (page: Page) => page.locator('.stage');
const video = (page: Page) => page.evaluate(() => {
  const v = document.querySelector('video') as (HTMLVideoElement & { __marca?: number }) | null;
  return v ? { volume: Math.round(v.volume * 100), muted: v.muted, paused: v.paused, t: v.currentTime, marca: v.__marca ?? null } : null;
});

/** Sintoniza, toca e marca o elemento <video>: se a marca sobreviver, o elemento não foi recriado. */
async function tocar(page: Page, c: Channel = SIMPLES) {
  await tuneByLink(page, c);
  await expect(stage(page)).toHaveAttribute('data-phase', 'playing');
  await page.evaluate(() => {
    const v = document.querySelector('video') as HTMLVideoElement & { __marca?: number };
    v.loop = true; // a fixture é um vídeo curto que termina
    v.__marca = 7;
  });
}

test('volume: controle de 0 a 100 persiste entre sessões; o ícone e a tecla M silenciam e devolvem o volume de antes', async ({ page }) => {
  await preparar(page);
  await tocar(page);
  const slider = page.getByTestId('volume');
  await expect(slider).toBeVisible(); // sempre visível com os controles: não depende de hover
  await expect(slider).toHaveValue('100');

  await slider.fill('35');
  await expect.poll(async () => (await video(page))?.volume).toBe(35);
  expect(await page.evaluate(() => localStorage.getItem('tvlivre:volume'))).toBe('35');

  // ícone: silencia (o controle vai a 0) e, ao voltar, o volume é o de antes
  await page.getByRole('button', { name: 'Silenciar' }).click();
  await expect(page.getByRole('button', { name: 'Ativar o som' })).toHaveAttribute('aria-pressed', 'true');
  await expect(slider).toHaveValue('0');
  expect((await video(page))?.muted).toBe(true);
  await page.getByRole('button', { name: 'Ativar o som' }).click();
  await expect(slider).toHaveValue('35');
  expect(await video(page)).toMatchObject({ muted: false, volume: 35 });

  // arrastar até 0 é mudo; tirar do mudo devolve os 35
  await slider.fill('0');
  await expect(page.getByRole('button', { name: 'Ativar o som' })).toBeVisible();
  await page.getByRole('button', { name: 'Ativar o som' }).click();
  await expect(slider).toHaveValue('35');

  // recarregar: o volume salvo volta
  await page.reload();
  await page.getByRole('button', { name: /^Tocar / }).click();
  await expect(stage(page)).toHaveAttribute('data-phase', 'playing');
  await expect(page.getByTestId('volume')).toHaveValue('35');
  expect((await video(page))?.volume).toBe(35);
});

test('volume pelo teclado: setas no controle focado mudam o volume sem trocar de canal; M continua valendo', async ({ page, isMobile }) => {
  test.skip(isMobile, 'teclado físico');
  await preparar(page);
  await tocar(page);
  const url = page.url();
  const slider = page.getByTestId('volume');
  // chega-se ao controle com Tab, depois do botão de mudo
  await page.getByRole('button', { name: 'Silenciar' }).focus();
  await page.keyboard.press('Tab');
  await expect(slider).toBeFocused();
  expect(await slider.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none'); // foco visível
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveValue('90');
  await page.keyboard.press('ArrowUp');
  await expect(slider).toHaveValue('95');
  expect(page.url(), 'as setas no volume não zapeiam').toBe(url);
  await page.keyboard.press('m');
  await expect(slider).toHaveValue('0');
  await page.keyboard.press('m');
  await expect(slider).toHaveValue('95');
  // fora do controle de volume as setas seguem trocando de canal
  await slider.blur();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.url()).not.toBe(url);
});

test('mini-player: sair do canal não reinicia o vídeo, nunca há dois players, e dá para pausar, expandir e fechar', async ({ page, browserName }) => {
  const pedidos = await preparar(page);
  await tocar(page);
  await expect(page.getByTestId('mini-player')).toHaveCount(0);
  const listas = () => pedidos.filter((p) => p.endsWith('master.m3u8')).length;
  const antes = listas();

  // início: o mesmo <video> segue tocando numa janela fixa
  await page.goto('./#/');
  const mini = page.getByTestId('mini-player');
  await expect(mini).toBeVisible();
  await expect(mini).toContainText(SIMPLES.name);
  await expect(page.locator('video')).toHaveCount(1);
  await expect(page.getByTestId('player')).toHaveCount(1);
  expect((await video(page))?.marca, 'o elemento de vídeo é o mesmo').toBe(7);
  expect((await video(page))?.paused, 'continua tocando, não pausou').toBe(false);
  // o tempo avançar só é conferido fora do WebKit: lá o vídeo de fixture às vezes trava no começo (≈ 1 em 40, igual sem o
  // mini-player, medido no código da main), o que não tem relação com a troca de tela
  if (browserName !== 'webkit') {
    const t0 = (await video(page))!.t;
    await expect.poll(async () => (await video(page))!.t).toBeGreaterThan(t0);
  }
  await expect(page.getByTestId('home-ligar')).toBeVisible(); // a tela inicial está lá, atrás do mini-player

  // outra tela: continua o mesmo
  await page.goto('./#/sobre');
  await expect(mini).toBeVisible();
  expect((await video(page))?.marca).toBe(7);
  expect(listas(), 'a transmissão não foi pedida de novo').toBe(antes);

  // controles do mini-player
  await mini.getByRole('button', { name: 'Pausar' }).click();
  await expect.poll(async () => (await video(page))?.paused).toBe(true);
  await mini.getByRole('button', { name: 'Tocar' }).click();
  await expect.poll(async () => (await video(page))?.paused).toBe(false);
  await mini.getByRole('button', { name: 'Silenciar' }).click();
  expect((await video(page))?.muted).toBe(true);
  await mini.getByRole('button', { name: 'Ativar o som' }).click();

  // expandir: volta para o canal, com o mesmo vídeo
  await page.getByTestId('mini-expandir').click();
  await expect(page).toHaveURL(/#\/canal\/BR\/simples$/);
  await expect(mini).toHaveCount(0);
  await expect(page.locator('.dial')).toBeVisible();
  expect((await video(page))?.marca).toBe(7);
  expect(listas()).toBe(antes);

  // a grade (#/canais) mantém o player no lugar, sem mini
  await page.goto('./#/canais');
  await expect(page.getByTestId('channel-row').first()).toBeVisible();
  await expect(mini).toHaveCount(0);
  expect((await video(page))?.marca).toBe(7);

  // fechar: para o canal e some
  await page.goto('./#/');
  await expect(mini).toBeVisible();
  await page.getByTestId('mini-fechar').click();
  await expect(mini).toHaveCount(0);
  await expect(page.locator('video')).toHaveCount(0);
});

test('mini-player: só aparece se o vídeo estava tocando; pausado, sair do canal para como antes', async ({ page }) => {
  await preparar(page);
  await tocar(page);
  await stage(page).hover();
  await page.getByRole('button', { name: 'Pausar' }).click();
  await expect.poll(async () => (await video(page))?.paused).toBe(true);
  await page.goto('./#/');
  await expect(page.getByTestId('home-ligar')).toBeVisible();
  await expect(page.getByTestId('mini-player')).toHaveCount(0);
  await expect(page.locator('video')).toHaveCount(0);
});

test('mini-player em tela de 360 px: não cobre a navegação, cabe na largura e os botões têm 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await preparar(page);
  await tocar(page);
  await page.goto('./#/');
  const mini = page.getByTestId('mini-player');
  await expect(mini).toBeVisible();
  const caixa = (await page.locator('.workspace[data-mini]').boundingBox())!;
  const nav = (await page.locator('.bottom-nav').boundingBox())!;
  expect(caixa.y + caixa.height, 'o mini-player termina acima da navegação inferior').toBeLessThanOrEqual(nav.y);
  expect(caixa.x).toBeGreaterThanOrEqual(0);
  expect(caixa.x + caixa.width).toBeLessThanOrEqual(360);
  for (const id of ['mini-expandir', 'mini-fechar']) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sem rolagem horizontal').toBe(true);
  // a navegação continua utilizável com o mini-player aberto
  await page.locator('.bottom-nav').getByRole('button', { name: /Canais/ }).click();
  await expect(page.getByTestId('channel-row').first()).toBeVisible();
});
