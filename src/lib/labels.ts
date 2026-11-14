import type { Source, Status, StreamKind } from '../../shared/types.ts';

export const CATEGORY_LABELS: Record<string, string> = {
  auto: 'Automotivo', animation: 'Animação', business: 'Negócios', classic: 'Clássicos', comedy: 'Comédia',
  cooking: 'Culinária', culture: 'Cultura', documentary: 'Documentários', education: 'Educação',
  entertainment: 'Entretenimento', family: 'Família', general: 'Geral', interactive: 'Interativo',
  kids: 'Infantil', legislative: 'Legislativo', lifestyle: 'Estilo de vida', movies: 'Filmes',
  music: 'Música', news: 'Notícias', outdoor: 'Natureza e viagens', public: 'Serviço público',
  relax: 'Relaxamento', religious: 'Religioso', series: 'Séries', science: 'Ciência', shop: 'Compras',
  sports: 'Esportes', travel: 'Viagens', weather: 'Clima e tempo',
};

export const STATUS_LABELS: Record<Status, string> = {
  online: 'No ar',
  offline: 'Fora do ar',
  desconhecido: 'Não confirmado',
};

export const KIND_LABELS: Record<StreamKind, string> = {
  hls: 'HLS (HTTPS)',
  youtube: 'YouTube',
  http: 'HTTP',
  other: 'Outro formato',
};

export const SOURCE_LABELS: Record<Source, string> = {
  'free-tv': 'Free-TV',
  'iptv-org': 'iptv-org',
};

export const categoryLabel = (id: string): string => CATEGORY_LABELS[id] ?? id;

let regionNames: Intl.DisplayNames | null | undefined;
let languageNames: Intl.DisplayNames | null | undefined;

function displayNames(type: 'region' | 'language'): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames(['pt-BR'], { type });
  } catch {
    return null;
  }
}

export function countryName(code: string): string {
  if (code === 'INT') return 'Internacional';
  regionNames ??= displayNames('region');
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export function languageName(code: string): string {
  languageNames ??= displayNames('language');
  try {
    const n = languageNames?.of(code);
    return n && n !== code ? n.charAt(0).toUpperCase() + n.slice(1) : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/**
 * Bandeiras vêm SÓ dos dados de origem (campo `flag` do iptv-org, gravado no index.json). Nada é derivado do código aqui:
 * país sem bandeira na fonte (ou "INT") fica sem bandeira.
 */
const flags = new Map<string, string>();

export function registerCountryFlags(list: readonly { code: string; flag?: string }[]): void {
  for (const c of list) if (c.flag) flags.set(c.code, c.flag);
}

export function countryFlag(code: string): string {
  return flags.get(code) ?? '';
}
