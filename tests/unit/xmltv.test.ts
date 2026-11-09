import { describe, expect, it } from 'vitest';
import { decodeEntities, parseXmltv, parseXmltvTime } from '../../scripts/lib/xmltv.ts';

describe('parseXmltvTime', () => {
  it('aplica o fuso do formato XMLTV', () => {
    expect(parseXmltvTime('20261109200000 -0300')).toBe(Date.UTC(2026, 10, 9, 23, 0, 0) / 1000);
    expect(parseXmltvTime('20261109200000 +0530')).toBe(Date.UTC(2026, 10, 9, 14, 30, 0) / 1000);
    expect(parseXmltvTime('20261109200000 +0000')).toBe(Date.UTC(2026, 10, 9, 20, 0, 0) / 1000);
  });
  it('aceita sem fuso (UTC), com Z e sem segundos', () => {
    const t = Date.UTC(2026, 10, 9, 20, 0, 0) / 1000;
    expect(parseXmltvTime('20261109200000')).toBe(t);
    expect(parseXmltvTime('20261109200000Z')).toBe(t);
    expect(parseXmltvTime('202611092000 +0000')).toBe(t);
  });
  it('virada de dia e de ano', () => {
    expect(parseXmltvTime('20261231233000 -0300')).toBe(Date.UTC(2027, 0, 1, 2, 30, 0) / 1000);
  });
  it('rejeita lixo e datas impossíveis', () => {
    for (const bad of [undefined, '', 'amanhã', '20261309200000', '20261109250000', '2026110920']) expect(parseXmltvTime(bad)).toBeNull();
  });
});

describe('decodeEntities', () => {
  it('decodifica nomeadas, numéricas e duplas', () => {
    expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeEntities('Show &#233; &#xE9; &quot;ok&quot;')).toBe('Show é é "ok"');
    expect(decodeEntities('A&amp;amp;E')).toBe('A&E');
    expect(decodeEntities('<![CDATA[Jornal <Hoje>]]>')).toBe('Jornal <Hoje>');
  });
  it('mantém entidade desconhecida e colapsa espaços', () => {
    expect(decodeEntities('  a &foo; \n b ')).toBe('a &foo; b');
  });
});

describe('parseXmltv', () => {
  const xml = `<?xml version="1.0"?><tv>
    <channel id="Globo.br"><display-name>Globo</display-name></channel>
    <programme start="20261109200000 -0300" stop="20261109213000 -0300" channel="Globo.br">
      <title lang="pt">Jornal &amp; Cia</title><desc>longa descrição</desc><category lang="pt">Notícias</category></programme>
    <programme start="20261109213000 -0300" stop="20261109220000 -0300" channel='Globo.br'><title>Novela &#233;pica</title></programme>
    <programme start="lixo" stop="20261109220000 -0300" channel="Globo.br"><title>Quebrado</title></programme>
    <programme start="20261109220000 -0300" stop="20261109210000 -0300" channel="Globo.br"><title>Termina antes de começar</title></programme>
    <programme start="20261109220000 -0300" stop="20261109230000 -0300" channel="Globo.br"></programme>
    <programme start="20261109230000 -0300" stop="20261110000000 -0300"><title>Sem canal</title></programme>
    <programme start="20261110000000 -0300" stop="20261110010000 -0300" channel="SBT.br"><title>Último</title></programme>
  </tv>`;
  it('lê programas válidos e ignora os quebrados sem parar', () => {
    const { programmes, skipped } = parseXmltv(xml);
    expect(skipped).toBe(4);
    expect(programmes.map((p) => [p.channel, p.title, p.category])).toEqual([
      ['Globo.br', 'Jornal & Cia', 'Notícias'],
      ['Globo.br', 'Novela épica', undefined],
      ['SBT.br', 'Último', undefined],
    ]);
    expect(programmes[0]).toMatchObject({ start: Date.UTC(2026, 10, 9, 23, 0, 0) / 1000, stop: Date.UTC(2026, 10, 10, 0, 30, 0) / 1000 });
  });
  it('XML truncado não derruba o que veio antes', () => {
    const cut = xml.slice(0, xml.indexOf('<programme start="20261109213000') + 40);
    expect(parseXmltv(cut).programmes).toHaveLength(1);
  });
  it('arquivo vazio ou sem programas', () => {
    expect(parseXmltv('')).toEqual({ programmes: [], skipped: 0 });
    expect(parseXmltv('<tv></tv>').programmes).toEqual([]);
  });
});
