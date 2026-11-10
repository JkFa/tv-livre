import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { Channel } from '../shared/types.ts';
import { expect, test } from './fixtures.ts';
import { iniciarServico, WRANGLER_OK, type Servico } from './servico-presenca.ts';

// "Assistindo agora": o serviço de presença de verdade (wrangler dev local) + vários navegadores isolados (contextos separados
// = perfis separados), cada um tocando um canal de fixture HLS. Nada sai para a internet.

const HOST = 'https://fixtures.tvlivre.test';
const DIR = join(process.cwd(), 'tests', 'fixtures', 'hls');
const canal = (id: string, name: string): Channel => ({ id, name, country: 'BR', categories: ['news'], languages: ['por'], url: `${HOST}/${id}/master.m3u8`, kind: 'hls', status: 'online', sources: ['free-tv'] });
const SIMPLES = canal('simples', 'Fixture Simples');
const MULTI = canal('multi', 'Fixture Multi');
const CORS = { 'access-control-allow-origin': '*' };

test.skip(() => test.info().project.name !== 'chromium-desktop', 'cenário com vários navegadores: só no Chromium desktop');
test.skip(() => !WRANGLER_OK, 'instale workers/presenca (npm ci) para rodar o serviço local');

let servico: Servico;
const abertos: BrowserContext[] = [];
test.beforeAll(async () => {
  test.setTimeout(180_000);
  servico = await iniciarServico(8799);
});
test.afterAll(async () => {
  await servico?.parar();
});
test.afterEach(async () => {
  while (abertos.length) await abertos.pop()!.close();
});

