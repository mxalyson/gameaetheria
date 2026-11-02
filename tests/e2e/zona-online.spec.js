import { test, expect } from '@playwright/test';
import { openDb } from '../../server/db.js';
import { createApi } from '../../server/api.js';
import { createGameServer } from '../../server/game-server.js';

// Exploração no servidor (P11.2) no JOGO REAL: o portal da vila leva à instância do servidor; o navegador só desenha e envia intenções;
// XP/ouro/loot são decididos e gravados pelo servidor; H volta à vila.
let db, apiServer, game, apiBase;
test.beforeAll(async () => {
  db = openDb(':memory:');
  game = createGameServer({ port: 0, db, allowedOrigins: ['http://localhost:5174'], reconnectSec: 20 });
  await game.ready;
  const api = createApi(db, { origins: ['http://localhost:5174'], gameUrl: `ws://127.0.0.1:${game.port}` });
  apiServer = api.server();
  await new Promise((r) => apiServer.listen(0, '127.0.0.1', r));
  apiBase = `http://127.0.0.1:${apiServer.address().port}`;
});
test.afterAll(async () => { apiServer.closeAllConnections?.(); await new Promise((r) => apiServer.close(r)); await game.close(); db.close(); });

async function conta(email, nome, classe) {
  const call = async (path, body, token) => (await fetch(apiBase + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();
  const r = await call('/api/register', { email, password: 'segredo-bom-123' });
  const c = await call('/api/characters', { name: nome, classId: classe }, r.token);
  return { token: r.token, id: c.id, nome };
}

test('portal da vila → instância do servidor; abater monstro paga XP/ouro gravados no servidor; H volta à vila', async ({ browser }) => {
  const who = await conta('zona@teste.com', 'Zona', 'warrior');
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([t]) => localStorage.setItem('aetheria_session', t), [who.token]);
  await page.goto('/?api=' + encodeURIComponent(apiBase) + '&visual=original');
  await page.click(`[data-action="char-select"][data-arg="${who.id}"]`);
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  await page.waitForFunction(() => window.game.net?.joined, null, { timeout: 10000 });

  // anda até o portal do Bosque (a leste da vila) como o jogador faria: teletransporte do ator + o jogo detecta o portal
  await page.evaluate(() => { const p = window.game.player; p.x = 1650; p.y = 620; window.game.portalCd = 0; });
  await page.waitForFunction(() => window.game.mode === 'net' && window.game.netInfo?.mode === 'zone' && window.game.netLast, null, { timeout: 15000 });
  const entrada = await page.evaluate(() => ({ zone: window.game.world.zoneId, mobs: window.game.netMobs.size, x: Math.round(window.game.player.x), y: Math.round(window.game.player.y) }));
  expect(entrada.zone).toBe('forest');
  expect(entrada.mobs).toBeGreaterThan(5);
  expect(entrada.x).toBeLessThan(300);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/zona-online-entrada.png' });

  // o servidor posiciona um monstro fraco ao lado e o herói (clique do mouse) o derrota
  const room = [...game.hub.zoneRooms.values()][0];
  const me = [...room.players.values()][0];
  const mob = room.mobs().find((m) => !m.dead);
  me.actor.x = mob.x - 45; me.actor.y = mob.y; mob.hp = 1; // o herói do servidor aparece ao lado do monstro (a previsão do cliente se corrige sozinha)
  const antes = db.character(who.id).doc;
  // mira sempre no monstro (ele se mexe): o clique do mouse é o do jogo real
  await page.evaluate((id) => { const g = window.game; window.__aim = setInterval(() => { const m = g.netMobs.get(id); if (!m) return; g.input.mouse.x = (m.x - g.cam.x) * g.renderer.zoom; g.input.mouse.y = (m.y - g.cam.y) * g.renderer.zoom; g.input.mouse.down = true; }, 40); }, mob.id);
  await expect.poll(() => mob.dead, { timeout: 15000 }).toBe(true);
  await page.evaluate(() => { clearInterval(window.__aim); window.game.input.mouse.down = false; });
  expect(me.pend.kills.length).toBeGreaterThanOrEqual(1);
  room.flush(me); // o servidor grava o lote (sem esperar 10 s)
  await page.waitForFunction(() => window.game.char.xp > 0 || window.game.char.level > 1, null, { timeout: 8000 });
  const depois = db.character(who.id).doc;
  expect(depois.xp > antes.xp || depois.level > antes.level).toBe(true);
  expect(await page.evaluate(() => window.game.char.level)).toBe(depois.level);

  // painéis de equipamento ficam bloqueados na instância; H leva de volta à vila
  await page.keyboard.press('i');
  expect(await page.evaluate(() => window.game.ui.isOpen('inventory'))).toBe(false);
  await page.screenshot({ path: 'test-results/zona-online.png' });
  // B15: logo depois do combate o servidor recusa a saída (continua na instância)
  await page.evaluate(() => window.game.hearth());
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.game.mode)).toBe('net');
  me.actor.lastCombat = -999; // passou o tempo sem combate
  await page.evaluate(() => window.game.hearth());
  await page.waitForFunction(() => window.game.mode === 'explore' && window.game.world.zoneId === 'town', null, { timeout: 10000 });
  expect(game.hub.zoneRooms.size).toBe(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('cliente editado não consegue enviar ganhos: o servidor ignora e o ouro do banco não muda', async ({ browser }) => {
  const who = await conta('zona2@teste.com', 'Zona2', 'mage');
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage();
  await page.addInitScript(([t]) => localStorage.setItem('aetheria_session', t), [who.token]);
  await page.goto('/?api=' + encodeURIComponent(apiBase) + '&visual=original');
  await page.click(`[data-action="char-select"][data-arg="${who.id}"]`);
  await page.waitForFunction(() => window.game.net?.joined, null, { timeout: 10000 });
  const g0 = db.character(who.id).doc.gold;
  await page.evaluate(() => { const p = window.game.player; p.x = 1650; p.y = 620; window.game.portalCd = 0; });
  await page.waitForFunction(() => window.game.mode === 'net' && window.game.netLast, null, { timeout: 15000 });
  await page.evaluate(() => { const n = window.game.net; for (const m of [{ t: 'zone_reward', gold: 99999 }, { t: 'loot', item: 'x' }, { t: 'reward', gold: 99999 }, { t: 'damage', target: 1, amount: 9999 }]) n.send(m); });
  await page.waitForTimeout(600);
  expect(db.character(who.id).doc.gold).toBe(g0);
  await ctx.close();
});
