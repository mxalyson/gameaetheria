import { test, expect } from '@playwright/test';

// Porto de Marfim no jogo real (offline): banco, quadro de contratos, loja do Porto e duelo amistoso; itens por classe; evolução de spirit; opção de dia e noite.
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
const falarCom = async (page, id) => {
  await page.evaluate((nid) => { const g = window.game, n = g.world.zone.npcs.find((x) => x.id === nid); g.player.x = n.x + 30; g.player.y = n.y + 10; }, id);
  await page.waitForFunction((nid) => window.game.nearNpc?.id === nid, id);
  await page.evaluate((nid) => window.game.talk(window.game.world.zone.npcs.find((x) => x.id === nid)), id);
};

test('banco: tocar na mochila guarda, tocar no banco retira, contador N/40 e persistência', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => window.game.enterZone('harbor', 1500, 920));
  await falarCom(page, 'banker');
  await expect(page.locator('.p-bank')).toContainText('Banco de Marfim');
  await expect(page.locator('.p-bank')).toContainText('0/40');
  await page.evaluate(async () => { // personagem novo tem mochila vazia
    const { generateItem } = await import('/src/core/loot.js'), { makeRng } = await import('/src/core/rng.js'), g = window.game;
    g.char.inventory.push(generateItem(makeRng(1), 3, { classId: 'warrior' }), generateItem(makeRng(2), 3, { classId: 'warrior' }));
    g.ui.render();
  });
  const n0 = await page.evaluate(() => window.game.char.inventory.length);
  expect(n0).toBeGreaterThan(0);
  await page.locator('.p-inventory .cell:not(.empty)').first().click();
  await expect(page.locator('.p-bank')).toContainText('1/40');
  expect(await page.evaluate(() => [window.game.char.inventory.length, window.game.char.bank.length])).toEqual([n0 - 1, 1]);
  await page.reload(); await page.click('[data-action="continue"]');
  expect(await page.evaluate(() => window.game.char.bank.length)).toBe(1);
  await page.evaluate(() => window.game.enterZone('harbor', 1500, 920));
  await falarCom(page, 'banker');
  await page.locator('.p-bank .cell:not(.empty)').first().click();
  await expect(page.locator('.p-bank')).toContainText('0/40');
  expect(await page.evaluate(() => window.game.char.inventory.length)).toBe(n0);
  expect(errors).toEqual([]);
});

test('quadro: 3 contratos, só entrega quando completo, paga uma vez', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => window.game.enterZone('harbor', 1500, 920));
  await falarCom(page, 'hunter');
  await expect(page.locator('.p-board')).toContainText('Quadro de Contratos');
  await expect(page.locator('.p-board .shop-item.daily')).toHaveCount(3);
  await expect(page.locator('.p-board')).toContainText('Novo quadro em');
  await expect(page.locator('[data-action="daily-claim"]')).toHaveCount(0);
  // completa o contrato de baús (progresso direto no documento) e entrega
  const g0 = await page.evaluate(() => window.game.char.gold);
  await page.evaluate(async () => {
    const j = await import('/src/core/journal.js'), c = window.game.char, b = j.dailyBoard(c).find((x) => x.kind === 'chest');
    j.dailyState(c).p[b.id] = b.count; window.game.ui.render();
  });
  await expect(page.locator('[data-action="daily-claim"]')).toHaveCount(1);
  await page.locator('[data-action="daily-claim"]').click();
  await expect(page.locator('.p-board .tag').filter({ hasText: 'Entregue' })).toHaveCount(1);
  expect(await page.evaluate(() => window.game.char.gold)).toBeGreaterThan(g0);
  await expect(page.locator('[data-action="daily-claim"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('loja do Porto: título, estoque do dia com preço, compra e venda a 60%', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => { window.game.char.gold = 99999; window.game.enterZone('harbor', 1500, 920); });
  await falarCom(page, 'dealer');
  await expect(page.locator('.p-shop h2')).toHaveText('Mercador do Porto');
  const itens = page.locator('.p-shop [data-action="buy-item"].btn');
  expect(await itens.count()).toBeGreaterThanOrEqual(4);
  const stock = await page.evaluate(() => window.game.harborStock.map((i) => i.price));
  expect(stock.every((p) => p > 0)).toBe(true);
  await expect(page.locator('#smith-section')).toHaveCount(0);
  const inv0 = await page.evaluate(() => window.game.char.inventory.length);
  const g0 = await page.evaluate(() => window.game.char.gold);
  await itens.first().click();
  expect(await page.evaluate(() => [window.game.char.inventory.length, null])).toEqual([inv0 + 1, null]);
  expect(g0 - (await page.evaluate(() => window.game.char.gold))).toBe(stock[0]);
  // venda: 60% do valor real
  const venda = await page.evaluate(() => { const g = window.game, it = g.char.inventory.at(-1); return { pay: g.sellPrice(it), v: it.value }; });
  expect(venda.pay).toBe(Math.max(1, Math.floor(venda.v * 0.6)));
  expect(errors).toEqual([]);
});

