import { test, expect } from '@playwright/test';

// Ícones das habilidades no jogo real (o teste de bloqueio sobe o herói ao nv10: habilidade não aprendida mostra 'locked', que vence 'blocked'; ver SKILL_UNLOCK): barra (teclado), botões de toque, tooltip e escolha de classe usam a arte; recarga radial continua funcionando.
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
    expect(await carregou(page, '#touch .tbtn.atk img.art')).toEqual([true]); // ataque básico da classe
    expect(await page.evaluate(() => document.querySelector('#touch .tbtn.atk img.art').src)).toContain(`/attack/atk-${classe}.webp`);
    expect(await carregou(page, '#touch .tbtn.pot img.art')).toEqual([true]);
    expect(await carregou(page, '#skillbar .slot.art img.art')).toEqual([true, true, true, true, true]); // ataque + 3 habilidades + poção (barra existe no DOM, oculta no toque)
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
  expect(await carregou(page, '#skillbar .slot.art img.art')).toEqual([true, true, true, true, true]); // ataque + 3 habilidades + poção
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
  await page.waitForFunction(() => [...document.querySelectorAll('.class-card img.cc-sk')].length === 12 && [...document.querySelectorAll('.class-card img.cc-sk')].every((i) => i.complete && i.naturalWidth > 0));
});

test('categorias e estado indisponível: selo de categoria em cada habilidade, tooltip com categoria e ícone bloqueado quando atordoado', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await criar(page, 'cleric');
  await page.waitForTimeout(500);
  const cats = await page.evaluate(() => [...document.querySelectorAll('#touch .tbtn.sk .cat')].map((c) => c.className.replace('cat cat-', '')));
  expect(cats).toEqual(['cura', 'buff', 'controle']); // Luz Sagrada, Escudo Divino, Julgamento
  expect(await page.evaluate(() => document.querySelectorAll('#skillbar .slot .cat').length)).toBe(3);
  expect(await page.evaluate(() => window.game.ui.tooltipHtml('skill:judgement'))).toContain('Controle');
  await page.evaluate(() => { window.game.char.level = 10; window.game.refreshStats(); window.game.player.stunT = 1; });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => [...document.querySelectorAll('#touch .tbtn.sk')].every((b) => b.classList.contains('blocked')))).toBe(true);
  expect(await page.evaluate(() => ['slot-s0', 'slot-s1', 'slot-s2'].every((id) => document.getElementById(id).classList.contains('blocked')))).toBe(true);
  await page.screenshot({ path: 'test-results/icones-bloqueado.png' });
  await page.evaluate(() => { window.game.player.stunT = 0; });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => document.querySelectorAll('#touch .tbtn.sk.blocked').length)).toBe(0);
  await ctx.close();
});
