import { describe, expect, it } from 'vitest';
import type { Channel } from '../../shared/types.ts';
import { buildPlan, isPlayableHere, toHttps, unsupportedReason, type Caps } from '../../src/lib/playback.ts';
import { m3uFileName, m3uText, vlcHref } from '../../src/lib/vlc.ts';

const caps = (over: Partial<Caps> = {}): Caps => ({ mse: true, nativeHls: false, pageSecure: true, httpOk: false, ...over });
const ch = (over: Partial<Channel> = {}): Channel => ({
  id: 'x', name: 'Canal X', country: 'BR', categories: [], languages: [], url: 'https://a.example/live.m3u8',
  kind: 'hls', status: 'online', sources: ['free-tv'], ...over,
});
const sig = (steps: ReturnType<typeof buildPlan>) => steps.map((s) => `${s.engine}${s.upgrade ? '+up' : ''}${s.insecure ? '!' : ''}:${s.url.slice(0, 5)}`);

describe('buildPlan', () => {
  it('HTTPS com CORS: hls.js e, se o navegador tem, HLS nativo como reserva', () => {
    expect(sig(buildPlan(ch(), caps()))).toEqual(['hlsjs:https']);
    expect(sig(buildPlan(ch(), caps({ nativeHls: true })))).toEqual(['hlsjs:https', 'native:https']);
  });

  it('HTTPS sem CORS: só o HLS nativo (o <video> não exige CORS)', () => {
    expect(sig(buildPlan(ch({ cors: false }), caps({ nativeHls: true })))).toEqual(['native:https']);
    expect(buildPlan(ch({ cors: false }), caps())).toEqual([]);
  });

  it('"tentar mesmo assim" libera o hls.js mesmo com aviso de CORS', () => {
    expect(sig(buildPlan(ch({ cors: false }), caps(), { force: true }))).toEqual(['hlsjs:https']);
  });

  it('HTTP em página HTTPS: tenta o mesmo endereço por HTTPS antes do HTTP puro', () => {
    const plan = buildPlan(ch({ url: 'http://a.example/live.m3u8', kind: 'http' }), caps({ nativeHls: true }));
    expect(sig(plan)).toEqual(['hlsjs+up:https', 'native:https', 'hlsjs!:http:', 'native!:http:']);
    expect(plan[0]!.budgetMs).toBeLessThan(plan[2]!.budgetMs); // o upgrade não pode atrasar muito quem só tem HTTP
  });

  it('HTTP já liberado pelo usuário vai primeiro', () => {
    const plan = buildPlan(ch({ url: 'http://a.example/live.m3u8', kind: 'http' }), caps({ httpOk: true }));
    expect(sig(plan)).toEqual(['hlsjs!:http:', 'hlsjs+up:https']);
  });

  it('HTTP numa página que não é HTTPS (preview local) toca direto', () => {
    expect(sig(buildPlan(ch({ url: 'http://a.example/live.m3u8', kind: 'http' }), caps({ pageSecure: false })))).toEqual(['hlsjs:http:']);
  });

  it('canal que exige cabeçalhos não tem plano', () => {
    expect(buildPlan(ch({ needsHeaders: true }), caps({ nativeHls: true }))).toEqual([]);
  });
});

describe('unsupportedReason / isPlayableHere', () => {
  it('explica por que não dá', () => {
    expect(unsupportedReason(ch({ needsHeaders: true }), caps())).toBe('headers');
    expect(unsupportedReason(ch({ kind: 'other', url: 'https://a.example/x.mpd' }), caps())).toBe('format');
    expect(unsupportedReason(ch({ cors: false }), caps())).toBe('cors');
    expect(unsupportedReason(ch({ cors: false }), caps({ nativeHls: true }))).toBeNull();
    expect(unsupportedReason(ch({ url: 'http://a.example/l.m3u8', kind: 'http' }), caps())).toBeNull();
  });

  it('HTTP só entra no zapear depois de liberado e comprovado', () => {
    const http = ch({ url: 'http://a.example/l.m3u8', kind: 'http' });
    expect(isPlayableHere(http, caps())).toBe(false);
    expect(isPlayableHere(http, caps({ httpOk: true }))).toBe(true);
  });

  it('sem CORS conta como tocável só com HLS nativo', () => {
    expect(isPlayableHere(ch({ cors: false }), caps())).toBe(false);
    expect(isPlayableHere(ch({ cors: false }), caps({ nativeHls: true }))).toBe(true);
  });
});

describe('VLC sem copiar e colar', () => {
  const c = { name: 'Rede Vida, ao vivo', url: 'http://a.example:8080/live/index.m3u8?token=1#x' };

  it('Android usa intent dirigido ao pacote do VLC', () => {
    const h = vlcHref(c, 'android')!;
    expect(h).toMatch(/^intent:\/\/a\.example:8080\/live\/index\.m3u8\?token=1#Intent;scheme=http;/);
    expect(h).toContain('package=org.videolan.vlc');
    expect(h).toContain('S.title=Rede%20Vida%2C%20ao%20vivo');
  });

  it('iPhone usa o x-callback do VLC com a URL codificada', () => {
    expect(vlcHref({ ...c, url: 'https://a.example/l.m3u8' }, 'ios')).toBe('vlc-x-callback://x-callback-url/stream?url=https%3A%2F%2Fa.example%2Fl.m3u8');
  });

  it('computador não tem link universal: o caminho é o .m3u', () => {
    expect(vlcHref(c, 'desktop')).toBeNull();
    expect(m3uText(c)).toBe('#EXTM3U\n#EXTINF:-1,Rede Vida  ao vivo\nhttp://a.example:8080/live/index.m3u8?token=1#x\n');
    expect(m3uFileName({ name: 'Rede Vida — São Paulo' })).toBe('Rede-Vida-Sao-Paulo.m3u');
  });

  it('toHttps só troca o esquema', () => {
    expect(toHttps('http://a.example/http://b')).toBe('https://a.example/http://b');
  });
});

describe('AirPlay: só HLS nativo (o AirPlay não funciona com MediaSource)', () => {
  it('troca a tentativa atual para o HLS nativo, mantendo o canal', () => {
    const c = caps({ nativeHls: true });
    expect(sig(buildPlan(ch(), c))).toEqual(['hlsjs:https', 'native:https']);
    expect(sig(buildPlan(ch(), c, { nativeOnly: true }))).toEqual(['native:https']);
  });
  it('voltar ao motor anterior = planejar de novo sem nativeOnly', () => {
    const c = caps({ nativeHls: true });
    expect(sig(buildPlan(ch(), c, { nativeOnly: false }))).toEqual(sig(buildPlan(ch(), c)));
  });
  it('canal sem CORS e HTTP em página HTTPS continuam seguindo as regras do nativo', () => {
    expect(sig(buildPlan(ch({ cors: false }), caps({ nativeHls: true }), { nativeOnly: true }))).toEqual(['native:https']);
    expect(sig(buildPlan(ch({ url: 'http://a.example/l.m3u8' }), caps({ nativeHls: true }), { nativeOnly: true }))).toEqual(['native:https', 'native!:http:']);
  });
  it('sem HLS nativo no navegador não há o que tentar (o AirPlay nem é oferecido)', () => {
    expect(buildPlan(ch(), caps({ nativeHls: false }), { nativeOnly: true })).toEqual([]);
  });
});
