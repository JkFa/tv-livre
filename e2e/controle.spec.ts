import { devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { Channel } from '../shared/types.ts';
import { iniciarBroker } from './broker.ts';
import { expect, test } from './fixtures.ts';

// Controle pelo celular: computador (receptor) e celular (controle) em contextos separados, falando por um broker MQTT
// LOCAL (aedes + WebSocket). Nada sai para a internet.

const MORTO: Channel = { id: 'morto', name: 'Canal Morto', country: 'BR', categories: [], languages: ['por'], url: 'https://morto.tvlivre.test/x.m3u8', kind: 'hls', status: 'online', sources: ['free-tv'] };
const completo = () => test.info().project.name === 'chromium-desktop';
let broker: Awaited<ReturnType<typeof iniciarBroker>>;
const aberto: BrowserContext[] = [];

test.beforeAll(async () => {
  broker = await iniciarBroker();
});
test.afterAll(async () => {
  await broker.parar();
});
test.afterEach(async () => {
  while (aberto.length) await aberto.pop()!.close();
});

async function contexto(browser: Browser, opts: Parameters<Browser['newContext']>[0], brokerUrl: string = broker.url): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL!, locale: 'pt-BR', serviceWorkers: 'block', ...opts });
  await ctx.addInitScript((u) => localStorage.setItem('tvlivre:remote-broker', u), brokerUrl);
  await ctx.route(/abacus\.jasoncameron\.dev|ipwho\.is/, (r) => r.abort());
  await ctx.route('**/data/countries/BR.json', async (r) => {
    const real = (await (await r.fetch()).json()) as Channel[];
    await r.fulfill({ json: [...real, MORTO] });
  });
  await ctx.route('https://morto.tvlivre.test/**', (r) => r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'não existe' }));
  aberto.push(ctx);
  return ctx;
}

const computador = (browser: Browser) => contexto(browser, { viewport: { width: 1280, height: 800 } });
const celular = (browser: Browser) => contexto(browser, { ...devices['Pixel 7'] });

/** Abre o TV Livre, liga "Controlar pelo celular" e devolve o que o QR carrega (lido da sessão da aba). */
async function ligarControle(tv: Page) {
  await tv.goto('./#/canais');
  await expect(tv.getByTestId('channel-row').first()).toBeVisible();
  await tv.getByTestId('topbar-controle').click();
  await expect(tv.getByTestId('controle-codigo')).toBeVisible();
  const salvo = await tv.evaluate(() => JSON.parse(sessionStorage.getItem('tvlivre:controle-sessao')!));
  const qr = salvo.canais.find((c: { tipo: string }) => c.tipo === 'qr');
  return { caminho: `./#/controle?s=${qr.sessao}&k=${qr.chaveRaw}`, qr, codigo: await tv.getByTestId('controle-codigo').innerText() };
}
async function parear(cel: Page, caminho: string) {
  await cel.goto(caminho);
  await expect(cel.getByTestId('controle-status')).toHaveText('Conectado');
}
const numeroNaTv = (tv: Page) => tv.locator('.dial-now .num');
const hashTv = (tv: Page) => tv.evaluate(() => location.hash);

test('nada conecta nem carrega antes de ativar o controle; ao ativar, conecta e baixa o chunk', async ({ browser }) => {
  const ctx = await computador(browser);
  const tv = await ctx.newPage();
  const pedidos: string[] = [];
  tv.on('request', (r) => pedidos.push(r.url()));
  const antes = broker.conexoes();
  await tv.goto('./#/canais');
  await expect(tv.getByTestId('channel-row').first()).toBeVisible();
  await tv.waitForTimeout(1500);
  expect(broker.conexoes()).toBe(antes);
  expect(pedidos.filter((u) => /mqtt/i.test(u))).toEqual([]);
  expect(await tv.evaluate(() => sessionStorage.length)).toBe(0);
  await tv.getByTestId('topbar-controle').click();
  await expect(tv.getByTestId('controle-sheet')).toBeVisible();
  await expect(tv.getByTestId('controle-codigo')).toBeVisible();
  expect(broker.conexoes()).toBe(antes + 1);
  expect(pedidos.some((u) => /mqtt/i.test(u))).toBe(true);
});

