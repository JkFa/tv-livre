/** Protocolo do controle remoto. Tudo que chega da rede é validado aqui: nunca se confia no que vem de fora. */

export const VERSAO = 1;
export const MAX_CELULARES = 3;

export type Comando =
  | { c: 'canal:proximo' }
  | { c: 'canal:anterior' }
  | { c: 'canal:numero'; n: number }
  | { c: 'canal:id'; id: string; pais?: string }
  | { c: 'zapear' }
  | { c: 'volume'; v: number }
  | { c: 'mudo'; m: boolean }
  | { c: 'pausa' }
  | { c: 'play' }
  | { c: 'favoritar' }
  | { c: 'buscar'; texto: string }
  | { c: 'tela'; cheia: boolean }
  | { c: 'ping' }
  | { c: 'hello'; nome: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, max: number): string | null => (typeof x === 'string' && x.length > 0 && x.length <= max ? x : null);

const SEM_DADOS = new Set(['canal:proximo', 'canal:anterior', 'zapear', 'pausa', 'play', 'favoritar', 'ping']);

/** Comando válido ou null. Campos desconhecidos são ignorados; tipos, faixas e tamanhos são conferidos. */
export function validarComando(x: unknown): Comando | null {
  if (!isObj(x) || typeof x.c !== 'string') return null;
  const c = x.c;
  if (SEM_DADOS.has(c)) return { c } as Comando;
  switch (c) {
    case 'canal:numero':
      return typeof x.n === 'number' && Number.isInteger(x.n) && x.n >= 1 && x.n <= 9999 ? { c, n: x.n } : null;
    case 'canal:id': {
      const id = str(x.id, 200);
      if (!id) return null;
      if (x.pais === undefined) return { c, id };
      const pais = typeof x.pais === 'string' && /^[A-Za-z]{2,3}$/.test(x.pais) ? x.pais.toUpperCase() : null;
      return pais ? { c, id, pais } : null;
    }
    case 'volume':
      return typeof x.v === 'number' && Number.isFinite(x.v) && x.v >= 0 && x.v <= 1 ? { c, v: x.v } : null;
    case 'mudo':
      return typeof x.m === 'boolean' ? { c, m: x.m } : null;
    case 'tela':
      return typeof x.cheia === 'boolean' ? { c, cheia: x.cheia } : null;
    case 'buscar':
      return typeof x.texto === 'string' && x.texto.length <= 100 ? { c, texto: x.texto } : null;
    case 'hello': {
      const nome = typeof x.nome === 'string' ? x.nome.slice(0, 40) : '';
      return { c, nome: nome || 'Celular' };
    }
    default:
      return null;
  }
}

export interface Estado {
  canal: { id: string; numero: string; nome: string; logo?: string; pais: string } | null;
  tocando: boolean;
  erro?: string;
  mudo: boolean;
  volume: number;
  favorito: boolean;
  programaAtual?: string;
  modoTV: boolean;
  versao: number;
}

export function validarEstado(x: unknown): Estado | null {
  if (!isObj(x) || typeof x.tocando !== 'boolean' || typeof x.mudo !== 'boolean' || typeof x.modoTV !== 'boolean') return null;
  if (typeof x.volume !== 'number' || !(x.volume >= 0 && x.volume <= 1)) return null;
  let canal: Estado['canal'] = null;
  if (x.canal !== null && x.canal !== undefined) {
    const k = x.canal;
    if (!isObj(k)) return null;
    const id = str(k.id, 200), numero = str(k.numero, 8), nome = str(k.nome, 200), pais = str(k.pais, 8);
    if (!id || !numero || !nome || !pais) return null;
    const logo = typeof k.logo === 'string' && /^https:\/\//i.test(k.logo) && k.logo.length <= 500 ? k.logo : undefined;
    canal = { id, numero, nome, pais, ...(logo ? { logo } : {}) };
  }
  const erro = typeof x.erro === 'string' ? x.erro.slice(0, 200) : undefined;
  const programaAtual = typeof x.programaAtual === 'string' ? x.programaAtual.slice(0, 200) : undefined;
  return {
    canal, tocando: x.tocando, mudo: x.mudo, volume: x.volume, favorito: x.favorito === true, modoTV: x.modoTV,
    versao: typeof x.versao === 'number' ? x.versao : 0,
    ...(erro ? { erro } : {}), ...(programaAtual ? { programaAtual } : {}),
  };
}

// ---------------- envelope ----------------
/** Mensagens de controle do computador para os celulares (além do estado). */
export type Controle =
  | { tipo: 'rotacao'; para: string; sessao: string; chave: string }
  | { tipo: 'recusa'; para: string; motivo: 'limite' | 'bloqueado' }
  | { tipo: 'desconectar'; para: string }
  | { tipo: 'encerrado' };

export interface Envelope {
  v: number;
  seq: number;
  ts: number;
  /** Identificador de quem envia (um por celular; o computador usa "tv"). */
  de: string;
  t: 'cmd' | 'estado' | 'ctl';
  d: unknown;
}

/** Envelope bem formado ou null. A versão diferente é tratada por quem chama (mostra "atualize a página"). */
export function validarEnvelope(x: unknown): Envelope | null {
  if (!isObj(x)) return null;
  if (typeof x.v !== 'number' || !Number.isInteger(x.seq) || typeof x.ts !== 'number' || typeof x.de !== 'string' || !x.de || x.de.length > 64) return null;
  if (x.t !== 'cmd' && x.t !== 'estado' && x.t !== 'ctl') return null;
  return { v: x.v, seq: x.seq as number, ts: x.ts, de: x.de, t: x.t, d: x.d };
}

export function validarControle(x: unknown): Controle | null {
  if (!isObj(x) || typeof x.tipo !== 'string') return null;
  if (x.tipo === 'encerrado') return { tipo: 'encerrado' };
  const para = str(x.para, 64);
  if (!para) return null;
  if (x.tipo === 'desconectar') return { tipo: 'desconectar', para };
  if (x.tipo === 'recusa' && (x.motivo === 'limite' || x.motivo === 'bloqueado')) return { tipo: 'recusa', para, motivo: x.motivo };
  if (x.tipo === 'rotacao') {
    const sessao = str(x.sessao, 40), chave = str(x.chave, 60);
    return sessao && chave ? { tipo: 'rotacao', para, sessao, chave } : null;
  }
  return null;
}
