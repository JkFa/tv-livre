/** Navegação espacial (setas do controle remoto): escolhe o vizinho mais próximo na direção apertada. Parte pura, sem DOM. */
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Candidate<T> {
  box: Box;
  ref: T;
}

const cx = (b: Box) => (b.left + b.right) / 2;
const cy = (b: Box) => (b.top + b.bottom) / 2;

/** Distância entre intervalos [a0,a1] e [b0,b1]: 0 se sobrepõem. */
const gap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, a0 - b1, b0 - a1);

export function pickNext<T>(from: Box, items: readonly Candidate<T>[], dir: Dir): T | null {
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'down' || dir === 'right' ? 1 : -1;
  let best: T | null = null;
  let bestScore = Infinity;
  for (const { box, ref } of items) {
    // precisa estar do lado certo (pelo centro), senão voltaria para si mesmo ou para trás
    const delta = horizontal ? cx(box) - cx(from) : cy(box) - cy(from);
    if (delta * sign <= 1) continue;
    const primary = horizontal ? gap(from.left, from.right, box.left, box.right) : gap(from.top, from.bottom, box.top, box.bottom);
    const secondary = horizontal ? gap(from.top, from.bottom, box.top, box.bottom) : gap(from.left, from.right, box.left, box.right);
    const align = Math.abs(horizontal ? cy(box) - cy(from) : cx(box) - cx(from));
    // o alinhamento pesa mais que a distância: "descer" vai para o que está logo abaixo, não para o diagonal
    const score = primary + secondary * 4 + align * 0.5 + Math.abs(delta) * 0.01;
    if (score < bestScore) {
      bestScore = score;
      best = ref;
    }
  }
  return best;
}
