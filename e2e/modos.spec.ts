import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { Channel } from '../shared/types.ts';
import { expect, test, tuneByLink } from './fixtures.ts';

// Modos Normal/Econômico/Rádio e AirPlay, com listas HLS de fixture (tests/fixtures/hls, geradas por ffmpeg) servidas localmente.

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
    const path = new URL(r.request().url()).pathname.replace(/^\//, ''); // multi/v0_1.ts
    pedidos.push(path);
    const [dir, ...rest] = path.split('/');
    try {
      const body = readFileSync(join(DIR, dir === 'multi' ? 'multi' : 'simples', rest.join('/')));
      return r.fulfill({ status: 200, body, headers: { ...CORS, 'content-type': path.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' /* trechos .seg são MPEG-TS */ } });
    } catch {
      return r.fulfill({ status: 404, headers: CORS, body: 'nope' });
    }
  });
  return pedidos;
}

/** No Rádio o botão de tocar é o da própria tela do Rádio (não há pôster de vídeo). */
async function ligarRadio(page: Page, c: Channel) {
  await page.addInitScript(() => localStorage.setItem('tvlivre:modo-audio', 'radio'));
  await page.goto(`./#/canal/BR/${encodeURIComponent(c.id)}`);
  await page.getByTestId('radio-play').click();
}

const stage = (page: Page) => page.locator('.stage');
const tocando = (page: Page) => expect(stage(page)).toHaveAttribute('data-phase', 'playing');
const el = (page: Page, tag: 'audio' | 'video') => page.locator(tag);
const tempo = (page: Page, tag: 'audio' | 'video') => page.evaluate((t) => (document.querySelector(t) as HTMLMediaElement).currentTime, tag);

test('Normal: automático; Econômico: menor vídeo; mostra MB/h estimado e MB da sessão', async ({ page }) => {
  const pedidos = await preparar(page);
  await tuneByLink(page, MULTI);
  await tocando(page);
  await expect(page.getByTestId('modo-normal')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('modo-economico').click();
  await expect(stage(page)).toHaveAttribute('data-bitrate', '235400'); // o vídeo de menor bitrate (a variante só de áudio, 52800, não)
  await expect(stage(page)).not.toHaveAttribute('data-nivel-audio', 'on');
  await expect(page.getByTestId('consumo')).toContainText('≈ 106 MB/h'); // 235400 × 3600 / 8 / 1e6 = 105,9
  await expect.poll(() => tempo(page, 'video')).toBeGreaterThan(0);
  await expect(page.getByTestId('consumo')).toContainText('MB nesta sessão');
  expect(pedidos.some((p) => p.endsWith('.m3u8'))).toBe(true);
});

test('Rádio com variante só de áudio: usa <audio>, nível só de áudio (≈ 23,8 MB/h) e só baixa trechos dele', async ({ page }) => {
  const pedidos = await preparar(page);
  await ligarRadio(page, MULTI);
  await expect(page.getByTestId('radio-screen')).toBeVisible();
  await tocando(page);
  await expect(stage(page)).toHaveAttribute('data-midia', 'audio');
  await expect(stage(page)).toHaveAttribute('data-bitrate', '52800');
  await expect(stage(page)).toHaveAttribute('data-nivel-audio', 'on');
  await expect(page.getByTestId('consumo')).toContainText('≈ 23,8 MB/h');
  await expect(page.getByTestId('consumo-aviso')).toHaveCount(0);
  await expect.poll(() => tempo(page, 'audio')).toBeGreaterThan(0); // o som sai do <audio>
  await expect(el(page, 'video')).toBeHidden();
  const segmentos = pedidos.filter((p) => p.endsWith('.seg'));
  expect(segmentos.length).toBeGreaterThan(0);
  expect(segmentos.every((p) => /\/v2_\d+\.seg$/.test(p)), `só trechos da variante de áudio: ${segmentos.join(',')}`).toBe(true);
});

test('Rádio sem variante só de áudio: menor qualidade de vídeo e aviso claro com o consumo', async ({ page }) => {
  const pedidos = await preparar(page);
  await ligarRadio(page, SIMPLES);
  await tocando(page);
  await expect(stage(page)).toHaveAttribute('data-bitrate', '235400');
  await expect(page.getByTestId('consumo-aviso')).toContainText('Este canal não tem versão só de áudio; o Rádio usa a menor qualidade de vídeo (≈ 106 MB/h).');
  await expect.poll(() => tempo(page, 'audio')).toBeGreaterThan(0);
  expect(pedidos.filter((p) => p.endsWith('.seg')).every((p) => /\/v1_\d+\.seg$/.test(p))).toBe(true);
});

test('Wake Lock: segurado no vídeo, liberado no Rádio, de volta ao voltar para o vídeo', async ({ page }) => {
  await page.addInitScript(() => {
    const w = ((window as unknown as { __wl: { ativos: number } }).__wl = { ativos: 0 });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => { w.ativos++; const s = { released: false, release: async () => { if (!s.released) { s.released = true; w.ativos--; } }, addEventListener() {} }; return s; } },
    });
  });
  await preparar(page);
  const ativos = () => page.evaluate(() => (window as unknown as { __wl: { ativos: number } }).__wl.ativos);
  await tuneByLink(page, MULTI);
  await tocando(page);
  await expect.poll(ativos).toBe(1);
  await page.getByTestId('modo-radio').click();
  await expect(page.getByTestId('radio-screen')).toBeVisible();
  await expect.poll(ativos).toBe(0); // tela pode apagar
  await page.getByTestId('radio-video').click();
  await tocando(page);
  await expect.poll(ativos).toBe(1);
});