test.describe('com computador e celular', () => {
  test.skip(() => !completo(), 'cenário completo só no Chromium desktop');

  test('pareia por QR: o celular conecta, a chave sai do endereço e o computador lista o aparelho', async ({ browser }) => {
    const tv = await (await computador(browser)).newPage();
    const { caminho } = await ligarControle(tv);
    const cel = await (await celular(browser)).newPage();
    await parear(cel, caminho);
    expect(await cel.evaluate(() => location.hash)).toBe('#/controle'); // sem sessão nem chave no endereço
    // o teste roda em localhost: a folha avisa que o QR não abriria num celular de verdade
    await expect(tv.getByTestId('controle-aviso-local')).toContainText('QR code não vai abrir no celular');
    await expect(cel.getByTestId('controle-canal')).toContainText('Nenhum canal');
    await expect(tv.getByTestId('controle-celulares')).toContainText('Celular conectado · Android');
    await expect(tv.getByTestId('controle-celulares')).toContainText('(1/3)');
  });

  test('troca de canal pelo dial, pelo teclado numérico e pela aba Canais; mede a latência', async ({ browser }) => {
    const tv = await (await computador(browser)).newPage();
    await tv.addInitScript(() => addEventListener('hashchange', () => ((window as unknown as { __t: number }).__t = Date.now())));
    const { caminho } = await ligarControle(tv);
    await tv.keyboard.press('Escape');
    const cel = await (await celular(browser)).newPage();
    await parear(cel, caminho);

    // dial: próximo e anterior (o computador sintoniza e o celular mostra o canal)
    await cel.getByTestId('controle-proximo').click();
    await expect(tv).toHaveURL(/#\/canal\/BR\//);
    const primeiro = await numeroNaTv(tv).innerText();
    await expect(cel.getByTestId('controle-numero')).toHaveText(primeiro);
    await cel.getByTestId('controle-proximo').click();
    await expect.poll(() => numeroNaTv(tv).innerText()).not.toBe(primeiro);
    await cel.getByTestId('controle-anterior').click();
    await expect.poll(() => numeroNaTv(tv).innerText()).toBe(primeiro);

    // teclado numérico + Enter
    for (const t of ['1', '2']) await cel.getByTestId(`tecla-${t}`).click();
    await cel.getByTestId('tecla-enter').click();
    await expect(numeroNaTv(tv)).toHaveText('12');
    await expect(cel.getByTestId('controle-numero')).toHaveText('12');

    // aba Canais: busca com o teclado do celular e toque no canal
    await cel.getByTestId('aba-canais').click();
    await expect(cel.getByTestId('controle-canal-item').first()).toBeVisible();
    await cel.getByTestId('controle-busca').fill('globonews');
    const alvo = cel.getByTestId('controle-canal-item').first();
    const rotulo = (await alvo.getAttribute('aria-label'))!.replace(/^\d+\s+/, '');
    await alvo.click();
    await expect(tv.locator('.dial-now .dial-name')).toHaveText(rotulo);
    await expect(cel.getByTestId('controle-canal')).toContainText(rotulo);

    // latência toque → troca de canal, no broker local (10 medidas)
    const lat: number[] = [];
    for (let i = 0; i < 10; i++) {
      await tv.evaluate(() => ((window as unknown as { __t: number }).__t = 0));
      const t0 = await cel.evaluate(() => { const t = Date.now(); (document.querySelector('[data-testid=controle-proximo]') as HTMLElement).click(); return t; });
      await tv.waitForFunction(() => (window as unknown as { __t: number }).__t > 0);
      lat.push((await tv.evaluate(() => (window as unknown as { __t: number }).__t)) - t0);
      await cel.waitForTimeout(150);
    }
    lat.sort((a, b) => a - b);
    const mediana = lat[5]!;
    test.info().annotations.push({ type: 'latencia', description: `toque → troca de canal (broker local): mediana ${mediana} ms, mín ${lat[0]} ms, máx ${lat[9]} ms` });
    console.log(`LATENCIA mediana=${mediana}ms min=${lat[0]}ms max=${lat[9]}ms todas=${lat.join(',')}`);
    expect(mediana).toBeLessThan(1500);
  });

  test('volume, mudo, pausa e favoritar chegam ao computador e o estado volta ao celular', async ({ browser }) => {
    const tv = await (await computador(browser)).newPage();
    const { caminho } = await ligarControle(tv);
    const cel = await (await celular(browser)).newPage();
    await parear(cel, caminho);
    await cel.getByTestId('controle-proximo').click();
    await expect(tv).toHaveURL(/#\/canal\/BR\//);

    await cel.getByTestId('controle-mudo').click();
    await expect(cel.getByTestId('controle-mudo')).toHaveAttribute('aria-pressed', 'true');
    await expect(tv.getByRole('button', { name: 'Ativar o som' })).toBeVisible(); // o botão do player no computador também mudou
    await cel.getByTestId('controle-mudo').click();
    await expect(cel.getByTestId('controle-mudo')).toHaveAttribute('aria-pressed', 'false');

    await cel.getByTestId('controle-volume').fill('30');
    await expect.poll(() => cel.evaluate(() => Number((document.querySelector('[data-testid=controle-volume]') as HTMLInputElement).value))).toBe(30);
    await expect.poll(() => tv.evaluate(() => Math.round(((document.querySelector('video') as HTMLVideoElement).volume) * 100))).toBe(30);

    await cel.getByTestId('controle-favoritar').click();
    await expect(cel.getByTestId('controle-favoritar')).toHaveAttribute('aria-pressed', 'true');
    await expect(tv.getByRole('button', { name: 'Remover dos favoritos' }).first()).toBeVisible();
  });

  test('"tela inteira" do celular liga o layout de janela inteira e o computador mostra a saída; sair no computador atualiza o celular', async ({ browser }) => {
    const tv = await (await computador(browser)).newPage();
    const { caminho } = await ligarControle(tv);
    await tv.keyboard.press('Escape'); // fecha a folha
    const cel = await (await celular(browser)).newPage();
    await parear(cel, caminho);
    await cel.getByTestId('controle-tela').click();
    await expect(tv.locator('html')).toHaveAttribute('data-tv', 'on');
    await expect(tv.getByTestId('tv-sair')).toBeVisible(); // quem controla pelo celular nunca fica preso no Modo TV
    await expect(cel.getByTestId('controle-tela')).toHaveAttribute('aria-pressed', 'true');
    await tv.getByTestId('tv-sair').click(); // sai pelo botão do computador
    await expect(tv.locator('html')).toHaveAttribute('data-tv', 'off');
    await expect(cel.getByTestId('controle-tela')).toHaveAttribute('aria-pressed', 'false');
    await cel.getByTestId('controle-tela').click(); // liga de novo e sai pelo Esc
    await expect(tv.locator('html')).toHaveAttribute('data-tv', 'on');
    await tv.locator('body').click({ position: { x: 700, y: 500 } });
    await tv.keyboard.press('Escape');
    await expect(tv.locator('html')).toHaveAttribute('data-tv', 'off');
  });

  test('o computador reporta canal fora do ar e o celular oferece "Próximo canal"', async ({ browser }) => {
    const tv = await (await computador(browser)).newPage();
    const { caminho } = await ligarControle(tv);
    const cel = await (await celular(browser)).newPage();
    await parear(cel, caminho);
    await cel.getByTestId('aba-canais').click();
    await cel.getByTestId('controle-busca').fill('Canal Morto');
    await cel.getByTestId('controle-canal-item').first().click();
    await expect(tv).toHaveURL(/morto/);
    await expect(cel.getByTestId('controle-fora')).toContainText('Fora do ar no computador');
    const hash = await hashTv(tv);
    await cel.getByTestId('controle-fora-proximo').click();
    await expect.poll(() => hashTv(tv)).not.toBe(hash);
    await expect(cel.getByTestId('controle-fora')).toHaveCount(0);
  });

  test('desconectar um celular: ele perde o controle e o computador o tira da lista', async ({ browser }) => {
    const tv = await (await computador(browser)).newPage();
    const { caminho } = await ligarControle(tv);
    const cel = await (await celular(browser)).newPage();
    await parear(cel, caminho);
    await expect(tv.getByTestId('controle-desconectar')).toHaveCount(1);
    await tv.getByTestId('controle-desconectar').click();
    await expect(cel.getByTestId('controle-status')).toHaveText('Desconectado');
    await expect(cel.getByTestId('controle-aviso')).toContainText('desconectou este celular');
    await expect(tv.getByTestId('controle-celulares')).toContainText('Nenhum ainda');
    const antes = await hashTv(tv);
    await cel.evaluate(() => (document.querySelector('[data-testid=controle-proximo]') as HTMLElement | null)?.click());
    await tv.waitForTimeout(800);
    expect(await hashTv(tv)).toBe(antes);
  });

  test('encerrar o controle: celulares são desconectados, o QR antigo não manda mais e o novo funciona', async ({ browser }) => {
    const tv = await (await computador(browser)).newPage();
    const antigo = await ligarControle(tv);
    const cel = await (await celular(browser)).newPage();
    await parear(cel, antigo.caminho);
    await tv.getByTestId('controle-encerrar').click();
    await expect(cel.getByTestId('controle-status')).toHaveText('Controle encerrado');
    const lerQr = () => tv.evaluate(() => JSON.parse(sessionStorage.getItem('tvlivre:controle-sessao')!).canais.find((c: { tipo: string }) => c.tipo === 'qr').sessao as string);
    await expect.poll(lerQr).not.toBe(antigo.qr.sessao); // a sessão nova é gravada logo depois de encerrar
    const novo = await tv.evaluate(() => JSON.parse(sessionStorage.getItem('tvlivre:controle-sessao')!).canais.find((c: { tipo: string }) => c.tipo === 'qr'));
    expect(novo.sessao).not.toBe(antigo.qr.sessao);
    expect(novo.chaveRaw).not.toBe(antigo.qr.chaveRaw);
    // outro celular abre o link ANTIGO: nada acontece no computador
    const velho = await (await celular(browser)).newPage();
    await velho.goto(antigo.caminho);
    await expect(velho.getByTestId('controle-canal')).toContainText('Aguardando o computador');
    await velho.evaluate(() => (document.querySelector('[data-testid=controle-proximo]') as HTMLElement | null)?.click());
    await tv.waitForTimeout(800);
    expect(await hashTv(tv)).not.toMatch(/#\/canal\//);
    // o link novo funciona
    const n = await (await celular(browser)).newPage();
    await parear(n, `./#/controle?s=${novo.sessao}&k=${novo.chaveRaw}`);
    await n.getByTestId('controle-proximo').click();
    await expect(tv).toHaveURL(/#\/canal\/BR\//);
  });

  test('pareia pelo código de 8 caracteres e o código vira de uso único', async ({ browser }) => {
    const tv = await (await computador(browser)).newPage();
    const { codigo } = await ligarControle(tv);
    expect(codigo).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    await expect(tv.getByTestId('controle-expira')).toContainText('Vale por mais');
    const cel = await (await celular(browser)).newPage();
    await cel.goto('./#/canais');
    await cel.locator('nav.bottom-nav').getByRole('button', { name: 'Mais' }).click(); // o caminho de quem não tem câmera
    await cel.getByTestId('more-usar-controle').click();
    await expect(cel.getByTestId('controle-parear')).toBeVisible();
    await cel.getByTestId('controle-codigo-input').fill('ABCD-EFG0'); // 0 não existe no alfabeto
    await cel.getByTestId('controle-codigo-ok').click();
    await expect(cel.getByRole('alert')).toContainText('8 letras e números');
    await cel.getByTestId('controle-codigo-input').fill(codigo.toLowerCase());
    await cel.getByTestId('controle-codigo-ok').click();
    await expect(cel.getByTestId('controle-status')).toHaveText('Conectado');
    await cel.getByTestId('controle-proximo').click();
    await expect(tv).toHaveURL(/#\/canal\/BR\//);
    await expect(tv.getByTestId('controle-codigo-bloco')).toHaveCount(0); // o código foi consumido
    await expect(tv.getByTestId('controle-novo-codigo')).toBeVisible();
    await expect(tv.getByTestId('controle-celulares')).toContainText('(1/3)');
  });

  test('recarregar o computador mantém o controle (a sessão volta sozinha)', async ({ browser }) => {
    const tv = await (await computador(browser)).newPage();
    const { caminho } = await ligarControle(tv);
    const cel = await (await celular(browser)).newPage();
    await parear(cel, caminho);
    await tv.reload();
    await expect(tv.getByTestId('channel-row').first()).toBeVisible();
    await cel.getByTestId('controle-proximo').click();
    await expect(tv).toHaveURL(/#\/canal\/BR\//, { timeout: 20_000 });
    await expect(cel.getByTestId('controle-status')).toHaveText('Conectado');
  });

  test('o celular volta ao normal depois de a conexão cair e quando o app volta do segundo plano', async ({ browser }) => {
    const tv = await (await computador(browser)).newPage();
    const { caminho } = await ligarControle(tv);
    const cel = await (await celular(browser)).newPage();
    await parear(cel, caminho);
    broker.derrubar(); // queda do broker: o cliente MQTT reconecta sozinho
    await expect(cel.getByTestId('controle-status')).toHaveText('Reconectando…');
    await expect(cel.getByTestId('controle-status')).toHaveText('Conectado', { timeout: 20_000 });
    await cel.getByTestId('controle-proximo').click();
    await expect(tv).toHaveURL(/#\/canal\/BR\//, { timeout: 15_000 });
    // iPhone: ao voltar do segundo plano, reconecta mostrando "reconectando…" e reenvia o ping
    // o "Reconectando…" dura milissegundos num broker local rápido: em vez de torcer para o Playwright pegá-lo, um
    // observador grava as mudanças de situação e o teste confere a sequência reconectando → conectado
    await cel.evaluate(() => {
      const w = window as unknown as { __sit: string[] };
      w.__sit = [];
      const el = document.querySelector('[data-testid=controle-status]')!;
      new MutationObserver(() => w.__sit.push(el.getAttribute('data-situacao')!)).observe(el, { attributes: true, attributeFilter: ['data-situacao'] });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => cel.evaluate(() => (window as unknown as { __sit: string[] }).__sit)).toContain('reconectando');
    await expect(cel.getByTestId('controle-status')).toHaveText('Conectado', { timeout: 20_000 });
    const sit = await cel.evaluate(() => (window as unknown as { __sit: string[] }).__sit);
    expect(sit.indexOf('reconectando')).toBeLessThan(sit.lastIndexOf('conectado'));
  });

  test('o computador em segundo plano continua recebendo comandos', async ({ browser }) => {
    const ctx = await computador(browser);
    const tv = await ctx.newPage();
    const { caminho } = await ligarControle(tv);
    const cel = await (await celular(browser)).newPage();
    await parear(cel, caminho);
    const outra = await ctx.newPage(); // a aba do TV Livre vai para segundo plano
    await outra.goto('about:blank');
    await outra.bringToFront();
    // (o Chromium headless não marca a aba como `hidden` nem tira o foco: o que se prova é que o comando chega com outra aba na frente;
    // o comportamento com a aba realmente oculta e a tela bloqueada está na lista de testes manuais do PR)
    await cel.getByTestId('controle-proximo').click();
    await expect.poll(() => hashTv(tv), { timeout: 15_000 }).toMatch(/#\/canal\/BR\//);
  });

  test('broker fora do ar: o celular mostra o motivo e oferece tentar de novo', async ({ browser }) => {
    const tv = await (await computador(browser)).newPage();
    const { caminho } = await ligarControle(tv);
    const ctx = await contexto(browser, { ...devices['Pixel 7'] }, 'ws://127.0.0.1:1'); // ninguém escuta nessa porta
    const cel = await ctx.newPage();
    await cel.goto(caminho);
    await expect(cel.getByTestId('controle-aviso')).toContainText('Não foi possível conectar ao servidor de mensagens', { timeout: 30_000 });
    await expect(cel.getByTestId('controle-tentar')).toBeVisible();
  });
});

test('fumaça sem rede: duas abas do mesmo aparelho (BroadcastChannel) pareiam e trocam de canal', async ({ browser }) => {
  const ctx = await contexto(browser, { viewport: { width: 1280, height: 800 } }, 'broadcast');
  const tv = await ctx.newPage();
  const { caminho } = await ligarControle(tv);
  const cel = await ctx.newPage();
  await parear(cel, caminho);
  await cel.getByTestId('controle-proximo').click();
  await expect(tv).toHaveURL(/#\/canal\/BR\//);
  await expect(cel.getByTestId('controle-numero')).toHaveText(await numeroNaTv(tv).innerText());
});

test('iPhone (WebKit): pareia pelo broker, troca de canal e reconecta ao voltar do segundo plano', async ({ browser, browserName }) => {
  test.skip(browserName !== 'webkit', 'cenário do Safari/iPhone');
  const tv = await (await computador(browser)).newPage();
  const { caminho } = await ligarControle(tv);
  const cel = await (await contexto(browser, { ...devices['iPhone 14'] })).newPage();
  await parear(cel, caminho);
  await expect(tv.getByTestId('controle-celulares')).toContainText('Celular conectado · iPhone');
  await cel.getByTestId('controle-proximo').click();
  await expect(tv).toHaveURL(/#\/canal\/BR\//);
  await cel.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(cel.getByTestId('controle-status')).toHaveText('Conectado', { timeout: 20_000 });
  await cel.getByTestId('controle-proximo').click();
  // o número no celular acompanha o do computador (o estado volta pelo broker)
  await expect.poll(async () => (await numeroNaTv(tv).innerText()) === (await cel.getByTestId('controle-numero').innerText())).toBe(true);
});
