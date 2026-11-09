import { beforeEach, describe, expect, it } from 'vitest';
import { channelShareLink, peekSlug, resetPaginasForTest, setPaginasForTest, shareText, telegramUrl, whatsappUrl } from '../../src/lib/share.ts';

const base = { name: 'TV Cultura', number: '07', link: 'https://jkfa.github.io/tv-livre/canal/br/tv-cultura/' };

describe('shareText', () => {
  it('sem guia: "Tô assistindo … (canal NN) ao vivo no TV Livre: link"', () => {
    expect(shareText(base)).toBe('📺 Tô assistindo TV Cultura (canal 07) ao vivo no TV Livre: https://jkfa.github.io/tv-livre/canal/br/tv-cultura/');
  });
  it('com guia: "Agora em Nome: Programa — link"', () => {
    expect(shareText({ ...base, program: 'Roda Viva' })).toBe('📺 Agora em TV Cultura: Roda Viva — https://jkfa.github.io/tv-livre/canal/br/tv-cultura/');
  });
  it('sem o link (Telegram recebe o link à parte)', () => {
    expect(shareText(base, false)).toBe('📺 Tô assistindo TV Cultura (canal 07) ao vivo no TV Livre');
    expect(shareText({ ...base, program: 'Roda Viva' }, false)).toBe('📺 Agora em TV Cultura: Roda Viva');
  });
  it('programa vazio conta como sem guia', () => {
    expect(shareText({ ...base, program: '' })).toContain('Tô assistindo');
  });
});

describe('channelShareLink', () => {
  const ch = { id: 'Cultura.br@SP', country: 'BR' };
  it('usa a página indexável quando existe', () => {
    expect(channelShareLink(ch, 'tv-cultura', 'https://jkfa.github.io/tv-livre/')).toBe('https://jkfa.github.io/tv-livre/canal/br/tv-cultura/');
    expect(channelShareLink(ch, 'tv-cultura', 'https://jkfa.github.io/tv-livre')).toBe('https://jkfa.github.io/tv-livre/canal/br/tv-cultura/');
  });
  it('senão, a rota por hash, com o id codificado', () => {
    expect(channelShareLink(ch, undefined, 'https://jkfa.github.io/tv-livre/')).toBe('https://jkfa.github.io/tv-livre/#/canal/BR/Cultura.br%40SP');
  });
  it('nunca leva parâmetros de rastreamento', () => {
    for (const l of [channelShareLink(ch, 'x', 'https://s.example/'), channelShareLink(ch, undefined, 'https://s.example/')]) expect(l).not.toMatch(/[?&](utm|ref|fbclid|src)/i);
  });
});

describe('links de compartilhamento', () => {
  it('WhatsApp e Telegram codificam o texto', () => {
    const t = shareText(base);
    expect(whatsappUrl(t)).toBe(`https://wa.me/?text=${encodeURIComponent(t)}`);
    const u = new URL(telegramUrl(base.link, shareText(base, false)));
    expect(u.origin + u.pathname).toBe('https://t.me/share/url');
    expect(u.searchParams.get('url')).toBe(base.link);
    expect(u.searchParams.get('text')).toBe('📺 Tô assistindo TV Cultura (canal 07) ao vivo no TV Livre');
  });
});

describe('lista de páginas', () => {
  beforeEach(() => resetPaginasForTest());
  it('lê o slug do cache, sem rede', () => {
    expect(peekSlug({ id: 'a', country: 'BR' })).toBeUndefined();
    setPaginasForTest('BR', { a: 'canal-a' });
    expect(peekSlug({ id: 'a', country: 'BR' })).toBe('canal-a');
    expect(peekSlug({ id: 'b', country: 'BR' })).toBeUndefined();
    expect(peekSlug({ id: 'a', country: 'US' })).toBeUndefined();
  });
});
