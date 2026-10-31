import { test, expect } from '@playwright/test';

// PWA (P10): manifesto válido com ícones PNG, service worker registrado e jogo reabrindo sem rede.
test.use({ serviceWorkers: 'allow' });

test('manifesto tem ícones PNG 192/512/maskable e todos existem', async ({ page, request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json();
  const sizes = m.icons.filter((i) => i.type === 'image/png').map((i) => `${i.sizes}:${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  expect(m.orientation).toBe('landscape');
  for (const i of m.icons) expect((await request.get('/' + i.src)).ok(), i.src).toBe(true);
});

test('service worker controla a página e o jogo reabre offline', async ({ page, context }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?api=');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // agora a página já nasce controlada
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.locator('[data-action="new-char"]')).toBeVisible();
  await page.waitForTimeout(1500); // deixa o cache encher (módulos carregados na 2ª visita)
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-action="new-char"]')).toBeVisible();
  await page.click('[data-action="new-char"]'); await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
