/**
 * Zapear (sortear um canal): a ÚNICA regra de sorteio do app. Usada pelo botão da navegação inferior, pela tecla Z,
 * pelo botão verde do controle da TV, pelo controle pelo celular, pelo player, pelo mini-player e pelo Guia de TV.
 *
 * Regras (em ordem):
 * 1. Nunca sorteia canal que o navegador não toca (HTTP numa página segura, sem CORS, cabeçalhos, formato, YouTube
 *    que não incorpora): a promessa é "10 zaps → 10 canais que abrem".
 * 2. Sorteia entre os canais NO AR (passaram no último teste). Se forem poucos (< ZAP_MIN_POOL), junta os INSTÁVEIS.
 * 3. Canais que não abriram neste navegador nos últimos 7 dias só entram se não sobrar nada melhor.
 * 4. Não repete os últimos sorteados enquanto houver alternativa.
 * 5. Sem dado de saúde (lista antiga, tudo "não confirmado"), cai no comportamento de antes: qualquer canal não-offline
 *    que toque aqui.
 */
import { useCallback, useRef } from 'react';
import type { Channel } from '../../shared/types.ts';
import { channelKey } from './lineup.ts';
import { caps, isPlayableHere } from './playback.ts';
import { useHealth, type HealthSelector } from './useHealth.ts';

/** Abaixo disso a faixa "no ar" é pequena demais para um sorteio que pareça sorteio: entram os instáveis. */
export const ZAP_MIN_POOL = 5;
/** Quantos sorteios recentes evitar repetir. */
export const ZAP_MEMORY = 10;

export interface ZapOptions {
  /** Canal atual (nunca é sorteado de novo). */
  currentKey: string | null;
  /** Sorteados há pouco (chaves), evitados enquanto houver alternativa. */
  recent?: readonly string[];
  /** Restrição extra (ex.: transmitindo para a TV, só o que o Chromecast abre). */
  extra?: (c: Channel) => boolean;
  /** O canal toca aqui? (padrão: as capacidades deste navegador). Injetável para teste. */
  playable?: (c: Channel) => boolean;
  rnd?: () => number;
}

/** As faixas do sorteio, da melhor para a pior. Exportada para teste. */
export function zapTiers(list: readonly Channel[], sel: HealthSelector, o: ZapOptions): Channel[][] {
  const playable = o.playable ?? ((c: Channel) => isPlayableHere(c, caps()));
  const base = list.filter((c) => channelKey(c) !== o.currentKey && playable(c) && (o.extra?.(c) ?? true));
  const ok = base.filter((c) => sel.health(c) === 'ok');
  const okInst = base.filter((c) => sel.health(c) === 'ok' || sel.health(c) === 'instavel');
  const fresh = (l: Channel[]) => l.filter((c) => !sel.failedHere(c));
  const hasHealthData = list.some((c) => c.status !== 'desconhecido');
  const tiers: Channel[][] = [];
  if (fresh(ok).length >= ZAP_MIN_POOL) tiers.push(fresh(ok));
  tiers.push(fresh(okInst), okInst);
  // sem dado de saúde (ou nada no ar): o comportamento de antes, qualquer canal que não esteja fora do ar
  if (!hasHealthData || !okInst.length) tiers.push(fresh(base.filter((c) => c.status !== 'offline')), base.filter((c) => c.status !== 'offline'));
  return tiers;
}

/** Sorteia o próximo canal, ou null se nenhum canal da lista toca aqui. */
export function pickZap(list: readonly Channel[], sel: HealthSelector, o: ZapOptions): Channel | null {
  const recent = new Set(o.recent ?? []);
  for (const tier of zapTiers(list, sel, o)) {
    if (!tier.length) continue;
    const unseen = tier.filter((c) => !recent.has(channelKey(c)));
    const pool = unseen.length ? unseen : tier;
    return pool[Math.floor((o.rnd ?? Math.random)() * pool.length)] ?? null;
  }
  return null;
}

/**
 * Hook do zapear: a regra acima + saúde ao vivo (falhas locais) + memória dos últimos sorteios desta sessão.
 * Devolve `zapear(lista, atual, extra?)`; quem chama decide o que fazer com o canal (sintonizar, ancorar no mini-player).
 */
export function useZapear(): (list: readonly Channel[], currentKey: string | null, extra?: (c: Channel) => boolean) => Channel | null {
  const sel = useHealth();
  const recent = useRef<string[]>([]);
  return useCallback(
    (list, currentKey, extra) => {
      const pick = pickZap(list, sel, { currentKey, recent: recent.current, ...(extra ? { extra } : {}) });
      if (pick) recent.current = [channelKey(pick), ...recent.current.filter((k) => k !== channelKey(pick))].slice(0, ZAP_MEMORY);
      return pick;
    },
    [sel],
  );
}
