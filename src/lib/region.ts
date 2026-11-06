/**
 * Região de quem está acessando, para mostrar "Você está acessando de Minas Gerais, Brasil".
 * Usa o serviço gratuito ipwho.is (HTTPS, CORS aberto, sem chave): ele enxerga o IP de quem pergunta, como qualquer
 * servidor, e devolve estado e país. Pedimos só esses campos (sem cidade), sem cookies e sem referência, e guardamos
 * a resposta só na sessão (sessionStorage), então é uma consulta por sessão. Se falhar, a região simplesmente não aparece.
 */
export const REGION_URL = 'https://ipwho.is/?lang=pt-BR&fields=success,country,country_code,region';
const SESSION_KEY = 'tvlivre:regiao';
const TIMEOUT_MS = 4000;

export interface Region {
  /** Estado/província (pode faltar). */
  region: string | null;
  country: string;
  code: string;
}

const clean = (v: unknown, max = 60): string | null => {
  if (typeof v !== 'string') return null;
  const t = [...v].filter((ch) => ch !== '<' && ch !== '>' && ch.charCodeAt(0) >= 32).join('').trim();
  return t && t.length <= max ? t : null;
};

export function parseRegion(body: unknown): Region | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || b.success === false) return null;
  const country = clean(b.country);
  const code = clean(b.country_code, 3);
  if (!country || !code || !/^[A-Za-z]{2,3}$/.test(code)) return null;
  const region = clean(b.region);
  return { region: region && region !== country ? region : null, country, code: code.toUpperCase() };
}

export const formatRegion = (r: Region): string => (r.region ? `${r.region}, ${r.country}` : r.country);

function sessionGet(): Region | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? parseRegion({ success: true, ...(JSON.parse(raw) as object) }) : null;
  } catch {
    return null;
  }
}
function sessionSet(r: Region): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ region: r.region, country: r.country, country_code: r.code }));
  } catch {
    /* armazenamento bloqueado: consultamos de novo na próxima vez */
  }
}

let memo: Promise<Region | null> | null = null;

export function fetchRegion(fetchFn: typeof fetch = fetch): Promise<Region | null> {
  const cached = sessionGet();
  if (cached) return Promise.resolve(cached);
  memo ??= (async () => {
    try {
      const res = await fetchFn(REGION_URL, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const r = parseRegion(await res.json());
      if (r) sessionSet(r);
      return r;
    } catch {
      return null;
    }
  })();
  return memo;
}

export function resetRegionForTests(): void {
  memo = null;
}
