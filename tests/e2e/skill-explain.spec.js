import { test, expect } from '@playwright/test';

// Explicação das habilidades dentro do jogo: segurar o botão abre o cartão sem conjurar; toque curto conjura; painel Habilidades cabe na tela.
test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

async function touchApi(page) {
  const cdp = await page.context().newCDPSession(page);
  const pts = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...pts.values()] });
  return {
    async down(id, x, y) { pts.set(id, { x, y, id }); await send('touchStart'); },
    async up(id) { const p = pts.get(id); pts.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p] }); },
  };
}
const center = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

for (const vp of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`segurar para explicar e painel Habilidades (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize(vp);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?teste=paladino&api=');
    await page.waitForFunction(() => window.game?.player && !document.getElementById('screen').classList.contains('visible'));
    await page.waitForSelector('#hero-loading', { state: 'detached', timeout: 20000 });
    await page.waitForTimeout(500);
    const t = await touchApi(page);
    // segurar 0,7 s o botão 1: cartão aparece, nada é conjurado
    for (const [i, name] of [[0, 'a'], [3, 'b']]) {
      const p = await center(page, `.tbtn.sk${i}`);
      await t.down(1, p.x, p.y);
      await page.waitForTimeout(700);
      await expect(page.locator('#skill-card')).toBeVisible();
      const box = await page.locator('#skill-card').boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(vp.height); expect(box.x).toBeGreaterThanOrEqual(0);
      await page.screenshot({ path: `test-results/skill-explain-${name}-${vp.width}.png` });
      await t.up(1);
      await expect(page.locator('#skill-card')).toBeHidden();
      expect(await page.evaluate(() => window.game.player.cds.s0 + window.game.player.cds.s3)).toBe(0);
    }
    // toque curto conjura
    const p0 = await center(page, '.tbtn.sk0');
    await t.down(2, p0.x, p0.y); await page.waitForTimeout(80); await t.up(2);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.game.player.cds.s0)).toBeGreaterThan(0);
    // painel Habilidades pelo painel Personagem
    await page.evaluate(() => { window.game.ui.closePanels(); window.game.ui.openPanel('skills'); });
    await page.locator('.p-skills .sk-card').first().locator('summary').tap();
    await page.screenshot({ path: `test-results/skill-explain-panel-${vp.width}.png` });
    const pb = await page.evaluate(() => { const r = document.querySelector('.p-skills').getBoundingClientRect(); return { y: r.top, height: r.height }; }); // boundingBox() ignora o zoom da camada de painéis
    expect(pb.y + pb.height).toBeLessThanOrEqual(vp.height);
    await page.locator('.p-skills .sk-card').nth(4).locator('summary').tap();
    await page.locator('.p-skills .body').evaluate((b) => { b.scrollTop = b.scrollHeight; });
    await page.screenshot({ path: `test-results/skill-explain-panel2-${vp.width}.png` });
    expect(errors).toEqual([]);
  });
}

// Regressão (iPhone): o cartão ficava preso quando o toque longo terminava sem o `pointerup` normal (pointercancel, ponteiro perdido, foco perdido). Agora fecha sempre.
test('cartão de explicação nunca fica preso: cancelamento, perda de foco e tempo limite', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?teste=paladino&api=');
  await page.waitForFunction(() => window.game?.player && !document.getElementById('screen').classList.contains('visible'));
  await page.waitForSelector('#hero-loading', { state: 'detached', timeout: 20000 });
  await page.waitForTimeout(500);
  const t = await touchApi(page);
  const p = await center(page, '.tbtn.sk0');
  // 1) pointercancel simulado
  await t.down(1, p.x, p.y); await page.waitForTimeout(700);
  await expect(page.locator('#skill-card')).toBeVisible();
  await page.evaluate(() => document.querySelector('.tbtn.sk0').dispatchEvent(new PointerEvent('pointercancel', { pointerId: [...window.game.touch.btns.keys()][0], bubbles: true })));
  await expect(page.locator('#skill-card')).toBeHidden();
  await t.up(1);
  // 2) perda de foco da janela
  await t.down(2, p.x, p.y); await page.waitForTimeout(700);
  await expect(page.locator('#skill-card')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#skill-card')).toBeHidden();
  await t.up(2);
  // 3) sem nenhum evento de soltar: some sozinho em até 6 s
  await t.down(3, p.x, p.y); await page.waitForTimeout(700);
  await expect(page.locator('#skill-card')).toBeVisible();
  await page.evaluate(() => { const ui = window.game.ui; ui.showSkillCard(0); });
  await expect(page.locator('#skill-card')).toBeHidden({ timeout: 8000 });
  await t.up(3);
});
