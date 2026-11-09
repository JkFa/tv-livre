import type { Channel } from './types.ts';

/**
 * "Grade": cada país tem uma numeração estável de canais. A ordem não depende de filtros nem de status:
 * canais curados do Free-TV primeiro, depois ordem alfabética. Só muda quando a lista de canais muda.
 * (Usado pelo site e pelo build das páginas indexáveis, para o número ser o mesmo nos dois.)
 */
export function lineupOrder(list: readonly Channel[]): Channel[] {
  return [...list].sort(
    (a, b) =>
      Number(b.sources[0] === 'free-tv') - Number(a.sources[0] === 'free-tv') || a.name.localeCompare(b.name, 'pt-BR'),
  );
}

export function formatNumber(n: number | undefined): string {
  return n === undefined ? '--' : String(n).padStart(2, '0');
}
