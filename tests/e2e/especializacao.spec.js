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

test('escolher Arcano: fica salvo, vale no herói e a barra passa ao kit do Arcano (Raio Prismático)', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => { window.game.char.level = 15; window.game.char.quests.done.prova_do_mestre = Date.now(); window.game.ui.openPanel('character'); }); // exige a Prova do Mestre da classe
  await page.click('[data-action="spec"][data-arg="arcane"]'); // primeira escolha: sem confirmação, grátis
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { skillOf } = await import('/src/core/specs.js');
    const { skillIdAt } = await import('/src/core/unlocks.js');
    const id = skillIdAt('mage', 0, g.player.spec);
    return { char: g.char.spec, actor: g.player.spec, gold: g.char.gold, cd: skillOf('mage', g.player.spec, id).cd, name: skillOf('mage', g.player.spec, id).name, saved: JSON.parse(localStorage.getItem('aetheria_save_v1')).spec };
  });
  expect(r.char).toBe('arcane'); expect(r.actor).toBe('arcane'); expect(r.saved).toBe('arcane'); expect(r.name).toBe('Raio Prismático');
  expect(r.gold).toBe(60); // primeira escolha é grátis
  await expect(page.locator('[data-action="spec"]')).toHaveCount(1); // sobra a outra opção, agora desabilitada (precisa de Selo)
  await expect(page.locator('[data-action="spec"]')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('trocar exige Selo de Reespecialização (15.000 de ouro, comprado do Mestre) e confirmação do jogo; sem Selo ou sem ouro, não troca', async ({ page }) => {
  const errors = await criar(page);
  await page.evaluate(() => { const g = window.game; g.char.level = 15; g.char.quests.done.prova_do_mestre = Date.now(); g.char.gold = 20000; g.pickSpec('arcane'); });
  // sem Selo: a troca é recusada e nada muda
  const a = await page.evaluate(() => { const g = window.game; g.pickSpec('warlock'); return { spec: g.char.spec, gold: g.char.gold, confirm: !!document.querySelector('.confirm-veil') }; });
  expect(a.spec).toBe('arcane'); expect(a.gold).toBe(20000); expect(a.confirm).toBe(false);
  // o Selo só está à venda no painel aberto pelo Mestre
  await page.evaluate(() => { window.game.ui.closePanels(); window.game.ui.openPanel('character:master'); });
  await expect(page.locator('[data-action="buy-seal"]')).toBeVisible();
  await page.click('[data-action="buy-seal"]');
  await expect(page.locator('.confirm-veil')).toContainText('15.000'); // confirmação do próprio jogo (nunca confirm() do navegador)
  await page.click('.confirm-veil [data-yes]');
  const b = await page.evaluate(() => ({ gold: window.game.char.gold, seals: window.game.char.seals }));
  expect(b.gold).toBe(5000); expect(b.seals).toBe(1);
  await expect(page.locator('[data-action="buy-seal"]')).toBeDisabled(); // sem ouro para outro
  await page.click('[data-action="spec"][data-arg="warlock"]');
  await expect(page.locator('.confirm-veil')).toContainText('1 Selo');
  await page.click('.confirm-veil [data-yes]');
  const c = await page.evaluate(() => { const g = window.game; return { spec: g.char.spec, actor: g.player.spec, seals: g.char.seals, changes: g.char.specChanges, saved: JSON.parse(localStorage.getItem('aetheria_save_v1')).spec }; });
  expect(c.spec).toBe('warlock'); expect(c.actor).toBe('warlock'); expect(c.seals).toBe(0); expect(c.changes).toBe(1); expect(c.saved).toBe('warlock');
  expect(errors).toEqual([]);
});

test('save antigo com Piromante migra para Arcano ao carregar', async ({ page }) => {
  const errors = await criar(page);
  const spec = await page.evaluate(async () => {
    const { validate } = await import('/src/core/savedoc.js');
    const doc = structuredClone(window.game.char); doc.level = 20; doc.spec = 'pyromancer';
    return validate(doc).char.spec;
  });
  expect(spec).toBe('arcane');
  expect(errors).toEqual([]);
});
