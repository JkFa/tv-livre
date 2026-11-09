import { afterEach, describe, expect, it, vi } from 'vitest';
import { executar, type Acoes } from '../../../src/lib/remote/acoes.ts';
import { empacotar } from '../../../src/lib/remote/canal.ts';
import { Controlador } from '../../../src/lib/remote/controlador.ts';
import { MAX_CELULARES, VERSAO, type Comando, type Envelope, type Estado } from '../../../src/lib/remote/protocolo.ts';
import { Receptor, VALIDADE_CODIGO_MS } from '../../../src/lib/remote/receptor.ts';
import { cifrar, derivarDoCodigo, hashSessao, importarChave, topicoCmd, topicoEstado } from '../../../src/lib/remote/seguranca.ts';
import { BarramentoMemoria } from '../../../src/lib/remote/transporte.ts';

const ITER = 1000; // o app usa 200 mil; aqui só para o teste ser rápido
const estado = (n = '07'): Estado => ({ canal: { id: 'Globo.br', numero: n, nome: 'Globo', pais: 'BR' }, tocando: true, mudo: false, volume: 0.5, favorito: false, modoTV: false, versao: VERSAO });

function acoesEspia(): Acoes & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const f = (nome: string) => (...a: unknown[]) => void calls.push([nome, ...a]);
  return {
    calls, proximo: f('proximo'), anterior: f('anterior'), numero: f('numero'), canalId: f('canalId'), zapear: f('zapear'), volume: f('volume'),
    mudo: f('mudo'), pausa: f('pausa'), play: f('play'), favoritar: f('favoritar'), buscar: f('buscar'), tela: f('tela'),
  };
}

function parse(link: string) {
  const q = new URLSearchParams(link.split('?')[1]);
  return { sessao: q.get('s')!, chaveRaw: q.get('k')! };
}

async function montar(opts: { relogio?: () => number } = {}) {
  const bus = new BarramentoMemoria();
  const acoes = acoesEspia();
  const comandos: string[] = [];
  const r = new Receptor({ transporte: bus.criar(), acoes, urlBase: 'https://s.example/tv-livre/', iteracoes: ITER, aoComando: (c) => comandos.push(c.c), ...opts });
  const par = await r.iniciar();
  const celular = async (nome = 'Pixel', o: Partial<ConstructorParameters<typeof Controlador>[0]> = {}) => {
    const { sessao, chaveRaw } = parse(par.link);
    const c = new Controlador({ transporte: bus.criar(), sessao, chaveRaw, nome, ...opts, ...o });
    await c.conectar();
    return c;
  };
  return { bus, r, acoes, par, celular, comandos };
}
const espera = (fn: () => void) => vi.waitFor(fn, { timeout: 2000, interval: 5 });
afterEach(() => vi.useRealTimers());

describe('mapeamento comando → ação existente', () => {
  const casos: [Comando, unknown[]][] = [
    [{ c: 'canal:proximo' }, ['proximo']], [{ c: 'canal:anterior' }, ['anterior']], [{ c: 'canal:numero', n: 12 }, ['numero', 12]],
    [{ c: 'canal:id', id: 'x', pais: 'BR' }, ['canalId', 'x', 'BR']], [{ c: 'zapear' }, ['zapear']], [{ c: 'volume', v: 0.3 }, ['volume', 0.3]],
    [{ c: 'mudo', m: true }, ['mudo', true]], [{ c: 'pausa' }, ['pausa']], [{ c: 'play' }, ['play']], [{ c: 'favoritar' }, ['favoritar']],
    [{ c: 'buscar', texto: 'cultura' }, ['buscar', 'cultura']], [{ c: 'tela', cheia: true }, ['tela', true]],
  ];
  it.each(casos)('%j chama a ação certa, uma vez', (cmd, esperado) => {
    const a = acoesEspia();
    executar(cmd, a);
    expect(a.calls).toEqual([esperado]);
  });
  it('ping e hello não chamam ação nenhuma', () => {
    const a = acoesEspia();
    executar({ c: 'ping' }, a);
    executar({ c: 'hello', nome: 'x' }, a);
    expect(a.calls).toEqual([]);
  });
});

