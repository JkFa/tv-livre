import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { Channel, DataIndex } from '../shared/types.ts';
import { deadStream, expect, test, tuneByLink } from './fixtures.ts';

// Guia de TV (país por região, canais por assunto, bandeira dos dados de origem) e Zapear com a regra única de sorteio:
// só canais no ar que tocam no navegador. A grade do Brasil é TROCADA por uma lista controlada: 12 canais bons (vídeo de
// fixture servido localmente) e várias armadilhas (fora do ar, HTTP, cabeçalhos, formato) que nunca podem sair. ("Sem CORS" não
// entra: onde o navegador toca HLS sozinho, ele toca de verdade.)

const BOM = 'https://zap.tvlivre.test';
const RUIM = 'https://armadilha.tvlivre.test';
const DIR = join(process.cwd(), 'tests', 'fixtures', 'hls', 'simples');
const CORS = { 'access-control-allow-origin': '*' };
const canal = (id: string, p: Partial<Channel> = {}): Channel => ({
  id, name: `Zap ${id}`, country: 'BR', categories: ['news'], languages: ['por'], url: `${BOM}/${id}/master.m3u8`,
  kind: 'hls', status: 'online', sources: ['iptv-org'], ...p,
});
const BONS = Array.from({ length: 12 }, (_, i) => canal(`bom${String(i).padStart(2, '0')}`, { categories: [i % 2 ? 'news' : 'sports'] }));
const ARMADILHAS = [
  canal('fora', { status: 'offline', fails: 4, url: `${RUIM}/fora.m3u8` }),
  canal('cabecalho', { needsHeaders: true, url: `${RUIM}/cabecalho.m3u8` }),
  canal('formato', { kind: 'other', url: `${RUIM}/formato.mpd` }),
];

/** Link HTTP só é armadilha numa página HTTPS (o site publicado); no `vite preview` local (HTTP) ele toca de verdade. */
const HTTP = canal('http', { kind: 'http', url: 'http://armadilha.tvlivre.test/http.m3u8' });

