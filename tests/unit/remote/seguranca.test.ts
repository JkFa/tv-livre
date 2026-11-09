import { describe, expect, it } from 'vitest';
import {
  ALFABETO_CODIGO, cifrar, decifrar, derivarDoCodigo, deB64u, formatarCodigo, gerarChave, gerarCodigo, gerarSessao, hashSessao,
  importarChave, normalizarCodigo, paraB64u, topicoCmd, topicoEstado, Validador,
} from '../../../src/lib/remote/seguranca.ts';

describe('base64url', () => {
  it('vai e volta sem +, / nem =', () => {
    for (const n of [0, 1, 2, 3, 16, 32, 33]) {
      const b = crypto.getRandomValues(new Uint8Array(n));
      const s = paraB64u(b);
      expect(s).toMatch(/^[A-Za-z0-9_-]*$/);
      expect([...deB64u(s)]).toEqual([...b]);
    }
  });
});

describe('sessão e chave', () => {
  it('sessão: 16 bytes aleatórios em base64url, diferente a cada vez', () => {
    const a = gerarSessao();
    expect(deB64u(a)).toHaveLength(16);
    expect(gerarSessao()).not.toBe(a);
  });
  it('chave AES-GCM de 256 bits exportável e reimportável', async () => {
    const { chave, raw } = await gerarChave();
    expect(deB64u(raw)).toHaveLength(32);
    expect(await decifrar(await importarChave(raw), await cifrar(chave, 'oi'))).toBe('oi');
    await expect(importarChave(paraB64u(new Uint8Array(16)))).rejects.toThrow();
  });
  it('o tópico usa só o hash (hex de 32 caracteres), não a sessão', async () => {
    const s = gerarSessao();
    const h = await hashSessao(s);
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(topicoCmd(h)).toBe(`tvlivre/v1/${h}/cmd`);
    expect(topicoEstado(h)).toBe(`tvlivre/v1/${h}/estado`);
    expect(topicoCmd(h)).not.toContain(s);
    expect(await hashSessao(s)).toBe(h);
    expect(await hashSessao(gerarSessao())).not.toBe(h);
  });
});

