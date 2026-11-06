import { brChannels, COUNTER_VALUE, expect, playableHls, test } from './fixtures.ts';

// Tela inicial: porta de entrada para os canais. Roda no build local e no site publicado.

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('home-ligar')).toBeVisible();
});

test('tela inicial: uma ideia, uma ação principal, números reais e navegação para os canais', async ({ page }) => {
  await expect(page).toHaveTitle(/TV Livre/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Zapeie a TV aberta do mundo.');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const stats = page.getByRole('group', { name: 'A TV Livre em números' }).or(page.locator('dl.stats'));
  await expect(stats).toContainText('canais');
  await expect(stats).toContainText('no ar agora');
  await expect(page.getByRole('heading', { name: /^No ar agora · Brasil/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Por assunto' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Outros países' })).toBeVisible();
  // o app (player + grade) vive em #/canais
  await page.getByTestId('home-canais').click();
  await expect(page).toHaveURL(/#\/canais$/);
  await expect(page.getByTestId('channel-row').first()).toBeVisible();
});

test('"Ligar a TV" sintoniza um canal e o Voltar do navegador volta para o início', async ({ page }) => {
  await page.getByTestId('home-ligar').click();
  await expect(page).toHaveURL(/#\/canal\//);
  await expect(page.locator('.player')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('home-ligar')).toBeVisible();
});

test('destaque da vitrine abre o canal anunciado', async ({ page }) => {
  const screen = page.getByTestId('home-destaque');
  await expect(screen).toHaveAccessibleName(/^Assistir canal \d+ /);
  const name = (await screen.locator('.hs-name').textContent()) ?? '';
  expect(name).not.toBe('');
  await screen.click();
  await expect(page).toHaveURL(/#\/canal\//);
  await expect.poll(() => page.title()).toContain(name);
});

test('digitar o número do canal leva direto a ele; número que não existe avisa', async ({ page }) => {
  const input = page.getByLabel(/Sabe o número do canal/);
  await input.fill('99999'); // limitado a 4 dígitos
  await expect(input).toHaveValue('9999');
  await page.getByRole('button', { name: 'Ir', exact: true }).click();
  await expect(page.getByText(/Não existe canal 9999 na grade de Brasil/)).toBeVisible();
  await input.fill('2');
  await page.getByRole('button', { name: 'Ir', exact: true }).click();
  await expect(page).toHaveURL(/#\/canal\//);
});

test('assunto da tela inicial abre a grade já filtrada', async ({ page }) => {
  await page.locator('.cat').first().scrollIntoViewIfNeeded();
  const name = (await page.locator('.cat-name').first().textContent()) ?? '';
  await page.locator('.cat').first().click();
  await expect(page).toHaveURL(/#\/canais$/);
  await expect(page.getByRole('button', { name: `Remover filtro ${name}` })).toBeVisible();
  await expect(page.getByTestId('channel-row').first()).toBeVisible();
});

test('escolher outro país na tela inicial troca a vitrine sem sair dela', async ({ page }) => {
  const other = page.locator('.country[aria-pressed="false"]').filter({ hasNotText: 'Todos os países' }).first();
  await other.scrollIntoViewIfNeeded();
  const name = (await other.locator('.country-name').textContent()) ?? '';
  await other.click();
  await expect(page.getByRole('heading', { name: new RegExp(`^No ar agora · ${name}`) })).toBeVisible();
  await expect(page).toHaveURL(/#\/$|\/tv-livre\/?$|\/$/);
});

test('"Todos os países" abre a grade com o mundo todo', async ({ page }) => {
  await page.getByRole('button', { name: /Todos os países/ }).click();
  await expect(page).toHaveURL(/#\/canais$/);
  await expect(page.getByRole('button', { name: /^País: Todos os países/ })).toBeVisible();
});

test('favoritos e vistos há pouco aparecem na tela inicial', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find(playableHls) ?? br[0]!;
  await page.addInitScript(
    (c) => {
      localStorage.setItem('tvlivre:favoritos', JSON.stringify([{ id: c.id, country: 'BR' }]));
      localStorage.setItem('tvlivre:recentes', JSON.stringify([{ id: c.id, country: 'BR' }]));
      localStorage.setItem('tvlivre:ultimo', JSON.stringify({ id: c.id, country: 'BR' }));
    },
    target,
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Seus favoritos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vistos há pouco' })).toBeVisible();
  await expect(page.getByTestId('home-ligar')).toContainText(target.name);
});

test('barra de navegação do celular e menu do computador levam à tela inicial', async ({ page, isMobile }) => {
  await page.getByTestId('home-canais').click();
  await expect(page).toHaveURL(/#\/canais$/);
  const nav = isMobile ? page.getByRole('navigation', { name: 'Navegação principal' }) : page.getByRole('navigation', { name: 'Principal' });
  await nav.getByText('Início', { exact: true }).click();
  await expect(page.getByTestId('home-ligar')).toBeVisible();
  await expect(nav.getByText('Início', { exact: true })).toBeVisible();
});

test('só a tela inicial rola: a página (topo e navegação) fica parada', async ({ page }) => {
  const m = await page.evaluate(() => ({ doc: document.scrollingElement!.scrollHeight, view: document.scrollingElement!.clientHeight }));
  expect(m.doc).toBeLessThanOrEqual(m.view);
});

test('não rola para os lados em nenhuma largura', async ({ page }) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth + (document.querySelector('.home')!.scrollWidth - document.querySelector('.home')!.clientWidth));
  expect(over).toBeLessThanOrEqual(0);
});

test('contador de acessos e região de quem acessa ficam visíveis na tela inicial', async ({ page }) => {
  const strip = page.getByTestId('visitas-home');
  await strip.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('visitas-total')).toHaveText(COUNTER_VALUE.toLocaleString('pt-BR'));
  await expect(strip).toContainText('acessos ao site');
  await expect(page.getByTestId('visitas-regiao')).toHaveText('Minas Gerais, Brasil');
  await expect(strip).toContainText('Você está acessando de');
});

test('no computador, acessos e região também ficam fixos no topo', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a faixa do topo é só do computador; no celular os dados ficam na tela inicial');
  const chip = page.getByTestId('visitas-chip');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(`${COUNTER_VALUE.toLocaleString('pt-BR')} acessos`);
  await expect(chip).toContainText('Minas Gerais, Brasil');
  await page.getByTestId('home-canais').click();
  await expect(chip).toBeVisible(); // continua lá no aparelho
});

test('se o serviço de região falhar, só a região some', async ({ page, context }) => {
  await context.unroute('https://ipwho.is/**');
  await context.route('https://ipwho.is/**', (route) => route.abort('failed'));
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByTestId('home-ligar')).toBeVisible();
  await expect(page.getByTestId('visitas-total')).toHaveText(COUNTER_VALUE.toLocaleString('pt-BR'));
  await expect(page.getByTestId('visitas-regiao')).toHaveCount(0);
});

test('a consulta de região pede só estado e país e não manda nada do usuário', async ({ page, context }) => {
  const urls: string[] = [];
  await context.unroute('https://ipwho.is/**');
  await context.route('https://ipwho.is/**', (route) => {
    urls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"success":true,"country":"Brasil","country_code":"BR","region":"Minas Gerais"}' });
  });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByTestId('visitas-regiao')).toBeVisible();
  expect(urls).toHaveLength(1);
  expect(urls[0]).toContain('fields=success,country,country_code,region');
  expect(urls[0]).not.toMatch(/city/);
  await page.reload(); // a sessão guarda a resposta: não pergunta de novo
  await expect(page.getByTestId('visitas-regiao')).toBeVisible();
  expect(urls).toHaveLength(1);
});
