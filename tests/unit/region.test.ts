import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRegion, formatRegion, parseRegion, REGION_URL, resetRegionForTests } from '../../src/lib/region.ts';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  resetRegionForTests();
  vi.stubGlobal('window', { sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
});
afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => vi.fn<(u: string, i?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status: 200 }));
const mg = { success: true, country: 'Brasil', country_code: 'BR', region: 'Minas Gerais' };

describe('região de quem acessa', () => {
  it('lê estado e país e formata em português', () => {
    expect(parseRegion(mg)).toEqual({ region: 'Minas Gerais', country: 'Brasil', code: 'BR' });
    expect(formatRegion(parseRegion(mg)!)).toBe('Minas Gerais, Brasil');
  });
  it('sem estado (ou igual ao país) mostra só o país', () => {
    expect(formatRegion(parseRegion({ ...mg, region: undefined })!)).toBe('Brasil');
    expect(formatRegion(parseRegion({ ...mg, country: 'Singapura', country_code: 'SG', region: 'Singapura' })!)).toBe('Singapura');
  });
  it('rejeita respostas inválidas ou de erro', () => {
    for (const bad of [null, 'x', {}, { success: false }, { success: true, country: 'Brasil' }, { success: true, country: 'Brasil', country_code: 'BRASIL' }, { success: true, country: '', country_code: 'BR' }]) {
      expect(parseRegion(bad)).toBeNull();
    }
  });
  it('remove caracteres de controle e marcação', () => {
    expect(parseRegion({ ...mg, region: '<b>Minas</b>\n' })!.region).toBe('bMinas/b');
  });
  it('consulta uma vez por sessão e pede só estado e país', async () => {
    const f = ok(mg);
    expect((await fetchRegion(f as unknown as typeof fetch))?.region).toBe('Minas Gerais');
    resetRegionForTests();
    expect((await fetchRegion(f as unknown as typeof fetch))?.code).toBe('BR');
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0]?.[0])).toBe(REGION_URL);
    expect(REGION_URL).not.toMatch(/city|ip=/);
    expect(f.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
  });
  it('falha de rede ou HTTP: devolve null, sem lançar', async () => {
    expect(await fetchRegion((async () => { throw new Error('offline'); }) as unknown as typeof fetch)).toBeNull();
    resetRegionForTests();
    expect(await fetchRegion((async () => new Response('', { status: 429 })) as unknown as typeof fetch)).toBeNull();
  });
  it('sessionStorage bloqueado não quebra', async () => {
    vi.stubGlobal('window', { sessionStorage: { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } } });
    expect((await fetchRegion(ok(mg) as unknown as typeof fetch))?.code).toBe('BR');
  });
});
