import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { AHEAD_H, buildCountryFile, compactChannels } from '../../scripts/lib/epg-compact.ts';
import { channelsXml, planGuides } from '../../scripts/lib/epg-plan.ts';
import { guidesByChannel, type OrgGuide } from '../../scripts/lib/epg-guides.ts';
import type { Channel } from '../../shared/types.ts';
import type { XmltvProgramme } from '../../scripts/lib/xmltv.ts';

const NOW = new Date('2026-11-09T22:00:00Z');
const now = NOW.getTime() / 1000;
const H = 3600;
const p = (channel: string, startH: number, durH: number, title = 'Prog', category?: string): XmltvProgramme => ({
  channel, start: now + startH * H, stop: now + (startH + durH) * H, title, ...(category ? { category } : {}),
});

describe('compactChannels', () => {
  it('guarda só de agora−2h até +36h (recorta nas pontas)', () => {
    const out = compactChannels(
      [p('A', -5, 2, 'velho'), p('A', -3, 1.5, 'acaba-dentro'), p('A', -1, 1, 'atual'), p('A', 35, 2, 'passa-da-borda'), p('A', 36, 1, 'fora')],
      now,
    );
    expect(out.A!.map((e) => e[2])).toEqual(['acaba-dentro', 'atual', 'passa-da-borda']);
  });
  it('ordena, tira início repetido, encurta título e categoria', () => {
    const out = compactChannels([p('A', 2, 1, 'segundo'), p('A', 0, 1, 'x'.repeat(200), 'c'.repeat(50)), p('A', 0, 1, 'duplicado')], now);
    expect(out.A).toHaveLength(2);
    expect(out.A![0]![2]).toHaveLength(80);
    expect(out.A![0]![2].endsWith('…')).toBe(true);
    expect(out.A![0]![3]).toHaveLength(24);
    expect(out.A![1]![2]).toBe('segundo');
  });
  it('canal sem programa na janela some', () => {
    expect(compactChannels([p('A', 40, 1)], now)).toEqual({});
  });
  it('usa epoch em segundos (UTC)', () => {
    expect(compactChannels([p('A', 0, 1)], now).A![0]![0]).toBe(now);
  });
});

describe('buildCountryFile (orçamento de tamanho)', () => {
  const many: XmltvProgramme[] = [];
  for (let c = 0; c < 60; c++) for (let i = 0; i < 80; i++) many.push(p(`Canal${c}.xx`, i * 0.5 - 1, 0.5, `Programa número ${i} do canal ${c} ${Math.random().toString(36)}`, 'Variedades'));

  it('cabe no orçamento padrão com 36 h quando é pequeno', () => {
    const r = buildCountryFile(many.slice(0, 300), NOW);
    expect(r.aheadH).toBe(AHEAD_H);
    expect(r.trimmed).toBe(false);
    expect(r.gzipBytes).toBe(gzipSync(r.json).length);
  });
  it('corta a janela quando estoura o orçamento e informa', () => {
    const full = buildCountryFile(many, NOW, 10_000_000);
    const r = buildCountryFile(many, NOW, Math.floor(full.gzipBytes * 0.6));
    expect(r.trimmed).toBe(true);
    expect(r.aheadH).toBeLessThan(AHEAD_H);
    expect(r.gzipBytes).toBeLessThan(full.gzipBytes);
  });
  it('avisa se nem a menor janela cabe', () => {
    const r = buildCountryFile(many, NOW, 100);
    expect(r.overBudget).toBe(true);
    expect(r.aheadH).toBe(8);
  });
});

describe('planGuides / channelsXml', () => {
  const ch = (id: string, status: Channel['status'], country = 'BR'): Channel => ({
    id, name: `Nome & ${id}`, country, categories: [], languages: [], url: 'https://x/y.m3u8', kind: 'hls', status, sources: ['iptv-org'],
  });
  const g = (channel: string, site: string, site_id: string): OrgGuide => ({ channel, feed: null, site, site_id, site_name: site_id, lang: 'pt' });
  const guides = guidesByChannel([g('A.br', 'mi.tv', 'br#a'), g('A.br', 'raro.com', 'a'), g('B.br', 'mi.tv', 'br#b'), g('C.br', 'raro.com', 'c'), g('Z.br', 'mi.tv', 'br#z')]);
  const list = [ch('A.br', 'online'), ch('B.br@Sul', 'desconhecido'), ch('C.br', 'online'), ch('Z.br', 'offline'), ch('D.br', 'online')];

  it('um site por canal (o que cobre mais), sem canais offline nem sem guia', () => {
    const items = planGuides(list, guides, ['BR']);
    expect(items.map((i) => [i.id, i.site, i.site_id])).toEqual([['A.br', 'mi.tv', 'br#a'], ['B.br@Sul', 'mi.tv', 'br#b'], ['C.br', 'raro.com', 'c']]);
  });
  it('allowSites restringe os sites', () => {
    expect(planGuides(list, guides, ['BR'], ['raro.com']).map((i) => i.id)).toEqual(['A.br', 'C.br']);
  });
  it('xml escapa e usa o id da grade como xmltv_id', () => {
    const xml = channelsXml(planGuides(list, guides, ['BR']));
    expect(xml).toContain('xmltv_id="B.br@Sul"');
    expect(xml).toContain('>Nome &amp; A.br<');
    expect(xml).toContain('site_id="br#a"');
  });
});
