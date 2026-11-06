import { brChannels, expect, test } from './fixtures.ts';

const BASE = '/tv-livre/';

test.describe('PWA', () => {
  test.use({ serviceWorkers: 'allow' });

  test('manifesto: escopo, início, ícones, atalhos e capturas de tela apontam para /tv-livre/', async ({ page, request }) => {
    await page.goto('./#/canais');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toMatch(/manifest\.webmanifest$/);
    const res = await request.get(href!);
    expect(res.ok()).toBeTruthy();
    const m = await res.json();
    expect(m).toMatchObject({ lang: 'pt-BR', display: 'standalone', scope: BASE, start_url: BASE, id: BASE, theme_color: '#15110e', background_color: '#15110e' });
    expect(m.name).toContain('TV Livre');
    expect(m.short_name).toBe('TV Livre');
    expect(m.description).toMatch(/TV aberta/);
    const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable']));
    expect(m.shortcuts.map((s: { name: string }) => s.name)).toEqual(['Zapear', 'Favoritos', 'Buscar canal']);
    expect(m.screenshots.some((s: { form_factor: string }) => s.form_factor === 'narrow')).toBe(true);
    expect(m.screenshots.some((s: { form_factor: string }) => s.form_factor === 'wide')).toBe(true);

    const urls = [...m.icons.map((i: { src: string }) => i.src), ...m.shortcuts.flatMap((s: { icons: { src: string }[]; url: string }) => [...s.icons.map((i) => i.src)]), ...m.screenshots.map((s: { src: string }) => s.src)];
    for (const u of urls) {
      const r = await request.get(new URL(u, new URL(href!, page.url())).href);
      expect(r.ok(), `${u} deve existir`).toBeTruthy();
    }
    for (const s of m.shortcuts as { url: string }[]) expect(s.url.startsWith(BASE)).toBe(true);
  });

  test('metadados: apple-touch-icon, telas de abertura do iOS, Open Graph e canonical', async ({ page, request }) => {
    await page.goto('./#/canais');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /icons\/apple-touch-icon\.png$/);
    expect(await page.locator('link[rel="apple-touch-startup-image"]').count()).toBeGreaterThanOrEqual(10);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://jkfa.github.io/tv-livre/og.png');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
    const og = await request.get('og.png');
    expect(og.ok()).toBeTruthy();
    const splash = await page.locator('link[rel="apple-touch-startup-image"]').first().getAttribute('href');
    expect((await request.get(splash!)).ok()).toBeTruthy();
  });

  test('service worker registra com escopo /tv-livre/ e controla a página', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Service worker validado no Chromium; WebKit coberto nos demais testes');
    await page.goto('./#/canais');
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe(BASE);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const caches = await page.evaluate(async () => (await window.caches.keys()));
    expect(caches.some((k) => k.includes('precache'))).toBe(true);
  });

  test('offline: abre o app, mostra favoritos e explica que é preciso conexão; vídeo nunca é guardado', async ({ page, context, request, browserName }) => {
    test.skip(browserName !== 'chromium', 'Service worker validado no Chromium');
    const br = await brChannels(request);
    const target = br.find((c) => c.kind === 'http') ?? br[0]!;

    await page.goto('./#/canais');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // a partir daqui o SW intercepta e guarda os dados (stale-while-revalidate)
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.getByRole('searchbox').fill(target.name);
    await page.getByTestId('channel-row').filter({ hasText: target.name }).first().getByRole('button', { name: /^Favoritar / }).click();
    await page.reload();
    await expect(page.getByTestId('channel-row').first()).toBeVisible();
    await expect.poll(() => page.evaluate(async () => (await (await window.caches.open('tvlivre-dados')).keys()).length)).toBeGreaterThanOrEqual(2);

    await context.setOffline(true);
    await page.reload(); // sem rede: o shell vem do pré-cache e os dados do cache
    await expect(page.getByText(/Sem internet\. Seus favoritos continuam aqui/)).toBeVisible();
    await page.getByRole('tab', { name: /Favoritos/ }).click();
    await expect(page.getByTestId('channel-list')).toContainText(target.name);
    await page.getByTestId('channel-row').filter({ hasText: target.name }).first().locator('.row-main').click();
    await expect(page.getByText(/precisa de internet|sem internet|Sem conexão|é preciso conexão|Você está sem internet/i).first()).toBeVisible();

    // nenhum cache contém vídeo (segmentos .ts/.m4s ou manifestos .m3u8)
    const cachedUrls = await page.evaluate(async () => {
      const out: string[] = [];
      for (const k of await window.caches.keys()) for (const r of await (await window.caches.open(k)).keys()) out.push(r.url);
      return out;
    });
    expect(cachedUrls.filter((u) => /\.(m3u8|ts|m4s|mp4)(\?|$)/.test(u))).toEqual([]);
    await context.setOffline(false);
  });

  test('instalação: botão "Instalar" com beforeinstallprompt; some durante a reprodução', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium', 'beforeinstallprompt é do Chromium');
    void isMobile;
    await page.goto('./#/canais');
    await expect(page.getByTestId('channel-row').first()).toBeVisible();
    await page.evaluate(() => {
      const ev = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => {
          (window as unknown as { __prompted: boolean }).__prompted = true;
        },
        userChoice: Promise.resolve({ outcome: 'accepted' as const }),
      });
      window.dispatchEvent(ev);
    });
    const btn = page.getByRole('button', { name: 'Instalar', exact: true });
    await expect(btn).toBeVisible();
    await btn.click();
    expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true);
    await expect(btn).toBeHidden(); // evento consumido
  });

  test('modo standalone: sem convite de instalação e página Instalar confirma', async ({ page, context }) => {
    // O Playwright sobrescreve o display-mode emulado via CDP a cada navegação; simulamos o app instalado pela API de mídia.
    await context.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => {
        const mq = real(q);
        return /display-mode:\s*standalone/.test(q) ? new Proxy(mq, { get: (t, k) => (k === 'matches' ? true : Reflect.get(t, k) instanceof Function ? (Reflect.get(t, k) as (...a: unknown[]) => unknown).bind(t) : Reflect.get(t, k)) }) : mq;
      };
    });
    await page.goto('./#/instalar');
    expect(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches)).toBe(true);
    await expect(page.getByText('Você já está usando o aplicativo instalado.')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: 'dismissed' }) })));
    await expect(page.getByRole('button', { name: 'Instalar', exact: true })).toHaveCount(0);
    await page.goto('./#/canais');
    await expect(page.getByRole('button', { name: /Ligar a TV|Voltar ao canal/ })).toBeVisible(); // o app funciona normalmente
  });

  test('iPhone: instruções de instalação (Compartilhar > Adicionar à Tela de Início) e dispensa', async ({ page, browserName, isMobile }) => {
    test.skip(!(browserName === 'webkit' && isMobile), 'só no iPhone emulado');
    await page.goto('./#/canais');
    const bar = page.locator('.bar-install');
    await expect(bar).toContainText('Adicionar à Tela de Início');
    await bar.getByRole('button', { name: /Dispensar/ }).click();
    await expect(bar).toBeHidden();
    await page.reload();
    await expect(page.locator('.bar-install')).toBeHidden(); // dispensado: respeitado
    await page.goto('./#/instalar');
    await expect(page.getByRole('heading', { name: 'iPhone e iPad (Safari)' })).toBeVisible();
  });

  test('página Instalar tem instruções para Android, iPhone, computador e outros', async ({ page }) => {
    await page.goto('./#/instalar');
    for (const h of ['Android (Chrome, Edge, Samsung Internet)', 'iPhone e iPad (Safari)', 'Computador (Chrome, Edge)', 'Firefox e outros navegadores', 'Funciona sem internet?']) {
      await expect(page.getByRole('heading', { name: h })).toBeVisible();
    }
  });

  test('atalhos do manifesto: #/favoritos e #/buscar executam a ação e abrem o aparelho (#/canais)', async ({ page }) => {
    await page.goto('./#/favoritos');
    await expect(page.getByRole('tab', { name: /Favoritos/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/#\/canais$/);
    await page.goto('./#/buscar');
    await expect(page.getByRole('searchbox', { name: 'Buscar canal pelo nome' })).toBeFocused();
    await page.goto('./#/zapear');
    await expect(page).toHaveURL(/#\/canal\/BR\//);
  });
});
