import { test, expect } from '@playwright/test';

// Mobile-first (P12): o jogo é pensado para celular. Toque é o padrão em qualquer tela; nada de dicas de teclado; menu com botões para tudo.
async function criar(page, pref) {
  if (pref) await page.addInitScript(([p]) => localStorage.setItem('aetheria_prefs_v1', JSON.stringify(p)), [pref]);
  await page.goto('/?api=&visual=original');
  await page.click('[data-action="new-char"]'); await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
}

test('toque é o padrão em tela de toque (auto) e também quando "Toque" é escolhido num PC; teclado só se escolhido', async ({ browser }) => {
  const t = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });
  const pt = await t.newPage(); await criar(pt);
  expect(await pt.evaluate(() => document.body.classList.contains('touch'))).toBe(true);
  await t.close();
  const d = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const pd = await d.newPage(); await criar(pd, { scale: 100, quality: 'auto', controls: 'touch' });
  expect(await pd.evaluate(() => document.body.classList.contains('touch'))).toBe(true);
  expect(await pd.locator('#skillbar').isVisible()).toBe(false); // sem a barra de teclas (LMB, 1, 2, 3, Q, H, P)
  expect(await pd.locator('.tbtn.atk').isVisible()).toBe(true);
  await d.close();
  const k = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const pk = await k.newPage(); await criar(pk, { scale: 100, quality: 'auto', controls: 'keyboard' });
  expect(await pk.evaluate(() => document.body.classList.contains('touch'))).toBe(false);
  await k.close();
});

test('botões de toque funcionam com o mouse (PC) e o menu abre mochila, personagem, spirits, diário e mapa sem teclado', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await criar(page, { scale: 100, quality: 'auto', controls: 'touch' });
  const atk = page.locator('.tbtn.atk').first();
  const b = await atk.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  expect(await page.evaluate(() => window.game.touch.attack)).toBe(true);
  await page.mouse.up();
  expect(await page.evaluate(() => window.game.touch.attack)).toBe(false);
  for (const [id, label] of [['inventory', 'Inventário'], ['character', 'Personagem'], ['spirits', 'Spirits'], ['journal', 'Diário'], ['map', 'Mapa']]) {
    await page.click(`.menu-btns [data-arg="${id}"]`);
    expect(await page.evaluate((i) => window.game.ui.isOpen(i), id), label).toBe(true);
    await page.click(`.menu-btns [data-arg="${id}"]`).catch(() => {}); // alterna fechando (o painel pode cobrir o botão)
    await page.evaluate((i) => window.game.ui.close(i), id);
  }
  expect(await page.locator('.menu-btns [data-arg="party"]').isVisible()).toBe(false); // grupo só com conta
  expect(errors).toEqual([]);
  await ctx.close();
});

test('nenhum texto do jogo manda apertar teclas (tecla, WASD, letras entre parênteses) nos painéis e no tutorial', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await criar(page, { scale: 100, quality: 'auto', controls: 'touch' });
  const textos = [];
  for (const id of ['inventory', 'character', 'spirits', 'journal', 'map', 'options', 'shop', 'arena']) {
    await page.evaluate((i) => window.game.ui.openPanel(i), id);
    textos.push(await page.evaluate(() => document.getElementById('panel-layer').innerText));
    await page.evaluate((i) => window.game.ui.close(i), id);
  }
  textos.push(await page.evaluate(() => document.getElementById('log').textContent));
  const todo = textos.join('\n');
  expect(todo).not.toMatch(/\btecla\b|WASD|\((?:[A-Z])\)|\bclique\b/i);
  await ctx.close();
});
