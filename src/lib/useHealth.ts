import { useMemo } from 'react';
import type { Channel } from '../../shared/types.ts';
import { browserBlock, channelHealth, healthRank, qualityLabel, type BlockReason, type Health } from './health.ts';
import { channelKey } from './lineup.ts';
import { useLocalFailures } from './local-failures.ts';
import { caps } from './playback.ts';

export interface HealthSelector {
  health: (ch: Channel) => Health;
  /** Motivo de o navegador não tocar o canal aqui, ou null. */
  block: (ch: Channel) => BlockReason | null;
  /** Não abriu neste navegador nos últimos 7 dias. */
  failedHere: (ch: Channel) => boolean;
  quality: (ch: Channel) => string | null;
  rank: (ch: Channel) => number;
}

/** Seletor de saúde reutilizável (grade, player, guia, zapear): reage ao registro local de falhas. */
export function useHealth(): HealthSelector {
  const failures = useLocalFailures();
  return useMemo(() => makeHealthSelector(failures), [failures]);
}

export function makeHealthSelector(failures: ReadonlyMap<string, number>): HealthSelector {
  const failedHere = (ch: Channel) => failures.has(channelKey(ch));
  return {
    health: channelHealth,
    block: (ch) => browserBlock(ch, caps()),
    failedHere,
    quality: qualityLabel,
    rank: (ch) => healthRank(ch, failedHere(ch)),
  };
}
