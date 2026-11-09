/**
 * Diagnóstico do ambiente do controle remoto. A criptografia (WebCrypto) só existe em páginas seguras (HTTPS ou
 * localhost) e o link do QR precisa abrir no celular: dois motivos comuns de "não conectou" que merecem mensagem clara.
 */
export interface Ambiente {
  /** `window.isSecureContext`. */
  seguro: boolean;
  /** `crypto.subtle` existe? */
  temCripto: boolean;
  /** `location.hostname`. */
  host: string;
}

const PUBLICO = 'https://jkfa.github.io/tv-livre/';

/** Se o controle não pode funcionar nesta página, a mensagem; senão null. */
export function problemaDeAmbiente(a: Ambiente): string | null {
  if (a.seguro && a.temCripto) return null;
  return `O controle pelo celular precisa de uma página segura (HTTPS). Abra o TV Livre por ${PUBLICO} (ou por um túnel HTTPS): em http:// por um endereço de rede (como ${a.host || '192.168.x.x'}) o navegador bloqueia a criptografia.`;
}

/** O endereço só existe neste computador ou nesta rede: o QR code não abriria no celular. */
export function enderecoSoLocal(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || h.endsWith('.local') || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}
export const avisoEnderecoLocal = (host: string): string | null =>
  enderecoSoLocal(host)
    ? `Você abriu o TV Livre por ${host}, um endereço que só existe neste computador ou nesta rede: o QR code não vai abrir no celular. Abra o TV Livre pelo endereço público (${PUBLICO}) neste computador e tente de novo.`
    : null;

export const ambienteAtual = (): Ambiente => ({
  seguro: typeof window !== 'undefined' && window.isSecureContext === true,
  temCripto: typeof globalThis.crypto !== 'undefined' && !!globalThis.crypto.subtle,
  host: typeof window !== 'undefined' ? window.location.hostname : '',
});
