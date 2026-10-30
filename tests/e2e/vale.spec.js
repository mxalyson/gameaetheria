import { test, expect } from '@playwright/test';

test('Vale de Auren: renderiza, anima e não gera erros de console', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/vale.html');
  await page.waitForFunction(() => window.vale?.stats.frames > 60, null, { timeout: 20_000 });
  const stats = await page.evaluate(() => ({ ...window.vale.stats }));
  console.log('desempenho do Vale:', JSON.stringify(stats));

  // O canvas não pode estar em branco: precisa ter variedade de cores.
  const colors = await page.evaluate(() => {
    const c = document.getElementById('vale'), g = c.getContext('2d');
    const seen = new Set();
    for (let x = 0; x < c.width; x += 37) for (let y = 0; y < c.height; y += 37) seen.add(g.getImageData(x, y, 1, 1).data.slice(0, 3).join(','));
    return seen.size;
  });
  expect(colors).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});
