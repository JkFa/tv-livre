/**
 * "Assistindo agora": uma conexão WebSocket por navegador (a aba líder, eleita por Web Locks) com o serviço de presença.
 * Só informa DOIS fatos: se há alguém com o TV Livre aberto e qual canal está tocando. Nenhum identificador persistente,
 * cookie ou dado pessoal sai daqui; o id da aba (aleatório, em sessionStorage) só conversa entre abas do mesmo navegador.
 *
 * Toda a lógica fica numa classe com dependências injetadas (socket, canal entre abas, locks, relógio) para testar sem navegador.
 */

export interface Resumo {
  online: number;
  assistindo: number;
  top: { c: string; p: string; n: number }[];
  /** quantos assistem o MEU canal (o serviço só informa com 3 ou mais) */
  meu: number | null;
  acessos: number;
  hoje: number;
  pico: number;
  picoEm: string;
}
export type Assistindo = { c: string; p: string } | null;

export interface SocketLike {
  send(dados: string): void;
  close(codigo?: number): void;
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
}
export interface CanalLike {
  postMessage(m: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
}
export interface LocksLike {
  request(nome: string, cb: () => Promise<unknown>): Promise<unknown>;
}
export interface Deps {
  wsUrl: string;
  criarSocket: (url: string) => SocketLike;
  criarCanal?: () => CanalLike | null;
  locks?: LocksLike | null;
  tabId: string;
  visivel: () => boolean;
  onResumo: (r: Resumo | null) => void;
  agora?: () => number;
  random?: () => number;
}

/** Os mesmos números do serviço (workers/presenca/src/config.ts). */
export const PING_MS = 60_000;
export const PONG_ESPERA_MS = 15_000;
export const ENVIO_MIN_INTERVALO_MS = 2_000;
export const ENVIO_ATRASO_MS = 500;
export const OCIOSO_MS = 2 * 60_000;
export const BACKOFF_INICIO_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;
export const MAX_FALHAS = 5;
/** Depois de perder a conexão, os números somem se não voltar em tanto tempo. */
export const SUMIR_APOS_MS = 20_000;
export const ABA_VALIDADE_MS = 3 * 60_000;
export const NOME_LOCK = 'tvlivre:presenca-lider';
export const NOME_CANAL = 'tvlivre:presenca';

interface Entrada {
  e: Assistindo;
  v: boolean;
  ts: number;
}

const nat = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** Confere os campos do resumo (usado tanto para o que vem do serviço quanto para o que outra aba retransmite). */
export function validarResumo(x: unknown): Resumo | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (!nat(o.online) || !nat(o.assistindo) || !nat(o.acessos) || !nat(o.hoje) || !nat(o.pico)) return null;
  if (!Array.isArray(o.top) || o.top.length > 10) return null;
  const top: Resumo['top'] = [];
  for (const t of o.top as unknown[]) {
    const r = t as { c?: unknown; p?: unknown; n?: unknown } | null;
    if (!r || typeof r.c !== 'string' || typeof r.p !== 'string' || !nat(r.n)) return null;
    top.push({ c: r.c.slice(0, 100), p: r.p.slice(0, 3), n: r.n });
  }
  const meu = nat(o.meu) ? o.meu : null;
  return { online: o.online, assistindo: o.assistindo, top, meu, acessos: o.acessos, hoje: o.hoje, pico: o.pico, picoEm: typeof o.picoEm === 'string' ? o.picoEm.slice(0, 10) : '' };
}

/** Lê a mensagem de texto do serviço: JSON `{"t":"resumo","v":1,…}` válido ou null. */
export function lerResumo(texto: unknown): Resumo | null {
  if (typeof texto !== 'string' || texto.length > 8000) return null;
  try {
    const x = JSON.parse(texto) as { t?: unknown; v?: unknown } | null;
    return x && x.t === 'resumo' && x.v === 1 ? validarResumo(x) : null;
  } catch {
    return null;
  }
}

