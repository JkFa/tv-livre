/** Parser tolerante de playlists M3U/M3U8 de IPTV. Nunca lança: entradas inválidas são descartadas. */

export interface M3UEntry {
  /** Atributos do #EXTINF (tvg-id, tvg-logo, group-title…), chaves em minúsculas. */
  attrs: Record<string, string>;
  /** Título exibido (texto depois da vírgula). */
  title: string;
  url: string;
  /** Opções #EXTVLCOPT (ex.: http-user-agent, http-referrer). */
  options: Record<string, string>;
  /** Número da linha (1-based) do #EXTINF — útil para depuração. */
  line: number;
}

export interface M3UResult {
  entries: M3UEntry[];
  /** Linhas descartadas, com o motivo. */
  skipped: { line: number; reason: string }[];
}

const URL_RE = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;

/** Separa "-1 tvg-id="a,b" x="y",Título" em { head, title } respeitando aspas. */
function splitExtinf(body: string): { head: string; title: string } {
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) return { head: body.slice(0, i), title: body.slice(i + 1).trim() };
  }
  return { head: body, title: '' };
}

export function parseAttributes(head: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z0-9_.:-]+)=(?:"([^"]*)"|'([^']*)'|([^\s"',]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    const key = (m[1] ?? '').toLowerCase();
    if (key && !(key in attrs)) attrs[key] = (m[2] ?? m[3] ?? m[4] ?? '').trim();
  }
  return attrs;
}

export function parseM3U(text: string): M3UResult {
  const entries: M3UEntry[] = [];
  const skipped: M3UResult['skipped'] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);

  let pending: Omit<M3UEntry, 'url'> | null = null;

  const dropPending = (reason: string) => {
    if (pending) skipped.push({ line: pending.line, reason });
    pending = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = (lines[i] ?? '').trim();
    if (!raw) continue;

    if (/^#EXTINF:/i.test(raw)) {
      dropPending('EXTINF sem URL');
      const { head, title } = splitExtinf(raw.slice(raw.indexOf(':') + 1));
      pending = { attrs: parseAttributes(head), title, options: {}, line: i + 1 };
      continue;
    }

    if (/^#EXTVLCOPT:/i.test(raw)) {
      const [k, ...rest] = raw.slice(raw.indexOf(':') + 1).split('=');
      if (pending && k) pending.options[k.trim().toLowerCase()] = rest.join('=').trim();
      continue;
    }

    if (raw.startsWith('#')) continue; // #EXTM3U, #EXTGRP, comentários…

    if (!pending) {
      skipped.push({ line: i + 1, reason: 'URL sem EXTINF' });
      continue;
    }
    if (!URL_RE.test(raw)) {
      // ex.: "[NO PUBLIC STREAM]" usado pelo Free-TV como marcador
      dropPending(`linha não é URL: ${raw.slice(0, 40)}`);
      continue;
    }
    entries.push({ ...pending, url: raw });
    pending = null;
  }
  dropPending('EXTINF sem URL no fim do arquivo');
  return { entries, skipped };
}
