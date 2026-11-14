import { describe, expect, it } from 'vitest';
import { countryGeo, NO_REGION_LABEL, regionLabel } from '../../shared/regions.ts';

describe('regiões e bandeiras da fonte', () => {
  const geo = countryGeo({
    countries: [
      { code: 'BR', flag: '🇧🇷' },
      { code: 'RU', flag: '🇷🇺' },
      { code: 'GB', flag: '🇬🇧' },
      { code: 'XX' },
    ],
    regions: [
      { code: 'ASIA', countries: ['RU'] },
      { code: 'EUR', countries: ['RU'] },
      { code: 'SOUTHAM', countries: ['BR'] },
      { code: 'LATAM', countries: ['BR'] }, // fora da lista que mostramos
    ],
  });

  it('usa a bandeira da fonte e não inventa quando ela falta', () => {
    expect(geo.get('BR')?.flag).toBe('🇧🇷');
    expect(geo.get('XX')).toBeUndefined();
  });

  it('país pode estar em mais de uma região, na ordem fixa da lista', () => {
    expect(geo.get('RU')?.regions).toEqual(['EUR', 'ASIA']);
    expect(geo.get('BR')?.regions).toEqual(['SOUTHAM']);
  });

  it('país sem região na fonte fica sem região', () => {
    expect(geo.get('GB')?.regions).toEqual([]);
    expect(regionLabel('SEM')).toBe(NO_REGION_LABEL);
    expect(regionLabel('EUR')).toBe('Europa');
  });
});