/** Atraso de reconexão: 1 s, 2 s, 4 s… até 60 s, com sorteio de ±25% para não reconectar todo mundo junto. */
export function atrasoReconexao(falhas: number, random: () => number): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_INICIO_MS * 2 ** Math.max(0, falhas - 1));
  return Math.round(base * (0.75 + 0.5 * random()));
}

export class Presenca {
  private readonly d: Required<Pick<Deps, 'agora' | 'random'>> & Deps;
  private canal: CanalLike | null = null;
  private meu: Entrada;
  private abas = new Map<string, Entrada>();
  private iniciado = false;
  private lider = false;
  private sock: SocketLike | null = null;
  private aberto = false;
  private falhas = 0;
  private desistiu = false;
  private ocioso = false;
  private enviado: string | null = null;
  private ultimoEnvio = 0;
  private tEnvio: ReturnType<typeof setTimeout> | undefined;
  private tPing: ReturnType<typeof setInterval> | undefined;
  private tPong: ReturnType<typeof setTimeout> | undefined;
  private tReconectar: ReturnType<typeof setTimeout> | undefined;
  private tOcioso: ReturnType<typeof setTimeout> | undefined;
  private tSumir: ReturnType<typeof setTimeout> | undefined;
  private tBatida: ReturnType<typeof setInterval> | undefined;
  private liberarLock: (() => void) | null = null;

  constructor(deps: Deps) {
    this.d = { agora: () => Date.now(), random: Math.random, ...deps };
    this.meu = { e: null, v: deps.visivel(), ts: this.d.agora() };
  }

  get ehLider(): boolean {
    return this.lider;
  }
  get desistida(): boolean {
    return this.desistiu;
  }

  iniciar(): void {
    if (this.iniciado) return;
    this.iniciado = true;
    this.canal = this.d.criarCanal?.() ?? null;
    if (this.canal) this.canal.onmessage = (e) => this.aoCanal(e.data);
    // cada aba repete o seu estado de tempos em tempos (o líder descarta abas que sumiram sem avisar)
    this.tBatida = setInterval(() => this.publicar(), PING_MS);
    if (this.d.locks) {
      // o lock é segurado enquanto a aba viver: se a líder fechar, a próxima da fila assume
      void this.d.locks
        .request(NOME_LOCK, () => {
          if (!this.iniciado) return Promise.resolve();
          this.virarLider();
          return new Promise<void>((res) => (this.liberarLock = res));
        })
        .catch(() => undefined);
    } else {
      this.virarLider();
    }
    this.publicar();
  }

  /** A aba deixa de existir (fechou ou foi para o cache de páginas). */
  parar(): void {
    if (!this.iniciado) return;
    this.iniciado = false;
    this.canal?.postMessage({ k: 'sai', id: this.d.tabId });
    this.limpar();
    if (this.sock) this.fecharSocket(1000);
    this.liberarLock?.();
    this.liberarLock = null;
    this.lider = false;
    this.abas.clear();
    this.canal?.close();
    this.canal = null;
  }

  /** O que esta aba está tocando agora (null = nada). Chamado quando começa a tocar, troca de canal, pausa ou dá erro. */
  definir(a: Assistindo): void {
    if (this.meu.e?.c === a?.c && this.meu.e?.p === a?.p) return;
    this.meu = { ...this.meu, e: a, ts: this.d.agora() };
    this.publicar();
  }

  /** A aba ficou visível ou oculta. */
  visibilidade(visivel: boolean): void {
    this.meu = { ...this.meu, v: visivel, ts: this.d.agora() };
    this.publicar();
  }

  /** Qualquer interação do usuário: se a presença tinha desistido, tenta de novo. */
  interagir(): void {
    if (!this.desistiu) return;
    this.desistiu = false;
    this.falhas = 0;
    this.conectar();
  }

