import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Site estático publicado em https://jkfa.github.io/tv-livre/
export default defineConfig({
  base: '/tv-livre/',
  plugins: [
    react(),
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
