import { test, expect } from '@playwright/test';

// Celular em paisagem, com toque de verdade (emulação do Chrome).
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

async function startGame(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[data-action="new-char"]').tap();
  await page.locator('[data-action="create"]').tap();
  await page.waitForFunction(() => window.game?.player && !document.getElementById('screen').classList.contains('visible'));
  await page.waitForSelector('#hero-loading', { state: 'detached', timeout: 20000 }); // a tela "Preparando seu herói" bloqueia o toque até o atlas carregar
  await page.waitForTimeout(400);
}

const center = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

// Toques simultâneos via protocolo do Chrome (a API tap() não arrasta nem faz multitoque).
async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  const pts = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...pts.values()] });
  return {
    async down(id, x, y) { pts.set(id, { x, y, id }); await send('touchStart'); },
    async move(id, x, y) { pts.set(id, { x, y, id }); await send('touchMove'); },
    // No protocolo do Chrome, touchEnd libera exatamente os pontos listados.
    async up(id) { const p = pts.get(id); pts.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p] }); },
  };
}

test('celular: interface de toque aparece e tudo cabe na tela, sem sobreposição', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await startGame(page);
  expect(await page.evaluate(() => document.body.classList.contains('touch'))).toBe(true);
  expect(await page.locator('#skillbar').isVisible()).toBe(false);
  expect(await page.locator('#touch').isVisible()).toBe(true);

  const boxes = await page.evaluate(() => {
    const vis = (s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').map((e) => { const r = e.getBoundingClientRect(); return { s, id: e.className || e.id, x: r.left, y: r.top, w: r.width, h: r.height }; }).filter((b) => b.w > 0);
    return [...vis('.tbtn:not(.hidden)'), ...vis('#hud-player'), ...vis('#hud-zone'), ...vis('#hud-gold')];
  });
  expect(boxes.length).toBeGreaterThanOrEqual(7);
  for (const b of boxes) {
    expect(b.x, b.id).toBeGreaterThanOrEqual(0); expect(b.y, b.id).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w, b.id).toBeLessThanOrEqual(844); expect(b.y + b.h, b.id).toBeLessThanOrEqual(390);
  }
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  // botões de toque são arredondados e em arco: vale a distância entre centros (>= soma dos raios); o resto, retângulos
  const btn = (b) => b.s.startsWith('.tbtn'), mid = (b) => [b.x + b.w / 2, b.y + b.h / 2];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j], hit = btn(A) && btn(B) ? Math.hypot(mid(A)[0] - mid(B)[0], mid(A)[1] - mid(B)[1]) < 1.15 * (A.w + B.w) / 2 : overlap(A, B);
    expect(hit, `${A.id} x ${B.id}`).toBe(false);
  }
  // Alvos de toque: botões de ação com pelo menos 40 px (a escala automática de 70% no celular deixa ~42 px; Apple recomenda 44).
  for (const b of boxes.filter((b) => b.s.startsWith('.tbtn'))) expect(Math.min(b.w, b.h), b.id).toBeGreaterThanOrEqual(40);
  await page.screenshot({ path: 'test-results/mobile-hud.png' });
  expect(errors).toEqual([]);
});

test('joystick move o herói e para ao soltar', async ({ page }) => {
  await startGame(page);
  const t = await touch(page);
  const a = await page.evaluate(() => ({ x: window.game.player.x, y: window.game.player.y }));
  await t.down(1, 150, 260);
  await t.move(1, 150 + 60, 260);
  await expect(page.locator('#stick')).toBeVisible({ timeout: 4000 }); // com os heróis em miniatura carregando, o quadro pode atrasar
  // espera o EFEITO (andou >40 px), não um tempo fixo: sob carga o quadro atrasa
  await page.waitForFunction((x0) => window.game.player.x - x0 > 40, a.x, { timeout: 15000, polling: 50 });
  const b = await page.evaluate(() => ({ x: window.game.player.x, y: window.game.player.y }));
  await page.screenshot({ path: 'test-results/mobile-joystick.png' });
  await t.up(1);
  expect(b.x - a.x).toBeGreaterThan(40);
  expect(Math.abs(b.y - a.y)).toBeLessThan(15);
  // parou: a posição fica igual por 6 quadros seguidos (em vez de 400+300 ms fixos)
  await page.waitForFunction(() => new Promise((res) => { let last = window.game.player.x, n = 0; const f = () => { const x = window.game.player.x; n = Math.abs(x - last) < 0.5 ? n + 1 : 0; last = x; if (n >= 6) res(true); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), null, { timeout: 15000 });
  expect(await page.locator('#stick').isVisible()).toBe(false);
});

test('botões: ataque (segurar), habilidade com auto-mira, esquiva/poção e multitoque', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { const g = window.game; g.enterZone('forest', 600, 900); g.player.hp = g.player.maxHp = 99999; });
  await page.waitForFunction(() => window.game.world.zoneId === 'forest' && window.game.world.actors.some((a) => a.kind === 'mob'), null, { polling: 50 });
  // Um inimigo à direita e acima do herói, dentro do alcance de auto-mira.
  await page.evaluate(() => {
    const g = window.game, p = g.player;
    g.world.actors.filter((a) => a.kind === 'mob').forEach((m) => { m.x = -999; m.y = -999; });
    const m = g.world.actors.find((a) => a.kind === 'mob'); m.x = p.x + 120; m.y = p.y - 60; m.ai.target = null;
    window.__mob = m.id;
  });
  const aim = await page.evaluate(() => { const g = window.game; const r = g.touch.read(g.player, g.world); const m = g.world.byId(window.__mob); return { ax: r.aimX, ay: r.aimY, mx: m.x, my: m.y }; });
  expect(Math.abs(aim.ax - aim.mx)).toBeLessThan(1);
  expect(Math.abs(aim.ay - aim.my)).toBeLessThan(1);

  const t = await touch(page);
  const atk = await center(page, '.tbtn.atk');
  await t.down(1, atk.x, atk.y);
  await page.waitForFunction(() => window.game.player.cds.basic > 0, null, { timeout: 10000, polling: 50 });
  // multitoque: com o ataque pressionado, usa a habilidade 1.
  const sk = await center(page, '.tbtn.sk0');
  await t.down(2, sk.x, sk.y);
  await t.up(2);
  await page.waitForFunction(() => window.game.player.cds.s0 > 1, null, { timeout: 10000, polling: 50 });
  await page.screenshot({ path: 'test-results/mobile-combate.png' });
  await t.up(1);
  expect(await page.evaluate(() => window.game.touch.attack)).toBe(false);

  // Poção: só gasta se estiver ferido.
  await page.evaluate(() => { const g = window.game; g.player.hp = g.player.maxHp * 0.5; });
  const pots = await page.evaluate(() => window.game.char.potions);
  const pot = await center(page, '.tbtn.pot');
  await page.touchscreen.tap(pot.x, pot.y);
  await page.waitForFunction((n) => window.game.char.potions === n, pots - 1, { timeout: 10000, polling: 50 });
});

