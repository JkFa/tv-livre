import { defineConfig, devices } from '@playwright/test';

// BASE_URL aponta para o site publicado; sem ele, testa o build local via `vite preview`.
const remote = process.env.BASE_URL;
const baseURL = remote ?? 'http://localhost:4173/tv-livre/';
// PROJECTS=chromium-desktop,android … restringe os projetos (útil para depurar).
const only = process.env.PROJECTS?.split(',');

const projects = [
  { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
  { name: 'android', use: { ...devices['Pixel 7'] } },
  { name: 'iphone', use: { ...devices['iPhone 14'] } },
  { name: 'safari-desktop', use: { ...devices['Desktop Safari'] } },
].filter((p) => !only || only.includes(p.name));

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // serviceWorkers 'block': com SW controlando a página, o WebKit deixa de aplicar page.route; a suíte de PWA libera o SW.
  use: { baseURL, trace: 'retain-on-failure', locale: 'pt-BR', serviceWorkers: 'block' },
  projects,
  webServer: remote
    ? undefined
    : { command: 'npm run preview', url: baseURL, reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
