import type { Source, StreamKind } from '../../shared/types.ts';
import type { Candidate } from './candidate.ts';
import { normalizeName, normalizeUrl } from './normalize.ts';

export interface Merged extends Candidate {
  sources: Source[];
}

export interface MergeStats {
  duplicatesByUrl: number;
  duplicatesByName: number;
  inBothSources: number;
}

const KIND_RANK: Record<StreamKind, number> = { hls: 0, youtube: 1, other: 2, http: 3 };
const SOURCE_RANK: Record<Source, number> = { 'free-tv': 0, 'iptv-org': 1 };

function qualityValue(q?: string): number {
  const n = Number.parseInt(q ?? '', 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Ordem de preferência quando há duplicatas: Free-TV primeiro (curadoria manual);
 * entre candidatos da mesma fonte, preferimos link reproduzível no navegador,
 * sem bloqueio geográfico, sem cabeçalhos especiais e com maior qualidade.
 */
export function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    SOURCE_RANK[a.source] - SOURCE_RANK[b.source] ||
    KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
    Number(!!a.geo) - Number(!!b.geo) ||
    Number(!!a.needsHeaders) - Number(!!b.needsHeaders) ||
    qualityValue(b.quality) - qualityValue(a.quality)
  );
}

/** Junta candidatos removendo duplicatas por URL e por (nome normalizado + país). */
export function mergeCandidates(all: Candidate[]): { channels: Merged[]; stats: MergeStats } {
  const sorted = [...all].sort(compareCandidates); // sort é estável: preserva a ordem original nos empates
  const byUrl = new Map<string, Merged>();
  const byName = new Map<string, Merged>();
  const channels: Merged[] = [];
  const usedIds = new Map<string, number>();
  const stats: MergeStats = { duplicatesByUrl: 0, duplicatesByName: 0, inBothSources: 0 };

  const addSource = (kept: Merged, other: Candidate) => {
    if (!kept.sources.includes(other.source)) {
      kept.sources.push(other.source);
      stats.inBothSources++;
    }
    // completa metadados faltantes do mantido com os do duplicado
    if (!kept.logo && other.logo) kept.logo = other.logo;
    if (!kept.categories.length && other.categories.length) kept.categories = other.categories;
    if (!kept.languages.length && other.languages.length) kept.languages = other.languages;
  };

  for (const c of sorted) {
    const uKey = normalizeUrl(c.url);
    const nName = normalizeName(c.name);
    const nKey = nName ? `${nName}|${c.country}` : '';

    const dupUrl = byUrl.get(uKey);
    if (dupUrl) {
      stats.duplicatesByUrl++;
      addSource(dupUrl, c);
      continue;
    }
    const dupName = nKey ? byName.get(nKey) : undefined;
    if (dupName) {
      stats.duplicatesByName++;
      addSource(dupName, c);
      byUrl.set(uKey, dupName);
      continue;
    }

    const n = usedIds.get(c.id) ?? 0;
    usedIds.set(c.id, n + 1);
    const merged: Merged = { ...c, id: n === 0 ? c.id : `${c.id}~${n + 1}`, sources: [c.source] };
    channels.push(merged);
    byUrl.set(uKey, merged);
    if (nKey) byName.set(nKey, merged);
  }
  return { channels, stats };
}
