// Captura 30 s de áudio (16 kHz mono) de canais de notícias reais ao vivo, um por idioma, para medir o ASR.
// Uso: node capturar-clipes.mjs   → clips/<idioma>.wav + clips/<idioma>.json. Os clipes NÃO vão para o git (conteúdo de emissoras).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';

const DATA = '../../public/data';
const ALVOS = { en: 'eng', es: 'spa', ru: 'rus', fr: 'fra', ja: 'jpn' };
mkdirSync('clips', { recursive: true });
const idx = JSON.parse(readFileSync(`${DATA}/index.json`, 'utf8'));
const todos = idx.countries.flatMap((c) => JSON.parse(readFileSync(`${DATA}/countries/${c.code}.json`, 'utf8')));

const rodar = (url) =>
  new Promise((res) => {
    const saida = `clips/_tmp_${Math.random().toString(36).slice(2)}.wav`;
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-t', '30', '-i', url, '-vn', '-ac', '1', '-ar', '16000', '-af', 'volumedetect', saida], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    const t = setTimeout(() => p.kill('SIGKILL'), 50_000);
    p.on('close', () => {
      clearTimeout(t);
      let tam = 0;
      try { tam = statSync(saida).size; } catch { /* sem arquivo */ }
      res({ saida, tam, err });
    });
  });

async function volumeMedio(arq) {
  return new Promise((res) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-i', arq, '-af', 'volumedetect', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let e = '';
    p.stderr.on('data', (d) => (e += d));
    p.on('close', () => res(Number(/mean_volume: (-?[\d.]+) dB/.exec(e)?.[1] ?? -99)));
  });
}

async function tentar(lang, iso) {
  const cands = todos
    .filter((c) => c.kind === 'hls' && /^https:/.test(c.url) && c.cors !== false && c.languages.includes(iso))
    .sort((a, b) => Number(b.categories.includes('news')) - Number(a.categories.includes('news')) || Number(b.sources[0] === 'free-tv') - Number(a.sources[0] === 'free-tv'))
    .slice(0, 25);
  for (const c of cands) {
    const r = await rodar(c.url);
    if (r.tam >= 900_000) {
      const vol = await volumeMedio(r.saida);
      if (vol > -38) {
        const dest = `clips/${lang}.wav`;
        const { renameSync } = await import('node:fs');
        renameSync(r.saida, dest);
        writeFileSync(`clips/${lang}.json`, JSON.stringify({ idioma: lang, canal: c.name, pais: c.country, categorias: c.categories, url: c.url, volumeMedioDb: vol, bytes: r.tam }, null, 1));
        console.log(`[${lang}] ok: ${c.name} (${c.country}) volume ${vol} dB`);
        return true;
      }
    }
    try { (await import('node:fs')).unlinkSync(r.saida); } catch { /* nada */ }
  }
  console.log(`[${lang}] nenhum canal servido nos ${cands.length} candidatos`);
  return false;
}
// 2 idiomas por vez (leve para a máquina)
const langs = Object.entries(ALVOS);
for (let i = 0; i < langs.length; i += 2) await Promise.all(langs.slice(i, i + 2).map(([l, iso]) => tentar(l, iso)));
for (const f of readdirSync('clips')) if (f.startsWith('_tmp_')) (await import('node:fs')).unlinkSync(`clips/${f}`);
console.log('fim');
