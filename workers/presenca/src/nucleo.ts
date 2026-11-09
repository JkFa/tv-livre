/**
 * Núcleo do serviço de presença: só funções e classes puras (sem Cloudflare), para testar sem o runtime.
 * O número é uma ESTIMATIVA de conexões abertas, não uma métrica auditada.
 */
import { CONFIG } from './config.ts';

export type EstadoConexao = 'n' | 'a'; // navegando | assistindo
/** Guardado por conexão (serializeAttachment). Campos curtos de propósito. */
export interface Anexo {
  e: EstadoConexao;
  /** id do canal (só quando assistindo) */
  c?: string;
  /** país do canal */
  p?: string;
  /** conectou em (ms) */
  x: number;
  /** última mensagem recebida (ms) */
  u: number;
  /** fichas da rajada de mensagens e quando foram repostas */
  f: number;
  r: number;
}

export interface MsgEstado {
  s: 'assistindo' | 'navegando';
  c?: string;
  p?: string;
}

const ID_CANAL = /^[A-Za-z0-9._@~-]{1,100}$/;
const PAIS = /^[A-Za-z]{2,3}$/;

/** Mensagem do cliente válida ou null. Tamanho, formato e campos são conferidos; o resto é ignorado. */
export function validarMensagem(texto: unknown): MsgEstado | null {
  if (typeof texto !== 'string' || texto.length === 0 || texto.length > CONFIG.MAX_MSG_BYTES) return null;
  let x: unknown;
  try {
    x = JSON.parse(texto);
  } catch {
    return null;
  }
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (o.t !== 'estado') return null;
  if (o.s === 'navegando') return { s: 'navegando' };
  if (o.s === 'assistindo') {
    if (typeof o.c !== 'string' || !ID_CANAL.test(o.c)) return null;
    if (o.p !== undefined && (typeof o.p !== 'string' || !PAIS.test(o.p))) return null;
    return { s: 'assistindo', c: o.c, ...(typeof o.p === 'string' ? { p: o.p.toUpperCase() } : {}) };
  }
  return null;
}

export interface Top {
  c: string;
  p: string;
  n: number;
}
export interface Resumo {
  online: number;
  assistindo: number;
  /** contagem por canal (`PAÍS/id`), COMPLETA: só para uso interno; a saída pública usa `top` e `contagemDo` */
  contagem: Map<string, number>;
  top: Top[];
}
export const chaveCanal = (p: string | undefined, c: string): string => `${p ?? '??'}/${c}`;

