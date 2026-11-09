import { DurableObject } from 'cloudflare:workers';
import { CONFIG } from './config.ts';
import {
  aplicarAcesso, atualizarPico, contagemDo, ContadorPorIp, gastarFicha, LimitadorJanela, novosContadores, resumir, validarMensagem, virarDia,
  type Anexo, type Contadores,
} from './nucleo.ts';

export interface Env {
  SALA: DurableObjectNamespace<Sala>;
  ORIGENS: string;
  AMBIENTE: string;
  ABACUS_URL: string;
}

/** O que cada cliente recebe: totais, o top 10 público e a contagem do canal dele (nunca a lista de todos os canais). */
export interface MsgResumo {
  t: 'resumo';
  v: 1;
  online: number;
  assistindo: number;
  top: { c: string; p: string; n: number }[];
  /** quantos assistem o MEU canal (só se ≥ 3) */
  meu: number | null;
  acessos: number;
  hoje: number;
  pico: number;
  picoEm: string;
}

const novoAnexo = (agora: number): Anexo => ({ e: 'n', x: agora, u: agora, f: CONFIG.MSG_RAJADA, r: agora });

/**
 * A "sala" única do TV Livre. Só conta conexões WebSocket (API de hibernação: conexões ociosas não geram tempo de
 * execução, e o "ping" é respondido pelo runtime sem acordar o objeto). Tudo que é por conexão fica em
 * `serializeAttachment`; só os contadores e recordes vão ao armazenamento (uma linha por gravação).
 */
