import { test, expect } from '@playwright/test';

// Barra de 4 botões: o 4º (s3 / .sk3) é a Maestria — bloqueado com cadeado "Nv 25" abaixo do nível, "25 Maestria" ao
// atingir o nível sem a missão, e liberado só ao concluir a missão `maestria` (core/unlocks.js). Mais: fala do Doran offline.
async function criar(page, classe = 'warrior') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?api=');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('[data-action="new-char"]');
  await page.click(`[data-action="pick-class"][data-arg="${classe}"]`);
  await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  await page.waitForFunction(() => window.game?.player);
  return errors;
}
const nivel = (page, n) => page.evaluate((lv) => { const g = window.game; g.char.level = lv; g.refreshStats(); }, n);
// conclui a missão pelo caminho real: requisito, aceitar, eventos de abate de chefe e de uso de habilidade, entregar
const concluirMaestria = (page) => page.evaluate(() => {
  const g = window.game;
  g.char.quests.done.prova_do_mestre = Date.now();
  g.questAccept('maestria');
  for (let i = 0; i < 3; i++) g.gameEvent({ type: 'kill', boss: true, mobId: 'oak_ancient', zoneId: 'forest', level: 25 });
  for (let i = 0; i < 50; i++) g.gameEvent({ type: 'skill', skillId: g.char.classId });
  g.questTurnIn('maestria');
  return g.char.quests.done.maestria != null;
});
// o cadeado é um ::after com "Nv " + var(--lv); lê o texto renderizado, não só a classe
const cadeado = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return { locked: e.classList.contains('locked'), lv: e.style.getPropertyValue('--lv'), content: getComputedStyle(e, '::after').content }; }, sel);

test.describe('toque', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('botão sk3 da Maestria: cadeado "Nv 25" abaixo do nível, "Maestria" sem a missão, liberado ao concluí-la', async ({ page }) => {
    const errors = await criar(page);
    await page.waitForSelector('#hero-loading', { state: 'detached', timeout: 20000 });
    await expect(page.locator('#touch .tbtn.sk')).toHaveCount(4);
    // abaixo do nível 25
    await nivel(page, 10);
    await page.waitForFunction(() => document.querySelector('#touch .sk3')?.classList.contains('locked'), null, { polling: 100 });
    let c = await cadeado(page, '#touch .sk3');
    expect(c.lv).toBe('"25"');
    expect(c.content).toContain('Nv 25');
    // no nível 25, sem a missão: continua bloqueado e avisa "Maestria"
    await nivel(page, 25);
    await page.waitForFunction(() => document.querySelector('#touch .sk3')?.style.getPropertyValue('--lv').includes('Maestria'), null, { polling: 100 });
    c = await cadeado(page, '#touch .sk3');
    expect(c.locked).toBe(true);
    expect(c.content).toContain('Maestria');
    // um toque no botão bloqueado não dispara a habilidade
    expect(await page.evaluate(() => window.game.player.cds.s3 ?? 0)).toBe(0);
    const box = await page.locator('#touch .sk3').boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    expect(await page.evaluate(() => window.game.player.cds.s3 ?? 0)).toBe(0);
    // conclui a missão: libera
    expect(await concluirMaestria(page)).toBe(true);
    await page.waitForFunction(() => !document.querySelector('#touch .sk3')?.classList.contains('locked'), null, { polling: 100 });
    expect(await page.evaluate(() => window.game.player.mastery)).toBe(true);
    expect((await cadeado(page, '#touch .sk3')).locked).toBe(false);
    expect(errors).toEqual([]);
  });
});

test('barra do teclado/mouse (desktop): slot s3 bloqueado e depois liberado pela Maestria', async ({ page }) => {
  const errors = await criar(page, 'mage');
  await nivel(page, 10);
  await expect(page.locator('#slot-s3')).toHaveClass(/locked/);
  expect(await page.locator('#slot-s3').evaluate((e) => e.style.getPropertyValue('--lv'))).toBe('"25"');
  await nivel(page, 25);
  await page.waitForFunction(() => document.querySelector('#slot-s3')?.style.getPropertyValue('--lv').includes('Maestria'), null, { polling: 100 });
  await expect(page.locator('#slot-s3')).toHaveClass(/locked/);
  expect(await concluirMaestria(page)).toBe(true);
  await expect(page.locator('#slot-s3')).not.toHaveClass(/locked/);
  expect(errors).toEqual([]);
});

test('Doran offline: 1ª conversa mostra a fala "Sem rede" com o botão do serviço; a 2ª abre a arena direto; sem filas online', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => { window.game.char.level = 12; window.game.enterZone('town', 1100, 600); });
  const irAoDoran = async () => {
    await page.evaluate(() => { const g = window.game, n = g.world.zone.npcs.find((x) => x.id === 'arena'); g.player.x = n.x + 30; g.player.y = n.y + 10; });
    await page.waitForFunction(() => window.game.nearNpc?.id === 'arena', null, { polling: 100 });
  };
  await irAoDoran();
  expect(await page.evaluate(() => window.game.computeMarks().arena ?? null)).toBeNull();
  await page.keyboard.press('e');
  await expect(page.locator('.panel')).toContainText('Mestre Doran');
  await expect(page.locator('.panel')).toContainText('Sem rede');
  await expect(page.locator('[data-action="net-queue"]')).toHaveCount(0); // offline: nada de filas online
  await expect(page.locator('[data-action="quest-accept"], [data-action="quest-turnin"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.game.dialogNpc)).toBe('arena');
  await page.evaluate(() => { window.game.ui.closePanels(); window.game.dialogNpc = null; });
  await page.keyboard.press('e');
  await expect(page.locator('[data-action="match"], [data-action="waves"]').first()).toBeVisible();
  expect(await page.evaluate(() => window.game.dialogNpc ?? null)).toBeNull();
  expect(errors).toEqual([]);
});
