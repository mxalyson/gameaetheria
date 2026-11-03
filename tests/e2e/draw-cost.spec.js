import { test, expect } from '@playwright/test';

// Custo de desenho no cliente (P10) com 8 a 50 atores em tela, viewport de celular (844×390).
// ATENÇÃO: o Chromium do Playwright rasteriza por CPU (sem GPU) — os números são PESSIMISTAS e NÃO substituem medição em celular real.
// Cada quadro termina com uma leitura de 1 pixel, que obriga o navegador a concluir a rasterização (sem isso só se mediria o tempo de enfileirar comandos).
// O teste só falha se o desenho ficar absurdamente caro (limite largo); os números medidos vão para o relatório.
test('custo de draw() com 8, 25 e 50 atores (CPU, pessimista)', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?api=&visual=miniatura');
  await page.click('[data-action="new-char"]'); await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  await page.evaluate(() => window.game.enterZone('forest', 700, 900));
  await page.waitForFunction(() => window.heroSprites.drawn > 5);
  const out = await page.evaluate(async () => {
    const g = window.game, w = g.world, res = {}, cx = g.canvas.getContext('2d');
    const base = w.actors.filter((a) => a !== g.player && !a.dead);
    const measure = (n) => {
      const extra = [];
      for (let i = 0; extra.length + 1 < n; i++) {
        const src = base[i % base.length] ?? g.player;
        const c = { ...src, id: 900000 + extra.length, x: g.player.x + Math.cos(i) * (40 + (i % 9) * 22), y: g.player.y + Math.sin(i) * (30 + (i % 7) * 18), dead: false, hp: src.maxHp };
        w.actors.push(c); extra.push(c);
      }
      const ts = [];
      for (let k = 0; k < 90; k++) { const t0 = performance.now(); g.renderer.draw(w, g.cam, { player: g.player }); cx.getImageData(0, 0, 1, 1); /* força a rasterização acabar */ ts.push(performance.now() - t0); }
      for (const c of extra) w.actors.splice(w.actors.indexOf(c), 1);
      ts.sort((a, b) => a - b);
      return { actors: w.actors.length + extra.length, avg: +(ts.reduce((s, x) => s + x, 0) / ts.length).toFixed(2), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(2), max: +ts[ts.length - 1].toFixed(2) };
    };
    for (const n of [8, 25, 50]) res[n] = measure(n);
    // aura de evolução: 25 atores, todos especializados (tier 1) e depois todos com Maestria (tier 2); a diferença para `res[25]` é o custo da aura
    const specs = ['paladin', 'arcane', 'sniper', 'guardian'];
    const withAura = (tier) => { const pl = w.actors.filter((a) => a.kind !== 'mob' && a.kind !== 'spirit'); const old = pl.map((a) => [a.spec, a.mastery]); pl.forEach((a, i) => { a.spec = specs[i % 4]; a.mastery = tier === 2; }); const r = measure(25); pl.forEach((a, i) => { a.spec = old[i][0]; a.mastery = old[i][1]; }); return r; };
    res.aura1 = withAura(1); res.aura2 = withAura(2);
    return res;
  });
  for (const n of [8, 25, 50]) console.log(`# draw() com ~${n} atores: média ${out[n].avg} ms · p95 ${out[n].p95} ms · máx ${out[n].max} ms (CPU headless)`);
  console.log(`# aura (25 atores): sem ${out[25].avg} ms · tier1 ${out.aura1.avg} ms · tier2 ${out.aura2.avg} ms (média por quadro; CPU headless)`);
  expect(out[50].p95).toBeLessThan(80);
  expect(errors).toEqual([]);
});
