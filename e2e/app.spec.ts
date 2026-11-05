import type { Channel } from '../shared/types.ts';
import { brChannels, COUNTER_VALUE, deadStream, expect, openChannel, playableHls, search, searchBox, stalledStream, swipe, test } from './fixtures.ts';

// Roda tanto contra o build local (vite preview) quanto contra o site publicado (BASE_URL).

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('channel-row').first()).toBeVisible();
});

const hashId = (url: string) => decodeURIComponent(url.split('/').pop() ?? '');

test('abre o app: TV pronta para ligar, Brasil selecionado e grade carregada', async ({ page, request }) => {
  await expect(page).toHaveTitle(/TV Livre/);
  await expect(page.getByRole('button', { name: /Ligar a TV|Voltar ao canal/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^País: Brasil/ })).toBeVisible();
  const br = await brChannels(request);
  await expect(page.getByTestId('result-count')).toContainText(`${br.length.toLocaleString('pt-BR')} canais`);
  // a grade usa números de canal como elemento gráfico
  await expect(page.getByTestId('channel-row').first().locator('.row-num')).toHaveText(/^\d{2,3}$/);
});

test('busca um canal pelo nome, sem diferenciar acentos, e mostra o estado vazio', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find((c) => /^[\p{L}\p{N} ]{5,}$/u.test(c.name)) ?? br[0]!;
  await search(page, target.name.toUpperCase());
  await expect(page.getByTestId('channel-list')).toContainText(target.name);

  await search(page, 'zzzz-nenhum-canal-assim');
  await expect(page.getByText(/Nada com “zzzz-nenhum-canal-assim”/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Procurar em todos os países' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar busca' }).first().click();
  await expect(searchBox(page)).toHaveValue('');
});

test('filtros em folha: escolher categoria, ver o chip e limpar tudo', async ({ page }) => {
  await page.getByRole('button', { name: /^Filtros/ }).click();
  const sheet = page.getByRole('dialog', { name: 'País e filtros' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Notícias', exact: true }).click();
  await sheet.getByRole('button', { name: 'No ar', exact: true }).click();
  await sheet.getByRole('button', { name: /^Ver \d/ }).click();
  await expect(sheet).toBeHidden();
  const chips = page.getByRole('list', { name: 'Filtros ativos' });
  await expect(chips.getByRole('button', { name: /Remover filtro Notícias/ })).toBeVisible();
  await expect(chips.getByRole('button', { name: /Remover filtro No ar/ })).toBeVisible();
  await chips.getByRole('button', { name: /Remover filtro Notícias/ }).click();
  await expect(chips.getByRole('button', { name: /Remover filtro Notícias/ })).toHaveCount(0);
  await chips.getByRole('button', { name: /Remover filtro No ar/ }).click();
  await expect(chips).toBeHidden();
});

test('Esc fecha a folha de filtros', async ({ page }) => {
  await page.getByRole('button', { name: /^Filtros/ }).click();
  const sheet = page.getByRole('dialog', { name: 'País e filtros' });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('a vinheta de troca não cobre o painel de erro', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find(playableHls)!;
  await page.route(target.url, deadStream);
  await openChannel(page, target.name);
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('.osd')).toHaveCount(0);
});

test('sintonizar mostra o canal; tocar com a rede falhando explica a causa e sugere outros', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find(playableHls)!;
  expect(target, 'precisa haver um canal HLS tocável no Brasil').toBeTruthy();
  await page.route(target.url, (route) => deadStream(route)); // servidor responde 404
  await openChannel(page, target.name); // escolher na grade já toca (é um gesto do usuário)
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 40_000 });
  await expect(alert.getByRole('heading', { level: 3 })).toContainText(/saiu do ar/i);
  await expect(alert.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await expect(alert.getByTestId('vlc-open')).toBeVisible(); // "Abrir no VLC": sem copiar e colar
  await expect(page.getByRole('button', { name: /Tela cheia/ })).toBeVisible();
});

