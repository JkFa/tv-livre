import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTheme, isDarkNow } from '../../src/lib/prefs.ts';

const mem = new Map<string, string>();
const sistema = (escuro: boolean) =>
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) },
    matchMedia: (q: string) => ({ matches: q.includes('dark') ? escuro : !escuro }),
  });
beforeEach(() => {
  mem.clear();
  sistema(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('tema padrão', () => {
  it('sem escolha salva o padrão é o CLARO, mesmo com o sistema escuro', () => {
    expect(getTheme()).toBe('claro');
    expect(isDarkNow(getTheme())).toBe(false);
  });
  it('escolhas do usuário continuam valendo', () => {
    mem.set('tvlivre:tema', 'escuro');
    expect(getTheme()).toBe('escuro');
    mem.set('tvlivre:tema', 'auto');
    expect(getTheme()).toBe('auto');
    mem.set('tvlivre:tema', 'claro');
    expect(getTheme()).toBe('claro');
  });
  it('valor salvo inválido volta ao padrão claro', () => {
    mem.set('tvlivre:tema', 'roxo');
    expect(getTheme()).toBe('claro');
  });
});

describe('isDarkNow', () => {
  it('claro e escuro são fixos; automático segue o sistema', () => {
    expect(isDarkNow('claro')).toBe(false);
    expect(isDarkNow('escuro')).toBe(true);
    sistema(true);
    expect(isDarkNow('auto')).toBe(true);
    sistema(false);
    expect(isDarkNow('auto')).toBe(false);
  });
});
