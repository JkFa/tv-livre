import { describe, expect, it } from 'vitest';
import type { Channel } from '../../shared/types.ts';
import { avisoPulo, castMedia, eBrave, eChromium, podeTransmitir, proximoTransmissivel } from '../../src/lib/cast.ts';
import { channelKey } from '../../src/lib/lineup.ts';

const ch = (over: Partial<Channel> = {}): Channel => ({
  id: 'x', name: 'Canal X', country: 'BR', categories: [], languages: [], url: 'https://a.example/live.m3u8',
  kind: 'hls', status: 'online', sources: ['free-tv'], ...over,
});

describe('podeTransmitir', () => {
  it('HLS em HTTPS com CORS e sem cabeçalhos: sim', () => {
    expect(podeTransmitir(ch())).toBe(true);
    expect(podeTransmitir(ch({ cors: true }))).toBe(true);
  });
  it.each([
    ['http', { kind: 'http' as const, url: 'http://a.example/live.m3u8' }],
    ['hls com URL http', { url: 'http://a.example/live.m3u8' }],
    ['sem CORS', { cors: false }],
    ['exige cabeçalhos', { needsHeaders: true }],
    ['youtube', { kind: 'youtube' as const, url: 'https://www.youtube.com/watch?v=abc' }],
    ['outro formato', { kind: 'other' as const }],
  ])('%s: não', (_n, over) => {
    expect(podeTransmitir(ch(over))).toBe(false);
  });
  it('combinações: cada condição sozinha basta para barrar', () => {
    for (const kind of ['hls', 'http', 'youtube', 'other'] as const)
      for (const proto of ['https://', 'http://'])
        for (const cors of [undefined, true, false])
          for (const needsHeaders of [undefined, false, true]) {
            const esperado = kind === 'hls' && proto === 'https://' && cors !== false && needsHeaders !== true;
            expect(podeTransmitir(ch({ kind, url: `${proto}a.example/l.m3u8`, ...(cors === undefined ? {} : { cors }), ...(needsHeaders === undefined ? {} : { needsHeaders }) }))).toBe(esperado);
          }
  });
});

describe('proximoTransmissivel (zapear durante a transmissão)', () => {
  const a = ch({ id: 'a', name: 'A' });
  const b = ch({ id: 'b', name: 'B', url: 'http://b.example/x.m3u8' }); // não transmissível
  const c = ch({ id: 'c', name: 'C', cors: false }); // não transmissível
  const d = ch({ id: 'd', name: 'D' });
  const e = ch({ id: 'e', name: 'E', status: 'offline' });
  const list = [a, b, c, d, e];

  it('pula os que não dão e informa quais', () => {
    const r = proximoTransmissivel(list, channelKey(a), 1);
    expect(r.canal?.id).toBe('d');
    expect(r.puladas.map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('para trás e dando a volta; nunca para em canal fora do ar', () => {
    expect(proximoTransmissivel(list, channelKey(d), -1).canal?.id).toBe('a');
    expect(proximoTransmissivel(list, channelKey(d), 1).canal?.id).toBe('a'); // e (offline) fica de fora, volta ao início
  });
  it('sem nenhum outro transmissível: null', () => {
    expect(proximoTransmissivel([a, b, c], channelKey(a), 1).canal).toBeNull();
    expect(proximoTransmissivel([], null, 1)).toEqual({ canal: null, puladas: [] });
  });
  it('sem canal atual começa do início/fim', () => {
    expect(proximoTransmissivel(list, null, 1).canal?.id).toBe('a');
  });
  it('aviso de pulo', () => {
    const nums = new Map([[channelKey(b), 7], [channelKey(c), 8]]);
    expect(avisoPulo([], nums)).toBe('');
    expect(avisoPulo([b], nums)).toBe('Canal 07 B não pode ser transmitido, pulando.');
    expect(avisoPulo([b, c], nums)).toContain('2 canais não podem ser transmitidos');
  });
});

describe('castMedia', () => {
  it('título "NN · Nome", subtítulo = programa ou país, logo só se https', () => {
    const base = { pais: 'Brasil', iconUrl: 'https://s/icon.png' };
    expect(castMedia(ch({ logo: 'https://l/x.png' }), '07', { ...base, programa: 'Jornal' })).toEqual({
      url: 'https://a.example/live.m3u8', contentType: 'application/x-mpegURL', title: '07 · Canal X', subtitle: 'Jornal', image: 'https://l/x.png',
    });
    expect(castMedia(ch({ logo: 'http://l/x.png' }), '07', base)).toMatchObject({ subtitle: 'Brasil', image: 'https://s/icon.png' });
    expect(castMedia(ch(), '07', base).image).toBe('https://s/icon.png');
  });
});

describe('navegador', () => {
  it('Chromium por marca ou por UA; Safari, Firefox e iOS não', () => {
    expect(eChromium({ userAgentData: { brands: [{ brand: 'Chromium' }] } })).toBe(true);
    expect(eChromium({ userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36' })).toBe(true);
    expect(eChromium({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605 CriOS/120 Mobile' })).toBe(false);
    expect(eChromium({ userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15' })).toBe(false);
    expect(eChromium({ userAgent: 'Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/120.0' })).toBe(false);
  });
  it('Brave pela presença de navigator.brave', () => {
    expect(eBrave({ brave: {} })).toBe(true);
    expect(eBrave({})).toBe(false);
  });
});
