import { test, expect } from '@playwright/test';

// Missões, diálogos, baús, mapa-múndi, diário e conquistas no jogo real (modo offline).
async function criar(page, classe = 'warrior') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?api=');
  await page.evaluate(() => localStorage.removeItem('aetheria_save_v1'));
  await page.reload();
  await page.click('[data-action="new-char"]');
  await page.click(`[data-action="pick-class"][data-arg="${classe}"]`);
  await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  return errors;
}
const irAoNpc = async (page, id) => {
  await page.evaluate((nid) => { const g = window.game, n = g.world.zone.npcs.find((x) => x.id === nid); g.player.x = n.x + 30; g.player.y = n.y + 10; }, id);
  await page.waitForFunction((nid) => window.game.nearNpc?.id === nid, id);
};
const matarNoBosque = (page, n, mobId = 'slime') => page.evaluate(([k, id]) => { const g = window.game; for (let i = 0; i < k; i++) g.onMobKilled({ mobId: id, level: 1, x: g.player.x, y: g.player.y, boss: false, elite: false }); }, [n, mobId]);

test('missão completa: diálogo, aceitar, progresso por abates reais, marca "?", entregar, recompensa e conquista', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => window.game.enterZone('town', 1330, 700));
  await irAoNpc(page, 'guard');
  expect(await page.evaluate(() => window.game.computeMarks().guard)).toBe('offer');
  await page.keyboard.press('e');
  await expect(page.locator('.panel')).toContainText('Primeiros Passos');
  await expect(page.locator('.panel')).toContainText('Derrote 5 criaturas');
  await page.click('[data-action="quest-accept"]');
  expect(await page.evaluate(() => Object.keys(window.game.char.quests.active))).toEqual(['primeiros_passos']);
  await page.evaluate(() => window.game.ui.closePanels());
  // abates na zona errada (vila) não contam; no Bosque contam
  await matarNoBosque(page, 3);
  expect(await page.evaluate(() => window.game.char.quests.active.primeiros_passos.p[0])).toBe(0);
  await page.evaluate(() => window.game.enterZone('forest', 300, 950));
  await matarNoBosque(page, 5);
  expect(await page.evaluate(() => window.game.char.quests.active.primeiros_passos.p[0])).toBe(5);
  await expect(page.locator('.toast', { hasText: 'Missão pronta' })).toBeVisible();
  await expect(page.locator('.toast', { hasText: 'Conquista' }).first()).toBeVisible(); // Primeiro Sangue
  await page.evaluate(() => window.game.enterZone('town', 1330, 700));
  await irAoNpc(page, 'guard');
  await page.waitForFunction(() => window.game.computeMarks().guard === 'ready');
  const gold0 = await page.evaluate(() => window.game.char.gold);
  await page.keyboard.press('e');
  await expect(page.locator('.panel')).toContainText('Entregar missão');
  await page.click('[data-action="quest-turnin"]');
  const r = await page.evaluate(() => ({ gold: window.game.char.gold, done: Object.keys(window.game.char.quests.done), quests: window.game.char.stats.quests, ach: Object.keys(window.game.char.achievements) }));
  expect(r.gold).toBeGreaterThanOrEqual(gold0 + 60); expect(r.done).toEqual(['primeiros_passos']); expect(r.quests).toBe(1);
  expect(r.ach).toContain('primeiro_sangue');
  // a próxima missão da cadeia aparece (a recompensa de XP subiu o nível)
  await page.evaluate(() => window.game.ui.closePanels());
  await page.keyboard.press('e');
  await expect(page.locator('.panel')).toContainText('Caça aos Lobos');
  // título: usar a conquista e ver no HUD
  await page.evaluate(() => window.game.ui.closePanels());
  await page.keyboard.press('j');
  await expect(page.locator('.panel')).toContainText('Primeiro Sangue');
  await page.click('[data-action="set-title"][data-arg="primeiro_sangue"]');
  await expect(page.locator('#hud-name')).toContainText('o Novato');
  // persiste ao recarregar
  await page.reload();
  await page.click('[data-action="continue"]');
  expect(await page.evaluate(() => window.game.char.quests.done.primeiros_passos > 0)).toBe(true);
  expect(await page.evaluate(() => window.game.char.title)).toBe('primeiro_sangue');
  expect(errors).toEqual([]);
});

