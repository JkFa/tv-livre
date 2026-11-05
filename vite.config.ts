import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = '/tv-livre/';

// Site estático publicado em https://jkfa.github.io/tv-livre/
export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      base: BASE,
      scope: BASE,
      // O app mostra "Atualizar" quando há versão nova; nunca recarrega sozinho durante a reprodução.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: BASE,
        name: 'TV Livre — TV aberta ao vivo',
        short_name: 'TV Livre',
        description: 'O controle remoto da TV aberta: canais do Brasil e do mundo ao vivo, com zapear e favoritos. Sem cadastro e sem anúncios.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        background_color: '#15110e',
        theme_color: '#15110e',
        categories: ['entertainment', 'video'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        screenshots: [
          { src: 'screenshots/celular-1.png', sizes: '1080x1920', type: 'image/png', form_factor: 'narrow', label: 'Player e grade de canais' },
          { src: 'screenshots/celular-2.png', sizes: '1080x1920', type: 'image/png', form_factor: 'narrow', label: 'Filtros em folha inferior' },
          { src: 'screenshots/desktop-1.png', sizes: '1920x1080', type: 'image/png', form_factor: 'wide', label: 'Player grande ao lado da grade de canais' },
          { src: 'screenshots/desktop-2.png', sizes: '1920x1080', type: 'image/png', form_factor: 'wide', label: 'Tema claro, papel envelhecido' },
        ],
        shortcuts: [
          { name: 'Zapear', short_name: 'Zapear', description: 'Sortear um canal no ar', url: `${BASE}#/zapear`, icons: [{ src: 'icons/shortcut-zapear.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Favoritos', short_name: 'Favoritos', description: 'Abrir seus canais favoritos', url: `${BASE}#/favoritos`, icons: [{ src: 'icons/shortcut-favoritos.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Buscar canal', short_name: 'Buscar', description: 'Buscar um canal pelo nome', url: `${BASE}#/buscar`, icons: [{ src: 'icons/shortcut-buscar.png', sizes: '192x192', type: 'image/png' }] },
        ],
      },
      workbox: {
        // estrutura do app: pré-cache. Dados e vídeo ficam fora do pré-cache.
        globPatterns: ['**/*.{js,css,html,woff2,svg,webmanifest}', 'icons/*.png'],
        globIgnores: ['data/**', 'screenshots/**', 'splash/**', 'og.png', '404.html'],
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/^\/tv-livre\/data\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // sem skipWaiting automático: a atualização só entra quando o usuário aceita ("Atualizar")
        skipWaiting: false,
        runtimeCaching: [
          {
            // dados dos canais: mostra o que está em cache e atualiza em segundo plano
            // ATENÇÃO: esta função é serializada para dentro do service worker; não pode referenciar variáveis de fora.
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin && url.pathname.startsWith('/tv-livre/data/') && !url.pathname.endsWith('health.json'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'tvlivre-dados',
              expiration: { maxEntries: 250, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          // Nada mais é interceptado: transmissões (HLS, YouTube), logos e o contador vão direto para a rede.
        ],
      },
      devOptions: { enabled: false },
    }),
    {
      // GitHub Pages serve 404.html para caminhos desconhecidos; copiamos o index.html
      // para que um reload em qualquer rota nunca caia numa página 404 genérica.
      name: 'spa-404-fallback',
      closeBundle() {
        try {
          copyFileSync(resolve('dist/index.html'), resolve('dist/404.html'));
        } catch {
          /* build parcial */
        }
      },
    },
  ],
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
