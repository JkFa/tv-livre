import type { Channel } from '../../shared/types.ts';
import { channelHealth, healthRank, type Health } from './health.ts';
import { bomParaOuvir } from './modo.ts';
import { caps, isPlayableHere } from './playback.ts';

export interface Filters {
  query: string;
  category: string;
  language: string;
  /** Saúde do canal (ver health.ts): no ar, instável, não confirmado ou fora do ar. */
  status: Health | '';
  /** "Ocultar canais fora do ar" (começa desligado: por padrão eles ficam no fim da lista; a escolha fica salva). */
  hideOffline: boolean;
  playableOnly: boolean;
  /** Só canais com programa que começou há pouco ou começa logo (precisa do guia). */
  startingNow: boolean;
  /** "Bom para ouvir": notícias, música, religião, conversa, esportes e educação. */
  listen: boolean;
  /** "Mais assistidos agora": só os canais do top público do serviço de presença, do mais para o menos assistido. */
  trending: boolean;
}

export const EMPTY_FILTERS: Filters = { query: '', category: '', language: '', status: '', hideOffline: false, playableOnly: false, startingNow: false, listen: false, trending: false };

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

/** Ordem da lista com vários países: saúde (no ar → não confirmado → instável → fora), Free-TV primeiro e nome. */
export function compareForDisplay(a: Channel, b: Channel): number {
  return (
    healthRank(a, false) - healthRank(b, false) ||
    Number(b.sources[0] === 'free-tv') - Number(a.sources[0] === 'free-tv') ||
    a.name.localeCompare(b.name, 'pt-BR')
  );
}

/** Filtra e, havendo busca, ordena por relevância (prefixo > início de palavra > contém). */
/**
 * Filtra e ordena. Sem busca: pela saúde (`rank`, ver healthRank: no ar no topo, canais que falharam neste navegador e fora do ar
 * no fim), mantendo a ordem original dentro de cada faixa. Com busca: relevância primeiro, saúde depois.
 * Nenhum canal sai da lista por causa do status, a não ser que o usuário peça (`hideOffline` ou o filtro de status).
 */
export function filterChannels(
  list: readonly Channel[],
  f: Filters,
  ctx: { startingNow?: (c: Channel) => boolean; assistindo?: ReadonlyMap<string, number>; rank?: (c: Channel) => number } = {},
): Channel[] {
  const q = normalizeSearch(f.query);
  const tokens = q ? q.split(' ') : [];
  const scored: { ch: Channel; score: number; rank: number }[] = [];
  const rank = ctx.rank ?? ((c: Channel) => healthRank(c, false));

  for (const ch of list) {
    if (f.status && channelHealth(ch) !== f.status) continue;
    if (f.hideOffline && f.status !== 'fora' && ch.status === 'offline') continue;
    if (f.category && !ch.categories.includes(f.category)) continue;
    if (f.language && !ch.languages.includes(f.language)) continue;
    if (f.playableOnly && !isPlayableHere(ch, caps())) continue;
    if (f.startingNow && !ctx.startingNow?.(ch)) continue;
    if (f.listen && !bomParaOuvir(ch.categories)) continue;
    if (f.trending && !ctx.assistindo?.has(`${ch.country}/${ch.id}`)) continue;
    let score = 0;
    if (tokens.length) {
      const key = searchKey(ch);
      if (!tokens.every((t) => key.includes(t))) continue;
      score = key.startsWith(` ${q}`) ? 3 : key.includes(` ${q}`) ? 2 : 1;
    }
    scored.push({ ch, score, rank: rank(ch) });
  }
  if (f.trending && ctx.assistindo) {
    const n = (c: Channel) => ctx.assistindo?.get(`${c.country}/${c.id}`) ?? 0;
    scored.sort((a, b) => n(b.ch) - n(a.ch) || b.score - a.score);
  } else scored.sort((a, b) => b.score - a.score || a.rank - b.rank);
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
