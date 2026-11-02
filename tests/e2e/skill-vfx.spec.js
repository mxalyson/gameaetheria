import { test, expect } from '@playwright/test';

// Efeitos das 12 habilidades no jogo real (herói nv10: as habilidades liberam nos nv 1/5/10, SKILL_UNLOCK; abaixo disso a simulação ignora o lançamento): cada lançamento (evento `cast` real da simulação) gera o efeito certo; sem erros; nada muda na mecânica.
const KIND = { whirlwind: 'whirl', charge: 'dashtrail', warcry: 'warcry', fireball: 'muzzle', frostnova: 'frost', blink: 'blink', rain: 'rain', pierce: 'pierce', roll: 'roll', holylight: 'sun', divineshield: 'bubble', judgement: 'beam' };
const CLASSES = { warrior: ['whirlwind', 'charge', 'warcry'], mage: ['fireball', 'frostnova', 'blink'], archer: ['rain', 'pierce', 'roll'], cleric: ['holylight', 'divineshield', 'judgement'] };

for (const [classe, skills] of Object.entries(CLASSES)) {
  test(`${classe}: as 3 habilidades geram o efeito próprio e a mecânica segue igual`, async ({ browser }) => {
    test.setTimeout(60_000); // criar personagem + 3 lançamentos com captura; com a máquina carregada 30 s não bastava
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?api=&visual=original');
    await page.click('[data-action="new-char"]'); await page.click(`[data-action="pick-class"][data-arg="${classe}"]`); await page.click('[data-action="create"]');
    await page.waitForFunction(() => window.game?.mode === 'explore');
    await page.evaluate(() => { window.game.char.level = 10; window.game.refreshStats(); window.game.enterZone('forest', 700, 900); document.getElementById('toast-layer').style.display = 'none'; });
    await page.waitForTimeout(600);
    for (let i = 0; i < 3; i++) {
      const id = skills[i];
      const r = await page.evaluate(([idx]) => {
        const g = window.game, p = g.player;
        p.cds.s0 = p.cds.s1 = p.cds.s2 = 0; p.dead = false; p.hp = p.maxHp;
        g.world.svfx = []; const before = p.cds['s' + idx];
        const ok = g.world.castSkill(p, idx, p.x + 200, p.y + 20);
        return { ok, cdSet: p.cds['s' + idx] > 0, before };
      }, [i]);
      expect(r.ok).toBe(true); expect(r.cdSet).toBe(true); // a simulação lançou e aplicou a recarga como sempre
      // o evento 'cast' vira efeito no quadro seguinte; espera por condição (e não por tempo fixo: o clarão da Bola de Fogo dura só 0,3 s e a máquina carregada atrasava)
      await page.waitForFunction((k) => (window.game.world.svfx ?? []).some((f) => f.kind === k), KIND[id], { timeout: 3000 });
      const kinds = await page.evaluate(() => (window.game.world.svfx ?? []).map((f) => f.kind));
      expect(kinds, id).toContain(KIND[id]);
      await page.screenshot({ path: `test-results/vfx-${id}.png`, clip: { x: 150, y: 40, width: 540, height: 300 } });
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

// Custo de desenho com muitos efeitos ao mesmo tempo (CPU do Chromium sem GPU: pessimista; só tempo de JS do desenho, SEM ler pixels, que rebaixaria o canvas).
test('custo: 8 efeitos simultâneos (6 habilidades + 2 repetidas) não pesam no desenho', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?api=&visual=original');
  await page.click('[data-action="new-char"]'); await page.click('[data-action="create"]');
  await page.waitForFunction(() => window.game?.mode === 'explore');
  await page.evaluate(() => window.game.enterZone('forest', 700, 900));
  await page.waitForTimeout(800);
  const r = await page.evaluate(async () => {
    const { spawnSkillVfx } = await import('/src/render/skill-vfx.js');
    const g = window.game, w = g.world, p = g.player;
    const medir = async () => { const ts = []; for (let i = 0; i < 90; i++) { const t0 = performance.now(); g.renderer.draw(w, g.cam, { player: p }); ts.push(performance.now() - t0); await new Promise((r2) => requestAnimationFrame(r2)); } ts.sort((a, b) => a - b); return { avg: ts.reduce((a, b) => a + b, 0) / ts.length, p95: ts[Math.floor(ts.length * 0.95)] }; };
    w.svfx = [];
    const sem = await medir();
    const ids = ['whirlwind', 'frostnova', 'rain', 'holylight', 'divineshield', 'warcry', 'whirlwind', 'frostnova'];
    const manter = setInterval(() => { w.svfx.length = 0; for (const id of ids) spawnSkillVfx(w, { actor: p, skill: id, ang: 0, tx: p.x + 150, ty: p.y }); }, 120);
    const com = await medir(); clearInterval(manter);
    return { sem, com, ativos: w.svfx.length };
  });
  console.log(`# desenho sem efeitos: média ${r.sem.avg.toFixed(2)} ms · p95 ${r.sem.p95.toFixed(2)} | com 8 efeitos: média ${r.com.avg.toFixed(2)} ms · p95 ${r.com.p95.toFixed(2)} (CPU headless, só JS)`);
  expect(r.com.avg - r.sem.avg).toBeLessThan(3);
});
