import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bomParaOuvir, ConsumoSessao, conexaoFraca, escolherNivel, formatarMB, mbPorHora, pickVarianteAudio, textoConsumo, type Nivel,
} from '../../src/lib/modo.ts';
import { fimDoTimer, formatarRestante, getTimerPadrao, OPCOES_TIMER, passoTimer, RAMPA_MS, rotuloTimer, setTimerPadrao, volumeDoTimer } from '../../src/lib/timer.ts';

const v = (bitrate: number): Nivel => ({ bitrate, audioOnly: false });
const a = (bitrate: number): Nivel => ({ bitrate, audioOnly: true });

describe('escolherNivel', () => {
  const multi = [v(1_200_000), a(64_000), v(400_000), v(150_000)];
  it('Normal: automático (-1)', () => {
    expect(escolherNivel(multi, 'normal')).toEqual({ index: -1, audioOnly: false, semVarianteAudio: false });
  });
  it('Econômico: o vídeo de menor bitrate (nunca a variante só de áudio, que deixaria a tela preta)', () => {
    expect(escolherNivel([v(1_200_000), v(400_000), v(150_000)], 'economico')).toMatchObject({ index: 2, audioOnly: false });
    expect(escolherNivel(multi, 'economico')).toMatchObject({ index: 3, audioOnly: false });
    expect(escolherNivel([a(64_000)], 'economico')).toMatchObject({ index: 0, audioOnly: true }); // única opção
  });
  it('Rádio com variante só de áudio: usa a de menor bitrate', () => {
    expect(escolherNivel([v(800_000), a(96_000), a(48_000)], 'radio')).toEqual({ index: 2, audioOnly: true, semVarianteAudio: false });
  });
  it('Rádio sem variante só de áudio: menor nível de vídeo e avisa', () => {
    expect(escolherNivel([v(1_200_000), v(400_000), v(150_000)], 'radio')).toEqual({ index: 2, audioOnly: false, semVarianteAudio: true });
  });
  it('lista com um nível só', () => {
    expect(escolherNivel([v(500_000)], 'economico')).toMatchObject({ index: 0 });
    expect(escolherNivel([v(500_000)], 'radio')).toEqual({ index: 0, audioOnly: false, semVarianteAudio: true });
    expect(escolherNivel([a(64_000)], 'radio')).toEqual({ index: 0, audioOnly: true, semVarianteAudio: false });
  });
  it('lista vazia: automático', () => {
    expect(escolherNivel([], 'radio').index).toBe(-1);
  });
  it('empate de bitrate fica com o primeiro', () => {
    expect(escolherNivel([v(300_000), v(300_000)], 'economico').index).toBe(0);
  });
});

describe('pickVarianteAudio (o hls.js remove essas variantes de hls.levels)', () => {
  const vid = (b: number, url: string) => ({ bitrate: b, audioCodec: 'mp4a.40.2', videoCodec: 'avc1.42c014', width: 320, height: 180, url });
  const aud = (b: number, url: string) => ({ bitrate: b, audioCodec: 'mp4a.40.2', url });
  it('pega a de menor bitrate entre as só de áudio', () => {
    expect(pickVarianteAudio([vid(510_000, 'v0'), aud(96_000, 'a1'), vid(235_000, 'v1'), aud(52_800, 'a2')])).toEqual({ url: 'a2', bitrate: 52_800 });
  });
  it('sem variante só de áudio: null (o Rádio usa o menor vídeo)', () => {
    expect(pickVarianteAudio([vid(510_000, 'v0'), vid(235_000, 'v1')])).toBeNull();
    expect(pickVarianteAudio([])).toBeNull();
  });
  it('não confunde: sem codec de áudio, com resolução ou sem endereço não é variante de áudio', () => {
    expect(pickVarianteAudio([{ bitrate: 50_000, url: 'x' }, { bitrate: 50_000, audioCodec: 'mp4a.40.2', width: 10, height: 10, url: 'y' }, { bitrate: 50_000, audioCodec: 'mp4a.40.2', url: '' }])).toBeNull();
  });
});

describe('MB/h e consumo', () => {
  it('mbPorHora = bitrate × 3600 / 8', () => {
    expect(mbPorHora(1_000_000)).toBeCloseTo(450, 5);
    expect(mbPorHora(64_000)).toBeCloseTo(28.8, 5);
    expect(mbPorHora(0)).toBe(0);
  });
  it('formatarMB em pt-BR', () => {
    expect(formatarMB(28.8)).toBe('28,8');
    expect(formatarMB(450)).toBe('450');
    expect(formatarMB(1234.4)).toBe('1.234');
    expect(formatarMB(0)).toBe('0');
    expect(formatarMB(-1)).toBe('0');
  });
  it('soma os bytes reais dos trechos e ignora lixo', () => {
    const c = new ConsumoSessao();
    [250_000, 400_000, 350_000].forEach((n) => c.add(n));
    c.add(NaN); c.add(-5); c.add(0);
    expect(c.totalBytes).toBe(1_000_000);
    expect(c.totalMB).toBe(1);
  });
  it('textoConsumo: estimativa e sessão; aviso do Rádio sem áudio; nativo não inventa número', () => {
    expect(textoConsumo('normal', null, 0).linha).toContain('medindo');
    expect(textoConsumo('economico', { nativo: false, bitrate: 400_000, semVarianteAudio: false, audioOnly: false }, 12.34).linha).toBe('≈ 180 MB/h · 12,3 MB nesta sessão');
    const r = textoConsumo('radio', { nativo: false, bitrate: 150_000, semVarianteAudio: true, audioOnly: false }, 0);
    expect(r.aviso).toBe('Este canal não tem versão só de áudio; o Rádio usa a menor qualidade de vídeo (≈ 67,5 MB/h).');
    const n = textoConsumo('radio', { nativo: true, semVarianteAudio: false, audioOnly: false }, 0);
    expect(n.linha).toBe('Consumo não medido neste aparelho');
    expect(n.aviso).toBe('Economia não garantida neste aparelho: o navegador escolhe a qualidade sozinho.');
    expect(n.linha).not.toMatch(/MB\/h/);
    expect(textoConsumo('normal', { nativo: true, semVarianteAudio: false, audioOnly: false }, 0).aviso).toBeUndefined();
  });
  it('lista de um nível só: diz que o modo não reduz o consumo (e não fica em "medindo")', () => {
    const um = { nativo: false, semVarianteAudio: true, audioOnly: false, niveis: 1 };
    expect(textoConsumo('economico', um, 3).aviso).toBe('Este canal tem uma única qualidade: o modo Econômico não reduz o consumo.');
    expect(textoConsumo('radio', um, 3).aviso).toBe('Este canal tem uma única qualidade: o modo Rádio não reduz o consumo.');
    expect(textoConsumo('radio', um, 3).linha).toBe('Consumo por hora: não informado por este canal · 3,0 MB nesta sessão');
    expect(textoConsumo('normal', um, 0).aviso).toBeUndefined();
  });
});

