// Modelo de custo do serviço de presença contra os limites GRATUITOS da Cloudflare (docs consultadas em 2026-11-09).
//   node custos.mjs                 → tabela com os intervalos atuais
//   node custos.mjs --ping 30       → compara com outro intervalo de ping
// Limites (https://developers.cloudflare.com/workers/platform/limits/ e /durable-objects/platform/pricing/):
//   Workers Free: 100.000 requisições/dia · Durable Objects Free: 100.000 requisições/dia, 13.000 GB-s/dia,
//   100.000 linhas escritas/dia (cada setAlarm = 1 linha), 5 milhões de linhas lidas/dia. Mensagens recebidas contam 20:1;
//   mensagens enviadas e o auto-response do ping não custam duração.
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? Number(process.argv[i + 1]) : d; };

export const LIMITES = { workersReq: 100_000, doReq: 100_000, doGBs: 13_000, doLinhas: 100_000 };
export const PARAMS = {
  sessaoMin: arg('sessao', 20), // duração média de uma visita
  trocasPorSessao: arg('trocas', 6), // zapeadas (cada uma envia 1 mensagem de estado)
  pingS: arg('ping', 60), // intervalo do ping do cliente (auto-response, sem acordar o objeto)
  difusaoS: arg('difusao', 3), // no máximo 1 difusão a cada N s (só se algo mudou)
  gravarS: arg('gravar', 15), // gravação em lote dos contadores
  varreduraS: arg('varredura', 60), // varredura de conexões mortas e descarga de contadores
  verResumo: arg('resumo', 0.02), // fração das sessões que abre a página Sobre (GET /resumo)
  msAtivoPorEvento: arg('ms', 10), // CPU/relógio ativo por evento (estimativa conservadora)
};

/** N pessoas simultâneas, sustentadas por H horas no dia (o resto do dia, zero). */
export function consumo(N, H, p = PARAMS) {
  const sessoes = (N * H * 60) / p.sessaoMin;
  const msgsPorSessao = 1 + p.trocasPorSessao + 1; // assistindo, trocas, navegando/saída
  const pings = (p.sessaoMin * 60) / p.pingS;
  const msgsEntrada = sessoes * (msgsPorSessao + pings);
  const resumo = sessoes * p.verResumo;
  const difusoes = (H * 3600) / p.difusaoS; // pior caso: sempre há mudança
  const varreduras = (24 * 3600) / p.varreduraS; // a varredura roda o dia todo (só enquanto há conexões, então ≤ isto)
  const alarmes = difusoes + Math.min(varreduras, (H * 3600) / p.varreduraS);
  const workersReq = sessoes * 2 + resumo; // upgrade do WebSocket + POST /acesso (+ /resumo)
  const doReq = sessoes * 2 + resumo + msgsEntrada / 20 + alarmes;
  // cada setAlarm = 1 linha (um por difusão, no pior caso) + gravação em lote dos contadores (a cada 15 s) + recordes
  const linhas = difusoes + (H * 3600) / p.gravarS + 100;
  const eventos = sessoes * 2 + msgsEntrada / 20 + alarmes; // acordadas do objeto
  const gbs = (eventos * p.msAtivoPorEvento) / 1000 * 0.125;
  return { sessoes, workersReq, doReq, linhas, gbs };
}
const pct = (v, lim) => `${((v / lim) * 100).toFixed(0)}%`;
const f = (n) => Math.round(n).toLocaleString('pt-BR');
const cabe = (c) => c.workersReq <= LIMITES.workersReq && c.doReq <= LIMITES.doReq && c.linhas <= LIMITES.doLinhas && c.gbs <= LIMITES.doGBs;

/** Maior número de horas por dia (0–24) em que N pessoas simultâneas cabem no plano gratuito (bisseção). */
export function horasMax(N, p = PARAMS) {
  if (cabe(consumo(N, 24, p))) return 24;
  let lo = 0, hi = 24;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (cabe(consumo(N, m, p))) lo = m; else hi = m; }
  return lo;
}

/** Custo mensal no plano pago (US$ 5/mês de mínimo): requisições acima de 10 mi (Workers) / 1 mi (DO) + duração acima de 400 mil GB-s. */
export function custoPago(c, dias = 30) {
  const wReq = Math.max(0, c.workersReq * dias - 10_000_000) / 1e6 * 0.3;
  const dReq = Math.max(0, c.doReq * dias - 1_000_000) / 1e6 * 0.15;
  const dur = Math.max(0, c.gbs * dias - 400_000) / 1e6 * 12.5;
  return 5 + wReq + dReq + dur;
}

if (process.argv[1]?.endsWith('custos.mjs')) {
  console.log(`Parâmetros: sessão ${PARAMS.sessaoMin} min · ${PARAMS.trocasPorSessao} trocas/sessão · ping ${PARAMS.pingS} s · difusão ≥ ${PARAMS.difusaoS} s · varredura ${PARAMS.varreduraS} s\n`);
  console.log('| Simultâneos | Horas/dia nesse nível | Visitas/dia | Requisições Worker (limite 100 mil) | Requisições Durable Object (100 mil) | Linhas escritas (100 mil) | Duração GB-s (13 mil) | Cabe no gratuito? | Se não couber: plano pago/mês |');
  console.log('|---:|---:|---:|---|---|---|---|---|---:|');
  for (const [N, H] of [[100, 8], [100, 24], [1000, 2], [1000, 8], [1000, 24], [5000, 2], [5000, 8]]) {
    const c = consumo(N, H);
    const ok = cabe(c);
    console.log(`| ${f(N)} | ${H} | ${f(c.sessoes)} | ${f(c.workersReq)} (${pct(c.workersReq, LIMITES.workersReq)}) | ${f(c.doReq)} (${pct(c.doReq, LIMITES.doReq)}) | ${f(c.linhas)} (${pct(c.linhas, LIMITES.doLinhas)}) | ${f(c.gbs)} (${pct(c.gbs, LIMITES.doGBs)}) | ${ok ? 'sim' : '**não**'} | ${ok ? '—' : `US$ ${custoPago(c).toFixed(2)}`} |`);
  }
  console.log('\nQuantas horas por dia cada nível de simultâneos cabe no gratuito:');
  for (const N of [100, 1000, 5000]) console.log(`  ${f(N)} simultâneos → até ${horasMax(N).toFixed(1)} h/dia`);
  const msgs = 1 + PARAMS.trocasPorSessao + 1;
  const pings = (PARAMS.sessaoMin * 60) / PARAMS.pingS;
  const doPorVisita = 2 + (msgs + pings) / 20 + PARAMS.verResumo;
  console.log(`\nPor visita: 2 requisições de Worker (WebSocket + acesso) e ≈ ${doPorVisita.toFixed(1)} do Durable Object (2 + (${msgs} mensagens + ${pings} pings)/20).`);
  console.log(`Teto só pelo Worker: ≈ ${f(LIMITES.workersReq / 2)} visitas/dia; o Durable Object (100 mil/dia, incluindo ~${f((24 * 3600) / PARAMS.difusaoS)} alarmes/dia no pior caso) limita antes.`);
}
