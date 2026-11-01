import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// B2: monstro pintado (8 direções, animado por código). Usa uma criatura de TESTE (tests/fixtures, uma estátua do Meshy) injetada no lugar do cavaleiro,
// porque a arte final dos monstros ainda não chegou; o jogo sem arte usa o desenho antigo e não pede arquivos que não existem.
async function entrar(page, qs = '') {
  await page.route('**/assets/mobs/index.json', (r) => r.fulfill({ contentType: 'application/json', body: '{"ids":["knight"]}' }));
  await page.route('**/assets/mobs/knight.json', (r) => r.fulfill({ contentType: 'application/json', body: fs.readFileSync('tests/fixtures/mob-teste.json') }));
  await page.route('**/assets/mobs/knight.webp', (r) => r.fulfill({ contentType: 'image/webp', body: fs.readFileSync('tests/fixtures/mob-teste.webp') }));
  await page.goto('/?api=&visual=original' + qs);
  await page.click('[data-action="new-char"]'); await page.click('[data-action="create"]');
  await page.waitForFunction(() => window.game?.mode === 'explore', null, { timeout: 20000 });
  await page.waitForSelector('#hero-loading', { state: 'detached', timeout: 20000 });
  await page.evaluate(() => { const G = window.game; G.enterZone('ruins', 420, 900); G.player.hp = G.player.maxHp = 99999; });
  await page.waitForTimeout(1200);
}
const mobStats = (page) => page.evaluate(async () => (await import('/src/render/mob-sprites.js')).stats);

test('monstro pintado aparece (e some com ?monstros=original); sem erro de console', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await entrar(page, '&monstros=pintados');
  await page.evaluate(() => { const G = window.game, p = G.player; const k = G.world.actors.find((a) => a.kind === 'mob' && !a.boss); k.mobId = 'knight'; k.x = p.x + 60; k.y = p.y + 20; });
  await page.waitForTimeout(1200);
  const s = await mobStats(page);
  expect(s.loaded).toBe(1); expect(s.drawn).toBeGreaterThan(0);
  const c2 = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }); const p2 = await c2.newPage();
  await entrar(p2, '&monstros=original');
  await p2.evaluate(() => { const G = window.game, p = G.player; const k = G.world.actors.find((a) => a.kind === 'mob' && !a.boss); k.mobId = 'knight'; k.x = p.x + 60; k.y = p.y + 20; });
  await p2.waitForTimeout(800);
  expect((await mobStats(p2)).drawn).toBe(0);
  expect(errors).toEqual([]);
  await ctx.close(); await c2.close();
});

test('sem arte de monstros no índice: nenhum arquivo de monstro é pedido (nada de 404)', async ({ page }) => {
  await page.route('**/assets/mobs/index.json', (r) => r.fulfill({ contentType: 'application/json', body: '{"ids":[]}' })); // índice vazio, independente da arte já entregue
  const reqs = []; page.on('request', (r) => { if (/assets\/mobs\//.test(r.url())) reqs.push(r.url()); });
  const bad = []; page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto('/?api=&visual=original');
  await page.click('[data-action="new-char"]'); await page.click('[data-action="create"]');
  await page.waitForFunction(() => window.game?.mode === 'explore', null, { timeout: 20000 });
  await page.evaluate(() => window.game.enterZone('forest', 900, 900)); await page.waitForTimeout(1500);
  expect(reqs.filter((u) => !/index\.json/.test(u))).toEqual([]);
  expect(bad).toEqual([]);
});
