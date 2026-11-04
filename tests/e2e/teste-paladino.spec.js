import { test, expect } from '@playwright/test';

// Modo ?teste=paladino: sandbox Nv25, nada grava no save real do aparelho.
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

test('?teste=paladino: Paladino Nv25 em sandbox, sem tocar no save real', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const SAVE = JSON.stringify({ marcador: 'save-real-intacto' });
  await page.addInitScript((s) => { if (!sessionStorage.getItem('semeado')) { localStorage.setItem('aetheria_save_v1', s); sessionStorage.setItem('semeado', '1'); } }, SAVE);
  await page.goto('/?teste=paladino&api=');
  await page.waitForFunction(() => window.game?.player && !document.getElementById('screen').classList.contains('visible'));
  await page.waitForSelector('#hero-loading', { state: 'detached', timeout: 20000 });
  const look = await page.evaluate(async () => {
    const { heroLook } = await import('/src/render/hero-sprites.js');
    return { ...heroLook(window.game.player), cls: window.game.char.classId, lvl: window.game.char.level, shield: window.game.char.equipment.offhand?.rarity };
  });
  expect(look).toMatchObject({ spec: 'paladin', tier: 2, atlasVariant: 'paladin_nv25', cls: 'warrior', lvl: 25, shield: 'legendary' });
  await expect(page.locator('#teste-bar')).toContainText('MODO TESTE');
  // alterna para o Guerreiro base e para o Bosque sem recarregar
  await page.locator('#teste-base').click();
  await page.waitForSelector('#hero-loading', { state: 'detached', timeout: 20000 });
  expect(await page.evaluate(async () => (await import('/src/render/hero-sprites.js')).heroLook(window.game.player).tier)).toBe(0);
  await page.locator('#teste-bosque').click();
  expect(await page.evaluate(() => window.game.world.zoneId)).toBe('forest');
  await page.locator('#teste-evo').click();
  expect(await page.evaluate(() => window.game.player.spec)).toBe('paladin');
  // o save real continua exatamente como estava
  expect(await page.evaluate(() => localStorage.getItem('aetheria_save_v1'))).toBe(SAVE);
  expect(await page.evaluate(() => localStorage.getItem('aetheria_save_v1_backup'))).toBeNull();
  expect(errors).toEqual([]);
});
