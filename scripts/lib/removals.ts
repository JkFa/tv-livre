import { normalizeName, normalizeUrl } from './normalize.ts';
import type { Candidate } from './candidate.ts';

/** Lista de exclusão mantida em config/removals.json (pedidos de remoção de canais). */
export interface Removals {
  channelIds?: string[];
  urls?: string[];
  hosts?: string[];
  /** nomes de canal (comparados sem acentos, caixa e pontuação) */
  names?: string[];
}

export function isRemoved(c: Pick<Candidate, 'id' | 'url' | 'name'>, r: Removals): boolean {
  if (r.channelIds?.includes(c.id)) return true;
  if (r.urls?.some((u) => normalizeUrl(u) === normalizeUrl(c.url))) return true;
  if (r.hosts?.length) {
    try {
      const host = new URL(c.url).hostname.toLowerCase();
      if (r.hosts.some((h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`))) return true;
    } catch {
      /* URL inválida: nada a casar */
    }
  }
  if (r.names?.length) {
    const n = normalizeName(c.name);
    if (r.names.some((x) => normalizeName(x) === n)) return true;
  }
  return false;
}
