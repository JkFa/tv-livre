import { abrir, empacotar } from './canal.ts';
import { validarControle, validarEstado, VERSAO, type Comando, type Envelope, type Estado } from './protocolo.ts';
import { aleatorio, hashSessao, importarChave, paraB64u, topicoCmd, topicoEstado, Validador } from './seguranca.ts';
import type { EstadoConexao, Transporte } from './transporte.ts';

export type Situacao = 'conectando' | 'conectado' | 'reconectando' | 'sem-sinal' | 'erro' | 'encerrado' | 'desconectado' | 'limite' | 'bloqueado' | 'versao';
export interface Status {
  situacao: Situacao;
  /** Explicação para mostrar ao usuário (broker fora, relógio errado…). */
  motivo?: string;
}

export interface OpcoesControlador {
  transporte: Transporte;
  sessao: string;
  chaveRaw: string;
  nome: string;
  relogio?: () => number;
  /** Chamado quando a chave muda (pareamento por código): salvar a nova sessão. */
  aoMudarSessao?: (sessao: string, chaveRaw: string) => void;
  /** Sinal de vida do computador some depois deste tempo. */
  semSinalMs?: number;
  pingMs?: number;
}

/** O lado do celular: envia comandos cifrados e recebe o estado. Nunca toca vídeo. */
export class Controlador {
  readonly de = paraB64u(aleatorio(9));
  private seq: number;
  /** Sessão nova já recebida e ainda sendo trocada (mensagens repetidas da rotação chegam antes de a troca terminar). */
  private sessaoPendente: string | null = null;
  private chave!: CryptoKey;
  private sessao: string;
  private chaveRaw: string;
  private hash = '';
  private validador: Validador;
  private estado: Estado | null = null;
  private status: Status = { situacao: 'conectando' };
  private ultimoRecebido = 0;
  private errosDeTempo = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private fns: (() => void)[] = [];
  private ouvEstado = new Set<(e: Estado) => void>();
  private ouvStatus = new Set<(s: Status) => void>();
  private readonly agora: () => number;

  constructor(private readonly o: OpcoesControlador) {
    this.agora = o.relogio ?? Date.now;
    this.seq = this.agora();
    this.sessao = o.sessao;
    this.chaveRaw = o.chaveRaw;
    this.validador = new Validador(this.agora);
  }

  // ---------------- ciclo de vida ----------------
  async conectar(): Promise<void> {
    this.definir({ situacao: 'conectando' });
    this.chave = await importarChave(this.chaveRaw);
    this.hash = await hashSessao(this.sessao);
    this.fns.push(
      this.o.transporte.aoReceber((t, p) => void this.receber(t, p)),
      this.o.transporte.aoMudarEstado((e, m) => this.aoConexao(e, m)),
    );
    try {
      await this.o.transporte.conectar([topicoEstado(this.hash)]);
    } catch (e) {
      this.definir({ situacao: 'erro', motivo: e instanceof Error ? e.message : 'Não foi possível conectar' });
      throw e;
    }
    this.ultimoRecebido = this.agora();
    await this.enviar({ c: 'hello', nome: this.o.nome });
    this.timer = setInterval(() => void this.batida(), this.o.pingMs ?? 20_000);
  }

  private aoConexao(e: EstadoConexao, motivo?: string): void {
    if (['encerrado', 'desconectado', 'limite', 'bloqueado', 'versao'].includes(this.status.situacao) && e !== 'conectado') return;
    if (e === 'conectado') {
      if (this.status.situacao === 'reconectando' || this.status.situacao === 'erro') this.definir({ situacao: 'reconectando' });
      void this.enviar({ c: 'ping' }); // ao reconectar, pede o estado (o broker também reenvia o retido)
    } else if (e === 'reconectando' || e === 'conectando') this.definir({ situacao: 'reconectando' });
    else if (e === 'erro') this.definir({ situacao: 'erro', ...(motivo ? { motivo } : {}) });
  }

  /** O iPhone derruba o WebSocket em segundo plano: ao voltar, reconecta, mostra "reconectando…" e reenvia ping. */
  reconectar(): void {
    this.definir({ situacao: 'reconectando' });
    this.o.transporte.reconectar();
    void this.enviar({ c: 'ping' });
  }

  fechar(): void {
    clearInterval(this.timer);
    this.fns.forEach((f) => f());
    this.fns = [];
    this.o.transporte.fechar();
  }

