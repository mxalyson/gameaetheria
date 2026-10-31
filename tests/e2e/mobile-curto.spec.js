import { test, expect, devices } from '@playwright/test';

// Celular deitado DENTRO do navegador (barra de endereço): ~330 px de altura. O minimapa não pode sumir, nem sobrepor os botões; sem zoom de pinça.
test.use({ ...devices['Pixel 7 landscape'], viewport: { width: 863, height: 330 } });

test('altura curta (330 px): minimapa visível sem sobrepor os botões de toque; navegador sem zoom de pinça', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.tap('[data-action="new-char"]');
  await page.tap('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  await page.evaluate(() => window.game.enterZone('forest', 700, 900));
  await page.waitForTimeout(800);
  const box = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, d: getComputedStyle(document.querySelector(s)).display }; }, sel);
  const mm = await box('#minimap');
  expect(mm.d).not.toBe('none');
  expect(mm.w).toBeGreaterThan(60);
  expect(mm.h).toBeGreaterThan(40);
  for (const sel of ['.tbtn.atk', '.tbtn.sk0', '.tbtn.sk1', '.tbtn.sk2', '.tbtn.pot']) {
    const b = await box(sel);
    const sobrepoe = mm.x < b.x + b.w && mm.x + mm.w > b.x && mm.y < b.y + b.h && mm.y + mm.h > b.y;
    expect(sobrepoe, `minimapa x ${sel}`).toBe(false);
  }
  expect(await page.evaluate(() => getComputedStyle(document.body).touchAction)).toBe('none'); // dois dedos não viram zoom da página
  expect(errors).toEqual([]);
});
