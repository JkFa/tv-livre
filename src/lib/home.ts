import type { Channel, CountrySummary, DataIndex } from '../../shared/types.ts';
import { caps, isPlayableHere, type Caps } from './playback.ts';
import { lineupOrder } from './lineup.ts';

/** Regras puras da tela inicial: o que destacar, o que contar, o que sugerir. Sem DOM, fácil de testar. */

const dayNumber = (d: Date): number => Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);

/** Canais no ar que tocam aqui, curados primeiro (a mesma ordem da grade). */
export function liveNow(list: readonly Channel[], limit: number, c: Caps = caps()): Channel[] {
  const out: Channel[] = [];
  for (const ch of lineupOrder(list)) {
    if (ch.status !== 'online' || !isPlayableHere(ch, c)) continue;
    out.push(ch);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Canal em destaque na tela: o que o usuário estava vendo; senão um dos curados no ar, que muda a cada dia
 * (mesmo dia = mesmo canal, então a tela não troca sozinha enquanto se olha para ela).
 */
export function pickFeatured(
  list: readonly Channel[],
  resume: Channel | null,
  today: Date = new Date(),
  c: Caps = caps(),
  /** "Outro canal": avança pela mesma lista do dia. */
  nudge = 0,
): { channel: Channel; resumed: boolean } | null {
  if (resume && nudge === 0) return { channel: resume, resumed: true };
  const pool = liveNow(list, 12, c);
  if (!pool.length) return null;
  const ch = pool[(dayNumber(today) + nudge) % pool.length];
  return ch ? { channel: ch, resumed: false } : null;
}

export interface CategoryCount {
  id: string;
  count: number;
}

/** Categorias do país com mais canais (a lista de filtros usa o mesmo id). */
export function topCategories(list: readonly Channel[], limit: number): CategoryCount[] {
  const n = new Map<string, number>();
  for (const ch of list) for (const id of ch.categories) n.set(id, (n.get(id) ?? 0) + 1);
  return [...n]
    .map(([id, count]) => ({ id, count }))
    .filter((x) => x.id !== 'general' || n.size <= 1)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Países com mais canais no ar. O país atual sempre entra (e vem primeiro). */
export function topCountries(index: Pick<DataIndex, 'countries'>, current: string, limit: number): CountrySummary[] {
  const sorted = [...index.countries].sort((a, b) => b.online - a.online || a.code.localeCompare(b.code));
  const head = sorted.slice(0, limit);
  const cur = index.countries.find((c) => c.code === current);
  if (!cur) return head;
  return [cur, ...head.filter((c) => c.code !== current)].slice(0, limit);
}

/** "12138" → só dígitos, até 4; vazio se não houver número. */
export function parseChannelNumber(text: string): number | null {
  const digits = text.replace(/\D/g, '').slice(0, 4);
  if (!digits) return null;
  const n = Number(digits);
  return n > 0 ? n : null;
}
