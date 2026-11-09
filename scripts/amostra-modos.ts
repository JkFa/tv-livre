/**
 * Amostra canais NO AR e mede, pelas listas mestras HLS reais, o que cada modo consumiria (MB/h) e quantos têm
 * variante só de áudio. Também conta quantos canais são transmissíveis (podeTransmitir).
 *
 *   npx tsx scripts/amostra-modos.ts [--n 120] [--data-dir public/data]
 *
 * O consumo é o BANDWIDTH declarado na lista (pico por nível), não o medido: serve de ordem de grandeza.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Channel, DataIndex } from '../shared/types.ts';
import { podeTransmitir } from '../src/lib/cast.ts';
import { mbPorHora } from '../src/lib/modo.ts';
import { fetchText } from './lib/fetch-source.ts';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] ?? d) : d;
};
const dir = opt('data-dir', 'public/data');
const N = Number(opt('n', '120'));

const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as DataIndex;
const all: Channel[] = index.countries.flatMap((c) => JSON.parse(readFileSync(join(dir, 'countries', `${c.code}.json`), 'utf8')) as Channel[]);
const online = all.filter((c) => c.status === 'online');

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '–');
console.log('## Canais transmissíveis (podeTransmitir: HLS, HTTPS, CORS ok, sem cabeçalhos)\n');
console.log('| Conjunto | Canais | Transmissíveis | % |\n|---|---:|---:|---:|');
for (const [nome, lista] of [
  ['BR (todos)', all.filter((c) => c.country === 'BR')],
  ['BR (no ar)', online.filter((c) => c.country === 'BR')],
  ['Mundo (todos)', all],
  ['Mundo (no ar)', online],
] as const) {
  const t = lista.filter(podeTransmitir).length;
  console.log(`| ${nome} | ${lista.length} | ${t} | ${pct(t, lista.length)} |`);
}

// amostra determinística (embaralha com semente fixa) de canais no ar tocáveis por HLS em HTTPS
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pool = online.filter((c) => c.kind === 'hls' && /^https:/i.test(c.url) && c.cors !== false);
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [pool[i], pool[j]] = [pool[j]!, pool[i]!];
}
const alvo = pool.slice(0, N);

interface Variante { bw: number; audio: boolean }
const VIDEO = /(avc1|avc3|hvc1|hev1|dvh1|dvhe|vp0?9|vp8|av01|mp4v)/i;
function variantes(texto: string): Variante[] | null {
  if (!texto.includes('#EXT-X-STREAM-INF')) return null; // lista de mídia direta (sem níveis declarados)
  const out: Variante[] = [];
  for (const m of texto.matchAll(/#EXT-X-STREAM-INF:([^\n]*)\n/g)) {
    const attrs = m[1]!;
    const bw = Number(/(?:^|,)BANDWIDTH=(\d+)/.exec(attrs)?.[1] ?? /AVERAGE-BANDWIDTH=(\d+)/.exec(attrs)?.[1] ?? 0);
    const codecs = /CODECS="([^"]*)"/.exec(attrs)?.[1];
    const res = /RESOLUTION=\d+x\d+/.test(attrs);
    out.push({ bw, audio: !!codecs && !VIDEO.test(codecs) && !res });
  }
  return out.filter((v) => v.bw > 0);
}

const resultados: { c: Channel; v: Variante[] | null; erro?: string }[] = [];
let prox = 0;
await Promise.all(
  Array.from({ length: 10 }, async () => {
    for (let i = prox++; i < alvo.length; i = prox++) {
      const c = alvo[i]!;
      try {
        const t = await fetchText(c.url, { retries: 1, timeoutMs: 8000 });
        resultados.push({ c, v: variantes(t) });
      } catch (e) {
        resultados.push({ c, v: null, erro: e instanceof Error ? e.message : String(e) });
      }
    }
  }),
);

const lidos = resultados.filter((r) => !r.erro);
const mestras = lidos.filter((r) => r.v && r.v.length > 0);
const varios = mestras.filter((r) => r.v!.length > 1);
const comAudio = mestras.filter((r) => r.v!.some((x) => x.audio));
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const mediana = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : NaN);

const normalAlto: number[] = [], normalMeio: number[] = [], eco: number[] = [], radio: number[] = [], radioSoAudio: number[] = [];
for (const { v } of mestras) {
  const vid = v!.filter((x) => !x.audio).map((x) => x.bw).sort((a, b) => a - b);
  const aud = v!.filter((x) => x.audio).map((x) => x.bw).sort((a, b) => a - b);
  const base = vid.length ? vid : aud;
  normalAlto.push(mbPorHora(base[base.length - 1]!));
  normalMeio.push(mbPorHora(mediana(base)));
  eco.push(mbPorHora(base[0]!));
  radio.push(mbPorHora(aud[0] ?? base[0]!));
  if (aud.length) radioSoAudio.push(mbPorHora(aud[0]!));
}
const f = (n: number) => (Number.isFinite(n) ? n.toFixed(0) : '–');

console.log(`\n## Amostra: ${alvo.length} canais no ar sorteados (HLS, HTTPS, CORS ok); ${lidos.length} responderam\n`);
console.log('| Medida | Canais | % da amostra que respondeu |\n|---|---:|---:|');
console.log(`| Responderam a lista | ${lidos.length} | ${pct(lidos.length, alvo.length)} |`);
console.log(`| Lista mestra com níveis declarados | ${mestras.length} | ${pct(mestras.length, lidos.length)} |`);
console.log(`| Mais de um nível | ${varios.length} | ${pct(varios.length, lidos.length)} |`);
console.log(`| **Têm variante só de áudio** | ${comAudio.length} | ${pct(comAudio.length, lidos.length)} |`);
console.log(`| Lista de mídia direta (nível único, sem bitrate declarado) | ${lidos.length - mestras.length} | ${pct(lidos.length - mestras.length, lidos.length)} |`);
console.log(`\n## Consumo médio por hora, nos ${mestras.length} canais com lista mestra (BANDWIDTH declarado)\n`);
console.log('| Modo | MB/h médio | Observação |\n|---|---:|---|');
console.log(`| Normal, pior caso (nível mais alto) | ${f(media(normalAlto))} | o automático pode chegar a isso |`);
console.log(`| Normal, nível do meio | ${f(media(normalMeio))} | referência típica de rede média |`);
console.log(`| Econômico (menor vídeo) | ${f(media(eco))} | |`);
console.log(`| Rádio (áudio onde há; senão menor vídeo) | ${f(media(radio))} | média geral, inclui canais sem versão só de áudio |`);
console.log(`| Rádio, só nos ${comAudio.length} canais com variante de áudio | ${f(media(radioSoAudio))} | |`);
const falhas = resultados.filter((r) => r.erro).length;
console.log(`\n(${falhas} sem resposta em 8 s; semente fixa 42.)`);