  private async batida(): Promise<void> {
    if (['encerrado', 'desconectado', 'limite', 'bloqueado', 'versao'].includes(this.status.situacao)) return;
    const semSinal = this.o.semSinalMs ?? 40_000;
    if (this.agora() - this.ultimoRecebido > semSinal && this.status.situacao === 'conectado') {
      this.definir({ situacao: 'sem-sinal', motivo: 'O computador não responde. Confira se o TV Livre continua aberto nele.' });
    }
    await this.enviar({ c: 'ping' });
  }

  // ---------------- envio e recepção ----------------
  async enviar(cmd: Comando): Promise<void> {
    if (!this.chave) return;
    const env: Envelope = { v: VERSAO, seq: this.seq++, ts: this.agora(), de: this.de, t: 'cmd', d: cmd };
    this.o.transporte.enviar(topicoCmd(this.hash), await empacotar(this.chave, env), false);
  }

  private async receber(topico: string, payload: string): Promise<void> {
    if (topico !== topicoEstado(this.hash) || !payload) return;
    const r = await abrir(this.chave, payload, this.validador);
    if (!r.ok) {
      if (r.erro === 'versao') this.definir({ situacao: 'versao', motivo: 'O computador usa outra versão do TV Livre. Atualize a página nos dois aparelhos.' });
      if (r.erro === 'velha' || r.erro === 'futura') {
        // várias mensagens fora da janela de 30 s seguidas: provavelmente o relógio de um dos aparelhos está errado
        if (++this.errosDeTempo >= 3) this.definir({ situacao: 'sem-sinal', motivo: 'A data e a hora do celular e do computador estão diferentes. Ajuste os dois para automático.' });
      }
      return;
    }
    this.errosDeTempo = 0;
    this.ultimoRecebido = this.agora();
    const { env } = r;
    if (env.t === 'estado') {
      const e = validarEstado(env.d);
      if (!e) return;
      if (e.versao !== 0 && e.versao !== VERSAO) return this.definir({ situacao: 'versao', motivo: 'O computador usa outra versão do TV Livre. Atualize a página nos dois aparelhos.' });
      this.estado = e;
      if (this.status.situacao !== 'conectado') this.definir({ situacao: 'conectado' });
      this.ouvEstado.forEach((f) => f(e));
    } else if (env.t === 'ctl') {
      const c = validarControle(env.d);
      if (!c) return;
      if (c.tipo === 'encerrado') return this.definir({ situacao: 'encerrado', motivo: 'O controle foi encerrado no computador.' });
      if (c.para !== this.de) return;
      if (this.status.situacao === 'desconectado' || this.status.situacao === 'encerrado') return; // o primeiro motivo é o que vale
      if (c.tipo === 'desconectar') this.definir({ situacao: 'desconectado', motivo: 'O computador desconectou este celular.' });
      else if (c.tipo === 'recusa') this.definir(c.motivo === 'limite' ? { situacao: 'limite', motivo: 'O computador já tem 3 celulares conectados.' } : { situacao: 'bloqueado', motivo: 'Este celular foi desconectado pelo computador.' });
      else if (c.tipo === 'rotacao' && c.sessao !== this.sessao && c.sessao !== this.sessaoPendente) await this.trocarSessao(c.sessao, c.chave); // repetida: já trocou
    }
  }

  /** Pareamento por código: troca para a chave nova enviada pelo canal já cifrado. */
  private async trocarSessao(sessao: string, chaveRaw: string): Promise<void> {
    this.sessaoPendente = sessao;
    const novaChave = await importarChave(chaveRaw);
    const novoHash = await hashSessao(sessao);
    this.o.transporte.assinar(topicoEstado(novoHash));
    this.o.transporte.desassinar(topicoEstado(this.hash));
    this.sessao = sessao;
    this.chaveRaw = chaveRaw;
    this.chave = novaChave;
    this.hash = novoHash;
    this.validador = new Validador(this.agora);
    this.o.aoMudarSessao?.(sessao, chaveRaw);
    await this.enviar({ c: 'hello', nome: this.o.nome });
  }

  // ---------------- leitura ----------------
  private definir(s: Status): void {
    this.status = s;
    this.ouvStatus.forEach((f) => f(s));
  }
  get estadoAtual(): Estado | null {
    return this.estado;
  }
  get statusAtual(): Status {
    return this.status;
  }
  aoEstado(cb: (e: Estado) => void): () => void {
    this.ouvEstado.add(cb);
    return () => void this.ouvEstado.delete(cb);
  }
  aoStatus(cb: (s: Status) => void): () => void {
    this.ouvStatus.add(cb);
    return () => void this.ouvStatus.delete(cb);
  }
}
