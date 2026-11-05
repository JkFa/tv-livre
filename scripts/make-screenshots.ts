/**
 * Capturas de tela do manifesto PWA (public/screenshots). Precisa do build e de `vite preview` rodando:
 *   npm run build && (npm run preview &) && npx tsx scripts/make-screenshots.ts
 */
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/tv-livre/';
const OUT = resolve('public/screenshots');
const browser = await chromium.launch();

const probe = await browser.newContext();
const br = (await (await probe.request.get(`${BASE}data/countries/BR.json`)).json()) as { id: string; name: string; kind: string; cors?: boolean }[];
const pick = br.find((c) => c.name === 'TV Cultura') ?? br.find((c) => c.kind === 'hls')!;
await probe.close();

async function scene(opts: { w: number; h: number; dsf: number; mobile: boolean; theme: 'dark' | 'light'; file: string; sheet?: boolean }) {
  const ctx = await browser.newContext({
    viewport: { width: opts.w, height: opts.h },
    deviceScaleFactor: opts.dsf,
    isMobile: opts.mobile,
    hasTouch: opts.mobile,
    colorScheme: opts.theme,
    locale: 'pt-BR',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}#/canal/BR/${encodeURIComponent(pick.id)}`);
  await page.waitForSelector('[data-testid=player] .poster');
  await page.waitForSelector('[data-testid=channel-row]');
  if (opts.sheet) {
    await page.getByRole('button', { name: /^Filtros/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Notícias', exact: true }).click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, opts.file) });
  await ctx.close();
}

await scene({ w: 360, h: 640, dsf: 3, mobile: true, theme: 'dark', file: 'celular-1.png' });
await scene({ w: 360, h: 640, dsf: 3, mobile: true, theme: 'dark', file: 'celular-2.png', sheet: true });
await scene({ w: 1920, h: 1080, dsf: 1, mobile: false, theme: 'dark', file: 'desktop-1.png' });
await scene({ w: 1920, h: 1080, dsf: 1, mobile: false, theme: 'light', file: 'desktop-2.png' });
await browser.close();
console.log('capturas geradas em public/screenshots');
