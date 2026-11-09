import { describe, expect, it } from 'vitest';
import { pickNext, type Box } from '../../src/lib/spatial.ts';
import { detectTv, remoteKey, resolveTv, mostrarBotaoSair } from '../../src/lib/tvmode.ts';

const box = (left: number, top: number, w = 100, h = 60): Box => ({ left, top, right: left + w, bottom: top + h });

describe('pickNext (setas do controle remoto)', () => {
  // grade 3×2: a b c / d e f
  const cells = { a: box(0, 0), b: box(120, 0), c: box(240, 0), d: box(0, 80), e: box(120, 80), f: box(240, 80) };
  const items = Object.entries(cells).map(([ref, b]) => ({ ref, box: b }));
  const from = (k: keyof typeof cells) => items.filter((i) => i.ref !== k);

  it('anda para o vizinho imediato em cada direção', () => {
    expect(pickNext(cells.a, from('a'), 'right')).toBe('b');
    expect(pickNext(cells.b, from('b'), 'right')).toBe('c');
    expect(pickNext(cells.e, from('e'), 'left')).toBe('d');
    expect(pickNext(cells.b, from('b'), 'down')).toBe('e');
    expect(pickNext(cells.f, from('f'), 'up')).toBe('c');
  });

  it('não sai da borda nem volta para si mesmo', () => {
    expect(pickNext(cells.c, from('c'), 'right')).toBeNull();
    expect(pickNext(cells.a, from('a'), 'up')).toBeNull();
    expect(pickNext(cells.d, from('d'), 'down')).toBeNull();
  });

  it('prefere o alinhado ao diagonal mais perto', () => {
    const list = [
      { ref: 'diag', box: box(130, 70, 100, 60) }, // quase colado, mas deslocado
      { ref: 'reto', box: box(0, 140, 100, 60) }, // mais longe, alinhado
    ];
    expect(pickNext(cells.a, list, 'down')).toBe('reto');
  });

  it('lista de linhas empilhadas: ▼ vai para a linha de baixo, ◀▶ alternam o botão da linha', () => {
    const row1 = { main: box(0, 0, 500, 84), fav: box(500, 0, 88, 84) };
    const row2 = { main: box(0, 84, 500, 84), fav: box(500, 84, 88, 84) };
    const all = [
      { ref: 'r1fav', box: row1.fav }, { ref: 'r2main', box: row2.main }, { ref: 'r2fav', box: row2.fav },
    ];
    expect(pickNext(row1.main, all, 'right')).toBe('r1fav');
    expect(pickNext(row1.main, all, 'down')).toBe('r2main');
    expect(pickNext(row1.fav, [{ ref: 'r2main', box: row2.main }, { ref: 'r2fav', box: row2.fav }], 'down')).toBe('r2fav');
  });
});

describe('Modo TV', () => {
  it('detecta navegadores de TV pelo user agent', () => {
    const tvs = [
      'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 94.0.4606.31/7.0 TV Safari/537.36',
      'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager',
      'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K UR3 Build/STT1.220928.001) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233) AppleWebKit/537.36 Chrome/98 Safari/537.36',
      'Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 Chrome/84 Safari/537.36 CrKey/1.56.500000',
      'Mozilla/5.0 (Linux; Android 11; Chromecast Android TV Build/RTT3) Chrome/110 Safari/537.36',
    ];
    for (const ua of tvs) expect(detectTv(ua), ua).toBe(true);
  });

  it('não confunde celular, computador nem a palavra "TV" no site', () => {
    const others = [
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120',
    ];
    for (const ua of others) expect(detectTv(ua), ua).toBe(false);
  });

  it('preferência manda mais que a detecção', () => {
    expect(resolveTv('auto', true)).toBe(true);
    expect(resolveTv('auto', false)).toBe(false);
    expect(resolveTv('ligado', false)).toBe(true);
    expect(resolveTv('desligado', true)).toBe(false);
  });

  it('traduz as teclas do controle remoto (nomes padrão e códigos de Tizen/webOS)', () => {
    expect(remoteKey({ key: 'ArrowUp', keyCode: 38 })).toBe('up');
    expect(remoteKey({ key: 'Enter', keyCode: 13 })).toBe('ok');
    expect(remoteKey({ key: 'Escape', keyCode: 27 })).toBe('back');
    expect(remoteKey({ key: 'Unidentified', keyCode: 461 })).toBe('back'); // webOS
    expect(remoteKey({ key: 'Unidentified', keyCode: 10009 })).toBe('back'); // Tizen
    expect(remoteKey({ key: 'ChannelUp', keyCode: 0 })).toBe('chup');
    expect(remoteKey({ key: 'Unidentified', keyCode: 428 })).toBe('chdown');
    expect(remoteKey({ key: 'Unidentified', keyCode: 403 })).toBe('red');
    expect(remoteKey({ key: 'ColorF1Green', keyCode: 0 })).toBe('green');
    expect(remoteKey({ key: 'a', keyCode: 65 })).toBeNull();
  });
});

describe('mostrarBotaoSair (saída sempre visível do Modo TV)', () => {
  it('modo ligado à mão (navegador): visível', () => {
    expect(mostrarBotaoSair('ligado', false)).toBe(true);
    expect(mostrarBotaoSair('ligado', true)).toBe(true);
  });
  it('desligado: não há o que sair', () => {
    expect(mostrarBotaoSair('desligado', false)).toBe(false);
    expect(mostrarBotaoSair('desligado', true)).toBe(false);
  });
  it('automático: só liga em TV de verdade e aí o botão fica escondido (o controle remoto não clica)', () => {
    expect(mostrarBotaoSair('auto', true)).toBe(false);
    expect(mostrarBotaoSair('auto', false)).toBe(false);
  });
});
