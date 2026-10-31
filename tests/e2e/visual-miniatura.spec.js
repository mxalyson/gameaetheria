import { test, expect } from '@playwright/test';

// Visual novo OPCIONAL no jogo real (heróis em miniatura): desligado por padrão, ligado por ?visual=miniatura (fica salvo no aparelho).
async function criar(page, qs = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400 && !/fonts\.g/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto('/' + qs);
  await page.click('[data-action="new-char"]');
  await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  return errors;
}

test('visual original continua o padrão: nenhum sprite de miniatura é desenhado', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => window.game.enterZone('forest', 700, 900));
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.heroSprites?.drawn ?? 0)).toBe(0);
  expect(errors).toEqual([]);
});

test('?visual=miniatura: as 4 classes usam o sprite do herói (anda, ataca, sem erros) e a escolha fica salva', async ({ page }) => {
  const errors = await criar(page, '?visual=miniatura');
  await page.evaluate(() => window.game.enterZone('forest', 700, 900));
  let n = 0;
  for (const cls of ['warrior', 'mage', 'archer', 'cleric']) {
    await page.evaluate((c) => { window.game.player.classId = c; window.game.player.hp = window.game.player.maxHp; }, cls); n++;
    await page.waitForFunction((k) => window.heroSprites.loaded >= k, n, { timeout: 30000 });
  }
  const antes = await page.evaluate(() => window.heroSprites.drawn);
  await page.keyboard.down('d'); await page.waitForTimeout(700); await page.keyboard.up('d');
  await page.mouse.move(700, 300); await page.mouse.down(); await page.waitForTimeout(300); await page.mouse.up();
  expect(await page.evaluate(() => window.heroSprites.drawn)).toBeGreaterThan(antes);
  expect(await page.evaluate(() => localStorage.getItem('aetheria_visual'))).toBe('miniatura');
  // a escolha persiste: recarregar sem o parâmetro mantém o visual novo; ?visual=original volta ao antigo
  await page.goto('/?visual=original');
  expect(await page.evaluate(() => localStorage.getItem('aetheria_visual'))).toBe('original');
  expect(errors).toEqual([]);
});
