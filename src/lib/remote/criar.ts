import { readString } from '../storage.ts';
import { TransporteBroadcast } from './transporteBroadcast.ts';
import { BROKER_PADRAO, TransporteMqtt } from './transporteMqtt.ts';
import type { Transporte } from './transporte.ts';

/**
 * Escolhe o transporte. Uso real: broker MQTT público. Para desenvolvimento e testes, `tvlivre:remote-broker` no
 * localStorage pode ser `broadcast` (duas abas do mesmo aparelho) ou o endereço `ws://…` de um broker local.
 */
export function criarTransporte(): Transporte {
  const alvo = readString('tvlivre:remote-broker');
  if (alvo === 'broadcast') return new TransporteBroadcast();
  return new TransporteMqtt(alvo && /^wss?:\/\//.test(alvo) ? alvo : BROKER_PADRAO);
}
