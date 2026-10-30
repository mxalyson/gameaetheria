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
