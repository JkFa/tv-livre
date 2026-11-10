import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  atrasoReconexao, ENVIO_MIN_INTERVALO_MS, lerResumo, MAX_FALHAS, OCIOSO_MS, PING_MS, PONG_ESPERA_MS, Presenca, SUMIR_APOS_MS,
  type CanalLike, type Deps, type LocksLike, type Resumo, type SocketLike,
} from '../../src/lib/presenca.ts';

// ---------- dublês ----------
class Sock implements SocketLike {
  static todos: Sock[] = [];
  /** o serviço de verdade responde "pong" ao "ping" sem acordar ninguém */
  static autoPong = true;
  enviados: string[] = [];
  fechado: number | null = null;
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  constructor(public url: string) {
    Sock.todos.push(this);
  }
  send(d: string) {
    this.enviados.push(d);
    if (d === 'ping' && Sock.autoPong) queueMicrotask(() => this.receber('pong'));
  }
  close(c?: number) {
    this.fechado = c ?? 1005;
    this.onclose?.({});
  }
  abrir() {
    this.onopen?.({});
  }
  receber(d: unknown) {
    this.onmessage?.({ data: d });
  }
  cair() {
    this.onclose?.({});
  }
  get estados() {
    return this.enviados.filter((e) => e !== 'ping').map((e) => JSON.parse(e) as { s: string; c?: string; p?: string });
  }
}
const resumoMsg = (over: Partial<Resumo> = {}) =>
  JSON.stringify({ t: 'resumo', v: 1, online: 5, assistindo: 3, top: [{ c: 'x', p: 'BR', n: 3 }], meu: 3, acessos: 100, hoje: 10, pico: 7, picoEm: '2026-11-09', ...over });

/** Locks e canal compartilhados entre as "abas" de um mesmo navegador. */
function navegador() {
  const fila: { cb: () => Promise<unknown> }[] = [];
  let ocupado = false;
  const rodar = () => {
    if (ocupado) return;
    const prox = fila.shift();
    if (!prox) return;
    ocupado = true;
    void prox.cb().then(() => {
      ocupado = false;
      rodar();
    });
  };
  const locks: LocksLike = {
    request: (_n, cb) => {
      fila.push({ cb });
      rodar();
      return new Promise(() => undefined);
    },
  };
  const canais = new Set<FakeCanal>();
  class FakeCanal implements CanalLike {
    onmessage: CanalLike['onmessage'] = null;
    constructor() {
      canais.add(this);
    }
    postMessage(m: unknown) {
      const copia = JSON.parse(JSON.stringify(m));
      for (const c of canais) if (c !== this) queueMicrotask(() => c.onmessage?.({ data: copia }));
    }
    close() {
      canais.delete(this);
    }
  }
  return { locks, criarCanal: () => new FakeCanal() };
}

function aba(nav: ReturnType<typeof navegador>, id: string, over: Partial<Deps> = {}) {
  const resumos: (Resumo | null)[] = [];
  let visivel = true;
  const p = new Presenca({
    wsUrl: 'wss://presenca.test/ws', criarSocket: (u) => new Sock(u), criarCanal: nav.criarCanal, locks: nav.locks,
    tabId: id, visivel: () => visivel, onResumo: (r) => resumos.push(r), random: () => 0.5, ...over,
  });
  return { p, resumos, ocultar: (v: boolean) => { visivel = !v; p.visibilidade(!v); } };
}
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  Sock.todos = [];
  Sock.autoPong = true;
});
afterEach(() => vi.useRealTimers());

describe('lerResumo', () => {
  it('aceita o formato do serviço e rejeita o resto', () => {
    expect(lerResumo(resumoMsg())).toMatchObject({ online: 5, assistindo: 3, meu: 3, top: [{ c: 'x', p: 'BR', n: 3 }] });
    expect(lerResumo(resumoMsg({ meu: null }))?.meu).toBeNull();
    for (const ruim of ['pong', '', '{', '{"t":"resumo","v":2}', JSON.stringify({ t: 'resumo', v: 1, online: -1 }), JSON.stringify({ t: 'x' }), 5, null,
      resumoMsg({ online: 1.5 as unknown as number }), resumoMsg({ top: 'x' as unknown as Resumo['top'] }), 'x'.repeat(9000)]) {
      expect(lerResumo(ruim)).toBeNull();
    }
  });
});

describe('atrasoReconexao', () => {
  it('dobra de 1 s até 60 s e varia ±25%', () => {
    const meio = () => 0.5;
    expect([1, 2, 3, 4, 5, 6, 7, 8, 12].map((n) => atrasoReconexao(n, meio))).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
    expect(atrasoReconexao(3, () => 0)).toBe(3000);
    expect(atrasoReconexao(3, () => 1)).toBe(5000);
  });
});

