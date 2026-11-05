import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAttributes, parseM3U } from '../../scripts/lib/m3u.ts';
import { stripMarkers } from '../../scripts/lib/normalize.ts';

const fixture = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');

describe('parseM3U — playlist real do Free-TV', () => {
  const { entries, skipped } = parseM3U(fixture('free-tv-sample.m3u8'));

  it('lê as entradas com atributos e URL', () => {
    const globo = entries.find((e) => e.attrs['tvg-id'] === 'COMBrasil.br');
    expect(globo).toBeDefined();
    expect(globo?.title).toBe('COM Brasil');
    expect(globo?.attrs['tvg-country']).toBe('BR');
    expect(globo?.attrs['group-title']).toBe('Brazil');
    expect(globo?.url).toBe('https://br5093.streamingdevideo.com.br/abc/abc/playlist.m3u8');
  });

  it('preserva os marcadores circulados do título para tratamento posterior', () => {
    const sbt = entries.find((e) => e.attrs['tvg-id'] === 'SBTNacional.br');
    expect(sbt?.title).toBe('SBT Ⓨ');
    expect(stripMarkers(sbt!.title)).toEqual({ name: 'SBT', markers: ['Ⓨ'] });
  });

  it('descarta entradas cujo "link" é o marcador [NO PUBLIC STREAM]', () => {
    expect(skipped.filter((s) => s.reason.includes('NO PUBLIC STREAM')).length).toBeGreaterThanOrEqual(2);
    expect(entries.find((e) => e.attrs['tvg-id'] === 'WOWOWLive.jp')).toBeUndefined();
    for (const e of entries) expect(e.url).toMatch(/^[a-z]+:\/\//i);
  });

  it('não confunde o cabeçalho #EXTM3U com uma entrada', () => {
    expect(entries.every((e) => e.title.length > 0)).toBe(true);
  });
});

describe('parseM3U — entradas malformadas', () => {
  const { entries, skipped } = parseM3U(fixture('malformed.m3u8'));
  const byUrl = (u: string) => entries.find((e) => e.url === u);

  it('aceita BOM e quebras de linha CRLF', () => {
    expect(byUrl('https://exemplo.com/ok.m3u8')?.title).toBe('Canal Com Crlf Ⓨ');
  });

  it('respeita vírgula dentro de atributo entre aspas', () => {
    const e = byUrl('https://exemplo.com/ok.m3u8');
    expect(e?.attrs['tvg-name']).toBe('Canal, com vírgula');
    expect(e?.title).toBe('Canal Com Crlf Ⓨ');
  });

  it('descarta EXTINF sem URL e continua com o próximo', () => {
    expect(entries.find((e) => e.attrs['tvg-id'] === 'SemUrl.br')).toBeUndefined();
    expect(byUrl('https://exemplo.com/proximo.m3u8')?.attrs['tvg-id']).toBe('Proximo.br');
    expect(skipped.some((s) => s.reason === 'EXTINF sem URL')).toBe(true);
  });

  it('ignora URL solta sem EXTINF', () => {
    expect(byUrl('https://exemplo.com/url-sem-extinf.m3u8')).toBeUndefined();
    expect(skipped.some((s) => s.reason === 'URL sem EXTINF')).toBe(true);
  });

  it('aceita EXTINF sem atributos', () => {
    const e = byUrl('https://exemplo.com/sem-attrs.m3u8');
    expect(e?.title).toBe('Sem atributos nenhum');
    expect(e?.attrs).toEqual({});
  });

  it('não lança com aspas desbalanceadas', () => {
    expect(() => parseM3U('#EXTINF:-1 a="b,Titulo\nhttps://x.com/a.m3u8')).not.toThrow();
    expect(byUrl('https://exemplo.com/aspas.m3u8')).toBeDefined();
  });

  it('lê atributos sem aspas', () => {
    const e = byUrl('https://exemplo.com/sem-aspas.m3u8');
    expect(e?.attrs['tvg-id']).toBe('SemAspas.br');
    expect(e?.attrs['tvg-country']).toBe('BR');
    expect(e?.title).toBe('Atributos sem aspas');
  });

  it('captura #EXTVLCOPT de user-agent e referrer', () => {
    const e = byUrl('https://exemplo.com/vlc.m3u8');
    expect(e?.options['http-user-agent']).toBe('Mozilla/5.0 Custom');
    expect(e?.options['http-referrer']).toBe('https://emissora.example/');
  });

  it('descarta EXTINF final sem URL', () => {
    expect(entries.find((e) => e.attrs['tvg-id'] === 'Fim.br')).toBeUndefined();
  });
});

describe('parseM3U — casos extremos', () => {
  it('lida com texto vazio, só cabeçalho e lixo binário', () => {
    expect(parseM3U('').entries).toEqual([]);
    expect(parseM3U('#EXTM3U\n').entries).toEqual([]);
    expect(parseM3U('\u0000\u0001<html><body>404</body></html>').entries).toEqual([]);
  });

  it('parseAttributes mantém o primeiro valor de atributos repetidos', () => {
    expect(parseAttributes('-1 tvg-id="a" tvg-id="b"')).toEqual({ 'tvg-id': 'a' });
  });
});