test('baús: abrem com E, pagam, contam, recarregam em 10 min e o mapa e o diário abrem pelas teclas', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => window.game.enterZone('forest', 300, 950));
  await page.evaluate(() => { const c = window.game.world.zone.chests[0]; window.game.player.x = c.x + 20; window.game.player.y = c.y + 20; });
  await page.waitForFunction(() => window.game.nearChest === 'forest:1');
  const g0 = await page.evaluate(() => window.game.char.gold);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.game.char.stats.chests === 1); // a tecla só vale no próximo quadro: espera o efeito (a máquina carregada atrasava)
  const a = await page.evaluate(() => ({ gold: window.game.char.gold, chests: window.game.char.stats.chests, opened: Object.keys(window.game.char.chests) }));
  expect(a.gold).toBeGreaterThan(g0); expect(a.chests).toBe(1); expect(a.opened).toEqual(['forest:1']);
  await page.keyboard.press('e'); // ainda recarregando
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.game.char.stats.chests)).toBe(1);
  await page.evaluate(() => { window.game.char.chests['forest:1'] -= 11 * 60 * 1000; });
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.game.char.stats.chests === 2);
  await page.screenshot({ path: 'test-results/bau.png' });
  await page.keyboard.press('m');
  await expect(page.locator('.panel')).toContainText('Bosque Verdejante');
  await expect(page.locator('.panel')).toContainText('Você está aqui'); // cartão do mapa-múndi: a zona atual vem selecionada
  await page.keyboard.press('j');
  await expect(page.locator('.panel')).toContainText('Baús abertos: 2');
  expect(errors).toEqual([]);
});

test('NPC sem missão abre o serviço direto (como antes); missões de arena real não aparecem no jogo offline', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => { window.game.char.level = 12; window.game.enterZone('town', 1100, 600); });
  await irAoNpc(page, 'arena');
  expect(await page.evaluate(() => window.game.computeMarks().arena ?? null)).toBeNull(); // sem missão: sem marca
  // 1ª conversa offline da sessão: a fala do Doran (sem as filas) abre antes, com o botão do serviço
  await page.keyboard.press('e');
  await expect(page.locator('.panel')).toContainText('Mestre Doran');
  await expect(page.locator('.panel')).toContainText('Sem rede');
  expect(await page.evaluate(() => window.game.dialogNpc)).toBe('arena');
  await expect(page.locator('[data-action="quest-accept"], [data-action="quest-turnin"]')).toHaveCount(0);
  await page.evaluate(() => window.game.ui.closePanels());
  // 2ª conversa: abre a arena direto, como antes
  await page.evaluate(() => { window.game.dialogNpc = null; });
  await page.keyboard.press('e');
  await expect(page.locator('.panel')).toContainText('Mestre Doran');
  await expect(page.locator('[data-action="match"], [data-action="waves"]').first()).toBeVisible();
  expect(await page.evaluate(() => window.game.dialogNpc ?? null)).toBeNull();
  await page.evaluate(() => window.game.ui.closePanels());
  await irAoNpc(page, 'merchant');
  await page.evaluate(() => { const n = window.game.world.zone.npcs.find((x) => x.id === 'merchant'); window.game.player.x = n.x + 30; window.game.player.y = n.y; });
  await page.keyboard.press('e');
  await expect(page.locator('.panel').first()).toContainText('Mercadora Lia');
  expect(errors).toEqual([]);
});

test('mapa: zonas não visitadas mostram o cadeado (sem "${...}" literal)', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => window.game.ui.openPanel('map'));
  // mapa real: nós `.mp-node`; só a Vila vem liberada, o resto mostra o cadeado e, ao tocar, o cartão explica como chegar
  await expect(page.locator('.mp-node')).toHaveCount(8);
  await expect(page.locator('.mp-node.locked')).toHaveCount(7);
  expect(await page.locator('.mp-node:not(.locked)').getAttribute('data-arg')).toBe('town');
  await page.locator('.mp-node[data-arg="ruins"]').click();
  await expect(page.locator('.mp-card')).toContainText('Ainda não visitado');
  await expect(page.locator('.mp-card [data-action="teleport"]')).toHaveCount(0);
  const txt = await page.locator('.panel').first().innerText();
  expect(txt).not.toContain('${');
  await page.evaluate(() => window.game.ui.closeAll?.());
  expect(errors).toEqual([]);
});