describe('eleição da aba líder (Web Locks)', () => {
  it('duas abas do mesmo navegador usam UMA conexão', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    const b = aba(nav, 'B');
    a.p.iniciar();
    b.p.iniciar();
    await tick();
    expect(Sock.todos).toHaveLength(1);
    expect(a.p.ehLider).toBe(true);
    expect(b.p.ehLider).toBe(false);
  });

  it('se a líder fecha, a outra assume e abre a conexão', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    const b = aba(nav, 'B');
    a.p.iniciar();
    b.p.iniciar();
    await tick();
    Sock.todos[0]!.abrir();
    a.p.parar();
    await tick();
    expect(Sock.todos[0]!.fechado).toBe(1000);
    expect(b.p.ehLider).toBe(true);
    expect(Sock.todos).toHaveLength(2);
  });

  it('o estado de uma aba seguidora chega ao serviço pela líder; a líder repassa o resumo', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    const b = aba(nav, 'B');
    a.p.iniciar();
    b.p.iniciar();
    await tick();
    const s = Sock.todos[0]!;
    s.abrir();
    b.p.definir({ c: 'globo', p: 'BR' });
    await tick(600);
    expect(s.estados).toEqual([{ t: 'estado', s: 'assistindo', c: 'globo', p: 'BR' }]);
    s.receber(resumoMsg());
    await tick();
    expect(a.resumos.at(-1)?.assistindo).toBe(3);
    expect(b.resumos.at(-1)?.assistindo).toBe(3); // a seguidora recebe pela outra aba
  });

  it('com duas abas tocando, continua assistindo enquanto UMA delas toca', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    const b = aba(nav, 'B');
    a.p.iniciar();
    b.p.iniciar();
    await tick();
    const s = Sock.todos[0]!;
    s.abrir();
    a.p.definir({ c: 'um', p: 'BR' });
    await tick(600);
    b.p.definir({ c: 'dois', p: 'BR' });
    await tick(ENVIO_MIN_INTERVALO_MS + 100);
    expect(s.estados.at(-1)).toMatchObject({ s: 'assistindo', c: 'dois' }); // vale a mais recente
    b.p.definir(null);
    await tick(ENVIO_MIN_INTERVALO_MS + 100);
    expect(s.estados.at(-1)).toMatchObject({ s: 'assistindo', c: 'um' }); // A ainda toca
    a.p.definir(null);
    await tick(ENVIO_MIN_INTERVALO_MS + 100);
    expect(s.estados.at(-1)).toEqual({ t: 'estado', s: 'navegando' });
  });

  it('abas que somem sem avisar (travaram) deixam de contar após 3 min', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    const b = aba(nav, 'B');
    a.p.iniciar();
    b.p.iniciar();
    await tick();
    const s = Sock.todos[0]!;
    s.abrir();
    b.p.definir({ c: 'x', p: 'BR' });
    await tick(600);
    expect(s.estados.at(-1)).toMatchObject({ s: 'assistindo' });
    // B some sem mandar "sai" e sem repetir o estado
    (b.p as unknown as { canal: CanalLike }).canal.postMessage = () => undefined;
    (b.p as unknown as { publicar: () => void }).publicar = () => undefined;
    a.p.visibilidade(true); // a líder faz um recálculo depois de 4 min
    await tick(4 * 60_000);
    a.p.visibilidade(true);
    await tick(ENVIO_MIN_INTERVALO_MS + 100);
    expect(s.estados.at(-1)).toEqual({ t: 'estado', s: 'navegando' });
  });
});

describe('estados assistindo / navegando', () => {
  it('só conecta quando iniciada, envia "assistindo" ao tocar e "navegando" ao pausar/erro', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    expect(Sock.todos).toHaveLength(0);
    a.p.iniciar();
    await tick();
    const s = Sock.todos[0]!;
    expect(s.url).toBe('wss://presenca.test/ws');
    s.abrir();
    await tick(600);
    expect(s.estados).toEqual([]); // começa "navegando" no serviço: nada a enviar
    a.p.definir({ c: 'sbt', p: 'BR' });
    await tick(600);
    expect(s.estados).toEqual([{ t: 'estado', s: 'assistindo', c: 'sbt', p: 'BR' }]);
    a.p.definir(null);
    await tick(ENVIO_MIN_INTERVALO_MS + 100);
    expect(s.estados.at(-1)).toEqual({ t: 'estado', s: 'navegando' });
  });

  it('zapear rápido: no máximo 1 mensagem a cada 2 s e a última sempre vence', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    a.p.iniciar();
    await tick();
    const s = Sock.todos[0]!;
    s.abrir();
    for (let i = 0; i < 20; i++) {
      a.p.definir({ c: `canal${i}`, p: 'BR' });
      await tick(300);
    }
    await tick(ENVIO_MIN_INTERVALO_MS + 100);
    expect(s.estados.at(-1)).toMatchObject({ c: 'canal19' });
    expect(s.estados.length).toBeLessThanOrEqual(Math.ceil((20 * 300) / ENVIO_MIN_INTERVALO_MS) + 2);
  });

  it('ao reconectar, reenvia o estado atual', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    a.p.iniciar();
    await tick();
    Sock.todos[0]!.abrir();
    a.p.definir({ c: 'x', p: 'BR' });
    await tick(600);
    Sock.todos[0]!.cair();
    await tick(1100);
    const s2 = Sock.todos[1]!;
    s2.abrir();
    await tick(600);
    expect(s2.estados).toEqual([{ t: 'estado', s: 'assistindo', c: 'x', p: 'BR' }]);
  });
});

