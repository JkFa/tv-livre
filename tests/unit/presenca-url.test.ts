import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAVE_PRESENCA_TESTE, normalizarBase, presencaAtiva, presencaBase, presencaWs } from '../../src/lib/presenca-url.ts';

function janela(teste?: string) {
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => (k === CHAVE_PRESENCA_TESTE ? (teste ?? null) : null) } });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('endereço do serviço de presença', () => {
  it('só aceita https (e http local apenas no modo de teste)', () => {
    expect(normalizarBase('https://tvlivre-presenca.conta.workers.dev/', false)).toBe('https://tvlivre-presenca.conta.workers.dev');
    expect(normalizarBase('http://localhost:8787', false)).toBeNull();
    expect(normalizarBase('http://localhost:8787', true)).toBe('http://localhost:8787');
    expect(normalizarBase('http://127.0.0.1:8787/', true)).toBe('http://127.0.0.1:8787');
    for (const ruim of ['', '  ', 'ftp://x', 'http://evil.com', 'https://', 'javascript:alert(1)', 'https://a.com/caminho', null, undefined]) {
      expect(normalizarBase(ruim, true)).toBeNull();
    }
  });
  it('converte para WebSocket', () => {
    expect(presencaWs('https://x.workers.dev')).toBe('wss://x.workers.dev/ws');
    expect(presencaWs('http://localhost:8787')).toBe('ws://localhost:8787/ws');
  });
  it('sem variável de build e sem teste: sem serviço (o site funciona como antes)', () => {
    janela();
    vi.stubEnv('VITE_PRESENCA_URL', '');
    expect(presencaBase()).toBeNull();
    expect(presencaAtiva({ hostname: 'jkfa.github.io' }, false)).toBe(false);
  });
  it('em produção só liga em jkfa.github.io e sem automação', () => {
    janela();
    vi.stubEnv('VITE_PRESENCA_URL', 'https://p.workers.dev');
    vi.stubEnv('PROD', true);
    expect(presencaAtiva({ hostname: 'jkfa.github.io' }, false)).toBe(true);
    expect(presencaAtiva({ hostname: 'jkfa.github.io' }, true)).toBe(false); // automação
    expect(presencaAtiva({ hostname: 'localhost' }, false)).toBe(false);
    expect(presencaAtiva({ hostname: 'outro.site' }, false)).toBe(false);
  });
  it('o modo de teste aponta para o serviço local e liga mesmo em localhost/automação', () => {
    janela('http://localhost:8787');
    vi.stubEnv('VITE_PRESENCA_URL', '');
    expect(presencaBase()).toBe('http://localhost:8787');
    expect(presencaAtiva({ hostname: 'localhost' }, true)).toBe(true);
  });
});
