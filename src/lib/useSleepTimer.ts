import { useCallback, useEffect, useRef, useState } from 'react';
import { fimDoTimer, passoTimer, setTimerPadrao, type OpcaoTimer } from './timer.ts';

interface Alvo {
  /** Aplica o volume (0–1) ao elemento que está tocando. */
  volume: (v: number) => void;
  /** Hora de acabar: pausa a reprodução. */
  fim: () => void;
}

/**
 * Timer de desligar. Confere a cada segundo (a cada 250 ms nos últimos 10 s, para o volume descer suave) usando o
 * relógio do sistema, então continua certo mesmo se o navegador atrasar os temporizadores com a tela apagada.
 */
export function useSleepTimer(alvo: Alvo) {
  const [fimMs, setFimMs] = useState<number | null>(null);
  const [restanteMs, setRestanteMs] = useState(0);
  const a = useRef(alvo);
  useEffect(() => {
    a.current = alvo;
  });

  useEffect(() => {
    if (fimMs === null) return;
    const passo = () => {
      const p = passoTimer(fimMs, Date.now());
      setRestanteMs(p.restanteMs);
      a.current.volume(p.volume);
      if (p.terminou) {
        a.current.fim();
        a.current.volume(1); // restaura para a próxima vez que o usuário apertar play
        // o WebKit ignora `volume` atribuído no mesmo instante do pause() (só no <audio>): reaplica logo depois
        setTimeout(() => a.current.volume(1), 400);
        setFimMs(null);
      }
    };
    passo();
    const id = setInterval(passo, 250);
    return () => clearInterval(id);
  }, [fimMs]);

  /** Inicia e lembra a escolha. Devolve false se "fim do programa" não tem programa. */
  const iniciar = useCallback((o: OpcaoTimer, fimProgramaSeg?: number | null): boolean => {
    const fim = fimDoTimer(Date.now(), o, fimProgramaSeg);
    if (fim === null) return false;
    setTimerPadrao(o);
    setFimMs(fim);
    return true;
  }, []);
  const cancelar = useCallback(() => {
    setFimMs((f) => {
      if (f !== null) a.current.volume(1);
      return null;
    });
  }, []);

  return { ativo: fimMs !== null, restanteMs, iniciar, cancelar };
}