test('trocar de canal: botões do dial e vinheta com número e nome', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find(playableHls)!;
  await page.route('**/*.m3u8*', stalledStream); // conectando: a vinheta aparece sobre o vídeo
  await openChannel(page, target.name);

  const before = await page.title();
  await page.getByRole('button', { name: /^Próximo canal:/ }).click();
  await expect.poll(() => page.title()).not.toBe(before);
  const osd = page.locator('.osd');
  await expect(osd).toBeVisible();
  await expect(osd.locator('.osd-num')).toHaveText(/^\d{2,3}$/);
  await page.getByRole('button', { name: /^Canal anterior:/ }).click();
  await expect.poll(() => page.title()).toBe(before);
});

test('atalhos do teclado: setas trocam de canal, / busca, ? lista os atalhos, M muda o mudo', async ({ page, request, isMobile }) => {
  test.skip(isMobile, 'atalhos de teclado são do desktop');
  const br = await brChannels(request);
  const target = br.find(playableHls)!;
  await page.route('**/*.m3u8*', deadStream);
  await openChannel(page, target.name);
  await page.locator('body').click({ position: { x: 5, y: 5 } });

  const t0 = await page.title();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.title()).not.toBe(t0);
  const t1 = await page.title();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.title()).not.toBe(t1);

  await page.keyboard.press('m');
  await expect(page.getByRole('button', { name: 'Ativar o som' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('m');
  await expect(page.getByRole('button', { name: 'Silenciar' })).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('/');
  await expect(searchBox(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 5, y: 5 } });

  await page.keyboard.press('Shift+?');
  const help = page.getByRole('dialog', { name: 'Atalhos do teclado' });
  await expect(help).toBeVisible();
  await expect(help).toContainText('Zapear');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
});

test('digitar o número do canal sintoniza o canal', async ({ page, isMobile }) => {
  test.skip(isMobile, 'atalhos de teclado são do desktop');
  const row = page.getByTestId('channel-row').first();
  const num = (await row.locator('.row-num').innerText()).trim();
  const name = (await row.locator('.row-name').innerText()).trim();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  for (const d of num) await page.keyboard.press(d);
  await expect(page.locator('.digits')).toContainText(String(Number(num)));
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('Zapear sorteia um canal que não está offline', async ({ page, request, isMobile }) => {
  const br = await brChannels(request);
  await page.route('**/*.m3u8*', deadStream);
  if (isMobile) await page.getByTestId('zapear').click();
  else {
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('z');
  }
  await expect(page).toHaveURL(/#\/canal\/BR\//);
  const chosen = br.find((c) => c.id === hashId(page.url()));
  expect(chosen).toBeDefined();
  expect(chosen!.status).not.toBe('offline');
});

test('deslizar no player troca de canal (gesto horizontal), mas ignora as bordas da tela', async ({ page, request, isMobile }) => {
  test.skip(!isMobile, 'gestos de toque são do celular');
  const br = await brChannels(request);
  const target = br.find(playableHls)!;
  await page.route('**/*.m3u8*', deadStream);
  await openChannel(page, target.name);

  const t0 = await page.title();
  await swipe(page, '.stage', -140, 0.02); // começou na borda do sistema: ignorado
  await page.waitForTimeout(300);
  expect(await page.title()).toBe(t0);

  await swipe(page, '.stage', -140, 0.7); // deslizar para a esquerda = próximo canal
  await expect.poll(() => page.title()).not.toBe(t0);
  const t1 = await page.title();
  await swipe(page, '.stage', 140, 0.3); // para a direita = anterior
  await expect.poll(() => page.title()).not.toBe(t1);
});

test('canal HTTP que não toca oferece abrir no VLC com um toque, sem copiar link', async ({ page, context, request }, info) => {
  const br = await brChannels(request);
  const target = br.find((c) => c.kind === 'http');
  test.skip(!target, 'sem canal HTTP no Brasil nos dados atuais');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  await page.route(target!.url, (route) => route.abort('failed')); // servidor inalcançável (no site publicado o navegador nem tenta: conteúdo misto)
  await openChannel(page, target!.name);
  const open = page.getByTestId('vlc-open');
  await expect(open).toBeVisible({ timeout: 60_000 });

  if (info.project.name === 'android') {
    // Android: intent direto para o app do VLC
    await expect(open).toHaveAttribute('href', /^intent:\/\/.*package=org\.videolan\.vlc/);
  } else if (info.project.name === 'iphone') {
    await expect(open).toHaveAttribute('href', /^vlc-x-callback:\/\/x-callback-url\/stream\?url=/);
  } else {
    // computador: baixa um .m3u de um canal, que o VLC abre com dois cliques
    const [download] = await Promise.all([page.waitForEvent('download'), open.click()]);
    expect(download.suggestedFilename()).toMatch(/\.m3u$/);
  }
  // o caminho manual continua existindo
  await page.getByRole('button', { name: 'Copiar link' }).click();
  await expect(page.getByRole('button', { name: 'Link copiado' })).toBeVisible();
});

test('HTTP bloqueado no navegador de computador: o passo a passo para liberar abre numa folha', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'a opção "Conteúdo não seguro" só existe no Chromium de computador');
  const br = await brChannels(request);
  const target = br.find((c) => c.kind === 'http');
  test.skip(!target, 'sem canal HTTP no Brasil nos dados atuais');
  // Só numa página HTTPS o bloqueio de conteúdo misto existe; no preview local (http) o teste simula a mesma falha.
  await page.route(target!.url, (route) => route.abort('failed'));
  await page.route(target!.url.replace(/^http:/, 'https:'), (route) => route.abort('failed'));
  await openChannel(page, target!.name);
  const how = page.getByTestId('http-how');
  if (!(await how.isVisible({ timeout: 60_000 }).catch(() => false))) {
    test.skip(!page.url().startsWith('https:'), 'no preview local o HTTP não é conteúdo misto');
  }
  await how.click();
  await expect(page.getByTestId('http-steps')).toContainText('Conteúdo não seguro');
  await expect(page.getByTestId('http-reload')).toBeVisible();
});

test('YouTube incorporável usa o embed oficial (nocookie)', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find((c) => c.kind === 'youtube' && c.youtube?.embeddable);
  test.skip(!target, 'sem YouTube incorporável no Brasil nos dados atuais');
  await page.route('**/youtube-nocookie.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>embed</p>' }));
  await openChannel(page, target!.name);
  await expect(page.locator('iframe[title^="YouTube"]')).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
});