describe('pareamento por QR', () => {
  it('o link tem sessão e chave depois do #, nunca na parte enviada ao servidor', async () => {
    const { par } = await montar();
    expect(par.link.startsWith('https://s.example/tv-livre/#/controle?s=')).toBe(true);
    expect(new URL(par.link).search).toBe('');
    expect(par.link).toMatch(/\?s=[\w-]{22}&k=[\w-]{43}$/);
  });

  it('celular conecta, aparece na lista, recebe o estado e os comandos chegam às ações', async () => {
    const { r, acoes, celular, comandos } = await montar();
    const c = await celular('iPhone');
    await espera(() => expect(r.celularesConectados()).toHaveLength(1));
    expect(r.celularesConectados()[0]).toMatchObject({ nome: 'iPhone', via: 'qr' });
    await r.publicarEstado(estado());
    await espera(() => expect(c.estadoAtual?.canal?.numero).toBe('07'));
    expect(c.statusAtual.situacao).toBe('conectado');
    const todos: Comando[] = [{ c: 'canal:proximo' }, { c: 'canal:numero', n: 5 }, { c: 'volume', v: 0.2 }, { c: 'mudo', m: true }, { c: 'favoritar' }, { c: 'buscar', texto: 'tve' }];
    for (const cmd of todos) await c.enviar(cmd);
    await espera(() => expect(acoes.calls).toHaveLength(6));
    expect(acoes.calls.map((x) => x[0])).toEqual(['proximo', 'numero', 'volume', 'mudo', 'favoritar', 'buscar']);
    expect(comandos).toHaveLength(6);
  });

  it('o broker só vê mensagens cifradas e o tópico usa o hash da sessão', async () => {
    const { bus, par, celular, r } = await montar();
    const c = await celular();
    await r.publicarEstado(estado());
    await c.enviar({ c: 'canal:numero', n: 7 });
    await espera(() => expect(bus.log.length).toBeGreaterThan(2));
    const { sessao, chaveRaw } = parse(par.link);
    for (const m of bus.log) {
      expect(m.payload).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
      expect(m.payload).not.toContain('Globo');
      expect(m.topico).not.toContain(sessao);
      expect(m.payload).not.toContain(chaveRaw);
    }
  });

  it('ping devolve o estado (retido, quem chega depois também recebe)', async () => {
    const { r, celular } = await montar();
    await r.publicarEstado(estado('09'));
    const tarde = await celular('Tarde');
    await espera(() => expect(tarde.estadoAtual?.canal?.numero).toBe('09'));
  });
});

describe('rejeição de mensagens', () => {
  it('velha (> 30 s), repetida, adulterada, de outra chave, lixo e comando inválido: nada executa', async () => {
    const agora = 1_800_000_000_000;
    const { bus, par, acoes, celular } = await montar({ relogio: () => agora });
    const c = await celular();
    await c.enviar({ c: 'canal:proximo' });
    await espera(() => expect(acoes.calls).toHaveLength(1));
    const { sessao, chaveRaw } = parse(par.link);
    const cmdTopico = topicoCmd(await hashSessao(sessao));
    const noBarramento = bus.criar();
    await noBarramento.conectar([]);
    const chave = await importarChave(chaveRaw);

    // repetida: reenvia exatamente o que passou
    const original = bus.log.filter((m) => m.topico === cmdTopico).at(-1)!.payload;
    noBarramento.enviar(cmdTopico, original);
    // velha: ts de 31 s atrás, cifrado com a chave certa
    const velha: Envelope = { v: VERSAO, seq: 500, ts: agora - 31_000, de: 'x', t: 'cmd', d: { c: 'zapear' } };
    noBarramento.enviar(cmdTopico, await empacotar(chave, velha));
    // adulterada
    const adulterada = original.slice(0, -3) + (original.endsWith('AAA') ? 'BBB' : 'AAA');
    noBarramento.enviar(cmdTopico, adulterada);
    // outra chave
    noBarramento.enviar(cmdTopico, await cifrar(await importarChave(parse((await montar()).par.link).chaveRaw), JSON.stringify({ ...velha, ts: agora, seq: 501 })));
    // lixo
    for (const lixo of ['', 'lixo', 'v1.a.b', JSON.stringify({ c: 'zapear' })]) noBarramento.enviar(cmdTopico, lixo);
    // comando inválido, bem cifrado e novo
    for (const [i, d] of [{ c: 'rm -rf' }, { c: 'volume', v: 9 }, { c: 'canal:numero', n: -1 }, null, 'zapear'].entries()) {
      noBarramento.enviar(cmdTopico, await empacotar(chave, { v: VERSAO, seq: 600 + i, ts: agora, de: 'y', t: 'cmd', d }));
    }
    // versão diferente
    noBarramento.enviar(cmdTopico, await empacotar(chave, { v: 99, seq: 700, ts: agora, de: 'z', t: 'cmd', d: { c: 'zapear' } }));
    // e uma válida no fim, para provar que o canal continua funcionando
    noBarramento.enviar(cmdTopico, await empacotar(chave, { v: VERSAO, seq: 800, ts: agora, de: 'ok', t: 'cmd', d: { c: 'canal:anterior' } }));
    await espera(() => expect(acoes.calls.map((x) => x[0])).toEqual(['proximo', 'anterior']));
  });
});

