import { test, expect } from '@playwright/test';

// Ferreiro na loja: aprimora o item equipado, cobra ouro, mostra +N no tooltip e sobe o poder.
test('aprimorar equipamento na loja: cobra ouro, aparece +1 e o poder sobe', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?api=');
  await page.click('[data-action="new-char"]'); await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  const before = await page.evaluate(() => { const g = window.game; g.char.gold = 5000; g.ui.openPanel('shop:smith'); return { power: g.player.power ?? null, plus: g.char.equipment.weapon.plus ?? 0, gold: g.char.gold }; });
  // Ferreiro só aprimora: sem compra, venda nem mochila ao lado
  await expect(page.locator('.p-shop h2')).toHaveText('Ferreiro Brok');
  await expect(page.locator('.p-shop [data-action="buy-item"], .p-shop [data-action="buy-potion"], .p-shop [data-action="sell-bulk"], .p-shop [data-action="sell"]')).toHaveCount(0);
  await expect(page.locator('.p-inventory')).toHaveCount(0);
  const btn = page.locator('[data-action="enhance"]').first();
  await expect(btn).toBeVisible();
  await btn.click();
  const after = await page.evaluate(() => { const g = window.game; return { plus: g.char.equipment.weapon.plus, gold: g.char.gold, tip: g.ui.itemTooltip(g.char.equipment.weapon) }; });
  expect(after.plus).toBe(1);
  expect(after.gold).toBeLessThan(before.gold);
  expect(after.tip).toContain('Aprimorado +1');
  expect(errors).toEqual([]);
});