describe('aba em segundo plano', () => {
  it('oculta e sem tocar: fecha a conexão após 2 min e reabre ao voltar', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    a.p.iniciar();
    await tick();
    const s = Sock.todos[0]!;
    s.abrir();
    a.ocultar(true);
    await tick(OCIOSO_MS - 1000);
    expect(s.fechado).toBeNull();
    await tick(1500);
    expect(s.fechado).toBe(1000);
    expect(Sock.todos).toHaveLength(1);
    a.ocultar(false);
    await tick();
    expect(Sock.todos).toHaveLength(2);
  });

  it('oculta mas ainda tocando: mantém a conexão e continua contando', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    a.p.iniciar();
    await tick();
    const s = Sock.todos[0]!;
    s.abrir();
    a.p.definir({ c: 'x', p: 'BR' });
    a.ocultar(true);
    await tick(OCIOSO_MS * 3);
    expect(s.fechado).toBeNull();
    // para de tocar em segundo plano → passa a contar o tempo ocioso
    a.p.definir(null);
    await tick(OCIOSO_MS + 3000);
    expect(s.fechado).toBe(1000);
  });
});

describe('reconexão', () => {
  it('backoff 1 s, 2 s, 4 s, 8 s e desiste após 5 falhas seguidas, tentando de novo só na próxima interação', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    a.p.iniciar();
    await tick();
    const atrasos: number[] = [];
    let t = Date.now();
    for (let i = 0; i < MAX_FALHAS - 1; i++) {
      expect(Sock.todos).toHaveLength(i + 1);
      Sock.todos[i]!.cair();
      const antes = Sock.todos.length;
      while (Sock.todos.length === antes) {
        await tick(100);
        if (Date.now() - t > 120_000) throw new Error('não reconectou');
      }
      atrasos.push(Math.round((Date.now() - t) / 100) * 100);
      t = Date.now();
    }
    expect(atrasos).toEqual([1000, 2000, 4000, 8000]);
    Sock.todos.at(-1)!.cair(); // 5ª falha
    expect(a.p.desistida).toBe(true);
    await tick(10 * 60_000);
    expect(Sock.todos).toHaveLength(MAX_FALHAS);
    expect(a.resumos.at(-1)).toBeNull(); // números somem em silêncio
    a.p.interagir();
    await tick();
    expect(Sock.todos).toHaveLength(MAX_FALHAS + 1);
    expect(a.p.desistida).toBe(false);
  });

  it('receber um resumo zera as falhas; sem serviço os números somem após 20 s', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    a.p.iniciar();
    await tick();
    let s = Sock.todos[0]!;
    s.abrir();
    s.receber(resumoMsg());
    expect(a.resumos.at(-1)?.assistindo).toBe(3);
    s.cair();
    await tick(SUMIR_APOS_MS - 1000);
    expect(a.resumos.at(-1)).not.toBeNull(); // ainda mostra o último valor durante a queda curta
    await tick(1500);
    expect(a.resumos.at(-1)).toBeNull();
    await tick(2000);
    s = Sock.todos.at(-1)!;
    s.abrir();
    s.receber(resumoMsg({ assistindo: 9 }));
    expect(a.resumos.at(-1)?.assistindo).toBe(9);
    // depois de um resumo, as falhas recomeçam do zero: a próxima queda reconecta em ~1 s
    const n = Sock.todos.length;
    s.cair();
    await tick(1100);
    expect(Sock.todos).toHaveLength(n + 1);
  });

  it('ignora mensagens que não são resumo válido', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    a.p.iniciar();
    await tick();
    const s = Sock.todos[0]!;
    s.abrir();
    s.receber('lixo');
    s.receber('{"t":"resumo","v":1,"online":"muitos"}');
    expect(a.resumos).toEqual([]);
  });
});

describe('ping', () => {
  it('manda "ping" a cada 60 s; sem "pong" em 15 s fecha e reconecta', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    a.p.iniciar();
    await tick();
    const s = Sock.todos[0]!;
    Sock.autoPong = false;
    s.abrir();
    await tick(PING_MS + 10);
    expect(s.enviados.filter((e) => e === 'ping')).toHaveLength(1);
    s.receber('pong');
    await tick(PONG_ESPERA_MS + 100);
    expect(s.fechado).toBeNull(); // o pong chegou
    await tick(PING_MS);
    expect(s.enviados.filter((e) => e === 'ping')).toHaveLength(2);
    await tick(PONG_ESPERA_MS + 100); // este não teve pong
    expect(s.fechado).toBe(4000);
    await tick(1500);
    expect(Sock.todos).toHaveLength(2);
  });
});

describe('parar', () => {
  it('fecha a conexão e avisa as outras abas', async () => {
    const nav = navegador();
    const a = aba(nav, 'A');
    a.p.iniciar();
    await tick();
    const s = Sock.todos[0]!;
    s.abrir();
    a.p.parar();
    expect(s.fechado).toBe(1000);
    await tick(10 * 60_000);
    expect(Sock.todos).toHaveLength(1); // não reconecta sozinha
  });
});