describe('pareamento por código', () => {
  async function comCodigo(relogio?: () => number) {
    const m = await montar(relogio ? { relogio } : {});
    const codigo = m.par.codigo!;
    const d = await derivarDoCodigo(codigo, ITER);
    const trocas: string[] = [];
    const c = new Controlador({ transporte: m.bus.criar(), sessao: d.sessao, chaveRaw: d.chaveRaw, nome: 'Moto', ...(relogio ? { relogio } : {}), aoMudarSessao: (s) => trocas.push(s) });
    return { ...m, codigo, d, c, trocas };
  }

  it('o computador mostra um código de 8 símbolos legíveis, válido por 10 minutos', async () => {
    const { par } = await montar();
    expect(par.codigo).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(par.codigoExpiraEm).toBeGreaterThan(Date.now() + VALIDADE_CODIGO_MS - 5000);
  });

  it('conecta pelo código e troca para uma chave nova enviada pelo canal já cifrado; o código deixa de valer', async () => {
    const { r, c, acoes, trocas, bus, d, par } = await comCodigo();
    await c.conectar();
    await espera(() => expect(trocas).toHaveLength(1));
    expect(trocas[0]).not.toBe(d.sessao);
    expect(r.celularesConectados()).toHaveLength(1);
    expect(r.celularesConectados()[0]).toMatchObject({ nome: 'Moto', via: 'par' });
    await c.enviar({ c: 'zapear' });
    await espera(() => expect(acoes.calls).toEqual([['zapear']]));
    expect(r.pareamento().codigo).toBeNull(); // o código foi consumido
    // um segundo celular com o mesmo código não entra mais
    const outro = new Controlador({ transporte: bus.criar(), sessao: d.sessao, chaveRaw: d.chaveRaw, nome: 'Intruso' });
    await outro.conectar();
    await outro.enviar({ c: 'canal:proximo' });
    await new Promise((res) => setTimeout(res, 50));
    expect(acoes.calls).toEqual([['zapear']]);
    expect(r.celularesConectados()).toHaveLength(1);
    expect(par.link).toContain('#/controle'); // o QR continua valendo para os demais
  });

  it('expira em 10 minutos se ninguém conectar', async () => {
    let agora = 1_800_000_000_000;
    const { r, c, acoes, par } = await comCodigo(() => agora);
    expect(par.codigo).not.toBeNull();
    agora += VALIDADE_CODIGO_MS + 1000;
    r.verificarExpiracao();
    expect(r.pareamento().codigo).toBeNull();
    await c.conectar();
    await c.enviar({ c: 'zapear' });
    await new Promise((res) => setTimeout(res, 50));
    expect(acoes.calls).toEqual([]);
    expect(r.celularesConectados()).toHaveLength(0);
  });

  it('"novo código" gera outro de 10 minutos e o anterior deixa de funcionar', async () => {
    const agora = 1_800_000_000_000;
    const { r, c, acoes, codigo } = await comCodigo(() => agora);
    const novo = await r.novoCodigo();
    expect(novo.codigo).not.toBe(codigo);
    expect(novo.codigoExpiraEm).toBe(agora + VALIDADE_CODIGO_MS);
    await c.conectar(); // celular com o código antigo
    await c.enviar({ c: 'zapear' });
    await new Promise((res) => setTimeout(res, 50));
    expect(acoes.calls).toEqual([]);
    expect(r.celularesConectados()).toHaveLength(0);
  });
});

