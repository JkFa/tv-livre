import { defineConfig, devices } from '@playwright/test';

// BASE_URL aponta para o site publicado; sem ele, testa o build local via `vite preview`.
const remote = process.env.BASE_URL;
const baseURL = remote ?? 'http://localhost:4173/tv-livre/';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure', locale: 'pt-BR' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: remote
    ? undefined
    : { command: 'npm run preview', url: baseURL, reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