describe('plano de dados fraco e "Bom para ouvir"', () => {
  it('saveData ou 2g/3g', () => {
    expect(conexaoFraca({ saveData: true })).toBe(true);
    for (const t of ['slow-2g', '2g', '3g']) expect(conexaoFraca({ effectiveType: t })).toBe(true);
    expect(conexaoFraca({ effectiveType: '4g' })).toBe(false);
    expect(conexaoFraca(undefined)).toBe(false);
  });
  it('categorias para ouvir', () => {
    for (const c of ['news', 'music', 'religious', 'talk', 'sports', 'education']) expect(bomParaOuvir(['x', c])).toBe(true);
    expect(bomParaOuvir(['kids', 'movies'])).toBe(false);
    expect(bomParaOuvir([])).toBe(false);
  });
});

describe('timer de desligar', () => {
  const t0 = Date.parse('2026-11-09T22:00:00Z');
  it('minutos e fim do programa', () => {
    expect(fimDoTimer(t0, 15)).toBe(t0 + 15 * 60_000);
    expect(fimDoTimer(t0, 90)).toBe(t0 + 90 * 60_000);
    expect(fimDoTimer(t0, 'fim', t0 / 1000 + 1200)).toBe(t0 + 1_200_000);
  });
  it('"fim do programa" sem guia (ou programa já acabado) não existe', () => {
    expect(fimDoTimer(t0, 'fim')).toBeNull();
    expect(fimDoTimer(t0, 'fim', null)).toBeNull();
    expect(fimDoTimer(t0, 'fim', t0 / 1000 - 5)).toBeNull();
  });
  it('volume: 1 até faltarem 10 s, depois cai em linha reta até 0', () => {
    expect(volumeDoTimer(60_000)).toBe(1);
    expect(volumeDoTimer(RAMPA_MS)).toBe(1);
    expect(volumeDoTimer(7_500)).toBeCloseTo(0.75);
    expect(volumeDoTimer(5_000)).toBeCloseTo(0.5);
    expect(volumeDoTimer(1_000)).toBeCloseTo(0.1);
    expect(volumeDoTimer(0)).toBe(0);
    expect(volumeDoTimer(-50)).toBe(0);
  });
  it('relógio simulado: o passo mostra restante, volume e término', () => {
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    const fim = fimDoTimer(Date.now(), 15)!;
    expect(passoTimer(fim, Date.now())).toEqual({ restanteMs: 900_000, volume: 1, terminou: false });
    vi.setSystemTime(t0 + 900_000 - 9_000);
    expect(passoTimer(fim, Date.now())).toMatchObject({ restanteMs: 9_000, terminou: false });
    expect(passoTimer(fim, Date.now()).volume).toBeCloseTo(0.9);
    vi.setSystemTime(t0 + 900_000 - 2_000);
    expect(passoTimer(fim, Date.now()).volume).toBeCloseTo(0.2);
    vi.setSystemTime(t0 + 900_000);
    expect(passoTimer(fim, Date.now())).toEqual({ restanteMs: 0, volume: 0, terminou: true });
    vi.setSystemTime(t0 + 999_999_999);
    expect(passoTimer(fim, Date.now()).terminou).toBe(true);
  });
  it('formato do tempo restante e rótulos', () => {
    expect(formatarRestante(754_000)).toBe('12:34');
    expect(formatarRestante(3_723_000)).toBe('1:02:03');
    expect(formatarRestante(0)).toBe('0:00');
    expect(formatarRestante(500)).toBe('0:01');
    expect(OPCOES_TIMER.map(rotuloTimer)).toEqual(['15 min', '30 min', '60 min', '90 min', 'Fim do programa']);
  });
});

describe('lembrar a última escolha do timer', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, x: string) => void mem.set(k, x) } });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('grava e lê em tvlivre:timer-padrao; lixo vira null', () => {
    expect(getTimerPadrao()).toBeNull();
    setTimerPadrao(30);
    expect(mem.get('tvlivre:timer-padrao')).toBe('30');
    expect(getTimerPadrao()).toBe(30);
    setTimerPadrao('fim');
    expect(getTimerPadrao()).toBe('fim');
    mem.set('tvlivre:timer-padrao', '7');
    expect(getTimerPadrao()).toBeNull();
  });
});
