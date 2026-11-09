import { useCallback, useEffect, useRef, useState } from 'react';
import { Controlador, type Status } from './controlador.ts';
import { criarTransporte } from './criar.ts';
import { nomeDoAparelho, salvarPar, type Par } from './celular.ts';
import type { Comando, Estado } from './protocolo.ts';

/**
 * Controlador no celular. Reconecta ao voltar do segundo plano (o iPhone derruba o WebSocket) mostrando "reconectando…"
 * e reenviando `ping`. Nada é conectado enquanto não houver um pareamento.
 */
export function useControlador(par: Par | null) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [status, setStatus] = useState<Status>({ situacao: 'conectando' });
  const [tentativa, setTentativa] = useState(0);
  const ref = useRef<Controlador | null>(null);

  useEffect(() => {
    if (!par) return;
    const c = new Controlador({ transporte: criarTransporte(), sessao: par.sessao, chaveRaw: par.chaveRaw, nome: nomeDoAparelho(), aoMudarSessao: (sessao, chaveRaw) => salvarPar({ sessao, chaveRaw }) });
    ref.current = c;
    const fns = [c.aoEstado(setEstado), c.aoStatus(setStatus)];
    void c.conectar().catch(() => undefined); // o motivo chega por aoStatus
    const volta = () => {
      if (document.visibilityState === 'visible') c.reconectar();
    };
    document.addEventListener('visibilitychange', volta);
    window.addEventListener('pageshow', volta);
    return () => {
      document.removeEventListener('visibilitychange', volta);
      window.removeEventListener('pageshow', volta);
      fns.forEach((f) => f());
      c.fechar();
      ref.current = null;
    };
  }, [par, tentativa]);

  const enviar = useCallback((cmd: Comando) => void ref.current?.enviar(cmd), []);
  const tentarDeNovo = useCallback(() => {
    setStatus({ situacao: 'conectando' });
    setTentativa((n) => n + 1);
  }, []);
  return { estado, status, enviar, tentarDeNovo };
}