test('timer: pausa a reprodução, baixa o volume nos últimos 10 s e lembra a última escolha', async ({ page }) => {
  await page.addInitScript(() => {
    const real = Date.now.bind(Date);
    (window as unknown as { __skew: number }).__skew = 0;
    Date.now = () => real() + (window as unknown as { __skew: number }).__skew;
  });
  await preparar(page);
  await ligarRadio(page, MULTI);
  await tocando(page);
  await page.getByTestId('radio-timer').click();
  await page.getByTestId('timer-15').click();
  await expect(page.getByTestId('radio-timer')).toContainText('Desliga em');
  expect(await page.evaluate(() => localStorage.getItem('tvlivre:timer-padrao'))).toBe('15');
  const skew = (ms: number) => page.evaluate((v) => ((window as unknown as { __skew: number }).__skew = v), ms);
  const vol = () => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).volume);
  expect(await vol()).toBe(1);
  await skew(15 * 60_000 - 4_000); // faltam 4 s: volume em ≈ 0,4
  await expect.poll(vol).toBeLessThan(0.6);
  await expect.poll(vol).toBeGreaterThan(0);
  await skew(15 * 60_000 + 1_000); // acabou
  await expect.poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).paused)).toBe(true);
  await expect.poll(vol).toBe(1); // volume restaurado para a próxima vez
  await expect(page.getByTestId('radio-timer')).not.toContainText('Desliga em');
  // a última escolha aparece marcada
  await page.getByTestId('radio-timer').click();
  await expect(page.getByTestId('timer-15')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('timer-fim')).toHaveCount(0); // sem guia de programação, "fim do programa" não existe
});

test('a preferência do modo persiste após recarregar; R alterna o Rádio', async ({ page }) => {
  await preparar(page);
  await tuneByLink(page, MULTI);
  await tocando(page);
  await page.getByTestId('modo-economico').click();
  expect(await page.evaluate(() => localStorage.getItem('tvlivre:modo-audio'))).toBe('economico');
  await page.reload();
  await expect(page.getByTestId('modo-economico')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('body').press('r');
  await expect(page.getByTestId('radio-screen')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('tvlivre:modo-audio'))).toBe('radio');
  await page.locator('body').press('r');
  await expect(page.getByTestId('radio-screen')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('tvlivre:modo-audio'))).toBe('normal');
});

