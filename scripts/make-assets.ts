/**
 * Gera os ativos de marca em public/ a partir da geometria única da marca (src/brand/mark.ts):
 * ícones PWA (any + maskable), apple-touch-icon, favicon, ícones de atalho, og.png e telas de abertura do iOS.
 *
 *   npx tsx scripts/make-assets.ts
 *
 * Os arquivos gerados são versionados; só é preciso rodar de novo se a marca mudar.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Search, Shuffle, Star } from 'lucide-react';
import { chromium } from '@playwright/test';
import { MARK_DOT, MARK_FRAME_PATH } from '../src/brand/mark.ts';

const ROOT = resolve('.');
const PUB = join(ROOT, 'public');
const TMP = join(ROOT, '.cache', 'assets');
mkdirSync(TMP, { recursive: true });

const INK = '#15110e';
const PAPER = '#f1e9d8';
const ACCENT = '#ff4b2b';
const fontCss = `
@font-face{font-family:'Archivo TV';src:url('${pathToFileURL(join(ROOT, 'src/assets/fonts/archivo-latin-var.woff2'))}');font-weight:100 900;font-stretch:62% 125%}
@font-face{font-family:'Atkinson TV';src:url('${pathToFileURL(join(ROOT, 'src/assets/fonts/atkinson-next-latin-var.woff2'))}');font-weight:200 800}`;

/** Marca centrada em um quadrado de `size`, ocupando `ratio` da largura. */
function markSvg(size: number, ratio: number, frame: string, dot: string): string {
  const s = (size * ratio) / 54.5; // largura visível da moldura ≈ 54,5 unidades
  const tx = size / 2 - 32 * s;
  const ty = size / 2 - 34 * s;
  return `<g transform="translate(${tx} ${ty}) scale(${s})"><path d="${MARK_FRAME_PATH}" fill="none" stroke="${frame}" stroke-width="6.5"/><circle cx="${MARK_DOT.cx}" cy="${MARK_DOT.cy}" r="${MARK_DOT.r}" fill="${dot}"/></g>`;
}

const iconSvg = (size: number, kind: 'any' | 'maskable' | 'touch') => {
  const r = kind === 'any' ? size * 0.22 : 0;
  const ratio = kind === 'maskable' ? 0.46 : 0.56;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${ACCENT}"/>${markSvg(size, ratio, INK, PAPER)}</svg>`;
};

function glyph(Icon: typeof Star, size: number): string {
  return renderToStaticMarkup(createElement(Icon, { size, color: INK, strokeWidth: 2.4, strokeLinecap: 'square', strokeLinejoin: 'miter' }));
}
const shortcutSvg = (Icon: typeof Star) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192"><rect width="192" height="192" rx="42" fill="${ACCENT}"/><g transform="translate(48 48)">${glyph(Icon, 96)}</g></svg>`;

const browser = await chromium.launch();

async function shot(html: string, w: number, h: number, file: string, transparent = false) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const f = join(TMP, 'page.html');
  writeFileSync(f, `<!doctype html><meta charset="utf-8"><style>${fontCss}html,body{margin:0;background:${transparent ? 'transparent' : INK}}</style>${html}`);
  await page.goto(pathToFileURL(f).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
}

// ---- ícones ----
for (const s of [192, 512]) {
  await shot(iconSvg(s, 'any'), s, s, join(PUB, 'icons', `icon-${s}.png`), true);
  await shot(iconSvg(s, 'maskable'), s, s, join(PUB, 'icons', `maskable-${s}.png`));
}
await shot(iconSvg(180, 'touch'), 180, 180, join(PUB, 'icons', 'apple-touch-icon.png'));
await shot(iconSvg(32, 'any'), 32, 32, join(PUB, 'icons', 'favicon-32.png'), true);
for (const [name, Icon] of [['zapear', Shuffle], ['favoritos', Star], ['buscar', Search]] as const) {
  await shot(shortcutSvg(Icon), 192, 192, join(PUB, 'icons', `shortcut-${name}.png`), true);
}
writeFileSync(join(PUB, 'favicon.svg'), iconSvg(64, 'any').replace('width="64" height="64"', ''));

// ---- imagem de compartilhamento (1200×630) ----
const og = `
<div style="width:1200px;height:630px;background:${INK};color:${PAPER};position:relative;overflow:hidden;font-family:'Atkinson TV'">
  <div style="position:absolute;left:0;top:0;bottom:0;width:14px;background:${ACCENT}"></div>
  <div style="position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:22px">
    <svg width="84" height="84" viewBox="0 0 84 84">${markSvg(84, 0.88, PAPER, ACCENT)}</svg>
    <span style="font:850 44px/1 'Archivo TV';font-stretch:125%;letter-spacing:.01em">TV LIVRE</span>
  </div>
  <div style="position:absolute;left:72px;bottom:72px;width:560px">
    <div style="font:850 62px/1.02 'Archivo TV';font-stretch:112%;letter-spacing:-.01em">O controle remoto da TV aberta.</div>
    <div style="margin-top:22px;font:500 28px/1.3 'Atkinson TV';color:#a79e8e">Zapeie por milhares de canais ao vivo, direto no navegador. Sem cadastro, sem anúncios.</div>
  </div>
  <div style="position:absolute;right:56px;top:60px;bottom:40px;display:flex;align-items:center">
    <span style="font:900 560px/0.8 'Archivo TV';font-stretch:66%;color:${ACCENT};letter-spacing:-.02em;font-variant-numeric:tabular-nums">07</span>
  </div>
</div>`;
await shot(og, 1200, 630, join(PUB, 'og.png'));

// ---- telas de abertura do iOS (retrato) ----
const devices: [number, number, number][] = [
  [430, 932, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2],
  [414, 736, 3], [810, 1080, 2], [820, 1180, 2], [834, 1194, 2], [1024, 1366, 2], [744, 1133, 2],
];
for (const [w, h, r] of devices) {
  const W = w * r;
  const H = h * r;
  const m = Math.round(Math.min(W, H) * 0.2);
  const html = `<div style="width:${W}px;height:${H}px;background:${INK};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(m * 0.35)}px">
    <svg width="${m}" height="${m}" viewBox="0 0 ${m} ${m}">${markSvg(m, 0.94, PAPER, ACCENT)}</svg>
    <span style="font:850 ${Math.round(m * 0.2)}px/1 'Archivo TV';font-stretch:125%;color:${PAPER};letter-spacing:.02em">TV LIVRE</span></div>`;
  await shot(html, W, H, join(PUB, 'splash', `splash-${W}x${H}.png`));
}
await browser.close();
console.log('ativos gerados em public/');
