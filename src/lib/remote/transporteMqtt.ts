import type { MqttClient } from 'mqtt';
import type { EstadoConexao, Transporte } from './transporte.ts';

/**
 * Broker MQTT público (gratuito, sem conta) sobre WebSocket seguro. Todo conteúdo é cifrado de ponta a ponta
 * (AES-GCM) antes de sair do aparelho: o broker só vê tópicos com hash e mensagens ilegíveis. Para trocar de broker,
 * mude esta constante (ou, em desenvolvimento e testes, a chave `tvlivre:remote-broker`).
 */
export const BROKER_PADRAO = 'wss://broker.hivemq.com:8884/mqtt';
const TEMPO_PARA_CONECTAR_MS = 12_000;

export class TransporteMqtt implements Transporte {
  private cli: MqttClient | null = null;
  private ouvintes = new Set<(t: string, p: string) => void>();
  private estados = new Set<(e: EstadoConexao, m?: string) => void>();
  private conectouAlgumaVez = false;

  constructor(private readonly url: string = BROKER_PADRAO) {}

  private muda(e: EstadoConexao, m?: string): void {
    this.estados.forEach((f) => f(e, m));
  }

  async conectar(topicos: string[]): Promise<void> {
    this.muda('conectando');
    // o pacote `mqtt` só é baixado aqui (chunk sob demanda): nada é carregado antes de o usuário ativar o controle
    const { default: mqtt } = await import('mqtt');
    await new Promise<void>((resolve, reject) => {
      let ultimoErro = '';
      const cli = mqtt.connect(this.url, {
        clientId: `tvlivre-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
        reconnectPeriod: 2000,
        connectTimeout: TEMPO_PARA_CONECTAR_MS,
        clean: true,
        keepalive: 30,
      });
      this.cli = cli;
      const desistir = setTimeout(() => {
        if (this.conectouAlgumaVez) return;
        cli.end(true);
        const motivo = `Não foi possível conectar ao servidor de mensagens${ultimoErro ? ` (${ultimoErro})` : ''}. Pode ser o servidor fora do ar ou uma rede (de empresa, por exemplo) que bloqueia WebSocket.`;
        this.muda('erro', motivo);
        reject(new Error(motivo));
      }, TEMPO_PARA_CONECTAR_MS + 500);
      cli.on('connect', () => {
        clearTimeout(desistir);
        const primeira = !this.conectouAlgumaVez;
        this.conectouAlgumaVez = true;
        if (topicos.length) cli.subscribe(topicos, { qos: 1 });
        this.muda('conectado');
        if (primeira) resolve();
      });
      cli.on('error', (e) => void (ultimoErro = e.message));
      cli.on('reconnect', () => this.muda('reconectando'));
      cli.on('offline', () => this.conectouAlgumaVez && this.muda('reconectando'));
      cli.on('message', (t, buf) => this.ouvintes.forEach((f) => f(t, buf.toString())));
    });
  }

  assinar(topico: string): void {
    this.cli?.subscribe(topico, { qos: 1 });
  }
  desassinar(topico: string): void {
    this.cli?.unsubscribe(topico);
  }
  enviar(topico: string, payload: string, retido = false): void {
    this.cli?.publish(topico, payload, { qos: 0, retain: retido });
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
    this.cli?.reconnect();
  }
  fechar(): void {
    this.cli?.end(true);
    this.cli = null;
    this.muda('desconectado');
  }
}
