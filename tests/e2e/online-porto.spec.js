import { test, expect } from '@playwright/test';
import { openDb } from '../../server/db.js';
import { createApi } from '../../server/api.js';
import { createGameServer } from '../../server/game-server.js';

// Online (jogo real): ritual do chefe no HUD da instância (campo `rt` do snapshot) e duelo amistoso do Porto (fila `friendly`: sem Elo, ouro nem XP).
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
async function entrar(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([t]) => localStorage.setItem('aetheria_session', t), [who.token]);
  await page.goto('/?api=' + encodeURIComponent(apiBase) + '&visual=original');
  await page.click(`[data-action="char-select"][data-arg="${who.id}"]`);
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  await page.waitForFunction(() => window.game.net?.joined, null, { timeout: 10000 });
  return { ctx, page, errors };
}

test('ritual do chefe online: o HUD mostra "Ritual N/40" vindo do rt do servidor e some com o chefe vivo', async ({ browser }) => {
  const who = await conta('ritual@teste.com', 'Ritual', 'warrior');
  const row = db.character(who.id); row.doc.visited = { ...row.doc.visited, ember: 1 }; row.doc.scrolls = 3; // atalho de teste: o servidor não aceita esses campos vindos do cliente
  db.raw.prepare('update characters set doc = ? where id = ?').run(JSON.stringify(row.doc), who.id);
  const { ctx, page, errors } = await entrar(browser, who);
  // teletransporte para as Cinzas Ardentes (única zona com ritual): o servidor confere "visitado" e pergaminho no documento salvo
  await page.evaluate(() => { const g = window.game; g.teleport('ember'); });
  await page.waitForFunction(() => window.game.mode === 'net' && window.game.netInfo?.zone === 'ember' && window.game.netLast, null, { timeout: 15000 });
  const room = [...game.hub.zoneRooms.values()].find((r) => r.zoneId === 'ember');
  expect(room).toBeTruthy();
  const rit = page.locator('#ritual');
  await expect(rit).toHaveText('Ritual 0/40', { timeout: 8000 });
  await expect(rit).toBeVisible();
  // o servidor avança o contador: o HUD acompanha pelo `rt` do snapshot (enviado só quando muda)
  room.world.bossState.progress = 23;
  await expect(rit).toHaveText('Ritual 23/40', { timeout: 8000 });
  expect(await page.evaluate(() => window.game.netRitual.have)).toBe(23);
  // contador cheio: presságio, depois o chefe vivo esconde o contador
  room.world.bossState.progress = 40;
  await expect(rit).toHaveText('O chão estremece…', { timeout: 8000 });
  await expect(rit).toBeHidden({ timeout: 12000 });
  expect(errors).toEqual([]);
  await ctx.close();
});

test('duelo amistoso online do Porto: fila friendly, aviso "sem Elo, ouro nem XP" e Elo/ouro/XP inalterados no banco', async ({ browser }) => {
  test.setTimeout(120000);
  const who = await conta('amistoso@teste.com', 'Amistoso', 'warrior');
  const { ctx, page, errors } = await entrar(browser, who);
  await page.evaluate(() => window.game.enterZone('harbor', 1500, 920));
  const snap = () => { const d = db.character(who.id).doc; return JSON.stringify([d.gold, d.xp, d.level, d.arena]); };
  const antes = snap();
  const antesCli = await page.evaluate(() => { const c = window.game.char; return JSON.stringify([c.gold, c.xp, c.level, c.arena]); });
  await page.evaluate(() => { const g = window.game, n = g.world.zone.npcs.find((x) => x.id === 'duelist'); g.player.x = n.x + 30; g.player.y = n.y + 10; });
  await page.waitForFunction(() => window.game.nearNpc?.id === 'duelist');
  await page.evaluate(() => window.game.talk(window.game.world.zone.npcs.find((x) => x.id === 'duelist')));
  await expect(page.locator('#toasts, .toast').filter({ hasText: 'sem Elo, ouro nem XP' }).first()).toBeVisible({ timeout: 5000 });
  // o servidor completa com bot em poucos segundos
  await page.waitForFunction(() => window.game.mode === 'net' && window.game.netInfo?.friendly === true && window.game.netLast?.state === 'fight', null, { timeout: 30000 });
  const room = [...game.hub.rooms.values()].find((r) => r.friendly);
  expect(room).toBeTruthy();
  // o rival do servidor cai: vitória do jogador
  for (const p of room.players.values()) if (p.bot) { p.actor.hp = 0; p.actor.dead = true; }
  await expect(page.locator('#screen')).toContainText('Duelo amistoso', { timeout: 15000 });
  await expect(page.locator('#screen')).toContainText('sem Elo, ouro nem XP');
  await page.waitForTimeout(800);
  expect(snap()).toBe(antes);
  await page.click('[data-action="net-leave"]');
  await page.waitForFunction(() => window.game.mode === 'explore' && window.game.world.zoneId === 'harbor', null, { timeout: 10000 });
  expect(await page.evaluate(() => { const c = window.game.char; return JSON.stringify([c.gold, c.xp, c.level, c.arena]); })).toBe(antesCli);
  expect(snap()).toBe(antes);
  expect(errors).toEqual([]);
  await ctx.close();
});
