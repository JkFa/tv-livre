import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PROBE, fromHealthEntry, healthFields, judge, maxHeight, probeBatch, probeUrl, resolutionLabel, toHealthEntry, type ProbeOptions } from '../../scripts/lib/probe.ts';
import type { HealthEntry } from '../../shared/types.ts';

let server: Server;
let base = '';
const opts: ProbeOptions = { ...DEFAULT_PROBE, timeoutMs: 800, concurrency: 8, siteOrigin: 'https://site.example' };

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/ok.m3u8') {
      res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl', 'access-control-allow-origin': '*' });
      res.end('#EXTM3U\n#EXT-X-VERSION:3\n');
    } else if (url === '/nocors.m3u8') {
      res.writeHead(200, { 'content-type': 'application/x-mpegURL' });
      res.end('#EXTM3U\n');
    } else if (url === '/origin.m3u8') {
      // CORS só para a origem do site (como fazem alguns CDNs)
      res.writeHead(200, { 'access-control-allow-origin': req.headers.origin ?? '' });
      res.end('#EXTM3U\n');
    } else if (url === '/gone.m3u8') {
      res.writeHead(404).end('nope');
    } else if (url === '/geo.m3u8') {
      res.writeHead(403).end('blocked');
    } else if (url === '/html.m3u8') {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<html>login</html>');
    } else if (url === '/slow.m3u8') {
      setTimeout(() => res.writeHead(200).end('#EXTM3U\n'), 3000);
    } else if (url === '/needs-ua.m3u8') {
      if (req.headers['user-agent'] === 'ExoPlayer' && req.headers.referer === 'https://emissora.example/') {
        res.writeHead(200).end('#EXTM3U\n');
      } else res.writeHead(403).end();
    } else if (url === '/no-ext-playlist') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('#EXTM3U\n#EXTINF:-1,x\nhttp://a/b.ts');
    } else res.writeHead(500).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('probeUrl', () => {
  it('manifesto válido → ok, e detecta CORS aberto', async () => {
    expect(await probeUrl({ url: `${base}/ok.m3u8`, kind: 'hls' }, opts)).toMatchObject({ ok: true, cors: true });
    const r = await probeUrl({ url: `${base}/ok.m3u8`, kind: 'hls' }, opts);
    expect(r.latencyMs).toBeGreaterThan(0); // tempo até a resposta, para a dica de latência
  });
  it('detecta ausência de CORS', async () => {
    expect(await probeUrl({ url: `${base}/nocors.m3u8`, kind: 'hls' }, opts)).toMatchObject({ ok: true, cors: false });
  });
  it('aceita CORS restrito à origem do site', async () => {
    expect(await probeUrl({ url: `${base}/origin.m3u8`, kind: 'hls' }, opts)).toMatchObject({ ok: true, cors: true });
  });
  it('404 é falha definitiva', async () => {
    expect(await probeUrl({ url: `${base}/gone.m3u8`, kind: 'hls' }, opts)).toMatchObject({ ok: false, definitive: true });
  });
  it('403 (possível geo-bloqueio) NÃO é definitivo', async () => {
    expect(await probeUrl({ url: `${base}/geo.m3u8`, kind: 'hls' }, opts)).toMatchObject({ ok: false, definitive: false, reason: 'HTTP 403' });
  });
  it('200 com HTML em vez de manifesto não é ok nem definitivo', async () => {
    expect(await probeUrl({ url: `${base}/html.m3u8`, kind: 'hls' }, opts)).toMatchObject({ ok: false, definitive: false });
  });
  it('timeout é falha ambígua', async () => {
    expect(await probeUrl({ url: `${base}/slow.m3u8`, kind: 'hls' }, opts)).toMatchObject({ ok: false, definitive: false, reason: 'TIMEOUT' });
  });
  it('conexão recusada é falha definitiva', async () => {
    // abre e fecha um servidor para obter uma porta que certamente está fechada
    const tmp = createServer();
    await new Promise<void>((r) => tmp.listen(0, '127.0.0.1', r));
    const port = (tmp.address() as AddressInfo).port;
    await new Promise<void>((r) => tmp.close(() => r()));
    expect(await probeUrl({ url: `http://127.0.0.1:${port}/x.m3u8`, kind: 'http' }, opts)).toMatchObject({ ok: false, definitive: true });
  });
  it('envia User-Agent e Referer pedidos pela fonte', async () => {
    const r = await probeUrl(
      { url: `${base}/needs-ua.m3u8`, kind: 'hls', headers: { userAgent: 'ExoPlayer', referrer: 'https://emissora.example/' } },
      opts,
    );
    expect(r.ok).toBe(true);
  });
  it('promove https sem .m3u8 para hls quando o conteúdo é um manifesto', async () => {
    expect(await probeUrl({ url: `${base}/no-ext-playlist`, kind: 'other' }, opts)).toMatchObject({ ok: true, kind: 'hls' });
  });
});

