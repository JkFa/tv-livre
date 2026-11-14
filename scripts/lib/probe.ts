import type { Channel, HealthEntry, HealthFile, Status, StreamKind } from '../../shared/types.ts';
import { shortHash } from './normalize.ts';

export interface ProbeOptions {
  timeoutMs: number;
  concurrency: number;
  perHost: number;
  /** Origem do site; enviada no cabeçalho Origin para detectar se o servidor libera CORS. */
  siteOrigin: string;
  userAgent: string;
}

export const DEFAULT_PROBE: ProbeOptions = {
  timeoutMs: 10_000,
  concurrency: 80,
  perHost: 4,
  siteOrigin: 'https://jkfa.github.io',
  userAgent: 'Mozilla/5.0 (compatible; TVLivreBot/1.0; +https://github.com/JkFa/tv-livre)',
};

export interface ProbeTarget {
  url: string;
  kind: StreamKind;
  headers?: { userAgent?: string; referrer?: string };
}

export interface ProbeOutcome {
  ok: boolean;
  /** Falha certa (link morto) em vez de talvez-bloqueio/instabilidade. */
  definitive: boolean;
  reason: string;
  /** undefined = sem resposta HTTP, não dá para saber */
  cors?: boolean;
  /** Tipo real descoberto pelo conteúdo (ex.: https sem .m3u8 que na verdade é HLS). */
  kind?: StreamKind;
  /** Tempo até os cabeçalhos da resposta, em ms (só quando houve resposta). */
  latencyMs?: number;
  /** Altura da maior variante anunciada (lista mestre HLS com RESOLUTION=), quando houver. */
  height?: number;
}

/** Maior altura entre as variantes de uma lista mestre HLS (`RESOLUTION=1920x1080`), ou undefined. */
export function maxHeight(playlist: string): number | undefined {
  let max = 0;
  for (const m of playlist.matchAll(/#EXT-X-STREAM-INF:[^\n]*?RESOLUTION=(\d{2,5})x(\d{2,5})/gi)) {
    const h = Number(m[2]);
    if (h > max && h <= 4320) max = h;
  }
  return max || undefined;
}

/** "1080p" a partir da altura; alturas fora do padrão (ex.: 404) arredondam para a faixa comum mais próxima abaixo. */
export function resolutionLabel(height: number | undefined): string | undefined {
  if (!height) return undefined;
  const steps = [2160, 1440, 1080, 720, 576, 480, 360, 240];
  const s = steps.find((x) => height >= x * 0.95);
  return s ? `${s}p` : `${height}p`;
}

const DEAD_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'UND_ERR_INVALID_ARG',
]);

function errorCode(err: unknown): string {
  const e = err as { name?: string; code?: string; cause?: { code?: string; name?: string; errors?: { code?: string }[] } };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'TIMEOUT';
  // Em redes com IPv4+IPv6 o Node devolve um AggregateError, com os códigos dentro de `errors`.
  const codes = [e?.cause?.code, e?.code, ...(e?.cause?.errors ?? []).map((x) => x.code)].filter((c): c is string => !!c);
  return codes.find((c) => DEAD_CODES.has(c)) ?? codes[0] ?? e?.cause?.name ?? e?.name ?? 'ERRO';
}

async function readHead(res: Response, max = 16_384): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < max) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return buf.toString('utf8', 0, Math.min(buf.length, max));
}

function corsAllowed(res: Response, origin: string): boolean {
  const v = res.headers.get('access-control-allow-origin');
  return v === '*' || v === origin;
}

