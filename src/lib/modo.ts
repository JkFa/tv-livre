import { readString, writeString } from './storage.ts';

/** Normal = como sempre; Econômico = vídeo na menor qualidade; Rádio = só áudio (tela pode apagar). */
export type ModoAudio = 'normal' | 'economico' | 'radio';
export const MODOS: ModoAudio[] = ['normal', 'economico', 'radio'];
export const ROTULO_MODO: Record<ModoAudio, string> = { normal: 'Normal', economico: 'Econômico', radio: 'Rádio' };

const MODO_KEY = 'tvlivre:modo-audio';
const DICA_KEY = 'tvlivre:dica-dados';

export function getModoAudio(): ModoAudio {
  const v = readString(MODO_KEY);
  return v === 'economico' || v === 'radio' ? v : 'normal';
}
export const setModoAudio = (m: ModoAudio): void => writeString(MODO_KEY, m);

/** Categorias de "Bom para ouvir": dá para acompanhar sem olhar a tela. */
export const BOM_PARA_OUVIR = ['news', 'music', 'religious', 'talk', 'sports', 'education'];
export const bomParaOuvir = (categories: readonly string[]): boolean => categories.some((c) => BOM_PARA_OUVIR.includes(c));

// ---------------- escolha do nível ----------------
export interface Nivel {
  /** bits por segundo, como declarado na lista (BANDWIDTH). */
  bitrate: number;
  /** Variante só de áudio (CODECS sem vídeo). */
  audioOnly: boolean;
}
export interface Escolha {
  /** Índice do nível a fixar; -1 = automático (modo Normal). */
  index: number;
  /** O nível escolhido é só áudio. */
  audioOnly: boolean;
  /** Rádio pedido, mas a lista não tem variante só de áudio: usa o menor vídeo (e a tela avisa). */
  semVarianteAudio: boolean;
}

const menor = (niveis: readonly Nivel[], so?: (n: Nivel) => boolean): number => {
  let best = -1;
  niveis.forEach((n, i) => {
    if (so && !so(n)) return;
    if (best === -1 || n.bitrate < niveis[best]!.bitrate) best = i;
  });
  return best;
};

/**
 * Normal: automático. Econômico: o nível de menor bitrate. Rádio: a variante só de áudio de menor bitrate, se a lista
 * tiver; senão o menor nível (com o vídeo oculto). Lista de um nível só: esse mesmo nível.
 */
export function escolherNivel(niveis: readonly Nivel[], modo: ModoAudio): Escolha {
  if (modo === 'normal' || !niveis.length) return { index: -1, audioOnly: false, semVarianteAudio: false };
  if (modo === 'radio') {
    const a = menor(niveis, (n) => n.audioOnly);
    if (a !== -1) return { index: a, audioOnly: true, semVarianteAudio: false };
    return { index: menor(niveis), audioOnly: false, semVarianteAudio: true };
  }
  // Econômico é VÍDEO na menor qualidade: a variante só de áudio fica de fora (só entra se for a única)
  const v = menor(niveis, (n) => !n.audioOnly);
  const m = v !== -1 ? v : menor(niveis);
  return { index: m, audioOnly: !!niveis[m]?.audioOnly, semVarianteAudio: false };
}

/**
 * Variante só de áudio de menor bitrate da lista mestra. O hls.js REMOVE essas variantes de `hls.levels` quando há
 * variantes de vídeo, então ela é lida dos níveis brutos (MANIFEST_LOADED) e a fonte é recarregada nela.
 */
export interface NivelBruto {
  bitrate: number;
  audioCodec?: string | undefined;
  videoCodec?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  url: string;
}
export function pickVarianteAudio(levels: readonly NivelBruto[]): { url: string; bitrate: number } | null {
  let best: NivelBruto | null = null;
  for (const l of levels) {
    if (!l.audioCodec || l.videoCodec || (l.width && l.height) || !l.url) continue;
    if (!best || l.bitrate < best.bitrate) best = l;
  }
  return best ? { url: best.url, bitrate: best.bitrate } : null;
}

// ---------------- consumo ----------------
/** Megabytes (10^6 bytes) por hora de um fluxo de `bitrate` bits por segundo. */
export const mbPorHora = (bitrate: number): number => (bitrate * 3600) / 8 / 1_000_000;

export function formatarMB(mb: number): string {
  if (!Number.isFinite(mb) || mb < 0) return '0';
  if (mb >= 100) return Math.round(mb).toLocaleString('pt-BR');
  return mb.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: mb < 10 && mb > 0 ? 1 : 0 });
}

/** Soma dos bytes reais dos trechos baixados nesta sessão (FRAG_LOADED → stats.loaded). */
export class ConsumoSessao {
  private bytes = 0;
  add(n: number): void {
    if (Number.isFinite(n) && n > 0) this.bytes += n;
  }
  get totalBytes(): number {
    return this.bytes;
  }
  get totalMB(): number {
    return this.bytes / 1_000_000;
  }
}

export interface InfoConsumo {
  /** HLS nativo (iPhone): não dá para escolher a qualidade nem medir os bytes. */
  nativo: boolean;
  /** Bitrate do nível em uso (hls.js). */
  bitrate?: number | undefined;
  semVarianteAudio: boolean;
  /** Nível em uso é só áudio. */
  audioOnly: boolean;
  /** Quantos níveis de qualidade a lista tem (1 = não dá para economizar mudando de nível). */
  niveis?: number;
}

/** Textos honestos de consumo para a barra de modos. Nunca inventa número onde não dá para medir. */
export function textoConsumo(modo: ModoAudio, i: InfoConsumo | null, sessaoMB: number): { linha: string; aviso?: string } {
  if (!i) return { linha: 'Consumo: medindo…' };
  if (i.nativo) {
    return {
      linha: 'Consumo não medido neste aparelho',
      ...(modo !== 'normal' ? { aviso: 'Economia não garantida neste aparelho: o navegador escolhe a qualidade sozinho.' } : {}),
    };
  }
  const porHora = i.bitrate ? `≈ ${formatarMB(mbPorHora(i.bitrate))} MB/h` : 'Consumo por hora: não informado por este canal';
  const linha = `${porHora} · ${formatarMB(sessaoMB)} MB nesta sessão`;
  if (modo !== 'normal' && i.niveis === 1 && !i.audioOnly) {
    return { linha, aviso: `Este canal tem uma única qualidade: o modo ${modo === 'radio' ? 'Rádio' : 'Econômico'} não reduz o consumo.` };
  }
  if (modo === 'radio' && i.semVarianteAudio) {
    return { linha, aviso: `Este canal não tem versão só de áudio; o Rádio usa a menor qualidade de vídeo${i.bitrate ? ` (≈ ${formatarMB(mbPorHora(i.bitrate))} MB/h)` : ''}.` };
  }
  return { linha };
}

// ---------------- plano de dados fraco ----------------
interface Conexao {
  saveData?: boolean;
  effectiveType?: string;
}
const lerConexao = (): Conexao | undefined => (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: Conexao }).connection);
export function conexaoFraca(c: Conexao | undefined = lerConexao()): boolean {
  return !!c && (c.saveData === true || ['slow-2g', '2g', '3g'].includes(c.effectiveType ?? ''));
}

const TRINTA_DIAS = 30 * 24 * 3600 * 1000;
export function dicaDadosDispensada(now = Date.now()): boolean {
  const at = Number(readString(DICA_KEY));
  return Number.isFinite(at) && at > 0 && now - at < TRINTA_DIAS;
}
export const dispensarDicaDados = (): void => writeString(DICA_KEY, String(Date.now()));