describe('limite de celulares, desconectar e encerrar', () => {
  it(`até ${MAX_CELULARES} celulares; o seguinte é recusado`, async () => {
    const { r, celular } = await montar();
    const cs = [await celular('A'), await celular('B'), await celular('C')];
    await espera(() => expect(r.celularesConectados()).toHaveLength(3));
    const quarto = await celular('D');
    await espera(() => expect(quarto.statusAtual.situacao).toBe('limite'));
    expect(r.celularesConectados()).toHaveLength(3);
    expect(cs.every((c) => c.statusAtual.situacao !== 'limite')).toBe(true);
  });

  it('desconectar tira o celular e ignora comandos dele', async () => {
    const { r, celular, acoes } = await montar();
    const a = await celular('A');
    const b = await celular('B');
    await espera(() => expect(r.celularesConectados()).toHaveLength(2));
    await r.desconectar(a.de);
    await espera(() => expect(a.statusAtual.situacao).toBe('desconectado'));
    expect(r.celularesConectados().map((c) => c.nome)).toEqual(['B']);
    await a.enviar({ c: 'zapear' });
    await b.enviar({ c: 'canal:proximo' });
    await espera(() => expect(acoes.calls).toEqual([['proximo']]));
    await espera(() => expect(a.statusAtual.situacao).toBe('desconectado'));
  });

  it('encerrar: o QR antigo e os celulares conectados deixam de valer; o novo QR funciona', async () => {
    const { r, celular, acoes, par, bus } = await montar();
    const antigo = await celular('Antigo');
    await espera(() => expect(r.celularesConectados()).toHaveLength(1));
    const novoPar = await r.encerrar();
    expect(novoPar.link).not.toBe(par.link);
    await espera(() => expect(antigo.statusAtual.situacao).toBe('encerrado'));
    expect(r.celularesConectados()).toHaveLength(0);
    await antigo.enviar({ c: 'zapear' }); // comando velho com a chave velha
    // quem abrir o link antigo também não consegue nada
    const { sessao, chaveRaw } = parse(par.link);
    const reaberto = new Controlador({ transporte: bus.criar(), sessao, chaveRaw, nome: 'Reaberto' });
    await reaberto.conectar();
    await reaberto.enviar({ c: 'canal:proximo' });
    await new Promise((res) => setTimeout(res, 50));
    expect(acoes.calls).toEqual([]);
    // o link novo funciona
    const n = parse(novoPar.link);
    const novo = new Controlador({ transporte: bus.criar(), sessao: n.sessao, chaveRaw: n.chaveRaw, nome: 'Novo' });
    await novo.conectar();
    await novo.enviar({ c: 'canal:proximo' });
    await espera(() => expect(acoes.calls).toEqual([['proximo']]));
  });

  it('recarregar o computador: a sessão exportada volta e os celulares continuam a controlar', async () => {
    const { r, celular, bus } = await montar();
    const c = await celular('Persistente');
    await espera(() => expect(r.celularesConectados()).toHaveLength(1));
    const salvo = JSON.parse(JSON.stringify(r.exportar()));
    r.fechar();
    const acoes2 = acoesEspia();
    const r2 = new Receptor({ transporte: bus.criar(), acoes: acoes2, urlBase: 'https://s.example/tv-livre/', iteracoes: ITER });
    await r2.iniciar(salvo);
    await c.enviar({ c: 'zapear' });
    await espera(() => expect(acoes2.calls).toEqual([['zapear']]));
  });
});

