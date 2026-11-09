import type { APIRequestContext, Page } from '@playwright/test';
import type { Channel } from '../shared/types.ts';
import { podeTransmitir, proximoTransmissivel } from '../src/lib/cast.ts';
import { buildNumbers, channelKey, formatNumber } from '../src/lib/lineup.ts';
import { brChannels, expect, openChannel, test, tuneByLink } from './fixtures.ts';

// Chromecast com um STUB do SDK (nada do Google é baixado de verdade). O stub é o que o site recebe de gstatic.com.

test.skip(({ browserName }) => browserName !== 'chromium', 'O SDK do Cast só existe no Chromium');

const GSTATIC = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js*';
const STUB = `(() => {
  const calls = (window.__cast = { loads: [], stopped: 0, requests: 0, volume: [], mute: [] });
  const L = {}; let state = 'NOT_CONNECTED', session = null, vol = 0.5, mute = false;
  const emit = (t) => (L[t] || []).forEach((f) => f({}));
  const mk = () => ({
    getCastDevice: () => ({ friendlyName: 'TV da Sala' }), getVolume: () => vol, isMute: () => mute,
    setVolume: async (v) => { vol = v; calls.volume.push(v); }, setMute: async (m) => { mute = m; calls.mute.push(m); },
    loadMedia: async (r) => { const m = r.media; calls.loads.push({ url: m.contentId, contentType: m.contentType, streamType: m.streamType, title: m.metadata.title, subtitle: m.metadata.subtitle, image: m.metadata.images[0].url, autoplay: r.autoplay }); return window.__castFail || undefined; },
  });
  if (sessionStorage.getItem('__castSess')) { session = mk(); state = 'CONNECTED'; }
  const ctx = {
    setOptions: (o) => (window.__castOptions = o), addEventListener: (t, f) => (L[t] = (L[t] || []).concat(f)),
    getCastState: () => state, getCurrentSession: () => session,
    requestSession: async () => { calls.requests++; session = mk(); state = 'CONNECTED'; sessionStorage.setItem('__castSess', '1'); emit('caststate'); emit('session'); },
    endCurrentSession: () => { calls.stopped++; session = null; state = 'NOT_CONNECTED'; sessionStorage.removeItem('__castSess'); emit('caststate'); emit('session'); },
  };
  window.chrome = Object.assign(window.chrome || {}, { cast: {
    media: { DEFAULT_MEDIA_RECEIVER_APP_ID: 'CC1AD845', StreamType: { LIVE: 'LIVE' }, MediaInfo: function (u, c) { this.contentId = u; this.contentType = c; }, GenericMediaMetadata: function () {}, LoadRequest: function (m) { this.media = m; } },
    AutoJoinPolicy: { ORIGIN_SCOPED: 'origin_scoped' }, Image: function (u) { this.url = u; },
  } });
  window.cast = { framework: { CastContext: { getInstance: () => ctx }, CastContextEventType: { CAST_STATE_CHANGED: 'caststate', SESSION_STATE_CHANGED: 'session' } } };
  setTimeout(() => window.__onGCastApiAvailable && window.__onGCastApiAvailable(true), 0);
})();`;

async function prepararSdk(page: Page): Promise<string[]> {
  const pedidos: string[] = [];
  await page.route(GSTATIC, (r) => {
    pedidos.push(r.request().url());
    return r.fulfill({ contentType: 'text/javascript', body: STUB });
  });
  return pedidos;
}

/** Um canal transmissível cujo próximo na lista NÃO é (para ver o pulo), e o próximo que dá. */
async function escolher(request: APIRequestContext) {
  const br = await brChannels(request);
  const nums = buildNumbers({ BR: br });
  const i = br.findIndex((c, k) => podeTransmitir(c) && c.status !== 'offline' && br[k + 1] && !podeTransmitir(br[k + 1]!) && br[k + 1]!.status !== 'offline');
  const a = br[i >= 0 ? i : br.findIndex((c) => podeTransmitir(c) && c.status !== 'offline')]!;
  const { canal, puladas } = proximoTransmissivel(br, channelKey(a), 1);
  return { br, nums, a, proximo: canal!, puladas };
}
const titulo = (c: Channel, nums: Map<string, number>) => `${formatNumber(nums.get(channelKey(c)))} · ${c.name}`;
const cast = (page: Page) => page.evaluate(() => (window as unknown as { __cast: { loads: Record<string, unknown>[]; stopped: number; requests: number; volume: number[]; mute: boolean[] } }).__cast);

