import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'browser.spec.js',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: '../test-results',
  use: {
    baseURL: process.env.GAME_BASE_URL || 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 800 },
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    },
  },
});
