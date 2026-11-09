import { describe, expect, it } from 'vitest';
import { validarComando, validarControle, validarEnvelope, validarEstado, VERSAO } from '../../../src/lib/remote/protocolo.ts';

describe('validarComando', () => {
  it.each([
    [{ c: 'canal:proximo' }], [{ c: 'canal:anterior' }], [{ c: 'zapear' }], [{ c: 'pausa' }], [{ c: 'play' }], [{ c: 'favoritar' }], [{ c: 'ping' }],
    [{ c: 'canal:numero', n: 7 }], [{ c: 'canal:numero', n: 9999 }], [{ c: 'canal:id', id: 'Globo.br' }], [{ c: 'canal:id', id: 'x', pais: 'br' }],
    [{ c: 'volume', v: 0 }], [{ c: 'volume', v: 1 }], [{ c: 'volume', v: 0.35 }], [{ c: 'mudo', m: true }], [{ c: 'mudo', m: false }],
    [{ c: 'buscar', texto: 'globo' }], [{ c: 'buscar', texto: '' }], [{ c: 'tela', cheia: true }], [{ c: 'hello', nome: 'iPhone' }],
  ])('aceita %j', (cmd) => {
    expect(validarComando(cmd)).not.toBeNull();
  });

  it('normaliza: país em maiúsculas, hello sem nome vira "Celular", nome cortado, campos extras ignorados', () => {
    expect(validarComando({ c: 'canal:id', id: 'x', pais: 'br' })).toEqual({ c: 'canal:id', id: 'x', pais: 'BR' });
    expect(validarComando({ c: 'hello' })).toEqual({ c: 'hello', nome: 'Celular' });
    expect((validarComando({ c: 'hello', nome: 'x'.repeat(100) }) as { nome: string }).nome).toHaveLength(40);
    expect(validarComando({ c: 'zapear', extra: 'lixo', __proto__: { x: 1 } })).toEqual({ c: 'zapear' });
  });

  it.each([
    [null], [undefined], [42], ['zapear'], [[]], [{}], [{ c: 5 }], [{ c: 'rm -rf' }], [{ c: 'canal:numero' }],
    [{ c: 'canal:numero', n: 0 }], [{ c: 'canal:numero', n: -3 }], [{ c: 'canal:numero', n: 1.5 }], [{ c: 'canal:numero', n: 10000 }], [{ c: 'canal:numero', n: '7' }],
    [{ c: 'canal:numero', n: NaN }], [{ c: 'canal:numero', n: Infinity }],
    [{ c: 'canal:id' }], [{ c: 'canal:id', id: '' }], [{ c: 'canal:id', id: 5 }], [{ c: 'canal:id', id: 'x'.repeat(201) }], [{ c: 'canal:id', id: 'x', pais: 'brasil' }], [{ c: 'canal:id', id: 'x', pais: 5 }],
    [{ c: 'volume', v: 1.1 }], [{ c: 'volume', v: -0.1 }], [{ c: 'volume', v: NaN }], [{ c: 'volume', v: '0.5' }], [{ c: 'volume' }],
    [{ c: 'mudo', m: 'true' }], [{ c: 'mudo' }], [{ c: 'tela', cheia: 1 }],
    [{ c: 'buscar', texto: 'x'.repeat(101) }], [{ c: 'buscar', texto: 7 }], [{ c: 'buscar' }],
  ])('rejeita %j', (cmd) => {
    expect(validarComando(cmd)).toBeNull();
  });
});

describe('validarEstado', () => {
  const ok = { canal: { id: 'Globo.br', numero: '07', nome: 'Globo', pais: 'BR', logo: 'https://l/x.png' }, tocando: true, mudo: false, volume: 0.5, favorito: true, modoTV: false, versao: VERSAO, programaAtual: 'Jornal' };
  it('aceita o estado completo e sem canal', () => {
    expect(validarEstado(ok)).toEqual(ok);
    expect(validarEstado({ ...ok, canal: null })?.canal).toBeNull();
  });
  it('logo só se for https; erro e programa são cortados', () => {
    expect(validarEstado({ ...ok, canal: { ...ok.canal, logo: 'http://l/x.png' } })?.canal?.logo).toBeUndefined();
    expect(validarEstado({ ...ok, canal: { ...ok.canal, logo: 'javascript:alert(1)' } })?.canal?.logo).toBeUndefined();
    expect(validarEstado({ ...ok, erro: 'e'.repeat(999) })?.erro).toHaveLength(200);
  });
  it('rejeita forma errada', () => {
    for (const x of [null, 5, {}, { ...ok, tocando: 'sim' }, { ...ok, volume: 2 }, { ...ok, volume: 'x' }, { ...ok, modoTV: 1 }, { ...ok, canal: { id: 'x' } }, { ...ok, canal: 'Globo' }, { ...ok, canal: { ...ok.canal, nome: '' } }]) expect(validarEstado(x)).toBeNull();
  });
});

describe('envelope e controle', () => {
  const env = { v: VERSAO, seq: 3, ts: 1, de: 'cel-1', t: 'cmd', d: { c: 'ping' } };
  it('envelope bem formado passa; mal formado não', () => {
    expect(validarEnvelope(env)).toEqual(env);
    for (const x of [null, [], { ...env, t: 'x' }, { ...env, seq: 1.2 }, { ...env, de: '' }, { ...env, de: 'x'.repeat(65) }, { ...env, ts: 'agora' }, { ...env, v: '1' }]) expect(validarEnvelope(x)).toBeNull();
  });
  it('mensagens de controle', () => {
    expect(validarControle({ tipo: 'encerrado' })).toEqual({ tipo: 'encerrado' });
    expect(validarControle({ tipo: 'desconectar', para: 'a' })).toEqual({ tipo: 'desconectar', para: 'a' });
    expect(validarControle({ tipo: 'recusa', para: 'a', motivo: 'limite' })).toEqual({ tipo: 'recusa', para: 'a', motivo: 'limite' });
    expect(validarControle({ tipo: 'rotacao', para: 'a', sessao: 's', chave: 'k' })).toMatchObject({ tipo: 'rotacao' });
    for (const x of [null, {}, { tipo: 'desconectar' }, { tipo: 'recusa', para: 'a', motivo: 'x' }, { tipo: 'rotacao', para: 'a' }, { tipo: 'outra', para: 'a' }]) expect(validarControle(x)).toBeNull();
  });
});
