import type { Comando } from './protocolo.ts';

/**
 * As ações que o computador já tem (as mesmas do teclado e do controle da TV). O celular só chama estas funções:
 * nenhuma lógica de zapear, digitar número ou favoritar é duplicada aqui.
 */
export interface Acoes {
  proximo: () => void;
  anterior: () => void;
  numero: (n: number) => void;
  canalId: (id: string, pais?: string) => void;
  zapear: () => void;
  volume: (v: number) => void;
  mudo: (m: boolean) => void;
  pausa: () => void;
  play: () => void;
  favoritar: () => void;
  buscar: (texto: string) => void;
  tela: (cheia: boolean) => void;
}

/** Comando válido → ação. `ping` e `hello` são do transporte e não chegam aqui. */
export function executar(cmd: Comando, a: Acoes): void {
  switch (cmd.c) {
    case 'canal:proximo': return a.proximo();
    case 'canal:anterior': return a.anterior();
    case 'canal:numero': return a.numero(cmd.n);
    case 'canal:id': return a.canalId(cmd.id, cmd.pais);
    case 'zapear': return a.zapear();
    case 'volume': return a.volume(cmd.v);
    case 'mudo': return a.mudo(cmd.m);
    case 'pausa': return a.pausa();
    case 'play': return a.play();
    case 'favoritar': return a.favoritar();
    case 'buscar': return a.buscar(cmd.texto);
    case 'tela': return a.tela(cmd.cheia);
    case 'ping':
    case 'hello':
      return;
  }
}
