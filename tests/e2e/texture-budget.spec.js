import { test, expect } from '@playwright/test';
import { heroBytes } from '../../tools/texture-budget.mjs';

// Memória de textura dos heróis em miniatura por qualidade (P10): o valor REAL carregado no navegador bate com o calculado pelos PNG,
// a escala reduzida economiza o que promete e o herói continua sendo desenhado.
const HEROES = ['paladino', 'aprendiz', 'franco', 'sacerdote'];
const expected = (k) => HEROES.reduce((s, h) => s + heroBytes(h, k), 0);

async function medir(page, qs) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?api=&visual=miniatura' + qs);
  await page.click('[data-action="new-char"]'); await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  await page.evaluate(() => window.game.enterZone('forest', 700, 900));
  let n = 0;
  for (const cls of ['warrior', 'mage', 'archer', 'cleric']) { await page.evaluate((c) => { window.game.player.classId = c; }, cls); n++; await page.waitForFunction((k) => window.heroSprites.loaded >= k, n, { timeout: 30000 }); }
  await page.waitForFunction(() => window.heroSprites.drawn > 20);
  const r = await page.evaluate(() => ({ ...window.heroSprites }));
  expect(errors).toEqual([]);
  return r;
}

test('texturas: a memória carregada bate com o cálculo pelos PNG em cada escala e a escala reduzida economiza', async ({ browser }) => {
  const out = {};
  for (const k of [1, 0.75, 0.5]) {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    out[k] = await medir(page, `&texscale=${k}`);
    await ctx.close();
  }
  for (const k of [1, 0.75, 0.5]) {
    expect(out[k].texScale).toBe(k);
    expect(Math.abs(out[k].texBytes - expected(k)) / expected(k)).toBeLessThan(0.02); // até ±2% (arredondamento por folha)
    expect(out[k].drawn).toBeGreaterThan(20); // o herói continua sendo desenhado com a folha reduzida
  }
  expect(out[0.5].texBytes).toBeLessThan(out[1].texBytes * 0.3);
  expect(out[0.75].texBytes).toBeLessThan(out[1].texBytes * 0.6);
  console.log(`# memória medida no navegador (4 heróis): cheia ${(out[1].texBytes / 1048576).toFixed(1)} MiB · 0,75 ${(out[0.75].texBytes / 1048576).toFixed(1)} MiB · 0,5 ${(out[0.5].texBytes / 1048576).toFixed(1)} MiB`);
});

test('qualidade "baixa" nas opções reduz as texturas sozinha; "alta" mantém a resolução cheia', async ({ browser }) => {
  for (const [q, k] of [['low', 0.5], ['medium', 0.75], ['high', 1]]) {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    await page.addInitScript(([qq]) => localStorage.setItem('aetheria_prefs_v1', JSON.stringify({ scale: 100, quality: qq, controls: 'auto' })), [q]);
    const r = await medir(page, '');
    expect(r.texScale).toBe(k);
    await ctx.close();
  }
});
