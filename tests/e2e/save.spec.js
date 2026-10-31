import { test, expect } from '@playwright/test';

// Salvamento versionado: save antigo migra, save corrompido não derruba o jogo (backup/recuperação), importar valida e o nome não injeta HTML.
const antigo = {
  version: 1, name: 'Veterano', classId: 'archer', level: 12, xp: 30, statPoints: 0,
  alloc: { str: 0, agi: 30, int: 0, vit: 25 }, gold: 777, potions: 3, equipment: {}, inventory: [],
  spirits: [{ id: 'sp1', type: 'ember', rarity: 'common', level: 3, xp: 0 }], activeSpirit: 'sp1',
  arena: { rating: 1180, wins: 4, losses: 1, bestWave: 5 }, created: 1700000000000,
};

async function abrir(page, setup) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(setup);
  await page.goto('/');
  return errors;
}

test('save v1 antigo: migra para a versão atual, mostra aviso e o jogo continua jogável', async ({ page }) => {
  const errors = await abrir(page, () => {});
  // põe o save antigo no localStorage e recarrega, como se o jogador voltasse depois de atualizar o jogo
  await page.evaluate((s) => { localStorage.setItem('aetheria_save_v1', JSON.stringify(s)); }, antigo);
  await page.reload();
  await expect(page.locator('[data-action="continue"]')).toContainText('Veterano');
  await expect(page.locator('.toast')).toContainText('Save atualizado');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('aetheria_save_v1')));
  expect(saved.version).toBe(2);
  expect(saved.arena.rating).toBe(1180); expect(saved.arena.ratings).toEqual({});
  expect(await page.evaluate(() => !!localStorage.getItem('aetheria_save_v1_backup'))).toBe(true); // cópia do original
  await page.click('[data-action="continue"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  expect(await page.evaluate(() => window.game.char.gold)).toBe(777);
  expect(errors).toEqual([]);
});

test('save corrompido: o jogo abre normalmente, guarda o original e não mostra erro', async ({ page }) => {
  const errors = await abrir(page, () => {});
  await page.evaluate(() => localStorage.setItem('aetheria_save_v1', '{"classId":"archer","level":'));
  await page.reload();
  await expect(page.locator('[data-action="new-char"]')).toBeVisible();
  await expect(page.locator('[data-action="continue"]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('aetheria_save_v1_corrupt'))).toContain('"classId":"archer"');
  await expect(page.locator('.toast')).toContainText('Save ilegível');
  expect(errors).toEqual([]);
});

test('save principal corrompido com backup válido: recupera do backup', async ({ page }) => {
  const errors = await abrir(page, () => {});
  await page.evaluate((s) => {
    localStorage.setItem('aetheria_save_v1_backup', JSON.stringify({ ...s, version: 2, arena: { ...s.arena, ratings: {} }, name: 'Backup' }));
    localStorage.setItem('aetheria_save_v1', 'isto não é json');
  }, antigo);
  await page.reload();
  await expect(page.locator('[data-action="continue"]')).toContainText('Backup');
  await expect(page.locator('.toast')).toContainText('Save recuperado');
  expect(errors).toEqual([]);
});

test('save com trapaça: valores absurdos são limitados ao carregar', async ({ page }) => {
  await abrir(page, () => {});
  await page.evaluate((s) => localStorage.setItem('aetheria_save_v1', JSON.stringify({ ...s, level: 500, gold: 1e18, statPoints: 99999, name: '<img src=x onerror=window.__xss=1>' })), antigo);
  await page.reload();
  await page.click('[data-action="continue"]');
  const c = await page.evaluate(() => ({ level: window.game.char.level, gold: window.game.char.gold, pts: window.game.char.statPoints, name: window.game.char.name, xss: window.__xss ?? null }));
  expect(c.level).toBe(30); expect(c.gold).toBe(1e9); expect(c.pts).toBeLessThanOrEqual(145);
  expect(c.name).not.toMatch(/[<>=]/);
  expect(c.xss).toBeNull();
});

test('exportar e importar: arquivo válido substitui o personagem; arquivo inválido é recusado', async ({ page }) => {
  const errors = await abrir(page, () => {});
  await page.click('[data-action="new-char"]');
  await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  const r = await page.evaluate(async () => {
    const g = window.game; g.char.gold = 4242;
    const { exportSave } = await import('/src/save.js');
    const texto = exportSave(g.char);
    window.confirm = () => true;
    g.applyImport('{"format":"aetheria-save","char":{"classId":"naoexiste"}}');
    const ruim = g.char.gold;
    g.char.gold = 1;
    g.applyImport(texto);
    return { ruim, gold: g.char.gold, salvo: JSON.parse(localStorage.getItem('aetheria_save_v1')).gold };
  });
  expect(r.ruim).toBe(4242); // importação inválida não mexe em nada
  expect(r.gold).toBe(4242); expect(r.salvo).toBe(4242);
  await page.evaluate(() => window.game.ui.openPanel('options'));
  await expect(page.locator('[data-action="save-export"]')).toBeVisible();
  await expect(page.locator('[data-action="save-import"]')).toBeVisible();
  expect(errors).toEqual([]);
});