/** Conta online, assistindo e por canal, e monta o top N apenas com canais que passam do mínimo público. */
export function resumir(anexos: readonly Pick<Anexo, 'e' | 'c' | 'p'>[], minPublico: number = CONFIG.MIN_PUBLICO, topN: number = CONFIG.TOP_N): Resumo {
  const contagem = new Map<string, number>();
  let assistindo = 0;
  for (const a of anexos) {
    if (a.e !== 'a' || !a.c) continue;
    assistindo++;
    const k = chaveCanal(a.p, a.c);
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  const top: Top[] = [...contagem]
    .filter(([, n]) => n >= minPublico)
    .map(([k, n]) => {
      const i = k.indexOf('/');
      return { p: k.slice(0, i), c: k.slice(i + 1), n };
    })
    .sort((a, b) => b.n - a.n || a.c.localeCompare(b.c))
    .slice(0, topN);
  return { online: anexos.length, assistindo, contagem, top };
}

/** Quantos estão no canal desta conexão, ou null se não assiste ou se há menos que o mínimo público. */
export function contagemDo(r: Resumo, a: Pick<Anexo, 'e' | 'c' | 'p'>, minPublico: number = CONFIG.MIN_PUBLICO): number | null {
  if (a.e !== 'a' || !a.c) return null;
  const n = r.contagem.get(chaveCanal(a.p, a.c)) ?? 0;
  return n >= minPublico ? n : null;
}

// ---------------- contadores e recordes ----------------
export interface Contadores {
  /** total de acessos (começa no valor do Abacus, uma vez) */
  total: number;
  /** o total já foi migrado do Abacus? */
  migrado: boolean;
  /** dia (AAAA-MM-DD, America/Sao_Paulo) a que `hoje` se refere */
  dia: string;
  hoje: number;
  pico: number;
  /** AAAA-MM-DD do pico */
  picoEm: string;
}
export const novosContadores = (agora: number): Contadores => ({ total: 0, migrado: false, dia: diaSP(agora), hoje: 0, pico: 0, picoEm: '' });

const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
/** AAAA-MM-DD no fuso de São Paulo. */
export const diaSP = (ms: number): string => fmtDia.format(new Date(ms));

/** Vira o dia (zera "hoje") se mudou o dia em São Paulo. Devolve true se mudou. */
export function virarDia(c: Contadores, agora: number): boolean {
  const d = diaSP(agora);
  if (c.dia === d) return false;
  c.dia = d;
  c.hoje = 0;
  return true;
}
export function aplicarAcesso(c: Contadores, agora: number): void {
  virarDia(c, agora);
  c.total++;
  c.hoje++;
}
/** Atualiza o pico de pessoas assistindo. Devolve true se bateu o recorde. */
export function atualizarPico(c: Contadores, assistindo: number, agora: number): boolean {
  if (assistindo <= c.pico) return false;
  c.pico = assistindo;
  c.picoEm = diaSP(agora);
  return true;
}

// ---------------- limites de abuso (só em memória) ----------------
/** Janela deslizante simples por chave. Nada disso é gravado: reinicia quando o objeto reinicia. */
export class LimitadorJanela {
  private m = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly janelaMs: number,
  ) {}
  /** Registra e devolve true se ainda está dentro do limite. */
  permitir(chave: string, agora: number): boolean {
    const l = (this.m.get(chave) ?? []).filter((t) => agora - t < this.janelaMs);
    if (l.length >= this.max) {
      this.m.set(chave, l);
      return false;
    }
    l.push(agora);
    this.m.set(chave, l);
    if (this.m.size > 5000) for (const [k, v] of this.m) if (!v.some((t) => agora - t < this.janelaMs)) this.m.delete(k);
    return true;
  }
}

/** Conexões simultâneas por IP, só em memória. */
export class ContadorPorIp {
  private m = new Map<string, number>();
  constructor(private readonly max: number = CONFIG.MAX_CONEXOES_POR_IP) {}
  entrar(ip: string): boolean {
    const n = this.m.get(ip) ?? 0;
    if (n >= this.max) return false;
    this.m.set(ip, n + 1);
    return true;
  }
  sair(ip: string): void {
    const n = (this.m.get(ip) ?? 0) - 1;
    if (n <= 0) this.m.delete(ip);
    else this.m.set(ip, n);
  }
}

/** Rajada de mensagens por conexão: `f` fichas (no máximo `rajada`), repostas a 1 por `intervalo`. Devolve o novo estado ou null se estourou. */
export function gastarFicha(a: Pick<Anexo, 'f' | 'r'>, agora: number, intervalo: number = CONFIG.MSG_INTERVALO_MS, rajada: number = CONFIG.MSG_RAJADA): { f: number; r: number } | null {
  const repor = Math.max(0, Math.floor((agora - a.r) / intervalo));
  let fichas = a.f + repor;
  let r = a.r + repor * intervalo;
  if (fichas >= rajada) {
    fichas = rajada;
    r = agora;
  }
  if (fichas < 1) return null;
  return { f: fichas - 1, r };
}

/** Origem permitida? Produção: só as da lista. Dev: também localhost e 127.0.0.1 (qualquer porta, http). */
export function origemPermitida(origin: string | null, ambiente: string, lista: string): boolean {
  if (!origin) return false;
  const permitidas = lista.split(',').map((s) => s.trim()).filter(Boolean);
  if (permitidas.includes(origin)) return true;
  return ambiente === 'dev' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
}

/** Sem nenhum sinal (mensagem ou ping automático) há mais que o limite? */
export const estaMorta = (ultimoSinalMs: number, agora: number, limite: number = CONFIG.MORTA_MS): boolean => agora - ultimoSinalMs > limite;