async function preparar(page: Page, baseURL?: string) {
  const armadilhas = baseURL?.startsWith('https:') ? [...ARMADILHAS, HTTP] : ARMADILHAS;
  await page.route('**/data/countries/BR.json', (r) => r.fulfill({ json: [...armadilhas, ...BONS] }));
  await page.route(`${BOM}/**`, (r) => {
    const file = new URL(r.request().url()).pathname.split('/').slice(2).join('/');
    try {
      const body = readFileSync(join(DIR, file));
      return r.fulfill({ status: 200, body, headers: { ...CORS, 'content-type': file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' } });
    } catch {
      return r.fulfill({ status: 404, headers: CORS, body: 'nope' });
    }
  });
  await page.route(`${RUIM}/**`, deadStream);
  await page.route('http://armadilha.tvlivre.test/**', deadStream);
}

const idDaUrl = (url: string) => decodeURIComponent(url.split('#/canal/BR/')[1] ?? '');

test('10 zaps → 10 canais diferentes que abrem (nunca fora do ar nem que o navegador não toca)', async ({ page, baseURL }) => {
  test.slow();
  await preparar(page, baseURL);
  await page.goto('./#/guia');
  await expect(page.getByTestId('guia-card')).not.toHaveCount(0);
  const vistos: string[] = [];
  for (let i = 0; i < 10; i++) {
    const antes = page.url();
    await (i === 0 ? page.getByTestId('guia-zapear') : page.getByTestId('player-zapear')).click();
    await expect.poll(() => page.url()).not.toBe(antes);
    const id = idDaUrl(page.url());
    expect(BONS.map((c) => c.id), `zap ${i + 1} sorteou ${id}`).toContain(id);
    await expect(page.locator('.stage')).toHaveAttribute('data-phase', 'playing');
    vistos.push(id);
  }
  expect(new Set(vistos).size).toBe(10); // memória dos últimos sorteios: não repete enquanto houver alternativa
});

test('Guia de TV: assuntos, bandeira da fonte, regiões com pertencimento múltiplo e troca de país', async ({ page, request }) => {
  await preparar(page);
  const index = (await (await request.get('./data/index.json')).json()) as DataIndex;
  const br = index.countries.find((c) => c.code === 'BR')!;
  const ru = index.countries.find((c) => c.code === 'RU');

  await page.goto('./');
  // abertura: em um olhar, vários países (bandeiras vindas do index.json)
  const faixa = page.getByTestId('home-bandeiras');
  await expect(faixa.locator('button')).not.toHaveCount(0);
  await page.getByTestId('home-guia').click();
  await expect(page).toHaveURL(/#\/guia$/);

  await expect(page.locator('#guia-h1')).toContainText('Brasil');
  if (br.flag) await expect(page.locator('#guia-h1')).toContainText(br.flag);
  await expect(page.locator('[data-testid="guia-secao"][data-assunto="sports"]')).toBeVisible();
  await expect(page.locator('[data-testid="guia-secao"][data-assunto="news"] [data-testid="guia-card"]').first()).toBeVisible();
  // a armadilha fora do ar continua no guia (nunca se remove canal), marcada e por último
  const noticias = page.locator('[data-testid="guia-secao"][data-assunto="news"]');
  await noticias.getByRole('button', { name: /Mostrar os/ }).click();
  await expect(noticias.getByTestId('guia-card').last()).toHaveAttribute('data-saude', 'fora');

  // regiões: a do país atual vem escolhida; um país em duas regiões aparece nas duas
  const regioes = page.getByTestId('guia-regioes');
  await expect(regioes.locator('[data-regiao="SOUTHAM"]')).toHaveAttribute('aria-pressed', 'true');
  if (ru?.regions?.includes('EUR') && ru.regions.includes('ASIA')) {
    await regioes.locator('[data-regiao="EUR"]').click();
    await expect(page.getByTestId('guia-paises').locator('[data-pais="RU"]')).toBeVisible();
    await regioes.locator('[data-regiao="ASIA"]').click();
    await expect(page.getByTestId('guia-paises').locator('[data-pais="RU"]')).toBeVisible();
  }
  const semRegiao = index.countries.find((c) => !c.regions?.length && c.code !== 'INT');
  if (semRegiao) {
    await regioes.getByRole('button', { name: /Sem região na fonte/ }).click();
    await expect(page.getByTestId('guia-paises').locator(`[data-pais="${semRegiao.code}"]`)).toBeVisible();
  }

  // trocar de país pelo guia
  await regioes.getByRole('button', { name: /^Todas/ }).click();
  await page.getByTestId('guia-paises').locator('[data-pais="PT"]').click();
  await expect(page.locator('#guia-h1')).toContainText('Portugal');
  await expect(page.getByTestId('guia-card').first()).toBeVisible();
  await expect(page.getByTestId('guia-card').first().getByTestId('pais-canal')).toHaveAttribute('data-pais', 'PT');
});

test('mini-player: zapear troca o canal dentro da janelinha, sem sair da tela', async ({ page }) => {
  await preparar(page);
  await tuneByLink(page, BONS[0]!);
  await expect(page.locator('.stage')).toHaveAttribute('data-phase', 'playing');
  await page.evaluate(() => ((document.querySelector('video') as HTMLVideoElement).loop = true));
  await page.goto('./#/guia');
  const mini = page.getByTestId('mini-player');
  await expect(mini).toBeVisible();
  await expect(mini).toContainText(BONS[0]!.name);
  await page.getByTestId('mini-zapear').click();
  await expect(mini).not.toContainText(BONS[0]!.name);
  await expect(mini).toContainText(/Zap bom\d\d/);
  await expect(page).toHaveURL(/#\/guia$/);
  await expect(page.locator('.stage')).toHaveAttribute('data-phase', 'playing');
});

test('grade: cada canal mostra a origem (bandeira dos dados + país)', async ({ page }) => {
  await preparar(page);
  await page.goto('./#/canais');
  const linha = page.getByTestId('channel-row').first();
  await expect(linha.getByTestId('pais-canal')).toHaveAttribute('data-pais', 'BR');
});
