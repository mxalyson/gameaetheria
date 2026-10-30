import { defineConfig } from '@playwright/test';

// Medição de desempenho (separada da suíte normal: leva minutos e depende da GPU da máquina).
export default defineConfig({
  testDir: '.',
  timeout: 600_000,
  workers: 1,
  webServer: { command: 'node ../../server.js', url: 'http://localhost:5174', reuseExistingServer: true },
});
