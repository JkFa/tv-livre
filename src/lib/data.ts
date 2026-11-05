import type { Channel, DataIndex } from '../../shared/types.ts';

const BASE = import.meta.env.BASE_URL;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/${path}`);
  if (!res.ok) throw new Error(`Falha ao carregar ${path} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

let indexPromise: Promise<DataIndex> | null = null;
export function loadIndex(): Promise<DataIndex> {
  indexPromise ??= getJson<DataIndex>('index.json').catch((e) => {
    indexPromise = null;
    throw e;
  });
  return indexPromise;
}

const countryCache = new Map<string, Promise<Channel[]>>();
export function loadCountry(code: string): Promise<Channel[]> {
  let p = countryCache.get(code);
  if (!p) {
    p = getJson<Channel[]>(`countries/${encodeURIComponent(code)}.json`).catch((e) => {
      countryCache.delete(code);
      throw e;
    });
    countryCache.set(code, p);
  }
  return p;
}

/** Carrega vários países com concorrência limitada; ignora países que falharem. */
export async function loadCountries(codes: string[], onProgress?: (done: number, total: number) => void): Promise<Channel[]> {
  const results: Channel[][] = [];
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, codes.length) }, async () => {
      while (next < codes.length) {
        const code = codes[next++]!;
        try {
          results.push(await loadCountry(code));
        } catch {
          /* país indisponível: segue com os demais */
        }
        onProgress?.(++done, codes.length);
      }
    }),
  );
  return results.flat();
}
