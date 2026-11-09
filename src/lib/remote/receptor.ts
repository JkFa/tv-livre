import { executar, type Acoes } from './acoes.ts';
import { abrir, empacotar } from './canal.ts';
import { MAX_CELULARES, validarComando, VERSAO, type Comando, type Controle, type Envelope, type Estado } from './protocolo.ts';
import {
  derivarDoCodigo, gerarChave, gerarCodigo, gerarSessao, hashSessao, importarChave, topicoCmd, topicoEstado, Validador,
} from './seguranca.ts';
import type { Transporte } from './transporte.ts';

/** O modo por código expira em 10 minutos se ninguém conectar. */
export const VALIDADE_CODIGO_MS = 10 * 60_000;
/** Celular que não dá sinal há 2 minutos some da lista. */
const SUMIR_APOS_MS = 2 * 60_000;

type TipoCanal = 'qr' | 'codigo' | 'par';
interface Canal {
  tipo: TipoCanal;
  sessao: string;
  hash: string;
  chave: CryptoKey;
  chaveRaw: string;
  validador: Validador;
  codigo?: string;
  expiraEm?: number;
}
export interface Celular {
  de: string;
  nome: string;
  desde: number;
  visto: number;
  /** Tipo do canal por onde conectou. */
  via: TipoCanal;
}
export interface Pareamento {
  link: string;
  codigo: string | null;
  codigoExpiraEm: number | null;
}
export interface DadosSalvos {
  canais: { tipo: TipoCanal; sessao: string; chaveRaw: string; codigo?: string; expiraEm?: number }[];
  bloqueados: string[];
}
export interface OpcoesReceptor {
  transporte: Transporte;
  acoes: Acoes;
  /** Endereço da página, com a barra final: o link do QR é `<urlBase>#/controle?s=…&k=…`. */
  urlBase: string;
  relogio?: () => number;
  /** Iterações do PBKDF2 (só os testes mudam). */
  iteracoes?: number;
  /** Chamado a cada comando válido (vinheta "📱 controle"). */
  aoComando?: (cmd: Comando, celular: Celular) => void;
}

/**
 * O lado do computador/Smart TV. Recebe comandos cifrados, valida tudo e chama as ações que já existem.
 * Mantém até um canal por QR, um por código (10 min) e um por celular que conectou pelo código (chave nova).
 */
export class Receptor {
  private canais: Canal[] = [];
  private celulares = new Map<string, Celular>();
  private bloqueados = new Set<string>();
  /** Canal 'par' já criado para cada celular que conectou pelo código (a rotação é idempotente). */
  private pares = new Map<string, Canal>();
  /** Começa no relógio: assim o `seq` não repete depois de o computador recarregar a página. */
  private seq: number;
  private ultimoEstado: Estado | null = null;
  private ouvintes = new Set<() => void>();
  private desinscrever: (() => void) | null = null;
  private readonly agora: () => number;

  constructor(private readonly o: OpcoesReceptor) {
    this.agora = o.relogio ?? Date.now;
    this.seq = this.agora();
  }

  // ---------------- ciclo de vida ----------------
  /** Conecta ao transporte (ou rejeita com o motivo) e devolve o que mostrar: link do QR e código. */
  async iniciar(salvo?: DadosSalvos): Promise<Pareamento> {
    if (salvo?.canais.length) await this.restaurar(salvo);
    else {
      this.canais.push(await this.novoCanalQr());
      this.canais.push(await this.novoCanalCodigo());
    }
    this.desinscrever = this.o.transporte.aoReceber((t, p) => void this.receber(t, p));
    await this.o.transporte.conectar(this.canais.map((c) => topicoCmd(c.hash)));
    this.avisar();
    return this.pareamento();
  }

  private async restaurar(salvo: DadosSalvos): Promise<void> {
    for (const s of salvo.canais) {
      if (s.expiraEm && s.expiraEm < this.agora()) continue;
      this.canais.push(await this.montar(s.tipo, s.sessao, s.chaveRaw, { ...(s.codigo ? { codigo: s.codigo } : {}), ...(s.expiraEm ? { expiraEm: s.expiraEm } : {}) }));
    }
    salvo.bloqueados.forEach((b) => this.bloqueados.add(b));
    if (!this.canais.some((c) => c.tipo === 'qr')) this.canais.push(await this.novoCanalQr());
  }

