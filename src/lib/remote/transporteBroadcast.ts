import type { EstadoConexao, Transporte } from './transporte.ts';

type Msg = { k: 'pub'; topico: string; payload: string } | { k: 'sub'; topico: string };

/**
 * BroadcastChannel: duas abas do MESMO aparelho conversam sem rede nenhuma (testes e uso local). Faz o papel de um broker
 * pequeno, inclusive a mensagem retida (quem publicou a guarda e a reenvia quando alguém assina o tópico).
 */
export class TransporteBroadcast implements Transporte {
  private bc: BroadcastChannel | null = null;
  private topicos = new Set<string>();
  private retidos = new Map<string, string>();
  private ouvintes = new Set<(t: string, p: string) => void>();
  private estados = new Set<(e: EstadoConexao, m?: string) => void>();

  constructor(private readonly nome = 'tvlivre-remote') {}

  private muda(e: EstadoConexao, m?: string): void {
    this.estados.forEach((f) => f(e, m));
  }
  async conectar(topicos: string[]): Promise<void> {
    this.muda('conectando');
    if (typeof BroadcastChannel === 'undefined') {
      this.muda('erro', 'Este navegador não tem BroadcastChannel');
      throw new Error('Este navegador não tem BroadcastChannel');
    }
    const bc = new BroadcastChannel(this.nome);
    this.bc = bc;
    bc.onmessage = (ev: MessageEvent<Msg>) => {
      const m = ev.data;
      if (m.k === 'pub') {
        if (this.topicos.has(m.topico)) this.ouvintes.forEach((f) => f(m.topico, m.payload));
      } else if (m.k === 'sub') {
        const r = this.retidos.get(m.topico);
        if (r) bc.postMessage({ k: 'pub', topico: m.topico, payload: r } satisfies Msg);
      }
    };
    this.muda('conectado');
    topicos.forEach((t) => this.assinar(t));
  }
  assinar(topico: string): void {
    this.topicos.add(topico);
    this.bc?.postMessage({ k: 'sub', topico } satisfies Msg);
  }
  desassinar(topico: string): void {
    this.topicos.delete(topico);
  }
  enviar(topico: string, payload: string, retido = false): void {
    if (retido) {
      if (payload) this.retidos.set(topico, payload);
      else this.retidos.delete(topico);
    }
    this.bc?.postMessage({ k: 'pub', topico, payload } satisfies Msg);
  }
  aoReceber(cb: (t: string, p: string) => void): () => void {
    this.ouvintes.add(cb);
    return () => void this.ouvintes.delete(cb);
  }
  aoMudarEstado(cb: (e: EstadoConexao, m?: string) => void): () => void {
    this.estados.add(cb);
    return () => void this.estados.delete(cb);
  }
  reconectar(): void {
    this.muda('reconectando');
    this.topicos.forEach((t) => this.bc?.postMessage({ k: 'sub', topico: t } satisfies Msg));
    this.muda('conectado');
  }
  fechar(): void {
    this.bc?.close();
    this.bc = null;
    this.muda('desconectado');
  }
}
