/** Converte programas do XMLTV no JSON compacto por país (data/epg/<PAÍS>.json), respeitando um orçamento de tamanho. */
import { gzipSync } from 'node:zlib';
import type { EpgEntry, EpgFile } from '../../shared/types.ts';
import type { XmltvProgramme } from './xmltv.ts';

const H = 3600;
export const BEHIND_H = 2;
export const AHEAD_H = 36;
export const BUDGET_GZIP = 150 * 1024;
/** Janelas tentadas, da maior para a menor, até caber no orçamento. */
const AHEAD_STEPS = [AHEAD_H, 30, 24, 18, 12, 8];
const TITLE_MAX = 80;
const CATEGORY_MAX = 24;

/** Programas de "agora − 2h" até "+ahead h": recorta, ordena, tira sobreposição por início repetido e encurta textos. */
export function compactChannels(programmes: XmltvProgramme[], nowSec: number, aheadH = AHEAD_H): Record<string, EpgEntry[]> {
  const from = nowSec - BEHIND_H * H;
  const to = nowSec + aheadH * H;
  const byChannel = new Map<string, XmltvProgramme[]>();
  for (const p of programmes) {
    if (p.stop <= from || p.start >= to) continue;
    (byChannel.get(p.channel) ?? byChannel.set(p.channel, []).get(p.channel)!).push(p);
  }
  const out: Record<string, EpgEntry[]> = {};
  for (const id of [...byChannel.keys()].sort()) {
    const list = byChannel.get(id)!.sort((a, b) => a.start - b.start || a.stop - b.stop);
    const entries: EpgEntry[] = [];
    let lastStart = -1;
    for (const p of list) {
      if (p.start === lastStart) continue; // mesmo início duas vezes: fica o primeiro
      lastStart = p.start;
      const title = p.title.length > TITLE_MAX ? `${p.title.slice(0, TITLE_MAX - 1)}…` : p.title;
      const cat = p.category ? p.category.slice(0, CATEGORY_MAX) : undefined;
      entries.push(cat ? [p.start, p.stop, title, cat] : [p.start, p.stop, title]);
    }
    if (entries.length) out[id] = entries;
  }
  return out;
}

export interface CompactResult {
  file: EpgFile;
  json: string;
  rawBytes: number;
  gzipBytes: number;
  /** Horas à frente que couberam no orçamento. */
  aheadH: number;
  /** A janela precisou ser cortada para caber? */
  trimmed: boolean;
  /** Mesmo na menor janela passou do orçamento. */
  overBudget: boolean;
}

export function buildCountryFile(programmes: XmltvProgramme[], now: Date, budgetGzip = BUDGET_GZIP): CompactResult {
  const nowSec = Math.floor(now.getTime() / 1000);
  let last: CompactResult | undefined;
  for (const aheadH of AHEAD_STEPS) {
    const file: EpgFile = { generatedAt: now.toISOString(), channels: compactChannels(programmes, nowSec, aheadH) };
    const json = JSON.stringify(file);
    const gzipBytes = gzipSync(json).length;
    last = { file, json, rawBytes: Buffer.byteLength(json), gzipBytes, aheadH, trimmed: aheadH !== AHEAD_H, overBudget: gzipBytes > budgetGzip };
    if (!last.overBudget) return last;
  }
  return last!;
}