test('nada do Google é baixado antes do toque em Transmitir; o botão aparece só em canal transmissível', async ({ page, request }) => {
  const pedidos = await prepararSdk(page);
  const { a } = await escolher(request);
  await tuneByLink(page, a);
  await expect(page.getByTestId('cast-btn')).toBeVisible();
  await page.waitForTimeout(800);
  expect(pedidos, 'nenhuma requisição ao gstatic.com antes do toque').toHaveLength(0);
  await page.getByTestId('cast-btn').click();
  await expect(page.getByTestId('cast-panel')).toBeVisible();
  expect(pedidos).toHaveLength(1);
  expect(pedidos[0]).toContain('loadCastFramework=1');
});

test('canal que não pode ser transmitido (HTTP) toca normalmente, mas não mostra o botão', async ({ page, request }) => {
  await prepararSdk(page);
  const br = await brChannels(request);
  const ruim = br.find((c) => !podeTransmitir(c) && c.kind === 'http' && c.status !== 'offline');
  test.skip(!ruim, 'sem canal HTTP nos dados do dia');
  await page.goto('./#/canais');
  await openChannel(page, ruim!.name);
  await expect(page.locator('.controls')).toBeVisible();
  await expect(page.getByTestId('cast-btn')).toHaveCount(0);
});

