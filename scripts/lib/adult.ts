import { normalizeName } from './normalize.ts';

// Palavras que, sozinhas, indicam conteúdo adulto. Usamos limites de palavra para
// evitar falsos positivos como "Essex", "Sexta" ou "Adulto Mayor".
const ADULT_WORDS = [
  'xxx', 'porn', 'porno', 'pornhub', 'pornstar', 'adult', 'adults', 'erotic', 'erotica', 'erotico',
  'erotik', 'hentai', 'playboy', 'penthouse', 'hustler', 'brazzers', 'sextury', 'sexy', 'sex',
  'sexo', 'nude', 'nudes', 'naked', 'fetish', 'milf', 'babestation', 'redlight', 'privatespice',
  'dorcel', 'xtreme18',
];
const WORD_RE = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])(?:${ADULT_WORDS.join('|')})(?:$|[^\\p{L}\\p{N}])`,
  'iu',
);
const AGE_RE = /(?:^|\s)\+?18\s?\+(?:\s|$)/;
const ADULT_CATEGORIES = new Set(['xxx', 'adult', 'adulto', 'adultos']);

/** Texto (nome, grupo) sugere conteúdo adulto? */
export function looksAdultText(text: string): boolean {
  if (!text) return false;
  const plain = text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    // gêneros/canais comuns que contêm a palavra mas não são adultos
    .replace(/adult\s*(swim|alternative|contemporary|animation|pop|rock|hits)|(pop|rock|hits)\s*adult/gi, 'ok');
  if (WORD_RE.test(plain) || AGE_RE.test(plain)) return true;
  const n = normalizeName(plain);
  return n.includes('xxx') || n.includes('porn');
}

export function isAdultCategory(cats: readonly string[]): boolean {
  return cats.some((c) => ADULT_CATEGORIES.has(c.toLowerCase()));
}
