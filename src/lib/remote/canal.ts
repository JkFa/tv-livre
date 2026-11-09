/** Envelope cifrado entre computador e celular: monta, cifra, decifra e valida. */
import { validarEnvelope, VERSAO, type Envelope } from './protocolo.ts';
import { cifrar, decifrar, Validador, type Veredito } from './seguranca.ts';

export async function empacotar(chave: CryptoKey, env: Envelope): Promise<string> {
  return cifrar(chave, JSON.stringify(env));
}

export type Aberto = { ok: true; env: Envelope } | { ok: false; erro: 'cifra' | 'forma' | 'versao' | Exclude<Veredito, 'ok'> };

/**
 * Decifra e valida na ordem certa: cifra autenticada → forma → versão → idade/repetição.
 * A versão diferente é um erro à parte para a tela dizer "atualize a página" em vez de falhar em silêncio.
 */
export async function abrir(chave: CryptoKey, payload: string, validador: Validador): Promise<Aberto> {
  const claro = await decifrar(chave, payload);
  if (claro === null) return { ok: false, erro: 'cifra' };
  let json: unknown;
  try {
    json = JSON.parse(claro);
  } catch {
    return { ok: false, erro: 'forma' };
  }
  const env = validarEnvelope(json);
  if (!env) return { ok: false, erro: 'forma' };
  if (env.v !== VERSAO) return { ok: false, erro: 'versao' };
  const v = validador.aceitar(env);
  return v === 'ok' ? { ok: true, env } : { ok: false, erro: v };
}