test('favoritos e recentes persistem no localStorage, nas mesmas chaves de sempre', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find((c) => c.kind === 'http' || c.kind === 'other') ?? br[0]!;
  await search(page, target.name);
  const row = page.getByTestId('channel-row').filter({ hasText: target.name }).first();
  await row.getByRole('button', { name: /^Favoritar / }).click();
  await row.locator('.row-main').click();

  const stored = await page.evaluate(() => ({
    fav: JSON.parse(localStorage.getItem('tvlivre:favoritos') ?? '[]') as { id: string; country: string }[],
    rec: JSON.parse(localStorage.getItem('tvlivre:recentes') ?? '[]') as { id: string; country: string }[],
    last: JSON.parse(localStorage.getItem('tvlivre:ultimo') ?? 'null') as { id: string } | null,
  }));
  expect(stored.fav[0]).toEqual({ id: target.id, country: 'BR' });
  expect(stored.rec[0]).toEqual({ id: target.id, country: 'BR' });
  expect(stored.last?.id).toBe(target.id);

  await page.goto('./');
  await page.getByRole('tab', { name: /Favoritos/ }).click();
  await expect(page.getByTestId('channel-list')).toContainText(target.name);
  await page.getByRole('tab', { name: 'Recentes' }).click();
  await expect(page.getByTestId('channel-list')).toContainText(target.name);
});

test('retomada: ao voltar, oferece o último canal', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find((c) => c.kind === 'http') ?? br[0]!;
  await openChannel(page, target.name);
  await page.goto('./');
  const resume = page.getByRole('button', { name: /^Voltar ao canal \d+/ });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page).toHaveTitle(new RegExp(target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('o site funciona mesmo com localStorage indisponível', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'pt-BR' });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('SecurityError: armazenamento bloqueado');
      },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByTestId('channel-row').first()).toBeVisible();
  await page.getByRole('button', { name: /^Favoritar / }).first().click();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('lista virtualizada: milhares de canais, poucas linhas no DOM', async ({ page }) => {
  await page.getByRole('button', { name: /^País:/ }).click();
  await page.getByRole('dialog', { name: 'País e filtros' }).getByRole('combobox', { name: 'País' }).selectOption('ALL');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('result-count')).toContainText(/^\d{1,3}(\.\d{3})+ canais/, { timeout: 60_000 });
  const rendered = await page.getByTestId('channel-row').count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(80);
});

