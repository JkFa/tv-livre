/** Download com timeout e novas tentativas. Lança erro claro se a fonte estiver fora do ar. */
export async function fetchText(url: string, opts: { retries?: number; timeoutMs?: number } = {}): Promise<string> {
  const { retries = 3, timeoutMs = 60_000 } = opts;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'TVLivreBot/1.0 (+https://github.com/JkFa/tv-livre)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`Fonte indisponível: ${url} (${msg})`);
}

export async function fetchJson<T>(url: string, opts?: { retries?: number; timeoutMs?: number }): Promise<T> {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Fonte devolveu JSON inválido: ${url}`);
  }
}
