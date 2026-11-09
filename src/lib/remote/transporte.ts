/** Transporte de mensagens do controle remoto. Quem conversa por cima dele só vê strings já cifradas. */
export type EstadoConexao = 'desconectado' | 'conectando' | 'conectado' | 'reconectando' | 'erro';

export interface Transporte {
  /** Conecta e assina os tópicos. Resolve quando conectado; rejeita com o motivo (broker fora, rede bloqueada…). */
  conectar(topicos: string[]): Promise<void>;
  assinar(topico: string): void;
  desassinar(topico: string): void;
  /** `retido`: o broker guarda a última mensagem do tópico e a entrega a quem assinar depois. */
  enviar(topico: string, payload: string, retido?: boolean): void;
  aoReceber(cb: (topico: string, payload: string) => void): () => void;
  aoMudarEstado(cb: (e: EstadoConexao, motivo?: string) => void): () => void;
  /** Força uma nova conexão (o iPhone derruba o WebSocket ao ir para segundo plano). */
  reconectar(): void;
  fechar(): void;
}

// ---------------- barramento em memória (testes unitários) ----------------
export class BarramentoMemoria {
  readonly clientes = new Set<TransporteMemoria>();
  readonly retidos = new Map<string, string>();
  /** Todas as mensagens que passaram, para os testes olharem. */
  readonly log: { topico: string; payload: string }[] = [];
  criar(): TransporteMemoria {
    return new TransporteMemoria(this);
  }
}

export class TransporteMemoria implements Transporte {
  private topicos = new Set<string>();
  private ouvintes = new Set<(t: string, p: string) => void>();
  private estados = new Set<(e: EstadoConexao, m?: string) => void>();
  conectado = false;
  falharAoConectar: string | null = null;
  constructor(private readonly barramento: BarramentoMemoria) {}

  private muda(e: EstadoConexao, m?: string) {
    this.estados.forEach((f) => f(e, m));
  }
  async conectar(topicos: string[]): Promise<void> {
    this.muda('conectando');
    if (this.falharAoConectar) {
      this.muda('erro', this.falharAoConectar);
      throw new Error(this.falharAoConectar);
    }
    this.conectado = true;
    this.barramento.clientes.add(this);
    this.muda('conectado');
    topicos.forEach((t) => this.assinar(t));
  }
  assinar(topico: string): void {
    this.topicos.add(topico);
    const r = this.barramento.retidos.get(topico);
    if (r !== undefined) queueMicrotask(() => this.ouvintes.forEach((f) => f(topico, r)));
  }
  desassinar(topico: string): void {
    this.topicos.delete(topico);
  }
  enviar(topico: string, payload: string, retido = false): void {
    if (!this.conectado) return;
    this.barramento.log.push({ topico, payload });
    if (retido) this.barramento.retidos.set(topico, payload);
    for (const c of this.barramento.clientes) if (c !== this && c.topicos.has(topico)) queueMicrotask(() => c.ouvintes.forEach((f) => f(topico, payload)));
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
    queueMicrotask(() => this.muda('conectado'));
  }
  /** Simula queda de rede. */
  cair(): void {
    this.conectado = false;
    this.barramento.clientes.delete(this);
    this.muda('reconectando');
  }
  voltar(): void {
    this.conectado = true;
    this.barramento.clientes.add(this);
    this.muda('conectado');
  }
  fechar(): void {
    this.conectado = false;
    this.barramento.clientes.delete(this);
    this.muda('desconectado');
  }
}
