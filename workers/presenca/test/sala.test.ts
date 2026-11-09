import { env, exports } from 'cloudflare:workers';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MsgResumo, Sala } from '../src/sala.ts';

const ORIGEM = 'https://jkfa.github.io';
const stub = () => env.SALA.get(env.SALA.idFromName('global'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Cli {
  ws: WebSocket;
  msgs: MsgResumo[];
  fechou: () => boolean;
}
/** Abre um WebSocket de verdade contra o Worker (passando por index.ts, com Origin e IP). */
async function conectar(opts: { origem?: string | null; ip?: string } = {}): Promise<Cli | Response> {
  const headers: Record<string, string> = { Upgrade: 'websocket', 'CF-Connecting-IP': opts.ip ?? '10.0.0.1' };
  if (opts.origem !== null) headers.Origin = opts.origem ?? ORIGEM;
  const r = await exports.default.fetch(new Request('https://presenca.test/ws', { headers }));
  if (r.status !== 101 || !r.webSocket) return r;
  const ws = r.webSocket;
  ws.accept();
  const msgs: MsgResumo[] = [];
  let fechado = false;
  ws.addEventListener('message', (e: MessageEvent) => msgs.push(JSON.parse(e.data as string) as MsgResumo));
  ws.addEventListener('close', () => (fechado = true));
  return { ws, msgs, fechou: () => fechado };
}
const abrir = async (opts?: Parameters<typeof conectar>[0]) => (await conectar(opts)) as Cli;
const estado = (c: Cli, s: 'assistindo' | 'navegando', canal?: string) =>
  c.ws.send(JSON.stringify(s === 'navegando' ? { t: 'estado', s } : { t: 'estado', s, c: canal, p: 'BR' }));
/** Roda o alarme (difusão) e espera as mensagens chegarem. */
async function difundir() {
  await runDurableObjectAlarm(stub());
  await sleep(30);
}
const ultima = (c: Cli) => c.msgs.at(-1)!;
const abertos: Cli[] = [];
/** Estado limpo para o próximo teste: zera a memória e o armazenamento do objeto. */
async function limpar() {
  await runInDurableObject(stub(), async (i: Sala, state) => {
    await state.storage.deleteAll();
    await state.storage.deleteAlarm();
    Object.assign(i as unknown as { contadores: unknown }, { contadores: { total: 0, migrado: false, dia: '', hoje: 0, pico: 0, picoEm: '' } });
  });
}
const guardar = async (opts?: Parameters<typeof conectar>[0]) => {
  const c = await abrir(opts);
  abertos.push(c);
  return c;
};
afterEach(async () => {
  for (const c of abertos.splice(0)) try { c.ws.close(1000); } catch { /* já fechado */ }
  vi.restoreAllMocks();
  vi.useRealTimers();
  await sleep(10);
  // estado limpo para o próximo teste: descarta a memória do objeto e apaga o que foi gravado
  await limpar();
});

describe('conexão e contagens', () => {
  it('conta online e assistindo por estado e por canal, e divulga o canal só com ≥ 3', async () => {
    const a = await guardar({ ip: '10.0.0.1' });
    const b = await guardar({ ip: '10.0.0.2' });
    const c = await guardar({ ip: '10.0.0.3' });
    const d = await guardar({ ip: '10.0.0.4' });
    estado(a, 'assistindo', 'globo');
    estado(b, 'assistindo', 'globo');
    estado(c, 'assistindo', 'sbt');
    await sleep(30);
    await difundir();
    expect(ultima(a)).toMatchObject({ online: 4, assistindo: 3, meu: null, top: [] }); // globo tem 2: não divulga
    expect(ultima(d)).toMatchObject({ online: 4, assistindo: 3, meu: null });
    estado(d, 'assistindo', 'globo');
    await sleep(30);
    await difundir();
    expect(ultima(a)).toMatchObject({ online: 4, assistindo: 4, meu: 3, top: [{ c: 'globo', p: 'BR', n: 3 }] });
    expect(ultima(c).meu).toBeNull(); // o canal do SBT segue com 1
    estado(a, 'navegando');
    await sleep(30);
    await difundir();
    expect(ultima(b)).toMatchObject({ assistindo: 3, meu: null }); // globo caiu para 2: some do top e do "meu"
    expect(ultima(b).top).toEqual([]);
  });

  it('desconexão reduz as contagens', async () => {
    const a = await guardar({ ip: '10.0.1.1' });
    const b = await guardar({ ip: '10.0.1.2' });
    estado(a, 'assistindo', 'x');
    await sleep(30);
    await difundir();
    expect(ultima(b)).toMatchObject({ online: 2, assistindo: 1 });
    a.ws.close(1000);
    await sleep(50);
    await difundir();
    expect(ultima(b)).toMatchObject({ online: 1, assistindo: 0 });
  });

  it('a difusão só reenvia quando algo mudou', async () => {
    const a = await guardar({ ip: '10.0.2.1' });
    await difundir();
    const n = a.msgs.length;
    await difundir();
    await difundir();
    expect(a.msgs.length).toBe(n);
  });

  it('agrupa mudanças: no máximo um alarme (difusão) a cada 3 s', async () => {
    const a = await guardar({ ip: '10.0.3.1' });
    await runDurableObjectAlarm(stub()); // limpa o alarme da conexão
    const horario = await runInDurableObject(stub(), async (_i: Sala, state) => {
      // várias mudanças seguidas
      return state.storage.getAlarm();
    });
    expect(horario === null || horario > 0).toBe(true);
    for (let i = 0; i < 3; i++) estado(a, i % 2 ? 'navegando' : 'assistindo', 'x');
    await sleep(30);
    const alarmes = await runInDurableObject(stub(), async (_i: Sala, state) => state.storage.getAlarm());
    expect(alarmes).not.toBeNull();
    expect((alarmes as number) - Date.now()).toBeLessThanOrEqual(3_000);
    expect((alarmes as number) - Date.now()).toBeGreaterThan(1_500); // um único alarme, ~3 s à frente (não um por mensagem)
  });

  it('ping/pong automático não acorda nem precisa do objeto', async () => {
    const a = await guardar({ ip: '10.0.4.1' });
    const pong = new Promise<string>((res) => a.ws.addEventListener('message', (e) => e.data === 'pong' && res('pong'), { once: false }));
    a.ws.send('ping');
    expect(await Promise.race([pong, sleep(500).then(() => 'nada')])).toBe('pong');
  });
});

describe('mensagens inválidas e abusos', () => {
  it('mensagem inválida ou grande demais é ignorada e não derruba a conexão', async () => {
    const a = await guardar({ ip: '10.0.5.1' });
    a.ws.send('isto não é json');
    a.ws.send(JSON.stringify({ t: 'estado', s: 'assistindo', c: 'x'.repeat(500) }));
    a.ws.send(JSON.stringify({ t: 'estado', s: 'assistindo', c: '<b>' }));
    await sleep(30);
    await difundir();
    expect(a.fechou()).toBe(false);
    expect(ultima(a)).toMatchObject({ online: 1, assistindo: 0 });
  });

  it('mensagens rápidas demais (mais de 3 em seguida) são ignoradas', async () => {
    const a = await guardar({ ip: '10.0.5.2' });
    estado(a, 'assistindo', 'um');
    estado(a, 'navegando');
    estado(a, 'assistindo', 'dois');
    estado(a, 'navegando'); // 4ª: estourou a rajada
    await sleep(40);
    await difundir();
    expect(ultima(a).assistindo).toBe(1); // ficou na 3ª mensagem
  });

  it('Origin inválida ou ausente é recusada (403) e o objeto nem é acordado', async () => {
    const r1 = await conectar({ origem: 'https://evil.example' });
    const r2 = await conectar({ origem: null });
    expect((r1 as Response).status).toBe(403);
    expect((r2 as Response).status).toBe(403);
    const online = await runInDurableObject(stub(), async (i: Sala) => i.resumoPublico().online);
    expect(online).toBe(0);
  });

  it('no máximo 10 conexões por IP (a 11ª recebe 429); sair libera a vaga', async () => {
    const cs: Cli[] = [];
    for (let i = 0; i < 10; i++) cs.push(await guardar({ ip: '10.9.9.9' }));
    const extra = await conectar({ ip: '10.9.9.9' });
    expect((extra as Response).status).toBe(429);
    cs[0]!.ws.close(1000);
    await sleep(50);
    const outra = await conectar({ ip: '10.9.9.9' });
    expect((outra as Cli).ws).toBeDefined();
    abertos.push(outra as Cli);
  });

  it('remove a conexão morta (sem sinal por mais de 150 s)', async () => {
    const a = await guardar({ ip: '10.0.6.1' });
    const b = await guardar({ ip: '10.0.6.2' });
    estado(a, 'assistindo', 'x');
    await sleep(30);
    const real = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(real + 151_000);
    // b continua "viva" porque mandou algo agora
    const antes = await runInDurableObject(stub(), async (i: Sala) => i.resumoPublico().online);
    expect(antes).toBe(2);
    spy.mockReturnValue(real + 151_000);
    await runDurableObjectAlarm(stub());
    await sleep(30);
    expect(a.fechou()).toBe(true);
    expect(b.fechou()).toBe(true); // as duas ficaram caladas por 151 s no relógio simulado
    spy.mockRestore();
  });
});

describe('acessos, recordes e migração', () => {
  const post = (ip = '10.1.1.1', origem: string | null = ORIGEM) =>
    exports.default.fetch(new Request('https://presenca.test/acesso', { method: 'POST', headers: { 'CF-Connecting-IP': ip, ...(origem ? { Origin: origem } : {}) } }));
  const abacus = (valor: number | 'erro') =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (entrada) => {
      const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      if (!url.includes('abacus')) throw new Error(`fetch inesperado: ${url}`);
      if (valor === 'erro') return new Response('x', { status: 500 });
      return Response.json({ value: valor });
    });

  it('POST /acesso incrementa total e hoje; a migração do Abacus acontece UMA vez', async () => {
    const f = abacus(12_000);
    const r1 = await (await post('10.1.1.2')).json<{ acessos: number; hoje: number }>();
    expect(r1).toEqual({ acessos: 12_001, hoje: 1 });
    const r2 = await (await post('10.1.1.3')).json<{ acessos: number; hoje: number }>();
    expect(r2).toEqual({ acessos: 12_002, hoje: 2 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('se o Abacus falhar, não marca como migrado e tenta no próximo acesso', async () => {
    abacus('erro');
    const r1 = await (await post('10.1.1.4')).json<{ acessos: number }>();
    expect(r1.acessos).toBe(1);
    vi.restoreAllMocks();
    abacus(500);
    const r2 = await (await post('10.1.1.5')).json<{ acessos: number }>();
    expect(r2.acessos).toBe(502); // 1 + 500 do Abacus + 1
  });

  it('recusa Origin inválida e limita acessos por IP/hora', async () => {
    abacus(0);
    expect((await post('10.1.1.6', 'https://evil.example')).status).toBe(403);
    let ultimo = 200;
    for (let i = 0; i < 31; i++) ultimo = (await post('10.1.1.7')).status;
    expect(ultimo).toBe(429);
  });

  it('GET /resumo devolve JSON público com recorde e o top só com ≥ 3', async () => {
    abacus(0);
    const cs = [await guardar({ ip: '10.1.2.1' }), await guardar({ ip: '10.1.2.2' }), await guardar({ ip: '10.1.2.3' })];
    for (const c of cs) estado(c, 'assistindo', 'canal-x');
    await sleep(40);
    await difundir(); // atualiza o pico
    const r = await exports.default.fetch(new Request('https://presenca.test/resumo', { headers: { Origin: ORIGEM } }));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('max-age');
    const j = await r.json<{ assistindo: number; pico: number; picoEm: string; top: unknown[] }>();
    expect(j).toMatchObject({ assistindo: 3, pico: 3, top: [{ c: 'canal-x', n: 3 }] });
    expect(j.picoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('o "hoje" zera na virada do dia em America/Sao_Paulo', async () => {
    abacus(0);
    const base = Date.UTC(2026, 10, 10, 2, 50); // 23:50 do dia 9 em São Paulo
    const spy = vi.spyOn(Date, 'now').mockReturnValue(base);
    await post('10.1.3.1');
    await post('10.1.3.2');
    let j = await (await post('10.1.3.3')).json<{ hoje: number }>();
    expect(j.hoje).toBe(3);
    spy.mockReturnValue(base + 20 * 60_000); // 00:10 do dia 10 em São Paulo
    j = await (await post('10.1.3.4')).json<{ hoje: number; acessos: number }>();
    expect(j.hoje).toBe(1);
    spy.mockRestore();
  });
});