describe('estado, versão, queda e reconexão', () => {
  it('versão diferente mostra "atualize a página"', async () => {
    const { r, celular, par, bus } = await montar();
    const c = await celular();
    await espera(() => expect(r.celularesConectados()).toHaveLength(1));
    const { sessao, chaveRaw } = parse(par.link);
    const tv = bus.criar();
    await tv.conectar([]);
    tv.enviar(topicoEstado(await hashSessao(sessao)), await empacotar(await importarChave(chaveRaw), { v: 99, seq: 1, ts: Date.now(), de: 'tv', t: 'estado', d: estado() }));
    await espera(() => expect(c.statusAtual.situacao).toBe('versao'));
    expect(c.statusAtual.motivo).toMatch(/Atualize a página/);
  });

  it('broker fora: erro com o motivo e possibilidade de tentar de novo', async () => {
    const bus = new BarramentoMemoria();
    const t = bus.criar();
    t.falharAoConectar = 'broker fora do ar';
    const c = new Controlador({ transporte: t, sessao: 'abc', chaveRaw: (await (await import('../../../src/lib/remote/seguranca.ts')).gerarChave()).raw, nome: 'x' });
    await expect(c.conectar()).rejects.toThrow('broker fora do ar');
    expect(c.statusAtual).toEqual({ situacao: 'erro', motivo: 'broker fora do ar' });
  });

  it('queda de rede: "reconectando…", reenvia ping ao voltar e volta a "conectado" com o estado', async () => {
    const { r, par, bus, acoes } = await montar();
    const t = bus.criar();
    const { sessao, chaveRaw } = parse(par.link);
    const c = new Controlador({ transporte: t, sessao, chaveRaw, nome: 'Trem' });
    await c.conectar();
    await r.publicarEstado(estado('03'));
    await espera(() => expect(c.statusAtual.situacao).toBe('conectado'));
    t.cair();
    expect(c.statusAtual.situacao).toBe('reconectando');
    await r.publicarEstado(estado('04'));
    t.voltar();
    await espera(() => expect(c.estadoAtual?.canal?.numero).toBe('04'));
    expect(c.statusAtual.situacao).toBe('conectado');
    expect(acoes.calls).toEqual([]);
  });

  it('voltar do segundo plano (iPhone): reconectar() mostra "reconectando…" e reenvia ping', async () => {
    const { r, par, bus } = await montar();
    const { sessao, chaveRaw } = parse(par.link);
    const c = new Controlador({ transporte: bus.criar(), sessao, chaveRaw, nome: 'iPhone' });
    await c.conectar();
    await r.publicarEstado(estado('05'));
    await espera(() => expect(c.statusAtual.situacao).toBe('conectado'));
    const antes = bus.log.filter((m) => m.topico.endsWith('/cmd')).length;
    c.reconectar();
    expect(c.statusAtual.situacao).toBe('reconectando');
    await espera(() => expect(bus.log.filter((m) => m.topico.endsWith('/cmd')).length).toBeGreaterThan(antes));
    await r.publicarEstado(estado('06'));
    await espera(() => expect(c.statusAtual.situacao).toBe('conectado'));
  });

  it('sem sinal do computador (relógio simulado): depois de 40 s sem estado, "sem sinal"; volta quando o estado chega', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let agora = 1_800_000_000_000;
    const { r, par, bus } = await montar({ relogio: () => agora });
    const { sessao, chaveRaw } = parse(par.link);
    const c = new Controlador({ transporte: bus.criar(), sessao, chaveRaw, nome: 'Cel', relogio: () => agora, pingMs: 10_000, semSinalMs: 40_000 });
    await c.conectar();
    await r.publicarEstado(estado());
    await espera(() => expect(c.statusAtual.situacao).toBe('conectado'));
    // o computador "morre" (se continuasse vivo, responderia aos pings e o sinal nunca cairia)
    const vivo = bus.criar();
    void vivo;
    r.fechar();
    for (let i = 0; i < 5; i++) {
      agora += 10_000;
      await vi.advanceTimersByTimeAsync(10_000);
    }
    expect(c.statusAtual.situacao).toBe('sem-sinal');
    expect(c.statusAtual.motivo).toMatch(/computador não responde/);
    // o computador volta (outro receptor com a mesma sessão): o estado chega e o controle volta a "conectado"
    const volta = new Receptor({ transporte: bus.criar(), acoes: acoesEspia(), urlBase: 'x/', iteracoes: ITER, relogio: () => agora });
    await volta.iniciar(r.exportar());
    await volta.publicarEstado(estado('08'));
    await espera(() => expect(c.statusAtual.situacao).toBe('conectado'));
  });

  it('relógios muito diferentes: avisa para ajustar a data e a hora', async () => {
    const agoraTv = 1_800_000_000_000;
    const { r, par, bus } = await montar({ relogio: () => agoraTv });
    const { sessao, chaveRaw } = parse(par.link);
    const c = new Controlador({ transporte: bus.criar(), sessao, chaveRaw, nome: 'Cel', relogio: () => agoraTv + 5 * 60_000 });
    await c.conectar();
    for (let i = 0; i < 3; i++) await r.publicarEstado(estado());
    await espera(() => expect(c.statusAtual.motivo).toMatch(/data e a hora/));
  });
});
