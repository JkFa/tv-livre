import { createHash } from 'node:crypto';

/** Remove marcadores circulados do Free-TV (Ⓢ Ⓖ Ⓨ…) do fim do título e devolve os símbolos achados. */
export function stripMarkers(title: string): { name: string; markers: string[] } {
  const markers: string[] = [];
  const name = title
    .replace(/[Ⓐ-ⓩ]/g, (m) => {
      markers.push(m);
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { name, markers };
}

const QUALITY_WORDS = /\b(uhd|fhd|hd|sd|4k|8k|hevc|h264|h265|1080p?|720p?|576p?|480p?|360p?|1080i)\b/gi;

/** Nome canônico para detectar duplicatas: sem acentos, sem tags de qualidade, só letras e números. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[Ⓐ-ⓩ]/g, '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/&/g, ' e ')
    .replace(QUALITY_WORDS, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Chave de URL: ignora esquema (http/https), fragmento, porta padrão e barra final. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    const host = u.host.toLowerCase().replace(/:(80|443)$/, '');
    const path = u.pathname.replace(/\/+$/, '');
    return `${host}${path}${u.search}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

export function shortHash(text: string, len = 10): string {
  return createHash('sha1').update(text).digest('base64url').slice(0, len);
}

export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'canal'
  );
}

/** O iptv-org usa "UK" para o Reino Unido; o Free-TV usa o código ISO "GB". Unificamos em "GB". */
export function canonCountry(code: string): string {
  const c = code.trim().toUpperCase();
  return c === 'UK' ? 'GB' : c;
}