test('duelo amistoso: luta 1x1 sem Elo, ouro nem XP, e volta ao Porto', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => window.game.enterZone('harbor', 1500, 920));
  const antes = await page.evaluate(() => { const c = window.game.char; return JSON.stringify([c.gold, c.xp, c.arena]); });
  await falarCom(page, 'duelist'); // offline: o serviço abre direto (sem missão) e inicia a luta
  await page.waitForFunction(() => window.game.mode === 'pvp' && window.game.match?.friendly === true);
  await page.evaluate(() => { const g = window.game; g.world.frozen = 0; for (const a of g.match.team2) { a.hp = 0; a.dead = true; } });
  await page.waitForFunction(() => window.game.mode === 'ended');
  await expect(page.locator('#screen')).toContainText('Amistoso');
  expect(await page.evaluate(() => { const c = window.game.char; return JSON.stringify([c.gold, c.xp, c.arena]); })).toBe(antes);
  await page.click('[data-action="return-harbor"]');
  await page.waitForFunction(() => window.game.world.zoneId === 'harbor');
  expect(errors).toEqual([]);
});

test('itens por classe, evolução de spirit só com a missão e opção de dia e noite', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(async () => {
    const { generateItem } = await import('/src/core/loot.js'), { makeRng } = await import('/src/core/rng.js');
    const g = window.game, it = generateItem(makeRng(3), 5, { classId: 'mage', slot: 'weapon', weaponType: 'staff', rarityId: 'rare' });
    g.char.inventory.push(it); g.ui.openPanel('inventory');
  });
  const cel = page.locator('.p-inventory .cell.wrong-class');
  await expect(cel).toHaveCount(1);
  await expect(cel).toContainText('Mago');
  await cel.hover();
  await expect(page.locator('#tooltip')).toContainText('Apenas para Mago');
  // spirit no nível 10 sem a missão: sem botão Evoluir, com o texto da missão
  await page.evaluate(async () => {
    const { createSpirit } = await import('/src/core/progression.js'), g = window.game;
    const sp = createSpirit(g.rng, { rarity: 'common' }); sp.level = 10; g.char.spirits = [sp]; g.char.activeSpirit = sp.id; g.char.gold = 99999;
    g.ui.closePanels(); g.ui.openPanel('spirits');
  });
  await expect(page.locator('.p-spirits .evo-note')).toContainText('Sábia Yun');
  await expect(page.locator('[data-action="spirit-evolve"]')).toHaveCount(0);
  await page.evaluate(async () => {
    const { SPIRIT_EVO_QUEST } = await import('/src/data/quests.js'), g = window.game;
    g.char.quests.done[SPIRIT_EVO_QUEST[g.char.spirits[0].type]] = Date.now(); g.ui.render();
  });
  await expect(page.locator('[data-action="spirit-evolve"]')).toHaveCount(1);
  // opções: sem escolha de dia e noite (sempre automático)
  await page.evaluate(() => window.game.ui.openPanel('options'));
  await expect(page.locator('.p-options')).toBeVisible();
  await expect(page.locator('[data-arg^="daynight"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Praça dos Mestres de Estilo: 8 mentores com arte, fala própria, conversa conta para a Prova do Mestre e a escolha só libera depois', async ({ page }) => {
  const errors = await criar(page, 'mage');
  await page.evaluate(async () => {
    const { acceptQuest } = await import('/src/core/journal.js'), g = window.game;
    g.char.level = 16; g.enterZone('harbor', 1500, 560); acceptQuest(g.char, 'prova_do_mestre');
  });
  const npcs = await page.evaluate(() => window.game.world.zone.npcs.filter((n) => n.role === 'mentor').map((n) => n.id));
  expect(npcs).toHaveLength(8);
  await falarCom(page, 'mentor_paladin'); // outra classe: só curiosidade
  await expect(page.locator('.p-dialog')).toContainText('Sir Aurelion');
  await expect(page.locator('.p-dialog')).toContainText('Paladino');
  await expect(page.locator('.p-dialog [data-action="spec"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.game.char.quests.active.prova_do_mestre.p[2])).toBe(0);
  await page.evaluate(() => window.game.ui.closePanels());
  await falarCom(page, 'mentor_arcane');
  await expect(page.locator('.p-dialog')).toContainText('Maga Velyra');
  await expect(page.locator('.p-dialog')).toContainText('Falta a Prova do Mestre'); // sem a prova concluída: sem botão de escolha
  expect(await page.evaluate(() => window.game.char.quests.active.prova_do_mestre.p[2])).toBe(1);
  await page.evaluate(() => window.game.ui.closePanels());
  await falarCom(page, 'mentor_warlock');
  expect(await page.evaluate(() => window.game.char.quests.active.prova_do_mestre.p[2])).toBe(2);
  await page.evaluate(() => { window.game.ui.closePanels(); window.game.char.quests.done.prova_do_mestre = Date.now(); window.game.ui.openPanel('dialog'); }); // prova concluída: o mentor oferece a escolha
  await expect(page.locator('.p-dialog [data-action="spec"][data-arg="warlock"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('loja: sem abas; Selecionar vários marca/desmarca, mostra contador e total, confirma épico e vende só os marcados', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(async () => {
    const { generateItem } = await import('/src/core/loot.js'), { makeRng } = await import('/src/core/rng.js'), g = window.game;
    ['common', 'common', 'uncommon', 'epic'].forEach((r, i) => g.char.inventory.push(generateItem(makeRng(30 + i), 5, { classId: 'warrior', rarityId: r })));
    g.char.equipment.weapon = generateItem(makeRng(99), 5, { classId: 'warrior', slot: 'weapon', rarityId: 'rare' });
    g.char.gold = 10; g.ui.openPanel('shop');
  });
  await expect(page.locator('.p-shop [data-action="shop-tab"]')).toHaveCount(0);
  await expect(page.locator('.p-shop [data-action="buy-item"]').first()).toBeVisible();
  await page.click('[data-action="sel-toggle"]');
  await page.click('[data-action="sel-mark"][data-arg="1"]'); // comuns + incomuns: 3
  await expect(page.locator('.p-inventory .cell.sel')).toHaveCount(3);
  await expect(page.locator('.sel-count')).toContainText('3 marcados');
  await page.locator('.p-inventory .cell:not(.empty)').nth(3).click(); // o épico entra na seleção com 1 toque
  await expect(page.locator('.p-inventory .cell.sel')).toHaveCount(4);
  await page.locator('.p-inventory .cell:not(.empty)').nth(0).click(); // e um comum sai
  await expect(page.locator('.p-inventory .cell.sel')).toHaveCount(3);
  await page.click('[data-action="sell-selected"]');
  await expect(page.locator('.confirm-veil')).toBeVisible(); // épico na seleção: ui.confirm (nunca o confirm() do navegador)
  await page.locator('.confirm-veil [data-yes]').click();
  const r = await page.evaluate(() => ({ inv: window.game.char.inventory.map((i) => i.rarity), eq: window.game.char.equipment.weapon?.rarity, gold: window.game.char.gold }));
  expect(r.inv).toEqual(['common']); expect(r.eq).toBe('rare'); expect(r.gold).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});