  exportar(): DadosSalvos {
    return {
      canais: this.canais.map((c) => ({ tipo: c.tipo, sessao: c.sessao, chaveRaw: c.chaveRaw, ...(c.codigo ? { codigo: c.codigo } : {}), ...(c.expiraEm ? { expiraEm: c.expiraEm } : {}) })),
      bloqueados: [...this.bloqueados],
    };
  }

  fechar(): void {
    this.desinscrever?.();
    this.desinscrever = null;
    this.o.transporte.fechar();
  }

  // ---------------- canais ----------------
  private async montar(tipo: TipoCanal, sessao: string, chaveRaw: string, extra: { codigo?: string; expiraEm?: number } = {}): Promise<Canal> {
    return { tipo, sessao, hash: await hashSessao(sessao), chave: await importarChave(chaveRaw), chaveRaw, validador: new Validador(this.agora), ...extra };
  }
  private async novoCanalQr(): Promise<Canal> {
    return this.montar('qr', gerarSessao(), (await gerarChave()).raw);
  }
  private async novoCanalCodigo(): Promise<Canal> {
    const codigo = gerarCodigo();
    const d = await derivarDoCodigo(codigo, this.o.iteracoes);
    return this.montar('codigo', d.sessao, d.chaveRaw, { codigo, expiraEm: this.agora() + VALIDADE_CODIGO_MS });
  }

  pareamento(): Pareamento {
    const qr = this.canais.find((c) => c.tipo === 'qr');
    const cod = this.canais.find((c) => c.tipo === 'codigo');
    return {
      link: qr ? `${this.o.urlBase}#/controle?s=${qr.sessao}&k=${qr.chaveRaw}` : '',
      codigo: cod?.codigo ?? null,
      codigoExpiraEm: cod?.expiraEm ?? null,
    };
  }

  /** Gera outro código de 10 minutos (o anterior deixa de funcionar). */
  async novoCodigo(): Promise<Pareamento> {
    const antigo = this.canais.find((c) => c.tipo === 'codigo');
    if (antigo) this.removerCanal(antigo);
    const c = await this.novoCanalCodigo();
    this.canais.push(c);
    this.o.transporte.assinar(topicoCmd(c.hash));
    this.avisar();
    return this.pareamento();
  }

  private removerCanal(c: Canal): void {
    this.canais = this.canais.filter((x) => x !== c);
    this.o.transporte.desassinar(topicoCmd(c.hash));
  }

  /** Remove o código vencido. Chamar de tempos em tempos (a tela chama a cada segundo). */
  verificarExpiracao(): void {
    const c = this.canais.find((x) => x.tipo === 'codigo');
    if (c?.expiraEm && this.agora() > c.expiraEm) {
      this.removerCanal(c);
      this.avisar();
    }
    for (const [de, cel] of this.celulares) if (this.agora() - cel.visto > SUMIR_APOS_MS) this.celulares.delete(de);
  }

  // ---------------- celulares ----------------
  celularesConectados(): Celular[] {
    return [...this.celulares.values()];
  }
  aoMudar(cb: () => void): () => void {
    this.ouvintes.add(cb);
    return () => void this.ouvintes.delete(cb);
  }
  private avisar(): void {
    this.ouvintes.forEach((f) => f());
  }

  /** Tira um celular e não aceita mais comandos dele (até "Encerrar o controle"). */
  async desconectar(de: string): Promise<void> {
    const cel = this.celulares.get(de);
    this.bloqueados.add(de);
    this.celulares.delete(de);
    const canal = this.canais.find((c) => c.tipo === cel?.via) ?? this.canais[0];
    if (canal) await this.enviarControle(canal, { tipo: 'desconectar', para: de });
    this.avisar();
  }

