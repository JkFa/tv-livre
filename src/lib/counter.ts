/**
 * Contador de acessos via Abacus (https://abacus.jasoncameron.dev): serviço gratuito, sem chave, sem cookies,
 * CORS aberto. Só enviamos o namespace e a chave do contador — nenhum dado pessoal.
 */
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

/** Conta só visitas reais: site publicado, sem automação e sem ambiente de desenvolvimento. */
export function shouldCount(loc: Pick<Location, 'hostname'> = window.location, webdriver = navigator.webdriver): boolean {
  return import.meta.env.PROD && loc.hostname === 'jkfa.github.io' && !webdriver;
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
  const total = await call('hit', fetchFn);
  if (total !== null) {
    lastTotal = total;
    sessionSet(SESSION_FLAG, String(total));
  }
  return total;
}

/** Lê o total sem incrementar (usado na página Sobre). */
export async function readTotal(fetchFn: typeof fetch = fetch): Promise<number | null> {
  if (lastTotal !== null) return lastTotal;
  const n = await call('get', fetchFn);
  if (n !== null) lastTotal = n;
  return n;
}

export function resetCounterForTests(): void {
  countedThisPage = false;
  lastTotal = null;
}