/** Um "navegador" próprio (perfil isolado) com o serviço local ligado e os canais de fixture na grade. */
async function navegador(browser: Browser, opts: { servico?: string | null } = {}): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL!, locale: 'pt-BR', serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });
  const url = opts.servico === undefined ? servico.url : opts.servico;
  if (url) await ctx.addInitScript((u) => localStorage.setItem('tvlivre:presenca-teste', u), url);
  await ctx.route(/abacus\.jasoncameron\.dev|ipwho\.is/, (r) => r.abort());
  await ctx.route('**/data/countries/BR.json', async (r) => {
    const real = (await (await r.fetch()).json()) as Channel[];
    await r.fulfill({ json: [MULTI, SIMPLES, ...real] });
  });
  await ctx.route(`${HOST}/**`, (r) => {
    const [dir, ...rest] = new URL(r.request().url()).pathname.replace(/^\//, '').split('/');
    try {
      const body = readFileSync(join(DIR, dir === 'multi' ? 'multi' : 'simples', rest.join('/')));
      return r.fulfill({ status: 200, body, headers: { ...CORS, 'content-type': rest.join('/').endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' } });
    } catch {
      return r.fulfill({ status: 404, headers: CORS, body: 'nope' });
    }
  });
  abertos.push(ctx);
  return ctx.newPage();
}

const stage = (p: Page) => p.locator('.stage').first();
/** Abre o canal por link direto e toca (como o usuário). */
async function assistir(page: Page, c: Channel) {
  await page.goto(`./#/canal/BR/${c.id}`);
  await page.getByRole('button', { name: /^Tocar / }).click();
  await expect(stage(page)).toHaveAttribute('data-phase', 'playing', { timeout: 30_000 });
  // a fixture é um VOD curto; um canal de verdade ao vivo não termina. Em loop, ela continua "tocando" durante o teste todo.
  await page.evaluate(() => { for (const v of document.querySelectorAll('video')) v.loop = true; });
}
const total = (p: Page) => p.getByTestId('assistindo-total');
const doCanal = (p: Page) => p.getByTestId('assistindo-canal');
const online = async () => (await servico.resumo()).online;

test.describe.configure({ mode: 'serial' });

test('três pessoas no mesmo canal: os números batem em todas as telas, só aparece com 3+, e fechar uma página reduz', async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await navegador(browser);
  const b = await navegador(browser);
  const c = await navegador(browser);
  const d = await navegador(browser); // só navegando (não toca)
  await assistir(a, SIMPLES);
  await assistir(b, SIMPLES);
  await d.goto('./#/');
  await expect(d.getByRole('button', { name: /Ligar a TV|Voltar ao canal/ })).toBeVisible();
  await d.mouse.click(300, 300); // uma interação: a conexão abre sem esperar os 3 s
  await expect.poll(online, { timeout: 20_000 }).toBe(3);

  // 2 pessoas no canal: o número do canal NÃO é divulgado (privacidade: só com 3 ou mais)
  await expect(total(a)).toContainText('2 assistindo agora', { timeout: 20_000 });
  await expect(doCanal(a)).toHaveCount(0);

  await assistir(c, SIMPLES);
  // 3 tocando + 1 navegando: total assistindo = 3 (quem navega não conta), canal = 3, e é o mesmo número em todas as telas
  for (const p of [a, b, c, d]) await expect(total(p)).toContainText('3 assistindo agora', { timeout: 20_000 });
  for (const p of [a, b, c]) await expect(doCanal(p)).toHaveText('3 assistindo este canal');
  await expect.poll(async () => (await servico.resumo()).assistindo).toBe(3);

  // "Em alta agora" na tela inicial (de quem só navega): o canal com 3
  await expect(d.getByRole('heading', { name: 'Em alta agora' })).toBeVisible({ timeout: 20_000 });
  await expect(d.getByTestId('em-alta-contagem').first()).toContainText('3 assistindo');
  await expect(d.getByRole('button', { name: /Fixture Simples/ }).first()).toBeVisible();

  // fechar uma página reduz os números (e o canal volta a ficar abaixo de 3: some)
  const ctxC = c.context();
  await ctxC.close();
  abertos.splice(abertos.indexOf(ctxC), 1);
  await expect.poll(async () => (await servico.resumo()).assistindo, { timeout: 20_000 }).toBe(2); // o serviço soube
  for (const p of [a, b, d]) await expect(total(p)).toContainText('2 assistindo agora', { timeout: 25_000 });
  await expect(doCanal(a)).toHaveCount(0);
  await expect.poll(online, { timeout: 20_000 }).toBe(3);
});

test('duas abas do mesmo navegador usam UMA conexão', async ({ browser }) => {
  test.setTimeout(90_000);
  await expect.poll(online, { timeout: 30_000 }).toBe(0); // as páginas do teste anterior já fecharam
  const a = await navegador(browser);
  const b = await a.context().newPage();
  await a.goto('./#/');
  await b.goto('./#/canais');
  await a.mouse.click(300, 300);
  await b.mouse.click(300, 300);
  await expect.poll(online, { timeout: 20_000 }).toBe(1);
  await a.waitForTimeout(2500);
  expect(await online()).toBe(1);
  // as duas abas recebem os mesmos números (a seguidora recebe pela líder)
  await expect(a.getByTestId('visitas-chip')).toContainText('acessos', { timeout: 20_000 });
  await expect(b.getByTestId('visitas-chip')).toContainText('acessos', { timeout: 20_000 });
  await a.close(); // a líder sai: a outra aba assume e a conexão continua sendo uma só
  await expect.poll(online, { timeout: 25_000 }).toBe(1);
});

test('o acesso é registrado no serviço, uma vez por sessão, e o total parte do Abacus (migração)', async ({ browser }) => {
  const antes = await servico.resumo();
  const a = await navegador(browser);
  await a.goto('./#/');
  await expect.poll(async () => (await servico.resumo()).acessos, { timeout: 20_000 }).toBe(antes.acessos + 1);
  await a.reload();
  await a.waitForTimeout(1500);
  expect((await servico.resumo()).acessos).toBe(antes.acessos + 1); // recarregar na mesma sessão não conta de novo
  expect((await servico.resumo()).acessos).toBeGreaterThanOrEqual(1001); // 1000 do Abacus de mentira + esta visita
});

test('sem serviço configurado a tela fica como antes: nenhuma conexão e nenhum número de presença', async ({ browser }) => {
  const a = await navegador(browser, { servico: null });
  let sockets = 0;
  a.on('websocket', () => sockets++);
  await a.goto('./#/');
  await a.mouse.click(300, 300);
  await a.waitForTimeout(4000);
  expect(sockets).toBe(0);
  await expect(a.getByTestId('assistindo-total')).toHaveCount(0);
  await expect(a.getByRole('heading', { name: 'Em alta agora' })).toHaveCount(0);
});

test('serviço fora do ar: os números somem em silêncio e o vídeo continua tocando', async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await navegador(browser);
  await assistir(a, MULTI);
  await expect(total(a)).toContainText('assistindo agora', { timeout: 25_000 });
  await servico.parar(); // derruba o serviço
  await expect(total(a)).toHaveCount(0, { timeout: 60_000 }); // some depois de ~20 s sem resposta
  await expect(stage(a)).toHaveAttribute('data-phase', 'playing'); // o vídeo nunca parou
  await expect(a.getByTestId('visitas-chip')).not.toContainText('Erro');
});