/** Testa um link HLS/HTTP/outro via GET parcial do manifesto. Nunca lança. */
export async function probeUrl(t: ProbeTarget, opts: ProbeOptions = DEFAULT_PROBE): Promise<ProbeOutcome> {
  try {
    const headers: Record<string, string> = {
      'user-agent': t.headers?.userAgent || opts.userAgent,
      accept: '*/*',
      origin: opts.siteOrigin,
    };
    if (t.headers?.referrer) headers['referer'] = t.headers.referrer;

    const t0 = performance.now();
    const res = await fetch(t.url, { headers, redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs) });
    const latencyMs = Math.max(1, Math.round(performance.now() - t0));
    const cors = corsAllowed(res, opts.siteOrigin);

    if (res.status === 404 || res.status === 410) {
      res.body?.cancel().catch(() => undefined);
      return { ok: false, definitive: true, reason: `HTTP ${res.status}`, cors, latencyMs };
    }
    if (!res.ok) {
      res.body?.cancel().catch(() => undefined);
      // 401/403/451 costumam ser bloqueio geográfico ou de cabeçalho; 429/5xx, instabilidade.
      return { ok: false, definitive: false, reason: `HTTP ${res.status}`, cors, latencyMs };
    }

    const ctype = (res.headers.get('content-type') ?? '').toLowerCase();
    const head = (await readHead(res)).replace(/^\uFEFF/, '').trimStart();

    if (head.startsWith('#EXTM3U')) {
      const height = maxHeight(head);
      return { ok: true, definitive: false, reason: 'HLS ok', cors, kind: t.kind === 'other' ? 'hls' : t.kind, latencyMs, ...(height ? { height } : {}) };
    }
    if (head.startsWith('<MPD') || head.includes('<MPD ')) return { ok: true, definitive: false, reason: 'DASH ok', cors, latencyMs };
    const isMedia = /^(video|audio)\//.test(ctype) || ctype === 'application/octet-stream';
    if (isMedia && t.kind !== 'hls') return { ok: true, definitive: false, reason: `mídia ${ctype}`, cors, latencyMs };
    return { ok: false, definitive: false, reason: `conteúdo inesperado (${ctype || 'sem tipo'})`, cors, latencyMs };
  } catch (err) {
    const code = errorCode(err);
    return { ok: false, definitive: DEAD_CODES.has(code), reason: code };
  }
}

/** Embeds do YouTube: oEmbed responde 200 (existe e pode ser incorporado), 401/403 (embed bloqueado) ou 404. */
export async function probeYouTubeVideo(
  id: string,
  opts: ProbeOptions = DEFAULT_PROBE,
): Promise<{ status: Status; embeddable: boolean }> {
  try {
    const u = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
    const res = await fetch(u, { signal: AbortSignal.timeout(opts.timeoutMs), headers: { 'user-agent': opts.userAgent } });
    res.body?.cancel().catch(() => undefined);
    if (res.status === 200) return { status: 'online', embeddable: true };
    if (res.status === 401 || res.status === 403) return { status: 'desconhecido', embeddable: false };
    if (res.status === 404) return { status: 'offline', embeddable: false };
  } catch {
    /* rede instável */
  }
  return { status: 'desconhecido', embeddable: true };
}

// ---------- histórico: nunca marcar offline por uma única falha ----------

const STATUS_CODE: Record<Status, 0 | 1 | 2> = { online: 0, offline: 1, desconhecido: 2 };
const CODE_STATUS: Status[] = ['online', 'offline', 'desconhecido'];
const CORS_CODE = (c: boolean | undefined): 0 | 1 | 2 => (c === false ? 0 : c === true ? 1 : 2);
export const corsFromCode = (c: number): boolean | undefined => (c === 0 ? false : c === 1 ? true : undefined);
export const statusFromCode = (c: number): Status => CODE_STATUS[c] ?? 'desconhecido';

export const urlHealthKey = (url: string): string => shortHash(url, 12);

export interface Judged {
  status: Status;
  fails: number;
  cors?: boolean;
  /** Medidas do último teste com resposta (as de um teste anterior são mantidas se este não respondeu). */
  latencyMs?: number;
  height?: number;
  /** Link HTTP que respondeu também por HTTPS com CORS (preenchido por quem testa a versão HTTPS). */
  httpsOk?: boolean;
}

/** Reconstrói o julgamento a partir de uma entrada do histórico (reaproveitada sem novo teste). */
export function fromHealthEntry(e: HealthEntry): Judged {
  return {
    status: statusFromCode(e[0]),
    fails: e[1],
    cors: corsFromCode(e[3]),
    ...(e[4] ? { latencyMs: e[4] } : {}),
    ...(e[5] ? { height: e[5] } : {}),
    ...(e[6] === 1 ? { httpsOk: true } : {}),
  };
}

