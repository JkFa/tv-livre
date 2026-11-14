import { describe, expect, it } from 'vitest';
import { applySlider, parseVolume, serializeVolume, sliderValue, toggleMuted, volumeIcon } from '../../src/lib/volume.ts';

describe('volume do player', () => {
  it('lê o valor salvo (0 a 100) e ignora lixo', () => {
    expect(parseVolume('35')).toBe(0.35);
    expect(parseVolume('0')).toBe(0);
    expect(parseVolume('100')).toBe(1);
    for (const lixo of [null, '', 'abc', '-5', '101', '999', '1.5', '1e2']) expect(parseVolume(lixo)).toBe(1);
  });

  it('salva como inteiro de 0 a 100', () => {
    expect(serializeVolume(0.354)).toBe('35');
    expect(serializeVolume(7)).toBe('100');
    expect(serializeVolume(-1)).toBe('0');
    expect(parseVolume(serializeVolume(0.6))).toBe(0.6);
  });

  it('o controle deslizante mostra 0 no mudo e o volume fora dele', () => {
    expect(sliderValue({ volume: 0.8, muted: false })).toBe(80);
    expect(sliderValue({ volume: 0.8, muted: true })).toBe(0);
  });

  it('arrastar até 0 silencia sem perder o volume anterior; arrastar acima de 0 tira do mudo', () => {
    const mudo = applySlider({ volume: 0.7, muted: false }, 0);
    expect(mudo).toEqual({ volume: 0.7, muted: true });
    expect(toggleMuted(mudo)).toEqual({ volume: 0.7, muted: false });
    expect(applySlider({ volume: 0.7, muted: true }, 25)).toEqual({ volume: 0.25, muted: false });
    expect(applySlider({ volume: 0.7, muted: false }, 250).volume).toBe(1);
    expect(applySlider({ volume: 0.7, muted: false }, Number.NaN).muted).toBe(true);
  });

  it('o ícone alterna o mudo e restaura o volume anterior', () => {
    const a = toggleMuted({ volume: 0.4, muted: false });
    expect(a).toEqual({ volume: 0.4, muted: true });
    expect(toggleMuted(a)).toEqual({ volume: 0.4, muted: false });
  });

  it('tirar do mudo com volume zerado (vindo do controle pelo celular) devolve som', () => {
    expect(toggleMuted({ volume: 0, muted: true })).toEqual({ volume: 0.5, muted: false });
  });

  it('ícone: sem som, baixo ou alto', () => {
    expect(volumeIcon({ volume: 1, muted: true })).toBe('off');
    expect(volumeIcon({ volume: 0, muted: false })).toBe('off');
    expect(volumeIcon({ volume: 0.3, muted: false })).toBe('low');
    expect(volumeIcon({ volume: 0.5, muted: false })).toBe('high');
  });
});
