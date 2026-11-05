import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNTER_BASE, COUNTER_KEY, COUNTER_NS, parseTotal, readTotal, registerVisit, resetCounterForTests, shouldCount } from '../../src/lib/counter.ts';

function fakeSession(blocked = false) {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => {
      if (blocked) throw new Error('SecurityError');
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (blocked) throw new Error('SecurityError');
      data.set(k, v);
    },
  };
}
const okFetch = (value: number) =>
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ value }), { status: 200 }));

beforeEach(() => {
  resetCounterForTests();
  vi.stubGlobal('window', { sessionStorage: fakeSession() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('contador de acessos (Abacus)', () => {
  it('valida a resposta: só inteiros não negativos', () => {
    expect(parseTotal({ value: 128402 })).toBe(128402);
    expect(parseTotal({ value: 0 })).toBe(0);
    for (const bad of [null, {}, { value: '12' }, { value: -1 }, { value: 1.5 }, { value: NaN }, { error: 'x' }]) {
      expect(parseTotal(bad)).toBeNull();
    }
  });

  it('conta UMA visita por sessão e reaproveita o total nas demais chamadas', async () => {
    const f = okFetch(41);
    expect(await registerVisit(true, f as unknown as typeof fetch)).toBe(41);
    expect(await registerVisit(true, f as unknown as typeof fetch)).toBe(41);
    expect(await registerVisit(true, f as unknown as typeof fetch)).toBe(41);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0]?.[0])).toBe(`${COUNTER_BASE}/hit/${COUNTER_NS}/${COUNTER_KEY}`);
  });

  it('uma nova sessão (sessionStorage vazio) conta de novo', async () => {
    const f = okFetch(10);
    await registerVisit(true, f as unknown as typeof fetch);
    resetCounterForTests();
    vi.stubGlobal('window', { sessionStorage: fakeSession() });
    await registerVisit(true, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('com sessionStorage bloqueado, conta no máximo uma vez por carregamento da página', async () => {
    vi.stubGlobal('window', { sessionStorage: fakeSession(true) });
    const f = okFetch(5);
    await registerVisit(true, f as unknown as typeof fetch);
    await registerVisit(true, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('não envia dados pessoais: sem cookies, sem referer', async () => {
    const f = okFetch(1);
    await registerVisit(true, f as unknown as typeof fetch);
    const init = f.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(init.headers).toBeUndefined();
  });

  it('falha do serviço (rede, 500, JSON inválido) → null, sem lançar', async () => {
    const boom = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await registerVisit(true, boom as unknown as typeof fetch)).toBeNull();
    resetCounterForTests();
    vi.stubGlobal('window', { sessionStorage: fakeSession() });
    const err = vi.fn(async () => new Response('x', { status: 500 }));
    expect(await registerVisit(true, err as unknown as typeof fetch)).toBeNull();
    resetCounterForTests();
    const junk = vi.fn(async () => new Response('<html>', { status: 200 }));
    expect(await registerVisit(true, junk as unknown as typeof fetch)).toBeNull();
  });

  it('não conta quando desativado (dev, testes, automação)', async () => {
    const f = okFetch(1);
    expect(await registerVisit(false, f as unknown as typeof fetch)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('readTotal lê sem incrementar (endpoint get)', async () => {
    const f = okFetch(99);
    expect(await readTotal(f as unknown as typeof fetch)).toBe(99);
    expect(String(f.mock.calls[0]?.[0])).toContain('/get/');
  });

  it('shouldCount: só no site publicado, em produção e sem webdriver', () => {
    vi.stubEnv('PROD', true);
    expect(shouldCount({ hostname: 'jkfa.github.io' }, false)).toBe(true);
    expect(shouldCount({ hostname: 'jkfa.github.io' }, true)).toBe(false);
    expect(shouldCount({ hostname: 'localhost' }, false)).toBe(false);
    vi.stubEnv('PROD', false);
    expect(shouldCount({ hostname: 'jkfa.github.io' }, false)).toBe(false);
  });
});
