// Teste de carga MANUAL (fora do CI): N conexões simuladas contra o `wrangler dev` local.
//   node carga.mjs                    → 500 conexões por 300 s
//   node carga.mjs --n 1000 --seg 120 → outro tamanho
// Cada cliente se comporta como o site: conecta (espalhado em ~20 s), manda "assistindo" com um canal (zipf: poucos canais
// concentram a maioria), troca de canal a cada 45–90 s, manda "ping" a cada 60 s e lê as difusões. Mede mensagens recebidas
// e o CPU/memória dos processos `workerd` (Linux) para alimentar a tabela de custo (custos.mjs).
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const N = arg('n', 500);
const SEG = arg('seg', 300);
const PORTA = arg('porta', 8795);
const CANAIS = 60;
const TICK = 100; // sysconf(_SC_CLK_TCK) no Linux

const abacus = createServer((_q, r) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end('{"value":0}'); });
await new Promise((ok) => abacus.listen(PORTA + 1, '127.0.0.1', ok));
const estado = mkdtempSync(join(tmpdir(), 'tvlivre-carga-'));
const filho = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--port', String(PORTA), '--ip', '127.0.0.1', '--var', 'AMBIENTE:dev', '--var', `ABACUS_URL:http://127.0.0.1:${PORTA + 1}/get`, '--persist-to', estado], { env: { ...process.env, CI: '1', NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false' }, stdio: 'ignore' });
for (let i = 0; ; i++) {
  try { await fetch(`http://127.0.0.1:${PORTA}/`); break; } catch { if (i > 300) throw new Error('wrangler não subiu'); await new Promise((r) => setTimeout(r, 400)); }
}

/** Processos workerd (Linux): CPU acumulado em segundos e memória residente em MB. */
function workerd() {
  let cpu = 0, rss = 0;
  for (const pid of readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
    try {
      if (!readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('workerd')) continue;
      const st = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
      cpu += (Number(st[11]) + Number(st[12])) / TICK; // utime + stime
      rss += Number(readFileSync(`/proc/${pid}/statm`, 'utf8').split(' ')[1]) * 4096 / 1048576;
    } catch { /* processo sumiu */ }
  }
  return { cpu, rss };
}

const H = { Origin: 'http://127.0.0.1:4173' };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const canalDe = () => `canal${Math.floor(CANAIS * Math.random() ** 2.2)}`; // zipf aproximado
const stats = { abertas: 0, falhas: 0, recebidas: 0, bytes: 0, enviadas: 0, pings: 0, pongs: 0, porCliente: new Array(N).fill(0), maiorOnline: 0, maiorAssistindo: 0 };
const clientes = [];
const antes = workerd();
const t0 = Date.now();

function cliente(i) {
  return new Promise((ok) => {
    const ip = `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
    const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws`, { headers: { ...H, 'CF-Connecting-IP': ip } });
    const timers = [];
    ws.on('open', () => {
      stats.abertas++;
      const zapa = () => { ws.send(JSON.stringify({ t: 'estado', s: 'assistindo', c: canalDe(), p: 'BR' })); stats.enviadas++; };
      zapa();
      const proxZap = () => timers.push(setTimeout(() => { if (ws.readyState === 1) { zapa(); proxZap(); } }, 45_000 + Math.random() * 45_000));
      proxZap();
      timers.push(setInterval(() => { if (ws.readyState === 1) { ws.send('ping'); stats.pings++; } }, 60_000));
      fetch(`http://127.0.0.1:${PORTA}/acesso`, { method: 'POST', headers: { ...H, 'CF-Connecting-IP': ip } }).catch(() => {});
      ok();
    });
    ws.on('message', (d) => {
      const t = String(d);
      stats.bytes += t.length;
      if (t === 'pong') return void stats.pongs++;
      stats.recebidas++; stats.porCliente[i]++;
      try { const j = JSON.parse(t); stats.maiorOnline = Math.max(stats.maiorOnline, j.online); stats.maiorAssistindo = Math.max(stats.maiorAssistindo, j.assistindo); } catch { /* ignora */ }
    });
    ws.on('error', () => { stats.falhas++; ok(); });
    ws.on('close', () => timers.forEach((t) => (clearTimeout(t), clearInterval(t))));
    clientes.push({ ws, timers });
  });
}

console.log(`Carga: ${N} conexões por ${SEG} s contra wrangler dev (porta ${PORTA})…`);
const abrindo = [];
for (let i = 0; i < N; i++) { abrindo.push(cliente(i)); await dorme(20_000 / N); }
await Promise.all(abrindo);
console.log(`  ${stats.abertas} conexões abertas em ${((Date.now() - t0) / 1000).toFixed(1)} s (${stats.falhas} falhas)`);
const amostras = [];
const fim = t0 + SEG * 1000;
while (Date.now() < fim) { await dorme(5000); amostras.push(workerd()); }
const depois = workerd();
const dur = (Date.now() - t0) / 1000;
const rs = await (await fetch(`http://127.0.0.1:${PORTA}/resumo`, { headers: H })).json();
clientes.forEach(({ ws }) => ws.terminate());
filho.kill('SIGTERM'); await dorme(1500); filho.kill('SIGKILL');
abacus.close(); rmSync(estado, { recursive: true, force: true });

const ord = [...stats.porCliente].sort((a, b) => a - b);
const cpu = depois.cpu - antes.cpu;
const r = {
  conexoes: N, abertas: stats.abertas, falhas: stats.falhas, duracao_s: Math.round(dur),
  resumo_final: { online: rs.online, assistindo: rs.assistindo, canais_publicos_no_top: rs.top.length },
  maior_online_visto: stats.maiorOnline,
  mensagens_do_cliente_para_o_servico: { estado: stats.enviadas, ping: stats.pings, pong_recebidos: stats.pongs },
  difusoes_recebidas_por_cliente: { mediana: ord[Math.floor(N / 2)], max: ord.at(-1), por_minuto_mediana: +(ord[Math.floor(N / 2)] / (dur / 60)).toFixed(1) },
  total_difusoes_enviadas: stats.recebidas,
  bytes_recebidos_total: stats.bytes,
  bytes_por_difusao_media: Math.round(stats.bytes / Math.max(1, stats.recebidas)),
  cpu_workerd_s: +cpu.toFixed(1),
  cpu_percent_de_um_nucleo: +((cpu / dur) * 100).toFixed(1),
  memoria_workerd_mb: { pico: Math.round(Math.max(...amostras.map((a) => a.rss), depois.rss)) },
};
console.log(JSON.stringify(r, null, 2));
process.exit(0);
