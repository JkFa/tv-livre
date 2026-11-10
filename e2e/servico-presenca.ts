import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Sobe o serviço de presença de verdade (`wrangler dev`, Miniflare local) para os testes E2E.
 * - AMBIENTE=dev: aceita a origem http://localhost/127.0.0.1 do `vite preview`.
 * - O Abacus é um servidor local de mentira: nenhum teste sai para a internet.
 * - Estado em pasta temporária: cada execução começa do zero.
 */
export const WRANGLER_OK = existsSync(join(process.cwd(), 'workers', 'presenca', 'node_modules', 'wrangler', 'bin', 'wrangler.js'));

export interface Servico {
  url: string;
  /** Resumo público (GET /resumo, com a origem de teste). */
  resumo: () => Promise<{ online: number; assistindo: number; top: { c: string; n: number }[]; acessos: number; hoje: number; pico: number }>;
  parar: () => Promise<void>;
}

async function esperar(url: string, ms: number): Promise<void> {
  const fim = Date.now() + ms;
  for (;;) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(1500) });
      return;
    } catch {
      if (Date.now() > fim) throw new Error(`o serviço de presença não subiu em ${ms / 1000}s (${url})`);
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

export async function iniciarServico(porta: number): Promise<Servico> {
  const abacus = createServer((_q, r) => {
    r.writeHead(200, { 'content-type': 'application/json' });
    r.end(JSON.stringify({ value: 1000 }));
  });
  await new Promise<void>((ok) => abacus.listen(porta + 1, '127.0.0.1', ok));
  const estado = mkdtempSync(join(tmpdir(), 'tvlivre-presenca-'));
  const cwd = join(process.cwd(), 'workers', 'presenca');
  const filho: ChildProcess = spawn(
    process.execPath,
    [join(cwd, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'dev', '--port', String(porta), '--ip', '127.0.0.1', '--var', 'AMBIENTE:dev', '--var', `ABACUS_URL:http://127.0.0.1:${porta + 1}/get`, '--persist-to', estado],
    { cwd, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1' }, stdio: 'ignore' },
  );
  const url = `http://127.0.0.1:${porta}`;
  await esperar(`${url}/`, 120_000);
  return {
    url,
    resumo: async () => (await fetch(`${url}/resumo`, { headers: { Origin: 'http://127.0.0.1:4173' } })).json() as ReturnType<Servico['resumo']>,
    parar: async () => {
      filho.kill('SIGTERM');
      await new Promise<void>((ok) => {
        const t = setTimeout(() => (filho.kill('SIGKILL'), ok()), 5000);
        filho.once('exit', () => (clearTimeout(t), ok()));
      });
      await new Promise<void>((ok) => abacus.close(() => ok()));
      rmSync(estado, { recursive: true, force: true });
    },
  };
}