test('"Bom para ouvir" filtra a grade pelas categorias de áudio', async ({ page }) => {
  await preparar(page);
  await page.goto('./#/canais');
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await page.getByTestId('filter-ouvir').check();
  await page.getByRole('button', { name: /^Ver / }).click();
  await expect(page.getByTestId('channel-row').first()).toContainText('Fixture'); // as fixtures são "news"
  await expect(page.getByRole('list', { name: /canais/ }).locator('.chip, li').first()).toBeVisible();
  const n = await page.getByTestId('channel-row').count();
  expect(n).toBeGreaterThan(1);
});

test('plano de dados fraco: convite discreto, uma vez, dispensável', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '3g' }, configurable: true }));
  await preparar(page);
  await tuneByLink(page, MULTI);
  await expect(page.getByTestId('datatip')).toBeVisible();
  await page.getByRole('button', { name: 'Dispensar sugestão' }).click();
  await expect(page.getByTestId('datatip')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('player')).toBeVisible();
  await expect(page.getByTestId('datatip')).toHaveCount(0); // não volta por 30 dias
});

test.describe('AirPlay (destino simulado)', () => {
  test('o botão aparece com destino; trocar para HLS nativo, abrir o seletor e voltar ao hls.js ao sair', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __picker: number };
      w.__picker = 0;
      HTMLVideoElement.prototype.canPlayType = () => 'maybe'; // o AirPlay só existe onde há HLS nativo
      (HTMLVideoElement.prototype as unknown as { webkitShowPlaybackTargetPicker: () => void }).webkitShowPlaybackTargetPicker = () => void w.__picker++;
    });
    await preparar(page);
    await tuneByLink(page, MULTI);
    await tocando(page);
    const video = page.locator('video');
    const dispara = (tipo: string, extra: Record<string, unknown> = {}) =>
      page.evaluate(({ tipo, extra }) => { const v = document.querySelector('video')!; const e = new Event(tipo); Object.assign(e, extra); v.dispatchEvent(e); }, { tipo, extra });
    await expect(page.getByTestId('airplay-btn')).toHaveCount(0); // sem destino na rede, sem botão
    await dispara('webkitplaybacktargetavailabilitychanged', { availability: 'available' });
    await expect(page.getByTestId('airplay-btn')).toBeVisible();
    await expect(video).toHaveAttribute('x-webkit-airplay', 'allow');

    await page.getByTestId('airplay-btn').click(); // troca a tentativa atual para o HLS nativo, mantendo o canal
    await expect(video).toHaveAttribute('src', `${HOST}/multi/master.m3u8`);
    await dispara('playing'); // o nativo (simulado) começou a tocar: o seletor abre
    await expect.poll(() => page.evaluate(() => (window as unknown as { __picker: number }).__picker)).toBeGreaterThanOrEqual(1);

    // conectou a uma Apple TV: painel "Transmitindo para…"
    await page.evaluate(() => { Object.defineProperty(document.querySelector('video')!, 'webkitCurrentPlaybackTargetIsWireless', { value: true, configurable: true }); });
    await dispara('webkitcurrentplaybacktargetiswirelesschanged');
    await expect(page.getByTestId('cast-panel')).toContainText('Transmitindo para AirPlay');

    // saiu do AirPlay: volta ao motor anterior (hls.js usa um blob:, não o endereço direto)
    await page.evaluate(() => { Object.defineProperty(document.querySelector('video')!, 'webkitCurrentPlaybackTargetIsWireless', { value: false, configurable: true }); });
    await dispara('webkitcurrentplaybacktargetiswirelesschanged');
    await expect(page.getByTestId('cast-panel')).toHaveCount(0);
    await expect(video).not.toHaveAttribute('src', `${HOST}/multi/master.m3u8`);
  });
});
