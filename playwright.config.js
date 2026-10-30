import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5174', headless: true, viewport: { width: 1280, height: 720 } },
  webServer: { command: 'node server.js', url: 'http://localhost:5174', reuseExistingServer: true },
});
