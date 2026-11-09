import type { APIRequestContext, Page } from '@playwright/test';
import type { Channel, EpgFile } from '../shared/types.ts';
import { brChannels, expect, playableHls, test, tuneByLink } from './fixtures.ts';

test.use({ timezoneId: 'America/Sao_Paulo' });

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
async function pickChannel(request: APIRequestContext): Promise<Channel> {
  const br = await brChannels(request);
  const c = br.find((x) => playableHls(x) && x.status !== 'offline' && br.filter((y) => norm(y.name).includes(norm(x.name))).length === 1);
  expect(c).toBeTruthy();
  return c!;
}
const number = async (page: Page) => (await page.locator('.dial-now .num').textContent())!.trim();

test('folha de compartilhar: WhatsApp, Telegram e Copiar link, com o texto certo e a rota #/canal', async ({ page, request }) => {
  const ch = await pickChannel(request);
  await page.route('**/data/paginas/*.json', (r) => r.fulfill({ status: 404, body: '' })); // sem página indexável para o canal
  await tuneByLink(page, ch);
  const n = await number(page);
  await page.getByTestId('share-btn').click();
  const dialog = page.getByRole('dialog', { name: 'Compartilhar canal' });
  await expect(dialog).toBeVisible();
  const link = new URL(`./#/canal/BR/${encodeURIComponent(ch.id)}`, page.url()).href;
  const text = `📺 Tô assistindo ${ch.name} (canal ${n}) ao vivo no TV Livre: ${link}`;
  await expect(dialog.getByTestId('share-text')).toHaveText(text);
  const wa = new URL((await dialog.getByTestId('share-whatsapp').getAttribute('href'))!);
  expect(wa.origin + wa.pathname).toBe('https://wa.me/');
  expect(wa.searchParams.get('text')).toBe(text);
  const tg = new URL((await dialog.getByTestId('share-telegram').getAttribute('href'))!);
  expect(tg.origin + tg.pathname).toBe('https://t.me/share/url');
  expect(tg.searchParams.get('url')).toBe(link);
  expect(link).not.toMatch(/[?&](utm_|fbclid|ref=)/);
  await dialog.getByTestId('share-copy').click();
  await expect(dialog.getByTestId('share-copy')).toContainText('Link copiado');
});

test('tecla S abre a folha; quando existe uma página indexável, o link é o dela', async ({ page, request }) => {
  const ch = await pickChannel(request);
  await page.route('**/data/paginas/BR.json', (r) => r.fulfill({ json: { [ch.id]: 'slug-de-teste' } }));
  const loaded = page.waitForResponse('**/data/paginas/BR.json');
  await tuneByLink(page, ch);
  await loaded;
  await page.locator('body').press('s');
  const dialog = page.getByRole('dialog', { name: 'Compartilhar canal' });
  await expect(dialog.getByTestId('share-text')).toContainText(`${new URL('./canal/br/slug-de-teste/', page.url()).href}`);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('com guia, o texto é "Agora em Nome: Programa — link"', async ({ page, request }) => {
  const ch = await pickChannel(request);
  const idx = await (await request.get('data/index.json')).json();
  idx.epg = ['BR'];
  const t0 = Date.parse('2026-11-09T22:00:00Z') / 1000;
  await page.route('**/data/index.json', (r) => r.fulfill({ json: idx }));
  await page.route('**/data/epg/BR.json', (r) =>
    r.fulfill({ json: { generatedAt: new Date((t0 - 3600) * 1000).toISOString(), channels: { [ch.id]: [[t0 - 600, t0 + 3000, 'Roda Viva']] } } satisfies EpgFile }),
  );
  await page.route('**/data/paginas/*.json', (r) => r.fulfill({ status: 404, body: '' }));
  await page.clock.install({ time: t0 * 1000 });
  await tuneByLink(page, ch);
  await expect(page.getByTestId('guide-now')).toContainText('Roda Viva');
  await page.getByTestId('share-btn').click();
  const link = new URL(`./#/canal/BR/${encodeURIComponent(ch.id)}`, page.url()).href;
  await expect(page.getByTestId('share-text')).toHaveText(`📺 Agora em ${ch.name}: Roda Viva — ${link}`);
});

test('com a Web Share API, usa o compartilhamento do sistema e não abre a folha', async ({ page, request }) => {
  const ch = await pickChannel(request);
  await page.addInitScript(() => {
    (navigator as unknown as { share: (d: unknown) => Promise<void> }).share = async (d) => {
      (window as unknown as { __shared: unknown }).__shared = d;
    };
  });
  await tuneByLink(page, ch);
  await page.getByTestId('share-btn').click();
  const shared = await page.evaluate(() => (window as unknown as { __shared: { title: string; text: string } }).__shared);
  expect(shared.title).toBe(ch.name);
  expect(shared.text).toContain(`📺 Tô assistindo ${ch.name}`);
  expect(shared.text).toContain('/tv-livre/');
  await expect(page.getByRole('dialog', { name: 'Compartilhar canal' })).toBeHidden();
});

test('Modo TV: item do menu mostra um QR code do link, sem botões de rede social', async ({ page, request }) => {
  const ch = await pickChannel(request);
  await page.route('**/data/paginas/*.json', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('./?tv=1');
  await tuneByLink(page, ch);
  await page.keyboard.press('ArrowRight'); // abre a grade
  await page.getByTestId('tv-share').click();
  const dialog = page.getByRole('dialog', { name: 'Abrir no celular' });
  await expect(dialog.getByTestId('share-qr')).toBeVisible();
  await expect(dialog.getByTestId('share-link')).toContainText(`#/canal/BR/${encodeURIComponent(ch.id)}`);
  await expect(dialog.getByTestId('share-whatsapp')).toHaveCount(0);
  expect(await dialog.getByTestId('share-qr').locator('path').getAttribute('d')).toMatch(/^M\d+,\d+h1v1h-1z/);
});
