import type { Channel } from '../../shared/types.ts';

export type Cause = 'offline' | 'geo' | 'cors' | 'media' | 'timeout' | 'device' | 'mixed' | 'unknown';

export interface HlsErrorLike {
  type: string;
  details?: string;
  response?: { code?: number };
}

/** Traduz um erro fatal do hls.js na causa mais provável, combinando com o que o pipeline já sabia do canal. */
export function diagnose(data: HlsErrorLike, ch: Pick<Channel, 'status' | 'geo'>): Cause {
  if (data.type === 'mediaError') return 'media';
  if (data.type === 'networkError') {
    const code = data.response?.code;
    if (code === 404 || code === 410 || (code !== undefined && code >= 500)) return 'offline';
    if (code === 401 || code === 403 || code === 451) return 'geo';
    if (data.details === 'manifestLoadTimeOut') return 'timeout';
    // code 0/undefined: o navegador não deixa ver o motivo (CORS, DNS, bloqueio)
    if (ch.status === 'offline') return 'offline';
    if (ch.geo) return 'geo';
    return 'cors';
  }
  return 'unknown';
}

/** Erro do receptor do Chromecast (código do `chrome.cast.ErrorCode`/`loadMedia`) → causa, no mesmo padrão do player local. */
export function diagnoseCast(codigo: string, canal: Pick<Channel, 'status' | 'geo'>): Cause {
  if (/TIMEOUT/i.test(codigo)) return 'timeout';
  if (/CANCEL|SESSION|RECEIVER_UNAVAILABLE|API_NOT_INITIALIZED/i.test(codigo)) return 'device';
  if (canal.status === 'offline') return 'offline';
  if (canal.geo) return 'geo';
  // LOAD_MEDIA_FAILED / LOAD_FAILED: o receptor não conseguiu buscar o vídeo (fonte fora do ar ou CORS diferente do registrado)
  return /LOAD|MEDIA|NETWORK/i.test(codigo) ? 'cors' : 'unknown';
}
