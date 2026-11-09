// Mede o ASR no navegador (Chromium headless, WASM): download, carga fria e morna, tempo de inferência, memória e texto.
// Uso: node medir-asr.mjs <perfil> [clipes separados por vírgula]
//   perfis: tiny-wasm1 | base-wasm1 | base-wasm4 | small-wasm4 | base-gpu | small-gpu
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/janus/tv-livre/package.json');
const { chromium } = require('playwright-core');

const IDIOMA = { en: 'english', es: 'spanish', ru: 'russian', fr: 'french', ja: 'japanese' };
const PERFIS = {
  'tiny-wasm1': { modelo: 'onnx-community/whisper-tiny', dtype: 'q8', device: 'wasm', threads: 1, porta: 8101 },
  'base-wasm1': { modelo: 'onnx-community/whisper-base', dtype: 'q8', device: 'wasm', threads: 1, porta: 8101 },
  'base-wasm4': { modelo: 'onnx-community/whisper-base', dtype: 'q8', device: 'wasm', threads: 4, porta: 8102 },
  'small-wasm4': { modelo: 'onnx-community/whisper-small', dtype: 'q8', device: 'wasm', threads: 4, porta: 8102 },
  'base-gpu': { modelo: 'onnx-community/whisper-base', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, device: 'webgpu', threads: 1, porta: 8101 },
  'small-gpu': { modelo: 'onnx-community/whisper-small', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, device: 'webgpu', threads: 1, porta: 8101 },
};
const nome = process.argv[2];
const cfg = PERFIS[nome];
if (!cfg) throw new Error(`perfil: ${Object.keys(PERFIS).join(' | ')}`);
const clipes = (process.argv[3] ?? 'en,es,ru,fr,ja').split(',').filter((c) => existsSync(`clips/${c}.wav`));
const dir = `${process.cwd()}/.perfil-${cfg.porta}`;

const rssMB = () => {
  const l = execSync('ps -eo rss=,args=', { encoding: 'utf8' }).split('\n').filter((x) => x.includes(`user-data-dir=${dir}`));
  return Math.round(l.reduce((s, x) => s + Number(x.trim().split(/\s+/)[0]), 0) / 1024);
};
const livreMB = () => Number(execSync("free -m | awk 'NR==2{print $7}'", { encoding: 'utf8' }));

const ctx = await chromium.launchPersistentContext(dir, {
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on('console', (m) => console.log(`  [página] ${m.type()}: ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => console.log(`  [erro da página] ${String(e).slice(0, 300)}`));
page.on('requestfailed', (r) => console.log(`  [falha de rede] ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
await page.goto(`http://127.0.0.1:${cfg.porta}/`);
await page.waitForFunction(() => window.poc);
const info = await page.evaluate(() => window.poc.info());
const saida = { perfil: nome, config: cfg, info, memoriaLivreAntesMB: livreMB(), rssAntesMB: rssMB() };
console.log(`[${nome}] isolado=${info.isolado} nucleos=${info.nucleos} webgpu=${info.webgpu} adaptador=${JSON.stringify(info.adaptador)}`);
if (cfg.device === 'webgpu' && !info.adaptador) {
  console.log(`[${nome}] sem adaptador WebGPU neste navegador headless: perfil não medido aqui`);
  saida.erro = 'sem WebGPU';
  writeFileSync(`resultados/asr-${nome}.json`, JSON.stringify(saida, null, 1));
  await ctx.close();
  process.exit(0);
}

// carga: 1ª vez baixa (fria, se o cache do perfil estiver vazio); 2ª vez lê do cache (morna)
const carga1 = await page.evaluate((c) => window.poc.carregar(c), cfg);
saida.carga1 = { ms: Math.round(carga1.ms), bytesMB: +(carga1.bytes / 1e6).toFixed(1) };
saida.rssPosCargaMB = rssMB();
console.log(`[${nome}] carga 1: ${saida.carga1.ms} ms, download/arquivos ${saida.carga1.bytesMB} MB, RSS ${saida.rssPosCargaMB} MB`);
await page.reload();
await page.waitForFunction(() => window.poc);
const carga2 = await page.evaluate((c) => window.poc.carregar(c), cfg);
saida.carga2 = { ms: Math.round(carga2.ms), bytesMB: +(carga2.bytes / 1e6).toFixed(1) };
console.log(`[${nome}] carga 2 (cache): ${saida.carga2.ms} ms`);

saida.clipes = {};
for (const c of clipes) {
  await page.evaluate((x) => window.poc.baixarClipe(x), c);
  const janela = await page.evaluate(([x, l]) => window.poc.transcrever(x, l, 8), [c, IDIOMA[c]]); // janela de 8 s (uso ao vivo)
  const completo = await page.evaluate(([x, l]) => window.poc.transcrever(x, l), [c, IDIOMA[c]]); // 30 s inteiros
  saida.clipes[c] = {
    janela8s: { ms: Math.round(janela.ms), rtf: +(janela.ms / 1000 / janela.duracaoS).toFixed(2), texto: janela.texto.trim() },
    completo30s: { ms: Math.round(completo.ms), rtf: +(completo.ms / 1000 / completo.duracaoS).toFixed(2), texto: completo.texto.trim() },
  };
  console.log(`[${nome}] ${c}: 8s ${janela.ms | 0} ms (RTF ${saida.clipes[c].janela8s.rtf}) | 30s ${completo.ms | 0} ms (RTF ${saida.clipes[c].completo30s.rtf})`);
}
saida.rssPosInferenciaMB = rssMB();
saida.memoriaLivreDepoisMB = livreMB();
console.log(`[${nome}] RSS final ${saida.rssPosInferenciaMB} MB | memória livre do sistema ${saida.memoriaLivreDepoisMB} MB`);
writeFileSync(`resultados/asr-${nome}.json`, JSON.stringify(saida, null, 1));
await ctx.close();
