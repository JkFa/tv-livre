import { origemPermitida } from './nucleo.ts';
import type { Env } from './sala.ts';
export { Sala } from './sala.ts';

const SALA = 'global';

function cors(origin: string | null, base: HeadersInit = {}): Headers {
  const h = new Headers(base);
  if (origin) {
    h.set('access-control-allow-origin', origin);
    h.set('vary', 'Origin');
  }
  return h;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const sala = env.SALA.get(env.SALA.idFromName(SALA));

    if (request.method === 'OPTIONS') {
      if (!origemPermitida(origin, env.AMBIENTE, env.ORIGENS)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors(origin, { 'access-control-allow-methods': 'GET, POST', 'access-control-max-age': '86400' }) });
    }

    // A origem é conferida antes de acordar o objeto (assim tráfego de origem errada não custa requisição do Durable Object).
    if (url.pathname === '/ws') {
      if (!origemPermitida(origin, env.AMBIENTE, env.ORIGENS)) return new Response('origem não permitida', { status: 403 });
      return sala.fetch(request);
    }
    if (url.pathname === '/acesso' && request.method === 'POST') {
      if (!origemPermitida(origin, env.AMBIENTE, env.ORIGENS)) return new Response('origem não permitida', { status: 403 });
      const r = await sala.fetch(request);
      return new Response(r.body, { status: r.status, headers: cors(origin, { 'content-type': 'application/json', 'cache-control': 'no-store' }) });
    }
    if (url.pathname === '/resumo' && request.method === 'GET') {
      const liberada = origemPermitida(origin, env.AMBIENTE, env.ORIGENS) ? origin : null;
      // em dev (testes) não há cache: o número lido é sempre o de agora
      if (env.AMBIENTE === 'dev') {
        const dentro = await sala.fetch(request);
        return new Response(dentro.body, { status: dentro.status, headers: cors(liberada, { 'content-type': 'application/json', 'cache-control': 'public, max-age=10' }) });
      }
      // produção: cache curto de borda (10 s) — leituras repetidas não acordam o Durable Object
      const chave = new Request(`${url.origin}/resumo`);
      const cache = (caches as unknown as { default: Cache }).default;
      let r = await cache.match(chave);
      if (!r) {
        const dentro = await sala.fetch(request);
        r = new Response(dentro.body, { status: dentro.status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=10' } });
        if (r.ok) await cache.put(chave, r.clone());
      }
      return new Response(r.body, { status: r.status, headers: cors(liberada, r.headers) });
    }
    return new Response('TV Livre presença: só conta conexões.', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
