import type { Channel } from '../../shared/types.ts';
import { caps, isPlayableHere } from './playback.ts';

export { lineupOrder, formatNumber } from '../../shared/lineup.ts';
import { lineupOrder } from '../../shared/lineup.ts';

export const channelKey = (c: Pick<Channel, 'id' | 'country'>): string => `${c.country}/${c.id}`;

export function buildNumbers(store: Record<string, Channel[]>): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const list of Object.values(store)) {
    lineupOrder(list).forEach((c, i) => numbers.set(channelKey(c), i + 1));
  }
  return numbers;
}

/**
 * Próximo/anterior na lista visível, dando a volta nas pontas. Zapear prefere canais que tocam no navegador
 * e nunca para em canal offline; se não houver nenhum assim, aceita os demais não-offline.
 */
export function stepChannel(list: readonly Channel[], currentKey: string | null, dir: 1 | -1): Channel | null {
  if (!list.length) return null;
  const start = currentKey ? list.findIndex((c) => channelKey(c) === currentKey) : -1;
  const origin = start === -1 ? (dir === 1 ? -1 : 0) : start;
  for (const strict of [true, false]) {
    for (let i = 1; i <= list.length; i++) {
      const c = list[(((origin + dir * i) % list.length) + list.length) % list.length];
      if (!c || channelKey(c) === currentKey || c.status === 'offline') continue;
      if (strict && !isPlayableHere(c, caps())) continue;
      return c;
    }
  }
  return null;
}

export function findByNumber(list: readonly Channel[], numbers: Map<string, number>, n: number): Channel | null {
  return list.find((c) => numbers.get(channelKey(c)) === n) ?? null;
}
