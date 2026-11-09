/**
 * Leitor de XMLTV tolerante, sem dependências: só o que o guia precisa (programa, início, fim, título, categoria).
 * Entradas quebradas são ignoradas em vez de derrubar o guia inteiro.
 */
export interface XmltvProgramme {
  channel: string;
  /** Epoch UTC, em segundos. */
  start: number;
  stop: number;
  title: string;
  category?: string;
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodifica entidades XML/HTML (inclusive as duplamente codificadas, `&amp;amp;`, comuns em guias raspados). */
export function decodeEntities(s: string): string {
  let out = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  for (let i = 0; i < 2; i++) {
    const next = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1]!.toLowerCase() === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return NAMED[e.toLowerCase()] ?? m;
    });
    if (next === out) break;
    out = next;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * `20261109200000 -0300` → epoch em segundos. Aceita sem fuso (assume UTC) e sem segundos (`202611092000`).
 * Devolve null para data inválida.
 */
export function parseXmltvTime(raw: string | undefined): number | null {
  const m = /^\s*(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(?:([+-])(\d{2}):?(\d{2})|Z)?\s*$/.exec(raw ?? '');
  if (!m) return null;
  const [, y, mo, d, h, mi, s, sign, oh, om] = m;
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const min = Number(mi);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || min > 59) return null;
  const utc = Date.UTC(Number(y), month - 1, day, hour, min, Number(s ?? 0));
  const offset = sign ? (sign === '-' ? -1 : 1) * (Number(oh) * 60 + Number(om)) * 60 : 0;
  const ms = utc - offset * 1000;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[1] ?? m[2]) : undefined;
};

const firstText = (body: string, tag: string): string | undefined => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(body);
  const t = m ? decodeEntities(m[1]!) : '';
  return t || undefined;
};

export function parseXmltv(xml: string): { programmes: XmltvProgramme[]; skipped: number } {
  const programmes: XmltvProgramme[] = [];
  let skipped = 0;
  // cada <programme ...> … </programme>; um bloco quebrado (sem fechar) é descartado sem afetar os vizinhos
  const re = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const head = m[1]!;
    const body = m[2]!;
    const channel = attr(head, 'channel');
    const start = parseXmltvTime(attr(head, 'start'));
    const stop = parseXmltvTime(attr(head, 'stop'));
    const title = firstText(body, 'title');
    if (!channel || start === null || stop === null || stop <= start || !title) {
      skipped++;
      continue;
    }
    const category = firstText(body, 'category');
    programmes.push({ channel: decodeEntities(channel), start, stop, title, ...(category ? { category } : {}) });
  }
  return { programmes, skipped };
}
