/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Endereço do serviço de presença (Cloudflare Worker), ex.: https://tvlivre-presenca.conta.workers.dev. Vazio = sem "assistindo agora". */
  readonly VITE_PRESENCA_URL?: string;
}