  // ---------------- entre abas ----------------
  private publicar(): void {
    if (!this.iniciado) return;
    this.meu = { ...this.meu, ts: this.d.agora() };
    this.abas.set(this.d.tabId, this.meu);
    this.canal?.postMessage({ k: 'estado', id: this.d.tabId, e: this.meu.e, v: this.meu.v });
    if (this.lider) this.recalcular();
  }

  private aoCanal(m: unknown): void {
    const o = m as { k?: string; id?: unknown; e?: unknown; v?: unknown; r?: unknown } | null;
    if (!o || typeof o !== 'object') return;
    if (o.k === 'quem') return this.publicar();
    if (o.k === 'resumo') {
      if (!this.lider) this.d.onResumo(o.r === null ? null : validarResumo(o.r));
      return;
    }
    if (!this.lider || typeof o.id !== 'string' || o.id === this.d.tabId) return;
    if (o.k === 'sai') {
      this.abas.delete(o.id);
      return this.recalcular();
    }
    if (o.k === 'estado') {
      const e = o.e as { c?: unknown; p?: unknown } | null;
      const valido = e && typeof e.c === 'string' && typeof e.p === 'string' ? { c: e.c, p: e.p } : null;
      this.abas.set(o.id, { e: valido, v: o.v === true, ts: this.d.agora() });
      this.recalcular();
    }
  }

  private virarLider(): void {
    this.lider = true;
    this.abas.set(this.d.tabId, this.meu);
    this.canal?.postMessage({ k: 'quem' }); // as outras abas respondem com o estado delas
    this.recalcular();
  }

  /** Estado único da conexão: assistindo se QUALQUER aba toca (vale a mais recente); e se há alguma aba visível ou tocando. */
  private resultante(): { assistindo: Assistindo; ativo: boolean } {
    const agora = this.d.agora();
    let melhor: Entrada | null = null;
    let ativo = false;
    for (const [id, x] of this.abas) {
      if (id !== this.d.tabId && agora - x.ts > ABA_VALIDADE_MS) {
        this.abas.delete(id);
        continue;
      }
      if (x.v || x.e) ativo = true;
      if (x.e && (!melhor || x.ts >= melhor.ts)) melhor = x;
    }
    return { assistindo: melhor?.e ?? null, ativo };
  }

  private recalcular(): void {
    if (!this.lider) return;
    const { ativo } = this.resultante();
    if (ativo) {
      clearTimeout(this.tOcioso);
      this.tOcioso = undefined;
      if (this.ocioso) {
        this.ocioso = false;
        this.conectar();
      } else if (!this.sock && !this.tReconectar) {
        this.conectar(); // (durante a espera do backoff não fura a fila)
      }
    } else if (!this.tOcioso && !this.ocioso) {
      // todas as abas ocultas e nada tocando: depois de 2 min fecha a conexão (reabre ao voltar)
      this.tOcioso = setTimeout(() => {
        this.tOcioso = undefined;
        this.ocioso = true;
        clearTimeout(this.tReconectar);
        this.tReconectar = undefined;
        if (this.sock) this.fecharSocket(1000);
      }, OCIOSO_MS);
    }
    this.agendarEnvio();
  }

  // ---------------- conexão ----------------
  private conectar(): void {
    if (!this.iniciado || !this.lider || this.sock || this.desistiu || this.ocioso) return;
    clearTimeout(this.tReconectar);
    this.tReconectar = undefined;
    let s: SocketLike;
    try {
      s = this.d.criarSocket(this.d.wsUrl);
    } catch {
      return this.aoFalhar();
    }
    this.sock = s;
    this.aberto = false;
    s.onopen = () => {
      if (this.sock !== s) return;
      this.aberto = true;
      this.enviado = this.chave(null); // conexão nova: o serviço já começa em "navegando" e o balde de mensagens dela é novo
      this.ultimoEnvio = 0;
      this.tPing = setInterval(() => this.ping(), PING_MS);
      this.agendarEnvio();
    };
    s.onmessage = (e) => {
      if (this.sock !== s) return;
      if (e.data === 'pong') {
        clearTimeout(this.tPong);
        this.tPong = undefined;
        return;
      }
      const r = lerResumo(e.data);
      if (!r) return;
      this.falhas = 0;
      clearTimeout(this.tSumir);
      this.tSumir = undefined;
      this.d.onResumo(r);
      this.canal?.postMessage({ k: 'resumo', r });
    };
    s.onerror = () => undefined; // o `close` que vem em seguida cuida de tudo
    s.onclose = () => {
      if (this.sock !== s) return;
      this.sock = null;
      this.aberto = false;
      clearInterval(this.tPing);
      clearTimeout(this.tPong);
      this.tPing = this.tPong = undefined;
      if (!this.iniciado || this.ocioso) return;
      this.aoFalhar();
    };
  }