test('Transmitir: loadMedia com a URL e os metadados certos; painel "Transmitindo para…" com número e nome', async ({ page, request }) => {
  await prepararSdk(page);
  const { a, nums } = await escolher(request);
  await tuneByLink(page, a);
  await page.getByTestId('cast-btn').click();
  const panel = page.getByTestId('cast-panel');
  await expect(panel).toContainText('Transmitindo para TV da Sala');
  await expect(panel).toContainText(a.name);
  await expect(panel.locator('.cast-num')).toHaveText(formatNumber(nums.get(channelKey(a))));
  await expect.poll(async () => (await cast(page)).loads.length).toBe(1);
  const c = await cast(page);
  expect(c.loads[0]).toMatchObject({
    url: a.url, contentType: 'application/x-mpegURL', streamType: 'LIVE', title: titulo(a, nums), autoplay: true,
  });
  expect(c.loads[0]!.image).toMatch(a.logo?.startsWith('https://') ? /^https:\/\// : /icons\/icon-512\.png$/);
  expect(typeof c.loads[0]!.subtitle).toBe('string');
  await expect(page.locator('video')).not.toHaveAttribute('src', /.+/); // o celular não baixa o vídeo enquanto transmite
});

test('zapear durante a transmissão pula os não transmissíveis e chama loadMedia com o próximo que dá', async ({ page, request }) => {
  await prepararSdk(page);
  const { a, nums, proximo, puladas } = await escolher(request);
  await tuneByLink(page, a);
  await page.getByTestId('cast-btn').click();
  await expect.poll(async () => (await cast(page)).loads.length).toBe(1);
  await page.locator('.dial-side').last().click(); // próximo ›
  await expect.poll(async () => (await cast(page)).loads.length).toBe(2);
  expect((await cast(page)).loads[1]).toMatchObject({ url: proximo.url, title: titulo(proximo, nums) });
  if (puladas.length) await expect(page.getByRole('status').filter({ hasText: /não pode(m)? ser transmitido/ }).or(page.locator('.toast'))).toContainText(/não pode(m)? ser transmitido, pulando/);
  await expect(page.getByTestId('cast-panel')).toContainText(proximo.name);
});

test('volume e mudo controlam o aparelho; Parar volta ao vídeo local no mesmo canal', async ({ page, request }) => {
  await prepararSdk(page);
  const { a } = await escolher(request);
  await tuneByLink(page, a);
  await page.getByTestId('cast-btn').click();
  await page.getByLabel('Volume da TV').fill('80');
  await expect.poll(async () => (await cast(page)).volume.at(-1)).toBeCloseTo(0.8);
  await page.getByRole('button', { name: 'Silenciar a TV' }).click();
  await expect.poll(async () => (await cast(page)).mute.at(-1)).toBe(true);
  await page.getByTestId('cast-parar').click();
  expect((await cast(page)).stopped).toBe(1);
  await expect(page.getByTestId('cast-panel')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(a.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await expect(page.getByTestId('player')).toBeVisible();
});

test('erro do receptor: mensagem no padrão do diagnóstico e oferta do próximo canal', async ({ page, request }) => {
  await prepararSdk(page);
  const { a, proximo } = await escolher(request);
  await tuneByLink(page, a);
  await page.getByTestId('cast-btn').click();
  await expect.poll(async () => (await cast(page)).loads.length).toBe(1);
  await page.evaluate(() => ((window as unknown as { __castFail: string }).__castFail = 'LOAD_MEDIA_FAILED'));
  await page.locator('.dial-side').last().click();
  const erro = page.getByTestId('cast-erro');
  await expect(erro).toContainText('A TV não conseguiu abrir esse canal');
  await expect(erro).toContainText('LOAD_MEDIA_FAILED');
  await page.evaluate(() => ((window as unknown as { __castFail: string | undefined }).__castFail = undefined));
  await page.getByTestId('cast-proximo').click();
  await expect(page.getByTestId('cast-erro')).toHaveCount(0);
  expect(proximo).toBeTruthy();
});

test('recarregar com uma transmissão ativa retoma o painel de controle', async ({ page, request }) => {
  const pedidos = await prepararSdk(page);
  const { a } = await escolher(request);
  await tuneByLink(page, a);
  await page.getByTestId('cast-btn').click();
  await expect(page.getByTestId('cast-panel')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('cast-panel')).toContainText('Transmitindo para TV da Sala');
  expect(pedidos.length).toBeGreaterThanOrEqual(2);
});

test('Brave: não mostra o botão quebrado; explica como ligar o Media Router e só então transmite', async ({ page, request }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'brave', { value: { isBrave: async () => true } }));
  const pedidos = await prepararSdk(page);
  const { a } = await escolher(request);
  await tuneByLink(page, a);
  await page.getByTestId('cast-btn').click();
  await expect(page.getByTestId('brave-passos')).toContainText('brave://settings/extensions');
  expect(pedidos).toHaveLength(0);
  await page.getByTestId('brave-continuar').click();
  await expect(page.getByTestId('cast-panel')).toBeVisible();
  expect(pedidos).toHaveLength(1);
});

test('Modo TV: sem botão de transmitir', async ({ page, request }) => {
  await prepararSdk(page);
  const { a } = await escolher(request);
  await page.goto('./?tv=1');
  await tuneByLink(page, a);
  await expect(page.getByTestId('cast-btn')).toHaveCount(0);
});

test('Assistir na Smart TV (menu Mais): endereço curto e número do canal em letras grandes', async ({ page, request }) => {
  const { a, nums } = await escolher(request);
  await page.setViewportSize({ width: 390, height: 820 }); // o menu Mais mora na navegação inferior do celular
  await tuneByLink(page, a);
  await page.locator('nav.bottom-nav').getByRole('button', { name: 'Mais' }).click();
  await page.getByTestId('more-smarttv').click();
  await expect(page.getByTestId('smarttv-url')).toHaveText(/^[^/]+\/tv-livre$/);
  await expect(page.getByTestId('smarttv-num')).toHaveText(formatNumber(nums.get(channelKey(a))));
});

test('Assistir na Smart TV no computador: botão no topo abre a mesma explicação', async ({ page }) => {
  test.skip(!!test.info().project.use.isMobile, 'o botão do topo só existe no computador (no celular é o menu Mais)');
  await page.goto('./#/canais');
  await page.getByTestId('topbar-smarttv').click();
  await expect(page.getByRole('dialog', { name: 'Assistir na Smart TV' })).toContainText('Modo TV');
  await expect(page.getByTestId('smarttv-url')).toBeVisible();
});