describe('cifrar / decifrar (AES-GCM)', () => {
  it('ida e volta, com acentos e emoji', async () => {
    const { chave } = await gerarChave();
    const texto = JSON.stringify({ n: 7, nome: 'Canal Futura 📺 ação' });
    expect(await decifrar(chave, await cifrar(chave, texto))).toBe(texto);
  });
  it('IV aleatório: a mesma mensagem cifra diferente toda vez', async () => {
    const { chave } = await gerarChave();
    const [a, b] = [await cifrar(chave, 'x'), await cifrar(chave, 'x')];
    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
    expect(a.split('.')[1]).not.toBe(b.split('.')[1]);
  });
  it('chave errada, mensagem adulterada ou formato estranho: null', async () => {
    const { chave } = await gerarChave();
    const outra = (await gerarChave()).chave;
    const p = await cifrar(chave, 'segredo');
    expect(await decifrar(outra, p)).toBeNull();
    const [v, iv, ct] = p.split('.');
    const adulterado = `${v}.${iv}.${ct!.slice(0, -2)}${ct!.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(await decifrar(chave, adulterado)).toBeNull();
    for (const lixo of ['', 'v1', 'v1..', 'v2.a.b', 'nada', 'v1.@@@.###']) expect(await decifrar(chave, lixo)).toBeNull();
  });
});

describe('Validador (idade e repetição)', () => {
  const t0 = 1_800_000_000_000;
  const mk = (agora: () => number) => new Validador(agora);
  it('aceita mensagem nova e rejeita a repetida do mesmo remetente', () => {
    const v = mk(() => t0);
    expect(v.aceitar({ de: 'a', seq: 1, ts: t0 })).toBe('ok');
    expect(v.aceitar({ de: 'a', seq: 1, ts: t0 })).toBe('repetida');
    expect(v.aceitar({ de: 'a', seq: 2, ts: t0 })).toBe('ok');
    expect(v.aceitar({ de: 'b', seq: 1, ts: t0 })).toBe('ok'); // outro celular pode usar o mesmo número
  });
  it('rejeita mensagem com mais de 30 s e com mais de 30 s no futuro', () => {
    let agora = t0;
    const v = mk(() => agora);
    expect(v.aceitar({ de: 'a', seq: 1, ts: t0 - 29_999 })).toBe('ok');
    expect(v.aceitar({ de: 'a', seq: 2, ts: t0 - 30_001 })).toBe('velha');
    expect(v.aceitar({ de: 'a', seq: 3, ts: t0 + 30_001 })).toBe('futura');
    agora = t0 + 60_000; // o relógio andou: a mensagem de antes agora é velha
    expect(v.aceitar({ de: 'a', seq: 4, ts: t0 })).toBe('velha');
  });
  it('repetição também é pega depois de a janela andar (a mensagem velha seria rejeitada de qualquer jeito)', () => {
    let agora = t0;
    const v = mk(() => agora);
    expect(v.aceitar({ de: 'a', seq: 1, ts: t0 })).toBe('ok');
    agora = t0 + 31_000;
    expect(v.aceitar({ de: 'a', seq: 1, ts: t0 })).toBe('velha');
  });
  it('forma inválida', () => {
    const v = mk(() => t0);
    for (const m of [{ de: '', seq: 1, ts: t0 }, { de: 'a', seq: 1.5, ts: t0 }, { de: 'a', seq: -1, ts: t0 }, { de: 'a', seq: 1, ts: NaN }]) expect(v.aceitar(m)).toBe('forma');
  });
  it('a memória não cresce para sempre', () => {
    let agora = t0;
    const v = mk(() => agora);
    for (let i = 0; i < 50; i++) {
      agora += 10_000;
      v.aceitar({ de: 'a', seq: i, ts: agora });
    }
    // @ts-expect-error acesso ao estado interno só para conferir a limpeza
    expect(v.vistos.size).toBeLessThan(10);
  });
});

describe('código alternativo', () => {
  it('8 símbolos do alfabeto legível (sem 0, O, 1, I)', () => {
    expect(ALFABETO_CODIGO).toHaveLength(32);
    expect(ALFABETO_CODIGO).not.toMatch(/[01OI]/);
    for (let i = 0; i < 200; i++) {
      const c = gerarCodigo();
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    }
    expect(gerarCodigo()).not.toBe(gerarCodigo());
  });
  it('normaliza minúsculas, espaço e hífen; recusa o que não é código', () => {
    expect(normalizarCodigo('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizarCodigo(' abcd efgh ')).toBe('ABCDEFGH');
    expect(normalizarCodigo('ABCD-EFG0')).toBeNull(); // 0 não existe
    expect(normalizarCodigo('ABCDEFG')).toBeNull();
    expect(normalizarCodigo('ABCDEFGHJ')).toBeNull();
    expect(formatarCodigo('ABCDEFGH')).toBe('ABCD-EFGH');
  });
  it('derivação: o mesmo código dá a mesma sessão e a mesma chave; outro código dá outras', async () => {
    const a1 = await derivarDoCodigo('ABCDEFGH');
    const a2 = await derivarDoCodigo('ABCDEFGH');
    const b = await derivarDoCodigo('ABCDEFGJ');
    expect(a1).toEqual(a2);
    expect(a1.sessao).not.toBe(b.sessao);
    expect(a1.chaveRaw).not.toBe(b.chaveRaw);
    expect(deB64u(a1.sessao)).toHaveLength(16);
    expect(deB64u(a1.chaveRaw)).toHaveLength(32);
    // quem tem o código decifra o que o outro cifrou
    const k1 = await importarChave(a1.chaveRaw);
    const k2 = await importarChave(a2.chaveRaw);
    expect(await decifrar(k2, await cifrar(k1, 'ola'))).toBe('ola');
    expect(await decifrar(await importarChave(b.chaveRaw), await cifrar(k1, 'ola'))).toBeNull();
  });
  it('usa 200 mil iterações de PBKDF2 (custo para quem tenta adivinhar)', async () => {
    const { ITERACOES_CODIGO } = await import('../../../src/lib/remote/seguranca.ts');
    expect(ITERACOES_CODIGO).toBe(200_000);
    // o resultado muda com o número de iterações: a derivação realmente usa o parâmetro
    expect((await derivarDoCodigo('ABCDEFGH', 1000)).chaveRaw).not.toBe((await derivarDoCodigo('ABCDEFGH')).chaveRaw);
  });
});
