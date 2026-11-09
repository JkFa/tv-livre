import { describe, expect, it } from 'vitest';
import type { Channel } from '../../shared/types.ts';
import { coverageByCountry, guidesByChannel, orgChannelId, type OrgGuide } from '../../scripts/lib/epg-guides.ts';

const ch = (id: string, country: string, status: Channel['status']): Channel => ({
  id, name: id, country, categories: [], languages: [], url: 'https://x/y.m3u8', kind: 'hls', status, sources: ['iptv-org'],
});
const g = (channel: string | null, site: string): OrgGuide => ({ channel, feed: null, site, site_id: 'x', site_name: 'x', lang: 'pt' });

describe('orgChannelId', () => {
  it('tira sufixos de feed regional e de duplicata', () => {
    expect(orgChannelId('Globo.br')).toBe('Globo.br');
    expect(orgChannelId('Globo.br@Sul')).toBe('Globo.br');
    expect(orgChannelId('Globo.br~2')).toBe('Globo.br');
    expect(orgChannelId('Globo.br@Sul~3')).toBe('Globo.br');
  });
});

describe('coverageByCountry', () => {
  const guides = guidesByChannel([g('A.br', 'mi.tv'), g('A.br', 'outro.com'), g('B.br', 'mi.tv'), g('C.br', 'raro.com'), g(null, 'mi.tv')]);
  const list = [ch('A.br', 'BR', 'online'), ch('B.br', 'BR', 'online'), ch('C.br', 'BR', 'offline'), ch('D.br', 'BR', 'online'), ch('A.us', 'US', 'online')];

  it('conta só canais no ar e escolhe o site que cobre mais', () => {
    const [br] = coverageByCountry(list, guides, ['BR']);
    expect(br).toMatchObject({ country: 'BR', grade: 4, online: 3, onlineComGuia: 2, gradeComGuia: 3 });
    expect(br!.pct).toBeCloseTo(66.67, 1);
    expect(br!.sites).toEqual([{ site: 'mi.tv', canais: 2 }]);
  });

  it('país sem canais no ar dá 0% sem dividir por zero', () => {
    const [xx] = coverageByCountry(list, guides, ['XX']);
    expect(xx).toMatchObject({ grade: 0, online: 0, pct: 0, sites: [] });
  });
});
