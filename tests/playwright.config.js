import { defineConfig, devices } from '@playwright/test';

const externalURL = process.env.CHESS_LAB_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: externalURL || 'http://127.0.0.1:4173/THEBOBSBATH/',
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: externalURL ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/THEBOBSBATH/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
