import type { Channel, Status } from '../../shared/types.ts';
import { caps, isPlayableHere } from './playback.ts';

export interface Filters {
  query: string;
  category: string;
  language: string;
  status: Status | '';
  playableOnly: boolean;
}

export const EMPTY_FILTERS: Filters = { query: '', category: '', language: '', status: '', playableOnly: false };

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const nameCache = new Map<string, string>();
function searchKey(ch: Channel): string {
  let k = nameCache.get(ch.id);
  if (k === undefined) {
    k = ` ${normalizeSearch(ch.name)}`;
    nameCache.set(ch.id, k);
  }
  return k;
}

const STATUS_ORDER: Record<Status, number> = { online: 0, desconhecido: 1, offline: 2 };

export function compareForDisplay(a: Channel, b: Channel): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    Number(b.sources[0] === 'free-tv') - Number(a.sources[0] === 'free-tv') ||
    a.name.localeCompare(b.name, 'pt-BR')
  );
}

/** Filtra e, havendo busca, ordena por relevância (prefixo > início de palavra > contém). */
export function filterChannels(list: readonly Channel[], f: Filters): Channel[] {
  const q = normalizeSearch(f.query);
  const tokens = q ? q.split(' ') : [];
  const scored: { ch: Channel; score: number }[] = [];

  for (const ch of list) {
    if (f.status && ch.status !== f.status) continue;
    if (f.category && !ch.categories.includes(f.category)) continue;
    if (f.language && !ch.languages.includes(f.language)) continue;
    if (f.playableOnly && !isPlayableHere(ch, caps())) continue;
    let score = 0;
    if (tokens.length) {
      const key = searchKey(ch);
      if (!tokens.every((t) => key.includes(t))) continue;
      score = key.startsWith(` ${q}`) ? 3 : key.includes(` ${q}`) ? 2 : 1;
    }
    scored.push({ ch, score });
  }
  if (tokens.length) scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.ch);
}

/**
 * Sugestões quando um canal falha: mesmo país, que toque no navegador e não esteja offline.
 * Prioriza a mesma categoria e canais confirmados online.
 */
export function suggestAlternatives(current: Channel, pool: readonly Channel[], limit = 4): Channel[] {
  const candidates = pool.filter(
    (c) => c.id !== current.id && c.country === current.country && c.status !== 'offline' && isPlayableHere(c, caps()),
  );
  const rank = (c: Channel) =>
    (c.status === 'online' ? 0 : 2) + (c.categories.some((x) => current.categories.includes(x)) ? 0 : 1);
  return candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}