export class Sala extends DurableObject<Env> {
  private contadores: Contadores = novosContadores(Date.now());
  private porIp = new ContadorPorIp();
  private ipDe = new WeakMap<WebSocket, string>();
  private acessosPorIp = new LimitadorJanela(CONFIG.MAX_ACESSOS_POR_IP_HORA, 3_600_000);
  /** última mensagem enviada a cada conexão (só para não repetir o que não mudou) */
  private ultimaEnviada = new WeakMap<WebSocket, string>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    void ctx.blockConcurrencyWhile(async () => {
      const salvo = await ctx.storage.get<Contadores>('contadores');
      if (salvo) this.contadores = salvo;
    });
  }

  // ---------------- HTTP (vindo do Worker) ----------------
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') return this.abrirWebSocket(request);
    if (url.pathname === '/acesso' && request.method === 'POST') return this.registrarAcesso(request);
    if (url.pathname === '/resumo') return Response.json(this.resumoPublico());
    return new Response('não encontrado', { status: 404 });
  }

  private abrirWebSocket(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('esperava WebSocket', { status: 426 });
    const ip = request.headers.get('CF-Connecting-IP') ?? 'desconhecido'; // só em memória, para o limite; nunca gravado
    if (!this.porIp.entrar(ip)) return new Response('conexões demais deste endereço', { status: 429 });
    const [cliente, servidor] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(servidor);
    servidor.serializeAttachment(novoAnexo(Date.now()));
    this.ipDe.set(servidor, ip);
    void this.agendar();
    return new Response(null, { status: 101, webSocket: cliente });
  }

  private async registrarAcesso(request: Request): Promise<Response> {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'desconhecido';
    if (!this.acessosPorIp.permitir(ip, Date.now())) return Response.json(this.totais(), { status: 429 });
    await this.migrarDoAbacus();
    aplicarAcesso(this.contadores, Date.now());
    await this.ctx.storage.put('contadores', this.contadores); // 1 linha escrita por acesso
    void this.agendar();
    return Response.json(this.totais());
  }

  /** Na primeira vez, o total parte do valor atual do Abacus (para o número não cair). Só uma vez, e só se a leitura der certo. */
  private async migrarDoAbacus(): Promise<void> {
    if (this.contadores.migrado) return;
    try {
      const r = await fetch(this.env.ABACUS_URL, { signal: AbortSignal.timeout(3000), headers: { accept: 'application/json' } });
      const v = (await r.json<{ value?: unknown }>()).value;
      if (r.ok && typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) {
        this.contadores.total += v;
        this.contadores.migrado = true;
      }
    } catch {
      /* sem Abacus agora: tenta de novo no próximo acesso */
    }
  }

  // ---------------- WebSocket (hibernação) ----------------
  webSocketMessage(ws: WebSocket, mensagem: string | ArrayBuffer): void {
    const agora = Date.now();
    const a = ws.deserializeAttachment() as Anexo | null;
    if (!a || typeof mensagem !== 'string') return;
    const ficha = gastarFicha(a, agora);
    if (!ficha) return; // rápido demais: ignora
    const msg = validarMensagem(mensagem);
    const proximo: Anexo = { ...a, ...ficha, u: agora };
    if (msg) {
      if (msg.s === 'assistindo') {
        proximo.e = 'a';
        proximo.c = msg.c!;
        if (msg.p) proximo.p = msg.p;
        else delete proximo.p;
      } else {
        proximo.e = 'n';
        delete proximo.c;
        delete proximo.p;
      }
    }
    ws.serializeAttachment(proximo);
    if (msg) void this.agendar();
  }

  webSocketClose(ws: WebSocket): void {
    this.soltar(ws);
    void this.agendar();
  }
  webSocketError(ws: WebSocket): void {
    this.soltar(ws);
    void this.agendar();
  }
  private soltar(ws: WebSocket): void {
    const ip = this.ipDe.get(ws);
    if (ip) this.porIp.sair(ip);
  }

  // ---------------- difusão e varredura (alarme) ----------------
  /** Garante um alarme: a próxima difusão (agrupando mudanças) ou, no mínimo, a varredura. Só grava se não houver um mais cedo. */
  private async agendar(): Promise<void> {
    const agora = Date.now();
    const atual = await this.ctx.storage.getAlarm();
    const alvo = agora + CONFIG.DIFUSAO_MS;
    if (atual === null || atual > alvo) await this.ctx.storage.setAlarm(alvo);
  }

  async alarm(): Promise<void> {
    const agora = Date.now();
    this.varrerMortas(agora);
    const conexoes = this.ctx.getWebSockets();
    if (virarDia(this.contadores, agora)) await this.ctx.storage.put('contadores', this.contadores);
    const anexos = conexoes.map((w) => w.deserializeAttachment() as Anexo | null).filter((a): a is Anexo => !!a);
    const r = resumir(anexos);
    if (atualizarPico(this.contadores, r.assistindo, agora)) await this.ctx.storage.put('contadores', this.contadores);
    for (const ws of conexoes) {
      const a = ws.deserializeAttachment() as Anexo | null;
      if (!a) continue;
      const m: MsgResumo = {
        t: 'resumo', v: 1, online: r.online, assistindo: r.assistindo, top: r.top, meu: contagemDo(r, a),
        acessos: this.contadores.total, hoje: this.contadores.hoje, pico: this.contadores.pico, picoEm: this.contadores.picoEm,
      };
      const texto = JSON.stringify(m);
      if (this.ultimaEnviada.get(ws) === texto) continue; // nada mudou para esta conexão
      this.ultimaEnviada.set(ws, texto);
      try {
        ws.send(texto);
      } catch {
        /* conexão já caiu: a varredura cuida */
      }
    }
    // enquanto houver conexões, volta em 60 s só para varrer as mortas
    if (conexoes.length > 0) await this.ctx.storage.setAlarm(agora + CONFIG.VARREDURA_MS);
  }

  /** Fecha quem não dá sinal (nem mensagem nem ping automático) há mais de 150 s. */
  private varrerMortas(agora: number): void {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Anexo | null;
      if (!a) continue;
      const ping = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
      const ultimo = Math.max(a.u, a.x, ping);
      if (agora - ultimo > CONFIG.MORTA_MS) {
        try {
          ws.close(1001, 'sem sinal');
        } catch {
          /* já fechada */
        }
        this.soltar(ws);
      }
    }
  }

  // ---------------- leituras ----------------
  private totais() {
    return { acessos: this.contadores.total, hoje: this.contadores.hoje };
  }
  /** Resumo para quem não abre WebSocket (página Sobre). Sem contagem por canal além do top público. */
  resumoPublico() {
    const anexos = this.ctx.getWebSockets().map((w) => w.deserializeAttachment() as Anexo | null).filter((a): a is Anexo => !!a);
    const r = resumir(anexos);
    return {
      v: 1, online: r.online, assistindo: r.assistindo, top: r.top,
      acessos: this.contadores.total, hoje: this.contadores.hoje, pico: this.contadores.pico, picoEm: this.contadores.picoEm,
    };
  }
}