describe('judge — nunca marcar offline por uma única falha', () => {
  const fail = (definitive: boolean) => ({ ok: false, definitive, reason: 'x' });
  const prev = (s: 0 | 1 | 2, f: number): HealthEntry => [s, f, 0, 2];

  it('sucesso → online e zera falhas', () => {
    expect(judge({ ok: true, definitive: false, reason: 'ok', cors: true }, prev(2, 2))).toEqual({ status: 'online', fails: 0, cors: true });
  });
  it('falha ambígua → desconhecido; só vira offline na 3ª seguida', () => {
    expect(judge(fail(false), undefined).status).toBe('desconhecido');
    expect(judge(fail(false), prev(2, 1)).status).toBe('desconhecido');
    expect(judge(fail(false), prev(2, 2)).status).toBe('offline');
  });
  it('falha definitiva sem histórico → offline', () => {
    expect(judge(fail(true), undefined).status).toBe('offline');
  });
  it('canal que estava online e falha de forma definitiva só cai para desconhecido na 1ª vez', () => {
    expect(judge(fail(true), prev(0, 0))).toMatchObject({ status: 'desconhecido', fails: 1 });
    expect(judge(fail(true), prev(2, 1)).status).toBe('offline');
  });
});

describe('probeBatch', () => {
  it('respeita o limite de concorrência por host', async () => {
    let active = 0;
    let peak = 0;
    const fake = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return { ok: true, definitive: false, reason: 'ok' };
    };
    const items = Array.from({ length: 30 }, (_, i) => ({ key: String(i), url: `https://mesmo-host.example/${i}.m3u8`, kind: 'hls' as const }));
    const res = await probeBatch(items, { ...opts, concurrency: 20, perHost: 3 }, undefined, fake);
    expect(res.size).toBe(30);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('medidas do teste: latência, resolução e HTTPS', () => {
  it('lê a maior variante de uma lista mestre e rotula a resolução', () => {
    const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1"\nhi.m3u8\n';
    expect(maxHeight(master)).toBe(1080);
    expect(maxHeight('#EXTM3U\n#EXTINF:6,\nseg1.ts\n')).toBeUndefined();
    expect(resolutionLabel(1080)).toBe('1080p');
    expect(resolutionLabel(1072)).toBe('1080p');
    expect(resolutionLabel(404)).toBe('360p');
    expect(resolutionLabel(undefined)).toBeUndefined();
  });

  it('o histórico guarda e devolve latência, resolução e HTTPS; entradas antigas (4 posições) continuam válidas', () => {
    const j = { status: 'online' as const, fails: 0, cors: true, latencyMs: 230, height: 720, httpsOk: true };
    const e = toHealthEntry(j, 60_000 * 100);
    expect(e).toEqual([0, 0, 100, 1, 230, 720, 1]);
    expect(fromHealthEntry(e)).toEqual(j);
    expect(fromHealthEntry([2, 1, 100, 2])).toEqual({ status: 'desconhecido', fails: 1, cors: undefined });
  });

  it('falha mantém a resolução conhecida; sucesso traz as medidas novas', () => {
    expect(judge({ ok: false, definitive: false, reason: 'TIMEOUT' }, [0, 0, 1, 1, 200, 1080, 0])).toMatchObject({ fails: 1, height: 1080 });
    expect(judge({ ok: true, definitive: false, reason: 'HLS ok', cors: true, latencyMs: 90, height: 720 }, undefined)).toMatchObject({ latencyMs: 90, height: 720 });
  });

  it('campos publicados no canal: só os que têm valor', () => {
    expect(healthFields({ status: 'online', fails: 0 }, undefined)).toEqual({});
    expect(healthFields({ status: 'desconhecido', fails: 2, latencyMs: 300, height: 1080, httpsOk: true }, 123)).toEqual({ fails: 2, checked: 123, latency: 300, resolution: '1080p', httpsOk: true });
  });
});
