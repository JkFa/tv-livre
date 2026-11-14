/**
 * Contador de acessos. Com o serviço de presença configurado (`VITE_PRESENCA_URL`), a visita é registrada nele
 * (`POST /acesso`) e o total é lido de `/resumo`. Sem ele, ou se a leitura falhar, usa o Abacus
 * (https://abacus.jasoncameron.dev): serviço gratuito, sem chave, sem cookies, CORS aberto.
 * Só enviamos o namespace e a chave do contador — nenhum dado pessoal. Com o serviço de presença configurado, uma visita
 * que falhar NÃO é repetida no Abacus (o serviço novo já partiu do total do Abacus: contar nos dois duplicaria).
 */
import { presencaAtiva, presencaBase, presencaTeste } from './presenca-url.ts';

export const COUNTER_BASE = 'https://abacus.jasoncameron.dev';
export const COUNTER_NS = 'tvlivre-jkfa';
export const COUNTER_KEY = 'acessos';
const SESSION_FLAG = 'tvlivre:visita-contada';
const TIMEOUT_MS = 4000;

let countedThisPage = false;
let lastTotal: number | null = null;

export function parseTotal(body: unknown): number | null {
  const v = (body as { value?: unknown } | null)?.value;
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
}

async function call(kind: 'hit' | 'get', fetchFn: typeof fetch): Promise<number | null> {
  try {
    const res = await fetchFn(`${COUNTER_BASE}/${kind}/${COUNTER_NS}/${COUNTER_KEY}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return parseTotal(await res.json());
  } catch {
    return null;
  }
}

/** Conta só visitas reais: site publicado, sem automação e sem ambiente de desenvolvimento (ou o modo de teste explícito). */
export function shouldCount(loc: Pick<Location, 'hostname'> = window.location, webdriver = navigator.webdriver): boolean {
  if (presencaTeste() !== null) return true;
  return import.meta.env.PROD && loc.hostname === 'jkfa.github.io' && !webdriver;
}

/** Fala com o serviço de presença: `POST /acesso` (conta) ou `GET /resumo` (lê). Devolve o total ou null. */
async function chamarPresenca(base: string, tipo: 'acesso' | 'resumo', fetchFn: typeof fetch): Promise<number | null> {
  try {
    const res = await fetchFn(`${base}/${tipo}`, {
      method: tipo === 'acesso' ? 'POST' : 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const v = ((await res.json()) as { acessos?: unknown } | null)?.acessos;
    return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
  } catch {
    return null;
  }
}

function sessionGet(k: string): string | null {
  try {
    return window.sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function sessionSet(k: string, v: string): boolean {
  try {
    window.sessionStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
}

/** Registra no máximo UMA visita por sessão (sessionStorage). Devolve o total, ou null se o serviço falhar. */
export async function registerVisit(count: boolean = shouldCount(), fetchFn: typeof fetch = fetch): Promise<number | null> {
  if (!count) return null;
  const stored = sessionGet(SESSION_FLAG);
  if (stored !== null || countedThisPage) {
    const n = Number(stored);
    return stored !== null && Number.isSafeInteger(n) && n > 0 ? n : lastTotal;
  }
  countedThisPage = true; // evita contagem dupla mesmo se o sessionStorage estiver bloqueado
  const base = presencaBase();
  const total = base ? await chamarPresenca(base, 'acesso', fetchFn) : await call('hit', fetchFn);
  if (total !== null) {
    lastTotal = total;
    sessionSet(SESSION_FLAG, String(total));
  }
  return total;
}

/**
 * Lê o total sem incrementar (usado na página Sobre e fora do site publicado).
 * O serviço de presença só é consultado onde ele vale (`presencaAtiva`: site publicado sem automação, ou o modo de teste):
 * em localhost, prévias e E2E ele recusa a origem (CORS), o WebKit registra isso como erro da página e o teste sairia para a internet.
 */
export async function readTotal(fetchFn: typeof fetch = fetch, comPresenca: boolean = presencaAtiva()): Promise<number | null> {
  if (lastTotal !== null) return lastTotal;
  const base = comPresenca ? presencaBase() : null;
  const n = (base ? await chamarPresenca(base, 'resumo', fetchFn) : null) ?? (await call('get', fetchFn));
  if (n !== null) lastTotal = n;
  return n;
}

export function resetCounterForTests(): void {
  countedThisPage = false;
  lastTotal = null;
}
