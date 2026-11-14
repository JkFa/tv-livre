/**
 * Volume do player: lógica pura (sem DOM) para o controle deslizante de 0 a 100 e para o botão de mudo.
 * O volume guardado nunca vira 0 pelo controle deslizante: arrastar até 0 é "mudo", e tirar do mudo devolve o volume de antes.
 */
export interface Sound {
  /** 0 a 1 (o que vai para `HTMLMediaElement.volume`). */
  volume: number;
  muted: boolean;
}

export const VOLUME_STEP = 5;
const FALLBACK_VOLUME = 0.5;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Lê o valor salvo (inteiro de 0 a 100); qualquer coisa fora disso vira o volume máximo. */
export function parseVolume(raw: string | null): number {
  if (raw === null || !/^\d{1,3}$/.test(raw)) return 1;
  const n = Number(raw);
  return n <= 100 ? n / 100 : 1;
}

export const serializeVolume = (volume: number): string => String(Math.round(clamp01(volume) * 100));

/** Posição do controle deslizante (0 a 100): no mudo ele fica em 0. */
export const sliderValue = (s: Sound): number => (s.muted ? 0 : Math.round(clamp01(s.volume) * 100));

/** O usuário moveu o controle deslizante para `value` (0 a 100). */
export function applySlider(s: Sound, value: number): Sound {
  const v = clamp01((Number.isFinite(value) ? value : 0) / 100);
  if (v === 0) return { volume: s.volume, muted: true };
  return { volume: v, muted: false };
}

/** Clique no ícone (ou tecla M): alterna o mudo; ao voltar, um volume zerado sobe para a metade para o som reaparecer. */
export function toggleMuted(s: Sound): Sound {
  if (!s.muted) return { volume: s.volume, muted: true };
  return { volume: s.volume > 0 ? s.volume : FALLBACK_VOLUME, muted: false };
}

export type VolumeIcon = 'off' | 'low' | 'high';
export const volumeIcon = (s: Sound): VolumeIcon => (s.muted || s.volume === 0 ? 'off' : s.volume < 0.5 ? 'low' : 'high');

let settable: boolean | undefined;
/** O navegador deixa o site mudar o volume? (No iPhone/iPad só os botões do aparelho mudam: `volume` é somente leitura.) */
export function volumeSettable(): boolean {
  if (settable === undefined) {
    try {
      const v = document.createElement('video');
      v.volume = 0.5;
      settable = v.volume === 0.5;
    } catch {
      settable = false;
    }
  }
  return settable;
}
