/** Criptografia do controle remoto (WebCrypto): AES-GCM 256, código alternativo e proteção contra repetição. Sem dependências. */

export const VERSAO_CIFRA = 'v1';

// ---------------- base64url ----------------
export function paraB64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function deB64u(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
export const aleatorio = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
const enc = new TextEncoder();
const dec = new TextDecoder();
// o TypeScript 5.9 tipa Uint8Array<ArrayBufferLike>; o WebCrypto quer BufferSource: este cast é só de tipo
const buf = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

// ---------------- sessão e chave ----------------
/** Identificador da sessão: 16 bytes aleatórios. Nunca vai ao broker em claro: o tópico usa só o hash. */
export const gerarSessao = (): string => paraB64u(aleatorio(16));

/** Chave AES-GCM de 256 bits; `raw` (base64url) é o que vai no QR. */
export async function gerarChave(): Promise<{ chave: CryptoKey; raw: string }> {
  const chave = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return { chave, raw: paraB64u(new Uint8Array(await crypto.subtle.exportKey('raw', chave))) };
}
export async function importarChave(raw: string): Promise<CryptoKey> {
  const bytes = deB64u(raw);
  if (bytes.length !== 32) throw new Error('chave inválida');
  return crypto.subtle.importKey('raw', buf(bytes), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Hash curto (hex) da sessão: é o que aparece no nome do tópico. */
export async function hashSessao(sessao: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf(enc.encode(sessao))));
  return [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const topicoCmd = (hash: string): string => `tvlivre/v1/${hash}/cmd`;
export const topicoEstado = (hash: string): string => `tvlivre/v1/${hash}/estado`;

// ---------------- cifrar / decifrar ----------------
/** `v1.<iv>.<texto cifrado>`; IV aleatório novo a cada mensagem (nunca reutilizado com a mesma chave). */
export async function cifrar(chave: CryptoKey, texto: string): Promise<string> {
  const iv = aleatorio(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv) }, chave, buf(enc.encode(texto))));
  return `${VERSAO_CIFRA}.${paraB64u(iv)}.${paraB64u(ct)}`;
}
/** Texto original ou `null` se a chave não serve, o formato é outro ou a mensagem foi adulterada (o AES-GCM autentica). */
export async function decifrar(chave: CryptoKey, payload: string): Promise<string | null> {
  try {
    const [v, iv, ct] = payload.split('.');
    if (v !== VERSAO_CIFRA || !iv || !ct) return null;
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(deB64u(iv)) }, chave, buf(deB64u(ct)));
    return dec.decode(claro);
  } catch {
    return null;
  }
}

// ---------------- código alternativo (8 caracteres) ----------------
/** 32 símbolos sem 0, O, 1 e I (não se confundem na leitura). 8 símbolos = 40 bits. */
export const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const TAMANHO_CODIGO = 8;
/** Sal fixo do app: o segredo é o código; o sal só impede tabelas prontas genéricas. */
const SAL_CODIGO = 'tvlivre/v1/codigo-de-pareamento';
export const ITERACOES_CODIGO = 200_000;

export function gerarCodigo(): string {
  // 32 símbolos dividem 256 igualmente: um byte → um símbolo, sem viés
  return [...aleatorio(TAMANHO_CODIGO)].map((b) => ALFABETO_CODIGO[b % 32]).join('');
}
/** Aceita minúsculas, espaços e hífen; devolve o código limpo ou null se não for um código válido. */
export function normalizarCodigo(texto: string): string | null {
  const c = texto.toUpperCase().replace(/[\s-]+/g, '');
  return c.length === TAMANHO_CODIGO && [...c].every((x) => ALFABETO_CODIGO.includes(x)) ? c : null;
}
export const formatarCodigo = (c: string): string => `${c.slice(0, 4)}-${c.slice(4)}`;

/** Sessão e chave derivadas do código (PBKDF2-SHA-256, 200 mil iterações): quem sabe o código chega aos mesmos valores. */
export async function derivarDoCodigo(codigo: string, iteracoes = ITERACOES_CODIGO): Promise<{ sessao: string; chaveRaw: string }> {
  const base = await crypto.subtle.importKey('raw', buf(enc.encode(codigo)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: buf(enc.encode(SAL_CODIGO)), iterations: iteracoes }, base, 384));
  return { sessao: paraB64u(bits.slice(0, 16)), chaveRaw: paraB64u(bits.slice(16, 48)) };
}

// ---------------- anti-repetição ----------------
export const MAX_IDADE_MS = 30_000;
export type Veredito = 'ok' | 'velha' | 'futura' | 'repetida' | 'forma';

/**
 * Descarta mensagem com mais de 30 s (ou 30 s no futuro: relógio muito diferente) e a que repete o `seq` de um mesmo
 * remetente. Guarda só o que ainda pode ser repetido dentro da janela, então a memória não cresce.
 */
export class Validador {
  private vistos = new Map<string, number>();
  constructor(
    private readonly relogio: () => number = Date.now,
    private readonly maxIdadeMs = MAX_IDADE_MS,
  ) {}

  aceitar(m: { de: string; seq: number; ts: number }): Veredito {
    if (typeof m.de !== 'string' || !m.de || !Number.isInteger(m.seq) || m.seq < 0 || !Number.isFinite(m.ts)) return 'forma';
    const agora = this.relogio();
    const idade = agora - m.ts;
    if (idade > this.maxIdadeMs) return 'velha';
    if (idade < -this.maxIdadeMs) return 'futura';
    const k = `${m.de}:${m.seq}`;
    if (this.vistos.has(k)) return 'repetida';
    for (const [chave, ts] of this.vistos) if (agora - ts > this.maxIdadeMs * 2) this.vistos.delete(chave);
    this.vistos.set(k, m.ts);
    return 'ok';
  }
}