  private aoFalhar(): void {
    this.falhas++;
    if (this.falhas >= MAX_FALHAS) {
      this.desistiu = true;
      this.sumir();
      return;
    }
    if (!this.tSumir) this.tSumir = setTimeout(() => this.sumir(), SUMIR_APOS_MS);
    clearTimeout(this.tReconectar);
    this.tReconectar = setTimeout(() => {
      this.tReconectar = undefined;
      this.conectar();
    }, atrasoReconexao(this.falhas, this.d.random));
  }

  /** Sem serviço: os números desaparecem em silêncio (o vídeo e o resto do site continuam). */
  private sumir(): void {
    clearTimeout(this.tSumir);
    this.tSumir = undefined;
    this.d.onResumo(null);
    this.canal?.postMessage({ k: 'resumo', r: null });
  }

  private ping(): void {
    if (!this.sock || !this.aberto) return;
    try {
      this.sock.send('ping');
    } catch {
      return;
    }
    clearTimeout(this.tPong);
    this.tPong = setTimeout(() => {
      this.tPong = undefined;
      try {
        this.sock?.close(4000);
      } catch {
        /* já fechado */
      }
    }, PONG_ESPERA_MS);
  }

  private agendarEnvio(): void {
    if (!this.aberto || this.tEnvio) return;
    const { assistindo } = this.resultante();
    if (this.chave(assistindo) === this.enviado) return;
    // o serviço aceita ~1 mensagem a cada 2 s: agrupa as mudanças e sempre envia o estado MAIS RECENTE
    const espera = Math.max(ENVIO_ATRASO_MS, this.ultimoEnvio + ENVIO_MIN_INTERVALO_MS - this.d.agora());
    this.tEnvio = setTimeout(() => {
      this.tEnvio = undefined;
      if (!this.sock || !this.aberto) return;
      const { assistindo: a } = this.resultante();
      const k = this.chave(a);
      if (k === this.enviado) return;
      try {
        this.sock.send(JSON.stringify(a ? { t: 'estado', s: 'assistindo', c: a.c, p: a.p } : { t: 'estado', s: 'navegando' }));
        this.enviado = k;
        this.ultimoEnvio = this.d.agora();
      } catch {
        /* o close cuida */
      }
    }, espera);
  }
  private chave = (a: Assistindo): string => (a ? `${a.p}/${a.c}` : '-');

  private fecharSocket(codigo: number): void {
    const s = this.sock;
    this.sock = null;
    this.aberto = false;
    clearInterval(this.tPing);
    clearTimeout(this.tPong);
    clearTimeout(this.tEnvio);
    this.tEnvio = undefined;
    try {
      s?.close(codigo);
    } catch {
      /* já fechado */
    }
  }

  private limpar(): void {
    for (const t of [this.tEnvio, this.tPong, this.tReconectar, this.tOcioso, this.tSumir]) clearTimeout(t);
    clearInterval(this.tPing);
    clearInterval(this.tBatida);
    this.tEnvio = this.tPong = this.tReconectar = this.tOcioso = this.tSumir = this.tPing = this.tBatida = undefined;
  }
}
