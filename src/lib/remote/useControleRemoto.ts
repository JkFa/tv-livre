import { useCallback, useEffect, useRef, useState } from 'react';
import { readSession, removeSession, writeSession } from '../storage.ts';
import type { Acoes } from './acoes.ts';
import type { Comando, Estado } from './protocolo.ts';
import type { Celular, Pareamento, Receptor } from './receptor.ts';

const CHAVE_SESSAO = 'tvlivre:controle-sessao';
const CHAVES_ACOES = ['proximo', 'anterior', 'numero', 'canalId', 'zapear', 'volume', 'mudo', 'pausa', 'play', 'favoritar', 'buscar', 'tela'] as const;

interface Visao {
  ativo: boolean;
  conectando: boolean;
  erro: string | null;
  pareamento: Pareamento | null;
  celulares: Celular[];
}
const VAZIA: Visao = { ativo: false, conectando: false, erro: null, pareamento: null, celulares: [] };

interface Opcoes {
  acoes: Acoes;
  estado: Estado;
  /** Chamado a cada comando válido (aviso "📱 controle"). */
  aoComando?: (cmd: Comando, celular: Celular) => void;
}

/**
 * Controle pelo celular, lado do computador/TV. NADA é carregado nem conectado até `ativar()`: o código do receptor,
 * o pacote `mqtt` e a conexão com o broker são chunks sob demanda. Se esta aba já tinha o controle ligado (sessão em
 * `sessionStorage`), ele volta sozinho ao recarregar a página.
 */
export function useControleRemoto(o: Opcoes) {
  const [v, setV] = useState<Visao>(VAZIA);
  const rec = useRef<Receptor | null>(null);
  const acoesRef = useRef(o.acoes);
  const estadoRef = useRef(o.estado);
  const comandoRef = useRef(o.aoComando);
  useEffect(() => {
    acoesRef.current = o.acoes;
    estadoRef.current = o.estado;
    comandoRef.current = o.aoComando;
  });

  const atualizar = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    writeSession(CHAVE_SESSAO, JSON.stringify(r.exportar()));
    setV((x) => ({ ...x, pareamento: r.pareamento(), celulares: r.celularesConectados() }));
  }, []);

  const ativar = useCallback(async () => {
    if (rec.current) return;
    setV({ ...VAZIA, conectando: true });
    try {
      const [{ Receptor }, { criarTransporte }] = await Promise.all([import('./receptor.ts'), import('./criar.ts')]);
      // as ações são lidas na hora do comando (sempre as mais recentes do App)
      const acoes = Object.fromEntries(CHAVES_ACOES.map((k) => [k, (...a: unknown[]) => (acoesRef.current[k] as (...x: unknown[]) => void)(...a)])) as unknown as Acoes;
      const r = new Receptor({
        transporte: criarTransporte(),
        acoes,
        urlBase: new URL(import.meta.env.BASE_URL, window.location.origin).href,
        aoComando: (c, cel) => comandoRef.current?.(c, cel),
      });
      rec.current = r;
      let salvo;
      try {
        const bruto = readSession(CHAVE_SESSAO);
        salvo = bruto ? JSON.parse(bruto) : undefined;
      } catch {
        salvo = undefined;
      }
      const par = await r.iniciar(salvo);
      r.aoMudar(atualizar);
      writeSession(CHAVE_SESSAO, JSON.stringify(r.exportar()));
      setV({ ativo: true, conectando: false, erro: null, pareamento: par, celulares: r.celularesConectados() });
      void r.publicarEstado(estadoRef.current);
    } catch (e) {
      rec.current?.fechar();
      rec.current = null;
      setV({ ...VAZIA, erro: e instanceof Error ? e.message : 'Não foi possível ativar o controle' });
    }
  }, [atualizar]);

  // recarregou a página com o controle ligado: volta sozinho (o usuário já tinha ativado nesta aba)
  useEffect(() => {
    if (readSession(CHAVE_SESSAO)) void Promise.resolve().then(ativar);
  }, [ativar]);

  // estado para os celulares: a cada mudança e a cada 15 s (sinal de vida)
  const chaveEstado = JSON.stringify(o.estado);
  useEffect(() => {
    void rec.current?.publicarEstado(estadoRef.current);
  }, [chaveEstado, v.ativo]);
  useEffect(() => {
    if (!v.ativo) return;
    const batida = setInterval(() => void rec.current?.publicarEstado(estadoRef.current), 15_000);
    const venc = setInterval(() => {
      rec.current?.verificarExpiracao();
      atualizar();
    }, 5_000);
    return () => {
      clearInterval(batida);
      clearInterval(venc);
    };
  }, [v.ativo, atualizar]);

  const desativar = useCallback(() => {
    rec.current?.fechar();
    rec.current = null;
    removeSession(CHAVE_SESSAO);
    setV(VAZIA);
  }, []);
  const encerrar = useCallback(async () => {
    await rec.current?.encerrar();
    atualizar();
  }, [atualizar]);
  const novoCodigo = useCallback(async () => {
    await rec.current?.novoCodigo();
    atualizar();
  }, [atualizar]);
  const desconectar = useCallback(
    async (de: string) => {
      await rec.current?.desconectar(de);
      atualizar();
    },
    [atualizar],
  );

  return { ...v, ativar, desativar, encerrar, novoCodigo, desconectar };
}
export type ControleRemoto = ReturnType<typeof useControleRemoto>;
