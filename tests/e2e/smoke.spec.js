import { test, expect } from '@playwright/test';

test('cria personagem, entra na vila e se move sem erros de console', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await page.click('[data-action="new-char"]');
  await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);

  const before = await page.evaluate(() => ({ x: window.game.player.x, y: window.game.player.y }));
  await page.keyboard.down('d');
  await page.waitForTimeout(600);
  await page.keyboard.up('d');
  const after = await page.evaluate(() => ({ x: window.game.player.x, y: window.game.player.y }));

  expect(after.x).toBeGreaterThan(before.x + 20);
  expect(errors.filter((e) => !/fonts\.g(oogleapis|static)/.test(e))).toEqual([]);
});

test('Todas as zonas com cenário rico carregam, desenham e rodam sem erros de console', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('[data-action="new-char"]');
  await page.click('[data-action="create"]');
  for (const zone of ['forest', 'ruins', 'plains', 'town']) {
    await page.evaluate((z) => window.game.enterZone(z, 700, 900), zone);
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => ({ zone: window.game.world.zoneId, ponds: window.game.world.layout.ponds.length, runes: window.game.world.layout.runes.length, trail: window.game.world.layout.trail.length }));
    expect(info.zone).toBe(zone);
    if (zone !== 'town') expect(info.trail).toBeGreaterThan(10);
  }
  expect(errors.filter((e) => !/fonts\.g(oogleapis|static)/.test(e))).toEqual([]);
});