  /** Gera sessão e chave novas: o QR antigo e todos os celulares deixam de valer. */
  async encerrar(): Promise<Pareamento> {
    for (const c of this.canais) {
      await this.enviarControle(c, { tipo: 'encerrado' });
      this.o.transporte.enviar(topicoEstado(c.hash), '', true); // limpa a mensagem retida
      this.o.transporte.desassinar(topicoCmd(c.hash));
    }
    this.canais = [await this.novoCanalQr(), await this.novoCanalCodigo()];
    this.celulares.clear();
    this.bloqueados.clear();
    this.pares.clear();
    this.canais.forEach((c) => this.o.transporte.assinar(topicoCmd(c.hash)));
    if (this.ultimoEstado) await this.publicarEstado(this.ultimoEstado);
    this.avisar();
    return this.pareamento();
  }

  // ---------------- envio ----------------
  private async enviarEnvelope(canal: Canal, t: Envelope['t'], d: unknown, retido: boolean): Promise<void> {
    const env: Envelope = { v: VERSAO, seq: this.seq++, ts: this.agora(), de: 'tv', t, d };
    this.o.transporte.enviar(topicoEstado(canal.hash), await empacotar(canal.chave, env), retido);
  }
  private enviarControle(canal: Canal, c: Controle): Promise<void> {
    return this.enviarEnvelope(canal, 'ctl', c, false);
  }

  /** Publica o estado (retido: quem conectar depois recebe o último). Chamar a cada mudança e a cada 15 s. */
  async publicarEstado(e: Estado): Promise<void> {
    this.ultimoEstado = e;
    await Promise.all(this.canais.map((c) => this.enviarEnvelope(c, 'estado', e, true)));
  }

  // ---------------- recepção ----------------
  private async receber(topico: string, payload: string): Promise<void> {
    const canal = this.canais.find((c) => topicoCmd(c.hash) === topico);
    if (!canal || !payload) return;
    if (canal.expiraEm && this.agora() > canal.expiraEm) {
      this.verificarExpiracao();
      return;
    }
    const r = await abrir(canal.chave, payload, canal.validador);
    if (!r.ok || r.env.t !== 'cmd') return; // cifra errada, velha, repetida, forma ou versão: descarta em silêncio
    const cmd = validarComando(r.env.d);
    if (!cmd) return;
    const de = r.env.de;
    if (this.bloqueados.has(de)) {
      await this.enviarControle(canal, { tipo: 'recusa', para: de, motivo: 'bloqueado' });
      return;
    }
    let cel = this.celulares.get(de);
    if (!cel) {
      if (this.celulares.size >= MAX_CELULARES) {
        await this.enviarControle(canal, { tipo: 'recusa', para: de, motivo: 'limite' });
        return;
      }
      cel = { de, nome: 'Celular', desde: this.agora(), visto: this.agora(), via: canal.tipo };
      this.celulares.set(de, cel);
    }
    cel.visto = this.agora();
    if (cmd.c === 'hello') cel.nome = cmd.nome;

    // conectou pelo código: o código vira de uso único e o celular recebe uma chave nova pelo canal já cifrado
    if (canal.tipo === 'codigo') await this.rotacionar(canal, cel);
    cel = this.celulares.get(de)!;

    if (cmd.c !== 'hello' && cmd.c !== 'ping') {
      executar(cmd, this.o.acoes);
      this.o.aoComando?.(cmd, cel);
    }
    // hello e ping pedem o estado; os comandos reais já mudam o estado e a tela publica a mudança
    if ((cmd.c === 'hello' || cmd.c === 'ping') && this.ultimoEstado) void this.publicarEstado(this.ultimoEstado);
    this.avisar();
  }

  private async rotacionar(codigo: Canal, cel: Celular): Promise<void> {
    // várias mensagens do mesmo celular podem chegar antes de a rotação terminar: reenvia a mesma, sem criar outro canal
    let novo = this.pares.get(cel.de);
    if (!novo) {
      novo = await this.montar('par', gerarSessao(), (await gerarChave()).raw);
      if (this.pares.has(cel.de)) novo = this.pares.get(cel.de)!;
      else {
        this.pares.set(cel.de, novo);
        this.canais.push(novo);
        this.o.transporte.assinar(topicoCmd(novo.hash));
      }
    }
    await this.enviarControle(codigo, { tipo: 'rotacao', para: cel.de, sessao: novo.sessao, chave: novo.chaveRaw });
    cel.via = 'par';
    if (this.canais.includes(codigo)) this.removerCanal(codigo);
  }
}
