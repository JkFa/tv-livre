/**
 * Saúde dos canais: uma única fonte de verdade para selos, ordenação, filtro e (na Etapa 3) zapear e guia.
 * Lógica pura: o status vem do teste diário de links (campos `status` e `fails` do canal) e do registro local de falhas
 * deste navegador. Sem esses dados (arquivos antigos) tudo cai no comportamento de antes: só `status`.
 *
 * O teste roda em servidores nos EUA: um canal bloqueado lá pode tocar no Brasil e vice-versa. O status é uma DICA:
 * nunca tira um canal da lista, só sinaliza e reordena.
 */
import type { Channel } from '../../shared/types.ts';
import type { Caps } from './playback.ts';

/** ok = respondeu no último teste · instavel = 1–2 falhas seguidas · fora = 3+ falhas (ou link morto) · nao-confirmado = sem teste. */
export type Health = 'ok' | 'instavel' | 'fora' | 'nao-confirmado';

export const HEALTH_LABELS: Record<Health, string> = {
  ok: 'No ar',
  instavel: 'Instável',
  fora: 'Fora do ar',
  'nao-confirmado': 'Não confirmado',
};

export function channelHealth(ch: Pick<Channel, 'status' | 'fails'>): Health {
  if (ch.status === 'offline') return 'fora';
  if ((ch.fails ?? 0) > 0) return 'instavel';
  return ch.status === 'online' ? 'ok' : 'nao-confirmado';
}

/** Por que o navegador não consegue tocar este canal aqui (ou null se consegue). */
export type BlockReason = 'http' | 'cors' | 'headers' | 'format';

export function browserBlock(ch: Channel, caps: Caps): BlockReason | null {
  if (ch.kind === 'youtube') return null; // o embed tem as próprias regras (selo "Abrir no YouTube")
  if (ch.kind === 'other') return 'format';
  if (ch.needsHeaders) return 'headers';
  // HTTP numa página HTTPS é conteúdo misto: só toca se a versão HTTPS respondeu no teste ou se o usuário liberou o HTTP
  if (ch.kind === 'http' && caps.pageSecure && !caps.httpOk && !ch.httpsOk) return 'http';
  if (ch.cors === false && !caps.nativeHls) return 'cors';
  if (!caps.mse && !caps.nativeHls) return 'format';
  return null;
}

export const BLOCK_TEXT: Record<BlockReason, string> = {
  http: 'Link HTTP (sem HTTPS): o navegador bloqueia numa página segura. Abra no VLC ou libere o HTTP para este site.',
  cors: 'O servidor não libera a reprodução em outros sites e este navegador não toca HLS sozinho. Use o VLC.',
  headers: 'O link exige cabeçalhos que o navegador não consegue enviar. Use o VLC.',
  format: 'Formato que o navegador não toca. Use o VLC.',
};

/** Qualidade para o selo: a resolução medida no teste ou, sem ela, a informada pela fonte (ex.: "720p"). */
export function qualityLabel(ch: Pick<Channel, 'resolution' | 'quality'>): string | null {
  const q = ch.resolution ?? ch.quality;
  return q && /^\d{3,4}[pi]$/i.test(q) ? q.toLowerCase() : null;
}

/** Falhou neste navegador nos últimos 7 dias? */
export type LocalFailures = ReadonlyMap<string, number>;

const HEALTH_RANK: Record<Health, number> = { ok: 0, 'nao-confirmado': 1, instavel: 2, fora: 4 };

/**
 * Posição na lista (menor = mais acima): no ar → não confirmado → instável → falhou aqui → fora do ar.
 * Usada como critério estável: dentro de cada faixa a ordem de antes (Free-TV, nome) é mantida.
 */
export function healthRank(ch: Channel, failedHere: boolean): number {
  const h = channelHealth(ch);
  if (h === 'fora') return HEALTH_RANK.fora;
  return failedHere ? 3 : HEALTH_RANK[h];
}
