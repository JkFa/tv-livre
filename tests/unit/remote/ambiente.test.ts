import { describe, expect, it } from 'vitest';
import { avisoEnderecoLocal, enderecoSoLocal, problemaDeAmbiente } from '../../../src/lib/remote/ambiente.ts';

describe('problemaDeAmbiente', () => {
  it('página segura com WebCrypto: sem problema', () => {
    expect(problemaDeAmbiente({ seguro: true, temCripto: true, host: 'jkfa.github.io' })).toBeNull();
    expect(problemaDeAmbiente({ seguro: true, temCripto: true, host: 'localhost' })).toBeNull();
  });
  it('http por IP de rede (sem contexto seguro): explica que precisa de HTTPS e cita o endereço', () => {
    const m = problemaDeAmbiente({ seguro: false, temCripto: false, host: '192.168.0.12' });
    expect(m).toContain('HTTPS');
    expect(m).toContain('192.168.0.12');
    expect(m).toContain('https://jkfa.github.io/tv-livre/');
  });
  it('sem crypto.subtle mesmo "seguro": também avisa', () => {
    expect(problemaDeAmbiente({ seguro: true, temCripto: false, host: 'x' })).not.toBeNull();
  });
});

describe('endereço que o celular não alcança', () => {
  it.each(['localhost', '127.0.0.1', '::1', '[::1]', '192.168.0.12', '10.0.0.5', '172.16.4.2', '172.31.255.1', 'meu-pc.local'])('%s é só local', (h) => {
    expect(enderecoSoLocal(h)).toBe(true);
    expect(avisoEnderecoLocal(h)).toContain('QR code não vai abrir no celular');
  });
  it.each(['jkfa.github.io', 'abc.trycloudflare.com', '172.32.0.1', '8.8.8.8'])('%s é alcançável', (h) => {
    expect(enderecoSoLocal(h)).toBe(false);
    expect(avisoEnderecoLocal(h)).toBeNull();
  });
});