test('sem internet: aviso fixo e o player explica que é preciso conexão', async ({ page, context, request }) => {
  const br = await brChannels(request);
  const target = br.find(playableHls)!;
  await openChannel(page, target.name);
  await context.setOffline(true);
  await expect(page.getByText(/Sem internet\. Seus favoritos continuam aqui/)).toBeVisible();
  await expect(page.getByText('Você está sem internet').first()).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/Sem internet\. Seus favoritos/)).toBeHidden();
});

test.describe('contador de acessos', () => {
  test('aparece na página Sobre com formato brasileiro e não conta em ambiente local', async ({ page, counterCalls }) => {
    await page.goto('./#/sobre');
    const counter = page.getByTestId('contador');
    await expect(counter).toBeVisible();
    await expect(counter).toContainText(COUNTER_VALUE.toLocaleString('pt-BR'));
    await expect(counter).toContainText('acessos');
    expect(counterCalls.every((u) => u.includes('/get/'))).toBe(true); // só leitura; nenhuma visita contada
  });

  test('se o serviço falhar, o contador some e o resto da página continua', async ({ page, context }) => {
    await context.unroute('https://abacus.jasoncameron.dev/**');
    await context.route('https://abacus.jasoncameron.dev/**', (route) => route.abort('failed'));
    await page.goto('./#/sobre');
    await expect(page.getByRole('heading', { name: 'Sobre o TV Livre' })).toBeVisible();
    await expect(page.getByTestId('contador')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Privacidade e contador de acessos' })).toBeVisible();
  });
});

test('página Sobre mantém créditos, aviso de não hospedar vídeo e remoção; recarregar não gera 404', async ({ page }) => {
  await page.goto('./#/sobre');
  await expect(page.getByRole('heading', { name: 'Sobre o TV Livre' })).toBeVisible();
  await expect(page.getByText('não hospeda, retransmite, grava nem passa por proxy')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Free-TV/IPTV' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'iptv-org/iptv' })).toBeVisible();
  await expect(page.getByText('Pedir a remoção de um canal')).toBeVisible();
  const res = await page.reload();
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Sobre o TV Livre' })).toBeVisible();

  const missing = await page.request.get('rota-que-nao-existe/', { failOnStatusCode: false });
  expect([200, 404]).toContain(missing.status());
  expect(await missing.text()).toContain('<div id="root">');
});

test('link direto para um canal mostra o pôster e só toca depois de um toque do usuário', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find(playableHls)!;
  await page.route(target.url, deadStream);
  await page.goto(`./#/canal/BR/${encodeURIComponent(target.id)}`);
  const play = page.getByRole('button', { name: `Tocar ${target.name}` });
  await expect(play).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('alert')).toHaveCount(0); // nada foi carregado sem ação do usuário
  await play.click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 40_000 });
});

test('canal por link direto abre o player após recarregar', async ({ page, request }) => {
  const br = await brChannels(request);
  const target: Channel = br.find((c) => c.kind === 'http') ?? br[0]!;
  await page.goto(`./#/canal/BR/${encodeURIComponent(target.id)}`);
  await expect(page).toHaveTitle(new RegExp(target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await page.reload();
  await expect(page).toHaveTitle(new RegExp(target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('sem rolagem horizontal em nenhuma tela', async ({ page, request }) => {
  const br = await brChannels(request);
  for (const hash of ['#/', '#/sobre', '#/instalar', `#/canal/BR/${encodeURIComponent(br[0]!.id)}`]) {
    await page.goto(`./${hash}`);
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `rolagem horizontal em ${hash}`).toBeLessThanOrEqual(0);
  }
});
