import type { Page } from '@playwright/test';
import type { Channel, EpgFile } from '../shared/types.ts';
import { brChannels, expect, playableHls, search, test, tuneByLink } from './fixtures.ts';

// Guia de programação: arquivos simulados (epg/BR.json) e relógio simulado. Nada depende da grade real do dia.

test.use({ timezoneId: 'America/Sao_Paulo' });

const T0 = Date.parse('2026-11-09T22:00:00Z'); // 19h00 em Brasília
const sec = T0 / 1000;
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Um canal do Brasil que toca no navegador e cujo nome só bate com ele mesmo na busca. */
async function uniqueChannel(request: Parameters<typeof brChannels>[0]): Promise<Channel> {
  const br = await brChannels(request);
  const c = br.find((x) => playableHls(x) && x.status !== 'offline' && br.filter((y) => norm(y.name).includes(norm(x.name))).length === 1);
  expect(c, 'precisa de um canal do BR com nome único').toBeTruthy();
  return c!;
}

async function mockGuide(page: Page, request: Parameters<typeof brChannels>[0], entries: EpgFile['channels'][string] | null, opts: { listed?: boolean; ch: Channel }) {
  const idx = await (await request.get('data/index.json')).json();
  if (opts.listed !== false) idx.epg = ['BR'];
  const calls: string[] = [];
  await page.route('**/data/index.json', (r) => r.fulfill({ json: idx }));
  await page.route('**/data/epg/*.json', (r) => {
    calls.push(r.request().url());
    return entries ? r.fulfill({ json: { generatedAt: new Date(T0 - 3600_000).toISOString(), channels: { [opts.ch.id]: entries } } satisfies EpgFile }) : r.fulfill({ status: 404, body: 'não existe' });
  });
  await page.clock.install({ time: T0 });
  return calls;
}

const jornal: EpgFile['channels'][string] = [
  [sec - 1800, sec + 1800, 'Jornal da Noite', 'News'],
  [sec + 1800, sec + 5400, 'Cine Teste'],
];

test('grade e player mostram o programa certo e a barra avança', async ({ page, request }) => {
  const ch = await uniqueChannel(request);
  await mockGuide(page, request, jornal, { ch });
  await page.goto('./#/canais');
  await search(page, ch.name);
  const row = page.getByTestId('channel-row').filter({ hasText: ch.name }).first();
  await expect(row.getByTestId('row-now')).toContainText('Jornal da Noite');
  await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

  await row.locator('.row-main').click();
  const strip = page.getByTestId('guide-strip');
  await expect(strip.getByTestId('guide-now')).toContainText('Agora: Jornal da Noite');
  await expect(strip.getByTestId('guide-now')).toContainText('18h30–19h30');
  await expect(strip.getByTestId('guide-next')).toContainText('A seguir: Cine Teste');
  await expect(strip.getByTestId('guide-next')).toContainText('19h30');
  await expect(strip.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

  await page.clock.fastForward(10 * 60_000); // 19h10: 40 de 60 min
  await expect(strip.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');

  await page.clock.fastForward(21 * 60_000); // 19h31: o programa trocou sozinho, sem recarregar
  await expect(strip.getByTestId('guide-now')).toContainText('Agora: Cine Teste');
  await expect(strip.getByTestId('guide-next')).toHaveCount(0);
});

test('"Começando agora" filtra a grade pelos programas que começam em até 15 min', async ({ page, request }) => {
  const ch = await uniqueChannel(request);
  await mockGuide(page, request, [[sec - 3000, sec + 300, 'Já vai acabar'], [sec + 300, sec + 3900, 'Novela das nove']], { ch });
  await page.goto('./#/canais');
  await expect(page.getByTestId('channel-row').first()).toBeVisible();
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await page.getByTestId('filter-starting').check();
  await page.getByRole('button', { name: /^Ver / }).click();
  await expect(page.getByTestId('channel-row')).toHaveCount(1);
  await expect(page.getByTestId('channel-row').first()).toContainText(ch.name);
  await expect(page.getByTestId('channel-row').first()).toContainText('Já vai acabar');
});

test('tela inicial tem o bloco "Começando agora" quando há guia', async ({ page, request }) => {
  const ch = await uniqueChannel(request);
  await mockGuide(page, request, [[sec - 60, sec + 3000, 'Programa que acabou de começar']], { ch });
  await page.goto('./');
  const sec2 = page.getByRole('region', { name: /^Começando agora/ });
  await expect(sec2).toContainText(ch.name);
  await expect(sec2).toContainText('Programa que acabou de começar');
});

test('sem o arquivo do guia, nada quebra e nada aparece', async ({ page, request }) => {
  const ch = await uniqueChannel(request);
  await mockGuide(page, request, null, { ch });
  await page.goto('./#/canais');
  await search(page, ch.name);
  await expect(page.getByTestId('channel-row').first()).toBeVisible();
  await expect(page.getByTestId('row-now')).toHaveCount(0);
  await page.getByTestId('channel-row').first().locator('.row-main').click();
  await expect(page.locator('.player')).toBeVisible();
  await expect(page.getByTestId('guide-strip')).toHaveCount(0);
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await expect(page.getByTestId('filter-starting')).toBeVisible(); // o índice diz que há guia, mas ninguém começa
});

test('sem guia no índice, o site nem pede o arquivo e o filtro não aparece', async ({ page, request }) => {
  const ch = await uniqueChannel(request);
  const calls = await mockGuide(page, request, jornal, { ch, listed: false });
  await page.goto('./#/canais');
  await expect(page.getByTestId('channel-row').first()).toBeVisible();
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('filter-starting')).toHaveCount(0);
  expect(calls).toHaveLength(0);
});

test('Modo TV: a faixa aparece ao sintonizar e de novo com a tecla Info', async ({ page, request }) => {
  const ch = await uniqueChannel(request);
  await mockGuide(page, request, jornal, { ch });
  await page.goto('./?tv=1');
  await tuneByLink(page, ch);
  await expect(page.getByTestId('guide-tv')).toContainText('Jornal da Noite');
  await expect(page.getByTestId('guide-strip')).toHaveCount(0); // na TV não existe a faixa de baixo do player
  await page.clock.fastForward(7000);
  // o Playwright não conhece a tecla Info do controle remoto (Tizen/webOS: keyCode 457): dispara o evento direto
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Info', keyCode: 457, bubbles: true, cancelable: true })));
  await expect(page.getByTestId('guide-tv')).toBeVisible();
});
