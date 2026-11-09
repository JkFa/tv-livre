import { describe, expect, it } from 'vitest';
import { isAdultCategory, looksAdultText } from '../../scripts/lib/adult.ts';
import { classifyUrl } from '../../scripts/lib/classify.ts';
import { canonCountry, normalizeName, normalizeUrl } from '../../scripts/lib/normalize.ts';
import { isYouTubeUrl, parseYouTube } from '../../scripts/lib/youtube.ts';
import { youtubeEmbedUrl } from '../../shared/youtube.ts';

describe('normalizeName', () => {
  it('ignora acentos, caixa, pontuação e tags de qualidade', () => {
    expect(normalizeName('Rede Globo HD')).toBe(normalizeName('REDE  GLOBO'));
    expect(normalizeName('Canal São Paulo (1080p)')).toBe(normalizeName('Canal Sao Paulo'));
    expect(normalizeName('TV Cultura Ⓢ')).toBe('tvcultura');
  });
  it('mantém alfabetos não latinos', () => {
    expect(normalizeName('Арктика 24')).toBe('арктика24');
    expect(normalizeName('日本 TV')).toBe('日本tv');
  });
  it('não junta canais diferentes', () => {
    expect(normalizeName('Record News')).not.toBe(normalizeName('Record'));
  });
});

describe('normalizeUrl', () => {
  it('trata http e https como o mesmo stream e ignora barra final e fragmento', () => {
    expect(normalizeUrl('http://Exemplo.com:80/a/b.m3u8#x')).toBe(normalizeUrl('https://exemplo.com/a/b.m3u8'));
    expect(normalizeUrl('https://x.com/live/')).toBe(normalizeUrl('https://x.com/live'));
  });
  it('mantém query string (tokens distinguem streams)', () => {
    expect(normalizeUrl('https://x.com/a.m3u8?id=1')).not.toBe(normalizeUrl('https://x.com/a.m3u8?id=2'));
  });
  it('não lança com URL inválida', () => {
    expect(() => normalizeUrl('não é url')).not.toThrow();
  });
});

describe('canonCountry', () => {
  it('unifica UK (iptv-org) e GB (Free-TV)', () => {
    expect(canonCountry('uk')).toBe('GB');
    expect(canonCountry('GB')).toBe('GB');
    expect(canonCountry('br')).toBe('BR');
  });
});

describe('classifyUrl', () => {
  it.each([
    ['https://rnw-rn.otteravision.com/rnw/rn/rnw_rn.m3u8', 'hls'],
    ['https://x.com/master.m3u8?token=abc', 'hls'],
    ['http://168.197.104.22/FUTURA/index.m3u8', 'http'],
    ['https://www.youtube.com/watch?v=ABVQXgr2LW4', 'youtube'],
    ['https://youtu.be/ABVQXgr2LW4', 'youtube'],
    ['https://www.twitch.tv/abcnewsal', 'other'],
    ['rtmp://212.200.230.50:1935/RTV/rtv1', 'other'],
    ['rtsp://185.50.56.16:554/neontelvizija', 'other'],
    ['https://x.com/stream.mpd', 'other'],
    ['lixo', 'other'],
  ] as const)('%s → %s', (url, kind) => {
    expect(classifyUrl(url)).toBe(kind);
  });
});

describe('YouTube', () => {
  it('reconhece vídeo, canal e handle', () => {
    expect(parseYouTube('https://www.youtube.com/watch?v=ABVQXgr2LW4')).toEqual({ type: 'video', id: 'ABVQXgr2LW4', embeddable: true });
    expect(parseYouTube('https://youtu.be/ABVQXgr2LW4')?.type).toBe('video');
    expect(parseYouTube('https://www.youtube.com/channel/UCZaqeS_kWR3FJC0ukbOOiwA/live')).toEqual({
      type: 'channel',
      id: 'UCZaqeS_kWR3FJC0ukbOOiwA',
      embeddable: true,
    });
    expect(parseYouTube('https://www.youtube.com/@EuronewsAlbania/live')).toEqual({ type: 'handle', embeddable: false });
    expect(parseYouTube('https://www.youtube.com/c/todonoticias/live')?.embeddable).toBe(false);
    expect(parseYouTube('https://www.youtube.com/user/encuentro/live')?.embeddable).toBe(false);
  });
  it('rejeita IDs inválidos e outros sites', () => {
    expect(parseYouTube('https://www.youtube.com/watch?v=curto')?.embeddable).toBe(false);
    expect(parseYouTube('https://exemplo.com/watch?v=ABVQXgr2LW4')).toBeNull();
    expect(isYouTubeUrl('https://notyoutube.com/x')).toBe(false);
  });
  it('monta a URL do embed oficial (nocookie) só quando é possível', () => {
    expect(youtubeEmbedUrl(parseYouTube('https://youtu.be/ABVQXgr2LW4')!)).toBe(
      'https://www.youtube-nocookie.com/embed/ABVQXgr2LW4?autoplay=1&rel=0',
    );
    expect(youtubeEmbedUrl(parseYouTube('https://www.youtube.com/channel/UCZaqeS_kWR3FJC0ukbOOiwA/live')!)).toContain(
      'embed/live_stream?channel=UCZaqeS_kWR3FJC0ukbOOiwA',
    );
    expect(youtubeEmbedUrl(parseYouTube('https://www.youtube.com/@canal/live')!)).toBeNull();
  });
});

describe('filtro de conteúdo adulto', () => {
  it.each(['Brazzers TV', 'XXX Channel', 'Playboy TV Latin America', 'Hustler TV', 'Sexy Clips', 'Dating Naked UK', 'VF Cartoon 18+'])(
    'bloqueia "%s"',
    (name) => expect(looksAdultText(name)).toBe(true),
  );
  it.each(['Adult Swim', 'Essex TV', 'Sexta Feira TV', 'Globo News', 'Music Choice Adult Alternative', 'Pluto TV Adult Animation', 'Canal 18', 'TV Cultura'])(
    'não bloqueia "%s" por engano',
    (name) => expect(looksAdultText(name)).toBe(false),
  );
  it('reconhece a categoria xxx', () => {
    expect(isAdultCategory(['general', 'xxx'])).toBe(true);
    expect(isAdultCategory(['news'])).toBe(false);
  });
});

import { diagnoseCast } from '../../src/lib/diagnose.ts';
describe('diagnoseCast (erros do receptor do Chromecast)', () => {
  const on = { status: 'online' as const };
  it('mapeia os códigos para as mesmas causas do player', () => {
    expect(diagnoseCast('LOAD_MEDIA_FAILED', on)).toBe('cors');
    expect(diagnoseCast('LOAD_MEDIA_FAILED', { status: 'offline' })).toBe('offline');
    expect(diagnoseCast('LOAD_FAILED', { ...on, geo: true })).toBe('geo');
    expect(diagnoseCast('TIMEOUT', on)).toBe('timeout');
    expect(diagnoseCast('SESSION_ERROR', on)).toBe('device');
    expect(diagnoseCast('RECEIVER_UNAVAILABLE', on)).toBe('device');
    expect(diagnoseCast('ALGO_NOVO', on)).toBe('unknown');
  });
});
