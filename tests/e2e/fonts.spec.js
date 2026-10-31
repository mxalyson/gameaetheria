import { test, expect } from '@playwright/test';

// Fontes locais (P10+): o jogo não pede nada a hosts externos e as fontes carregam do próprio servidor.
test('fontes carregam localmente, sem requisições externas', async ({ page }) => {
  const externas = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) externas.push(r.url()); });
  await page.goto('/?api=');
  await page.evaluate(() => document.fonts.ready);
  const ok = await page.evaluate(async () => {
    await Promise.all([document.fonts.load('800 20px Cinzel'), document.fonts.load('400 14px Nunito'), document.fonts.load('900 14px Nunito')]);
    return ['800 20px Cinzel', '400 14px Nunito', '900 14px Nunito'].map((f) => document.fonts.check(f));
  });
  expect(ok).toEqual([true, true, true]);
  expect(externas).toEqual([]);
});