/**
 * Regras:
 *  - sucesso → online, zera falhas.
 *  - falha certa (404/410/DNS/certificado): offline, EXCETO se o canal estava online na última checagem
 *    — nesse caso espera uma segunda falha seguida.
 *  - falha ambígua (timeout, 403, 5xx, conteúdo estranho — comum em bloqueio geográfico): "desconhecido";
 *    só vira offline depois de 3 falhas seguidas.
 */
export function judge(outcome: ProbeOutcome, prev: HealthEntry | undefined): Judged {
  if (outcome.ok) {
    return { status: 'online', fails: 0, cors: outcome.cors, ...(outcome.latencyMs ? { latencyMs: outcome.latencyMs } : {}), ...(outcome.height ? { height: outcome.height } : {}) };
  }
  const fails = (prev?.[1] ?? 0) + 1;
  const wasOnline = prev?.[0] === 0;
  let status: Status;
  if (outcome.definitive) status = wasOnline && fails < 2 ? 'desconhecido' : 'offline';
  else status = fails >= 3 ? 'offline' : 'desconhecido';
  // sem sucesso agora: a resolução conhecida continua valendo (o canal é o mesmo); a latência é a deste teste, se respondeu
  const height = prev?.[5] || undefined;
  return { status, fails, cors: outcome.cors, ...(outcome.latencyMs ? { latencyMs: outcome.latencyMs } : {}), ...(height ? { height } : {}) };
}

// ---------- execução em lote ----------

class Semaphore {
  private waiters: (() => void)[] = [];
  private free: number;
  constructor(n: number) {
    this.free = n;
  }
  async acquire(): Promise<void> {
    if (this.free > 0) {
      this.free--;
      return;
    }
    await new Promise<void>((r) => this.waiters.push(r));
  }
  release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.free++;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export interface BatchItem extends ProbeTarget {
  key: string;
}

/** Executa os testes com concorrência global e por host limitadas. */
export async function probeBatch(
  items: BatchItem[],
  opts: ProbeOptions = DEFAULT_PROBE,
  onProgress?: (done: number, total: number) => void,
  probe: (t: ProbeTarget, o: ProbeOptions) => Promise<ProbeOutcome> = probeUrl,
): Promise<Map<string, ProbeOutcome>> {
  const results = new Map<string, ProbeOutcome>();
  const hosts = new Map<string, Semaphore>();
  // embaralha para espalhar os hosts e não bloquear workers esperando o mesmo host
  const queue = [...items];
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j] as BatchItem, queue[i] as BatchItem];
  }
  let done = 0;
  const worker = async () => {
    for (let item = queue.pop(); item; item = queue.pop()) {
      const host = hostOf(item.url);
      let sem = hosts.get(host);
      if (!sem) hosts.set(host, (sem = new Semaphore(opts.perHost)));
      await sem.acquire();
      try {
        results.set(item.key, await probe(item, opts));
      } finally {
        sem.release();
      }
      done++;
      if (onProgress && done % 500 === 0) onProgress(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, Math.max(1, items.length)) }, worker));
  onProgress?.(items.length, items.length);
  return results;
}

export function toHealthEntry(j: Judged, nowMs = Date.now()): HealthEntry {
  return [STATUS_CODE[j.status], j.fails, Math.floor(nowMs / 60_000), CORS_CODE(j.cors), j.latencyMs ?? 0, j.height ?? 0, j.httpsOk ? 1 : 0];
}

/** Campos de saúde que vão para o canal publicado (só os que têm valor, para enxugar o JSON). */
export function healthFields(j: Judged, checkedMinutes: number | undefined): Pick<Channel, 'fails' | 'checked' | 'latency' | 'resolution' | 'httpsOk'> {
  const resolution = resolutionLabel(j.height);
  return {
    ...(j.fails > 0 ? { fails: j.fails } : {}),
    ...(checkedMinutes ? { checked: checkedMinutes } : {}),
    ...(j.latencyMs ? { latency: j.latencyMs } : {}),
    ...(resolution ? { resolution } : {}),
    ...(j.httpsOk ? { httpsOk: true as const } : {}),
  };
}

export type { HealthFile };