test('painéis cabem na tela horizontal; opções mudam escala, qualidade e persistem', async ({ page }) => {
  await startGame(page);
  const fits = async (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; }, sel);
  await page.keyboard.press('Escape');
  await page.locator('[data-arg="inventory"]').tap();
  await page.locator('[data-arg="character"]').first().tap().catch(() => {});
  await page.waitForFunction(() => window.game.ui.open.has('inventory'), null, { timeout: 10000, polling: 50 });
  await page.evaluate(() => { window.game.ui.open.add('inventory'); window.game.ui.open.add('character'); window.game.ui.render(); });
  expect(await fits('#panel-layer')).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-paineis.png' });
  await page.evaluate(() => window.game.ui.closePanels());

  await page.locator('[data-arg="options"]').tap();
  await expect(page.locator('.p-options')).toBeVisible();
  expect(await fits('.p-options')).toBe(true);
  const before = await page.evaluate(() => document.getElementById('hud-player').getBoundingClientRect().width);
  await page.locator('[data-arg="scale:+10"]').tap();
  await page.locator('[data-arg="scale:+10"]').tap();
  await page.locator('[data-arg="scale:+10"]').tap();
  const after = await page.evaluate(() => document.getElementById('hud-player').getBoundingClientRect().width);
  expect(after).toBeGreaterThan(before * 1.2);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui').trim())).toBe('1'); // padrão automático (70% em 844×390) + 3 toques de +10: 80, 90, 100
  expect(await fits('.p-options')).toBe(true);
  await page.locator('[data-arg="quality:low"]').tap();
  expect(await page.evaluate(() => window.game.renderer.quality)).toBe(0);
  await page.screenshot({ path: 'test-results/mobile-opcoes.png' });

  await page.reload();
  await page.waitForFunction(() => window.game);
  expect(await page.evaluate(() => ({ s: window.game.prefs.scale, q: window.game.prefs.quality }))).toEqual({ s: 100, q: 'low' });
  expect(await page.evaluate(() => window.game.renderer.quality)).toBe(0);
});

test('item no inventário: 1º toque mostra detalhes, 2º toque equipa', async ({ page }) => {
  await startGame(page);
  const newId = await page.evaluate(async () => {
    const { generateItem } = await import('/src/core/loot.js');
    const { makeRng } = await import('/src/core/rng.js');
    const g = window.game;
    const it = generateItem(makeRng(5), 1, { classId: g.char.classId, slot: 'armor', rarityId: 'rare' }); // itens são por classe: só equipa o da própria classe
    g.char.inventory.push(it);
    g.ui.open.add('inventory'); g.ui.render();
    return it.id;
  });
  const cell = page.locator(`[data-tip="item:${newId}"]`);
  await cell.tap();
  await expect(page.locator('#tooltip')).toBeVisible();
  expect(await page.evaluate(() => window.game.char.equipment.armor.id)).not.toBe(newId);
  await page.screenshot({ path: 'test-results/mobile-item.png' });
  await cell.tap();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.game.char.equipment.armor.id)).toBe(newId);
});

test('retrato: pede para girar o aparelho; paisagem esconde o aviso', async ({ page }) => {
  await startGame(page);
  expect(await page.locator('#rotate-hint').isVisible()).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#rotate-hint')).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-retrato.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#rotate-hint')).toBeHidden();
});

test('telas de título e criação de personagem cabem na paisagem', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/mobile-titulo.png' });
  await page.locator('[data-action="new-char"]').tap();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/mobile-criacao.png' });
  const r = await page.evaluate(() => { const c = document.querySelector('.create-wrap'), b = document.querySelector('[data-action="create"]').getBoundingClientRect(); return { cw: c.getBoundingClientRect().height, ch: innerHeight, btnTop: b.top, btnBottom: b.bottom }; });
  expect(r.cw).toBeLessThanOrEqual(r.ch);
  expect(r.btnBottom).toBeLessThanOrEqual(r.ch);
});

test('HUD pintado: nenhum desfoque de fundo atrás dos vidros de vida/mana e dos medalhões', async ({ page }) => {
  await startGame(page);
  const bf = await page.evaluate(() => [...document.querySelectorAll('#hud, #hud *')].filter((e) => getComputedStyle(e).backdropFilter !== 'none').map((e) => e.id || e.className));
  expect(bf).toEqual([]);
});
