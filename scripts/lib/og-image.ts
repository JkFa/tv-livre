/**
 * Prévia 1200×630 por canal (Open Graph): número enorme + nome + marca TV Livre, sem o logo do canal.
 * Mesma geometria de marca, cores e fontes do scripts/make-assets.ts (DESIGN.md).
 */
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { MARK_DOT, MARK_FRAME_PATH } from '../../src/brand/mark.ts';

export interface OgJob {
  number: string;
  name: string;
  /** "Brasil · Notícias" */
  sub: string;
  /** Caminho relativo a `dist`, sem extensão: og/br/globo */
  file: string;
}

const INK = '#15110e';
const PAPER = '#f1e9d8';
const ACCENT = '#ff4b2b';
const MUTED = '#a79e8e';
const ROOT = resolve('.');

const markSvg = (size: number) => {
  const s = (size * 0.88) / 54.5;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g transform="translate(${size / 2 - 32 * s} ${size / 2 - 34 * s}) scale(${s})"><path d="${MARK_FRAME_PATH}" fill="none" stroke="${PAPER}" stroke-width="6.5"/><circle cx="${MARK_DOT.cx}" cy="${MARK_DOT.cy}" r="${MARK_DOT.r}" fill="${ACCENT}"/></g></svg>`;
};

const PAGE = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:'Archivo TV';src:url('${pathToFileURL(join(ROOT, 'src/assets/fonts/archivo-latin-var.woff2'))}');font-weight:100 900;font-stretch:62% 125%}
@font-face{font-family:'Atkinson TV';src:url('${pathToFileURL(join(ROOT, 'src/assets/fonts/atkinson-next-latin-var.woff2'))}');font-weight:200 800}
html,body{margin:0;background:${INK}}
#og{width:1200px;height:630px;background:${INK};color:${PAPER};position:relative;overflow:hidden;font-family:'Atkinson TV'}
#bar{position:absolute;left:0;top:0;bottom:0;width:14px;background:${ACCENT}}
#brand{position:absolute;left:72px;top:56px;display:flex;align-items:center;gap:20px}
#brand span{font:850 36px/1 'Archivo TV';font-stretch:125%;letter-spacing:.01em}
#txt{position:absolute;left:72px;bottom:64px;width:600px}
#sub{font:500 28px/1.2 'Atkinson TV';color:${MUTED};margin-bottom:14px}
#name{font:850 64px/1.04 'Archivo TV';font-stretch:112%;letter-spacing:-.01em;overflow-wrap:anywhere}
#numwrap{position:absolute;right:56px;top:60px;bottom:40px;display:flex;align-items:center}
#num{font:900 560px/0.8 'Archivo TV';font-stretch:66%;color:${ACCENT};letter-spacing:-.02em;font-variant-numeric:tabular-nums}
</style>
<div id="og"><div id="bar"></div>
<div id="brand">${markSvg(64)}<span>TV LIVRE</span></div>
<div id="txt"><div id="sub"></div><div id="name"></div></div>
<div id="numwrap"><span id="num"></span></div></div>
<script>
window.fill = (j) => {
  document.getElementById('num').textContent = j.number;
  document.getElementById('num').style.fontSize = (j.number.length <= 2 ? 560 : j.number.length === 3 ? 420 : 320) + 'px';
  document.getElementById('sub').textContent = j.sub;
  const n = document.getElementById('name'); n.textContent = j.name;
  n.style.fontSize = (j.name.length <= 16 ? 76 : j.name.length <= 28 ? 58 : 44) + 'px';
};
</script>`;

export interface OgResult {
  format: 'png' | 'jpg';
  totalBytes: number;
  fellBack: boolean;
  /** Qualidade JPEG usada (só quando `format` é jpg). */
  quality?: number;
}

/** Qualidades JPEG tentadas, da melhor para a pior, até o total projetado caber no orçamento. */
const QUALITIES = [82, 70, 60, 50, 40];

/**
 * Gera as imagens em `<dist>/<job.file>.png`. Mede as primeiras: se o total projetado passar do orçamento,
 * refaz tudo em JPEG (qualidade 82). Devolve o formato final e o total.
 */
export async function renderOgImages(dist: string, jobs: OgJob[], opts: { budgetBytes: number }): Promise<OgResult> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    mkdirSync(join(ROOT, '.cache'), { recursive: true });
    const html = join(ROOT, '.cache', 'og-page.html');
    writeFileSync(html, PAGE);
    await page.goto(pathToFileURL(html).href);
    await page.evaluate(() => document.fonts.ready);

    const shoot = async (j: OgJob, fmt: 'png' | 'jpg', quality = 82): Promise<number> => {
      await page.evaluate((x) => (window as unknown as { fill: (j: OgJob) => void }).fill(x), j);
      const buf = await page.screenshot(fmt === 'png' ? { type: 'png' } : { type: 'jpeg', quality });
      const f = join(dist, `${j.file}.${fmt}`);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, buf);
      return statSync(f).size;
    };
    const projected = async (sample: OgJob[], fmt: 'png' | 'jpg', q?: number) => {
      let n = 0;
      for (const j of sample) n += await shoot(j, fmt, q);
      return (n / sample.length) * jobs.length;
    };

    // amostra (as maiores prévias costumam ser as de nome longo) para decidir formato e qualidade antes de gastar tempo
    const sample = [...jobs].sort((a, b) => b.name.length - a.name.length).slice(0, Math.min(20, jobs.length));
    const cleanup = (fmt: 'png' | 'jpg') => { for (const j of sample) rmSync(join(dist, `${j.file}.${fmt}`), { force: true }); };
    let fmt: 'png' | 'jpg' = 'png';
    let quality: number | undefined;
    if ((await projected(sample, 'png')) > opts.budgetBytes) {
      cleanup('png');
      fmt = 'jpg';
      for (const q of QUALITIES) {
        quality = q;
        const fits = (await projected(sample, 'jpg', q)) <= opts.budgetBytes;
        if (fits) break;
      }
    }
    let total = 0;
    for (const j of jobs) total += await shoot(j, fmt, quality);
    return { format: fmt, totalBytes: total, fellBack: fmt === 'jpg', ...(quality ? { quality } : {}) };
  } finally {
    await browser.close();
  }
}
