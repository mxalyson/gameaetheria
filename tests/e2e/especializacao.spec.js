import { test, expect } from '@playwright/test';

// Especialização de classe (nível 15): bloqueada antes, duas escolhas depois; a primeira é grátis e vale no jogo.
async function criar(page, classe = 'mage') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.click('[data-action="new-char"]');
  await page.click(`[data-action="pick-class"][data-arg="${classe}"]`);
  await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  return errors;
}

test('painel do personagem: especialização travada antes do nível 15 e com 2 escolhas depois', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => window.game.ui.openPanel('character'));
  await expect(page.locator('.panel')).toContainText('Libera no nível 15');
  await expect(page.locator('[data-action="spec"]')).toHaveCount(0);
  await page.evaluate(() => { window.game.char.level = 15; window.game.ui.closePanels(); window.game.ui.openPanel('character'); });
  await expect(page.locator('[data-action="spec"]')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('escolher Piromante: fica salvo, vale no herói e a Bola de Fogo muda (dica e recarga)', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => { window.game.char.level = 15; window.game.char.quests.done.prova_do_mestre = Date.now(); window.game.ui.openPanel('character'); }); // exige a Prova do Mestre da classe
  await page.click('[data-action="spec"][data-arg="pyromancer"]');
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { skillOf } = await import('/src/core/specs.js');
    return { char: g.char.spec, actor: g.player.spec, gold: g.char.gold, cd: skillOf('mage', g.player.spec, 'fireball').cd, saved: JSON.parse(localStorage.getItem('aetheria_save_v1')).spec };
  });
  expect(r.char).toBe('pyromancer'); expect(r.actor).toBe('pyromancer'); expect(r.saved).toBe('pyromancer');
  expect(r.gold).toBe(60); // primeira escolha é grátis
  await expect(page.locator('[data-action="spec"]')).toHaveCount(1); // sobra a outra opção, agora com preço
  expect(errors).toEqual([]);
});

test('trocar de especialização cobra ouro; sem ouro, não troca', async ({ page }) => {
  await criar(page);
  const r = await page.evaluate(() => {
    const g = window.game; g.char.level = 15; g.char.quests.done.prova_do_mestre = Date.now(); g.char.gold = 1000;
    g.pickSpec('pyromancer'); const g1 = g.char.gold;
    g.pickSpec('cryomancer'); const g2 = g.char.gold; const s2 = g.char.spec;
    g.char.gold = 5; g.pickSpec('pyromancer');
    return { g1, g2, s2, final: g.char.spec };
  });
  expect(r.g1).toBe(1000); expect(r.g2).toBeLessThan(1000); expect(r.s2).toBe('cryomancer'); expect(r.final).toBe('cryomancer');
});
