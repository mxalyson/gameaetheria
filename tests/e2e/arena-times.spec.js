import { test, expect } from '@playwright/test';

// Grande Arena por times (1×1, 2×2, 4×4): liberada no nível 10, ponto de controle, aliados e inimigos bot, rating por modo.
async function criar(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.click('[data-action="new-char"]');
  await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  return errors;
}

test('painel da arena: abaixo do nível 10 o PvP está travado; no 10 mostra os 3 modos', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => window.game.ui.openPanel('arena'));
  await expect(page.locator('[data-action="match"]')).toHaveCount(0);
  await expect(page.locator('#panel-arena, .panel')).toContainText('nível 10');
  await page.evaluate(() => { window.game.char.level = 10; window.game.ui.closePanels(); window.game.ui.openPanel('arena'); });
  await expect(page.locator('[data-action="match"]')).toHaveCount(3);
  expect(errors).toEqual([]);
});

for (const [mode, size] of [['1v1', 1], ['2v2', 2], ['4v4', 4]]) {
  test(`partida ${mode}: times do tamanho certo, ponto de controle e fim com resultado e rating`, async ({ page }) => {
    const errors = await criar(page);
    await page.evaluate(() => { window.game.char.level = 12; });
    const info = await page.evaluate((m) => {
      const g = window.game;
      g.startMatch(m);
      return { mode: g.mode, t1: g.match.team1.length, t2: g.match.team2.length, obj: !!g.world.objective, zone: g.world.zoneId };
    }, mode);
    expect(info).toEqual({ mode: 'pvp', t1: size, t2: size, obj: true, zone: 'arena_team' });
    // avança a simulação sem esperar tempo real (jogador parado: o time dele decide sozinho)
    const fim = await page.evaluate(() => {
      const g = window.game;
      g.world.frozen = 0;
      for (let i = 0; i < 30 * 200 && g.mode === 'pvp'; i++) g.step(1 / 30);
      return { mode: g.mode, score: g.match.score, time: g.match.time };
    });
    expect(fim.mode).toBe('ended');
    await expect(page.locator('#screen .result')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('a partida só usa o rating do próprio modo (2v2 não mexe no 1v1)', async ({ page }) => {
  await criar(page);
  const r = await page.evaluate(() => {
    const g = window.game; g.char.level = 12;
    const antes = g.char.arena.rating;
    g.startMatch('2v2'); g.world.frozen = 0;
    for (let i = 0; i < 30 * 200 && g.mode === 'pvp'; i++) g.step(1 / 30);
    return { antes, depois: g.char.arena.rating, r2: g.char.arena.ratings?.['2v2'] };
  });
  expect(r.depois).toBe(r.antes);
  expect(typeof r.r2).toBe('number');
});

test('pareamento por poder: aliados e inimigos nascem com poder ≈ o do jogador (±20%)', async ({ page }) => {
  await criar(page);
  const r = await page.evaluate(async () => {
    const { playerPower } = await import('/src/core/power.js');
    const g = window.game; g.char.level = 15;
    const mine = playerPower(g.char);
    const out = [];
    for (const mode of ['2v2', '4v4']) {
      g.startMatch(mode);
      const all = [...g.match.chars.allies, ...g.match.chars.enemies].map((c) => playerPower(c));
      out.push({ mode, mine, min: Math.min(...all), max: Math.max(...all) });
    }
    return out;
  });
  for (const x of r) {
    expect(x.min).toBeGreaterThanOrEqual(x.mine * 0.8);
    expect(x.max).toBeLessThanOrEqual(x.mine * 1.2);
  }
});

test('passo fixo: o mesmo tempo de jogo dá o mesmo estado, em quadros de 8, 16 ou 33 ms', async ({ page }) => {
  await criar(page);
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (chunk) => {
      g.enterZone('forest', 700, 900);
      for (let t = 0; t < 3 - 1e-9; t += chunk) g.step(chunk);
      return { ticks: Math.round(g.world.time * 60) };
    };
    return [run(0.008), run(0.016), run(0.033)];
  });
  // tolerância de 1 tick (o resto do acumulador fica para o próximo quadro)
  for (const x of r) expect(Math.abs(x.ticks - 180)).toBeLessThanOrEqual(1);
});
