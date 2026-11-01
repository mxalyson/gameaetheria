import { test, expect } from '@playwright/test';

// Cenário em sprites (modelos 3D do Stylized Nature MegaKit fotografados): aparece no Bosque e nas Ruínas, o interruptor ?cenario=original volta ao desenho antigo,
// e o custo de desenho não piora. Medida em CPU (Chromium sem GPU), só tempo de JS, sem ler pixels.
async function entrar(page, zona, modo) {
  await page.goto('/?api=&visual=original&cenario=' + modo);
  await page.click('[data-action="new-char"]'); await page.click('[data-action="create"]');
  await page.waitForFunction(() => window.game?.mode === 'explore', null, { timeout: 15000 });
  await page.evaluate((z) => { window.game.enterZone(z, 900, 900); window.game.player.hp = window.game.player.maxHp = 99999; }, zona);
}

for (const zona of ['forest', 'ruins']) {
  test(`${zona}: sprites aparecem (e somem com ?cenario=original)`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
    await entrar(page, zona, 'natureza');
    await page.waitForFunction(() => window.natureStats?.drawn > 0, null, { timeout: 10000 });
    expect(await page.evaluate(() => window.natureStats.sprites)).toBeGreaterThanOrEqual(30);
    await ctx.close();
    const c2 = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }); const p2 = await c2.newPage();
    await entrar(p2, zona, 'original'); await p2.waitForTimeout(1200);
    expect(await p2.evaluate(() => window.natureStats?.drawn ?? 0)).toBe(0);
    expect(errors).toEqual([]);
    await c2.close();
  });
}

test('custo de desenho no Bosque: sprites não pesam mais que o desenho antigo (CPU, só JS)', async ({ browser }) => {
  const medir = async (modo) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }); const page = await ctx.newPage();
    await entrar(page, 'forest', modo); await page.waitForTimeout(1500);
    const r = await page.evaluate(async () => { const g = window.game; const ts = []; for (let i = 0; i < 120; i++) { const t0 = performance.now(); g.renderer.draw(g.world, g.cam, { player: g.player }); ts.push(performance.now() - t0); await new Promise((r2) => requestAnimationFrame(r2)); } ts.sort((a, b) => a - b); return { avg: ts.reduce((a, b) => a + b, 0) / ts.length, p95: ts[Math.floor(ts.length * 0.95)] }; });
    await ctx.close(); return r;
  };
  const n = await medir('natureza'), o = await medir('original');
  console.log(`# desenho no Bosque: sprites média ${n.avg.toFixed(2)} ms (p95 ${n.p95.toFixed(2)}) · antigo ${o.avg.toFixed(2)} ms (p95 ${o.p95.toFixed(2)})`);
  expect(n.avg).toBeLessThan(o.avg + 2); // no máximo 2 ms a mais (na prática costuma ser menor)
});

test('chão em sprites: flores, trevos e pedras de trilha carimbados no terreno', async ({ page }) => {
  await page.goto('/?api=&cenario=natureza');
  await page.click('[data-action="new-char"]'); await page.click('[data-action="create"]');
  await page.waitForFunction(() => window.game?.mode === 'explore', null, { timeout: 20000 });
  await page.evaluate(() => window.game.enterZone('forest', 420, 900));
  await page.waitForFunction(() => window.natureStats?.ground > 500, null, { timeout: 15000 });
});
