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

// ---------- Fase 4: herói jogável ----------
const toScreen = (page, x, y, z) => page.evaluate(([x, y, z]) => {
  const v = window.vale, s = v.scale;
  return { x: v.vw / 2 + (x - y) * 36 * s, y: v.vh / 2 - 290 * s + ((x + y) * 18 - z * 18) * s };
}, [x, y, z]);

test('Vale: terreno caminhável (água bloqueia, ponte libera)', async ({ page }) => {
  await page.goto('/vale.html');
  await page.waitForFunction(() => window.vale?.stats.frames > 5);
  const r = await page.evaluate(() => {
    const v = window.vale;
    return { water: v.heightAt(10.5, 13.5), bridge: v.heightAt(12.5, 8.5), bridgeSide: v.heightAt(12.5, 8.1), land: v.heightAt(6.5, 9.2), out: v.heightAt(-1, 3) };
  });
  expect(r.water).toBeNull();
  expect(r.bridge).toBe(3);
  expect(r.bridgeSide).toBeNull();
  expect(r.land).toBe(3);
  expect(r.out).toBeNull();
});

test('Vale: herói anda no eixo isométrico certo (D = baixo-direita... x+, y-)', async ({ page }) => {
  await page.goto('/vale.html');
  await page.waitForFunction(() => window.vale?.stats.frames > 5);
  const a = await page.evaluate(() => ({ x: window.vale.player.x, y: window.vale.player.y }));
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  const walking = await page.evaluate(() => window.vale.player.state);
  await page.keyboard.up('d');
  const b = await page.evaluate(() => ({ x: window.vale.player.x, y: window.vale.player.y }));
  expect(walking).toBe('walk');
  expect(b.x - a.x).toBeGreaterThan(0.4);
  expect(b.y - a.y).toBeLessThan(-0.4);
});

test('Vale: ataque e Golpe Giratório causam dano real no alvo de treino', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/vale.html');
  await page.waitForFunction(() => window.vale?.stats.frames > 5);
  await page.evaluate(() => { const p = window.vale.player; p.x = 6.7; p.y = 10.1; p.gz = p.z = window.vale.heightAt(6.7, 10.1); });
  const d = await toScreen(page, 7.7, 10.1, await page.evaluate(() => window.vale.dummy.z));
  await page.mouse.move(d.x, d.y);
  await page.mouse.down();
  await page.waitForTimeout(170);
  await page.screenshot({ path: 'test-results/pose-ataque.png' });
  await page.waitForTimeout(450);
  await page.mouse.up();
  const hits = await page.evaluate(() => ({ n: window.vale.dummy.hits, log: window.vale.log.slice() }));
  expect(hits.n).toBeGreaterThanOrEqual(1);
  expect(hits.log[0].amount).toBeGreaterThanOrEqual(1);

  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.vale.dummy.hits);
  await page.keyboard.press('1');
  await page.waitForTimeout(260);
  await page.screenshot({ path: 'test-results/pose-giratorio.png' });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ n: window.vale.dummy.hits, cd: window.vale.player.cds.skill, kinds: window.vale.log.map((l) => l.kind) }));
  expect(after.n).toBeGreaterThan(before);
  expect(after.kinds).toContain('skill');
  expect(after.cd).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});
