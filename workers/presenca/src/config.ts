/** Intervalos e limites do serviço. O cliente (src/lib/presenca.ts do site) usa os mesmos valores de ping. */
export const CONFIG = {
  /** Difusão do resumo: no máximo uma a cada 3 s (agrupa mudanças) e só se algo mudou. */
  DIFUSAO_MS: 3_000,
  /** Varredura de conexões mortas (e sinal de vida do alarme enquanto houver conexões). */
  VARREDURA_MS: 60_000,
  /** O cliente envia "ping" a cada 60 s (ver custos.mjs: com 30 s, 1.000 simultâneos estouram o plano gratuito). */
  PING_CLIENTE_S: 60,
  /** Conexão sem sinal por este tempo é considerada morta (2,5 pings). */
  MORTA_MS: 150_000,
  /** Só divulga a contagem de um canal quando há pelo menos este número de pessoas (privacidade). */
  MIN_PUBLICO: 3,
  TOP_N: 10,
  /** Limites de abuso. */
  MAX_CONEXOES_POR_IP: 10,
  /** Mensagens do cliente: 1 a cada 2 s, com rajada de 3. */
  MSG_INTERVALO_MS: 2_000,
  MSG_RAJADA: 3,
  MAX_MSG_BYTES: 200,
  MAX_ACESSOS_POR_IP_HORA: 30,
  FUSO: 'America/Sao_Paulo',
} as const;
