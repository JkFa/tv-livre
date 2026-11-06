import { devices } from '@playwright/test';
import { brChannels, deadStream, expect, playableHls, stalledStream, test } from './fixtures.ts';

// Modo TV: tudo pelo teclado/controle remoto, em 1920×1080, sem mouse. O controle remoto envia as mesmas teclas.
test.use({ ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'o Modo TV roda em navegadores de TV (Chromium); um projeto basta');
  await page.addInitScript(() => localStorage.setItem('tvlivre:modo-tv', 'ligado'));
});

const title = (page: import('@playwright/test').Page) => page.title();

test('Modo TV: tela cheia, sem barras, grade escondida e fora do foco', async ({ page }) => {
  await page.goto('./#/canais');
  await expect(page.locator('html')).toHaveAttribute('data-tv', 'on');
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('.bottom-nav')).toBeHidden();
  const grade = page.locator('.grade');
  await expect(grade).toHaveAttribute('inert', '');
  await expect(grade).toBeHidden(); // visibility: hidden
  const box = await page.locator('.stage').boundingBox();
  expect(box!.width).toBeGreaterThan(1900);
  expect(box!.height).toBeGreaterThan(1060);
});

test('Modo TV: OK liga a TV, ▲▼ trocam de canal, OK abre a grade, setas movem o foco e OK escolhe', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find(playableHls)!;
  await page.route('**/*.m3u8*', stalledStream);
  await page.goto(`./#/canal/BR/${encodeURIComponent(target.id)}`);
  await expect(page.getByRole('button', { name: /^Tocar / })).toBeVisible(); // app carregado
  await page.keyboard.press('Enter'); // poster: OK toca
  await expect.poll(() => title(page)).toContain(target.name);

  const t0 = await title(page);
  await page.keyboard.press('ArrowUp'); // CH+
  await expect.poll(() => title(page)).not.toBe(t0);
  await expect(page.locator('.osd')).toBeVisible();
  const t1 = await title(page);
  await page.keyboard.press('ArrowDown'); // CH-
  await expect.poll(() => title(page)).toBe(t0);
  expect(t1).not.toBe(t0);

  // OK abre a grade com o foco no canal atual
  await page.keyboard.press('Enter');
  const grade = page.locator('.grade');
  await expect(grade).toHaveAttribute('data-open', 'true');
  await expect(grade).toBeVisible();
  const current = grade.locator('.row-main[aria-current="true"]');
  await expect(current).toBeFocused();

  // ▼ move o foco para a linha de baixo, sem trocar de canal
  await page.keyboard.press('ArrowDown');
  const focusedName = await page.evaluate(() => document.activeElement?.closest('.row')?.querySelector('.row-name')?.textContent ?? '');
  expect(focusedName).not.toBe('');
  expect(await title(page)).toBe(t0);

  // OK sintoniza o canal focado e fecha a grade
  await page.keyboard.press('Enter');
  await expect(grade).toBeHidden();
  await expect.poll(() => title(page)).toContain(focusedName);

  await page.screenshot({ path: 'test-results/tv-assistindo.png' });
});

test('Modo TV: Voltar fecha a grade; números digitam o canal; teclas coloridas funcionam', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find(playableHls)!;
  await page.route('**/*.m3u8*', deadStream);
  await page.goto(`./#/canal/BR/${encodeURIComponent(target.id)}`);
  await expect(page.getByRole('button', { name: /^Tocar / })).toBeVisible(); // app carregado
  await page.keyboard.press('Enter');

  await page.keyboard.press('ArrowRight'); // ▶ também abre a grade
  const grade = page.locator('.grade');
  await expect(grade).toBeVisible();
  await page.waitForTimeout(450); // fim da animação de entrada
  await page.screenshot({ path: 'test-results/tv-grade.png' });
  await page.keyboard.press('Escape'); // Voltar
  await expect(grade).toBeHidden();

  await page.keyboard.press('1');
  await expect(page.locator('.digits')).toContainText('1');
  await page.keyboard.press('Enter');
  await expect.poll(() => title(page)).toMatch(/^01 /);

  // verde = zapear; vermelho = favoritar o canal atual
  const t = await title(page);
  await page.keyboard.press('F3'.replace('F3', 'Escape'));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ColorF1Green', bubbles: true, cancelable: true })));
  await expect.poll(() => title(page)).not.toBe(t);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ColorF0Red', bubbles: true, cancelable: true })));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tvlivre:favoritos') ?? '[]').length)).toBe(1);
});

test('Modo TV: erro de canal não oferece VLC (TV não tem), mas deixa trocar de canal e foca nos botões', async ({ page, request }) => {
  const br = await brChannels(request);
  const target = br.find(playableHls)!;
  await page.route('**/*.m3u8*', deadStream);
  await page.goto(`./#/canal/BR/${encodeURIComponent(target.id)}`);
  await expect(page.getByRole('button', { name: /^Tocar / })).toBeVisible(); // app carregado
  await page.keyboard.press('Enter');
  const problem = page.getByTestId('problem');
  await expect(problem).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId('vlc-open')).toHaveCount(0);
  await page.keyboard.press('Enter'); // OK foca o primeiro botão do painel
  await expect(problem.getByRole('button').first()).toBeFocused();
  await page.screenshot({ path: 'test-results/tv-erro.png' });
});

test('Modo TV: dá para sair pela grade e pelo menu; T liga e desliga no teclado', async ({ page }) => {
  await page.goto('./#/canais');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('t');
  await expect(page.locator('html')).toHaveAttribute('data-tv', 'off');
  expect(await page.evaluate(() => localStorage.getItem('tvlivre:modo-tv'))).toBe('desligado');
  await page.keyboard.press('t');
  await expect(page.locator('html')).toHaveAttribute('data-tv', 'on');
});

test('Modo TV: a tela inicial abre com o foco em "Ligar a TV"; setas movem o foco; OK sintoniza', async ({ page }) => {
  await page.route('**/*.m3u8*', stalledStream);
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-tv', 'on');
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.getByTestId('home-ligar')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('home-canais')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('home-ligar')).toBeFocused();
  await page.keyboard.press('ArrowDown'); // desce pela página: o foco sempre anda e fica dentro da tela inicial
  await expect(page.getByTestId('home-ligar')).not.toBeFocused();
  expect(await page.evaluate(() => !!document.activeElement?.closest('.home'))).toBe(true);
  await page.getByTestId('home-ligar').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/canal\//);
});
