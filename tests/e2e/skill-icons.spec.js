import { test, expect } from '@playwright/test';

// Ícones das habilidades no jogo real: barra (teclado), botões de toque, tooltip e escolha de classe usam a arte; recarga radial continua funcionando.
const CLASSES = ['warrior', 'mage', 'archer', 'cleric'];
async function criar(page, classe, prefs) {
  if (prefs) await page.addInitScript(([p]) => localStorage.setItem('aetheria_prefs_v1', JSON.stringify(p)), [prefs]);
  await page.goto('/?api=&visual=original');
  await page.click('[data-action="new-char"]');
  await page.click(`[data-action="pick-class"][data-arg="${classe}"]`);
  await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
}
const carregou = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((i) => i.complete && i.naturalWidth > 0), sel);

for (const classe of CLASSES) {
  test(`${classe}: barra de habilidades e botões de toque mostram a arte (não emoji) e a recarga radial gira`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
    await criar(page, classe);
    await page.waitForTimeout(800);
    expect(await carregou(page, '#touch .tbtn.sk img.art')).toEqual([true, true, true]);
    expect(await carregou(page, '#touch .tbtn.pot img.art')).toEqual([true]);
    expect(await carregou(page, '#skillbar .slot.art img.art')).toEqual([true, true, true, true]); // 3 habilidades + poção (barra existe no DOM, oculta no toque)
    // recarga radial: ao usar a habilidade 1 o anel (--p) vai a 1 e o número aparece
    await page.evaluate(() => { const g = window.game; g.player.cds.s0 = 4; });
    await page.waitForTimeout(250);
    const p = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#touch .sk0')).getPropertyValue('--p')));
    expect(p).toBeGreaterThan(0.3);
    await page.screenshot({ path: `test-results/icones-${classe}.png` });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('modo teclado: a barra mostra a arte com a tecla, e o tooltip tem ícone, nome e recarga', async ({ page }) => {
  await criar(page, 'mage', { scale: 100, quality: 'auto', controls: 'keyboard' });
  expect(await carregou(page, '#skillbar .slot.art img.art')).toEqual([true, true, true, true]);
  await page.hover('#slot-s0');
  const tip = page.locator('#tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Bola de Fogo');
  await expect(tip).toContainText('Recarga');
  expect(await tip.locator('img.tt-ic').count()).toBe(1);
  await page.screenshot({ path: 'test-results/icones-teclado.png' });
});

test('escolha de classe lista as habilidades com ícone', async ({ page }) => {
  await page.goto('/?api=&visual=original');
  await page.click('[data-action="new-char"]');
  expect(await carregou(page, '.class-card img.cc-sk')).toEqual(Array(12).fill(true));
});
