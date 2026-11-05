import type { Channel, Source } from '../../shared/types.ts';

/** Canal ainda sem status de rede; sai das fontes e entra na deduplicação. */
export type Candidate = Omit<Channel, 'status' | 'sources'> & {
  source: Source;
  /** Cabeçalhos que a fonte pede para testar o link; usados só no teste de rede, nunca publicados. */
  probeHeaders?: { userAgent?: string; referrer?: string };
};

export interface BuildStats {
  excludedAdult: number;
  excludedClosed: number;
  excludedNoChannel: number;
  excludedInvalid: number;
  /** removidos a pedido (config/removals.json) */
  excludedRemoved: number;
  fromFreeTv: number;
  fromIptvOrg: number;
}
