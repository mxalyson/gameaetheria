import { test, expect } from '@playwright/test';
import { openDb } from '../../server/db.js';
import { createApi } from '../../server/api.js';
import { createGameServer } from '../../server/game-server.js';

// Multiplayer no JOGO REAL (modo online): contas, arena com jogadores reais, grupo, cooperativo. O servidor decide; o navegador só desenha.
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

// Cria conta + personagem pela API (como o jogo faz) e ajusta o nível direto no banco (atalho de teste para liberar o PvP).
async function conta(email, nome, classe, nivel = 10) {
  const call = async (path, body, token) => (await fetch(apiBase + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();
  const r = await call('/api/register', { email, password: 'segredo-bom-123' });
  const c = await call('/api/characters', { name: nome, classId: classe }, r.token);
  const row = db.character(c.id); row.doc.level = nivel;
  db.raw.prepare('update characters set doc = ? where id = ?').run(JSON.stringify(row.doc), c.id);
  return { token: r.token, id: c.id, nome };
}

async function entrar(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([t]) => localStorage.setItem('aetheria_session', t), [who.token]);
  await page.goto('/?api=' + encodeURIComponent(apiBase));
  await page.click(`[data-action="char-select"][data-arg="${who.id}"]`);
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  await page.waitForFunction(() => window.game.net?.joined, null, { timeout: 10000 });
  return { ctx, page, errors, who };
}
const fila = async (c, modo) => { await c.page.evaluate(() => window.game.ui.openPanel('arena')); await c.page.click(`[data-action="net-queue"][data-arg="${modo}"]`); };
const naPartida = (c) => c.page.waitForFunction(() => window.game.mode === 'net' && window.game.netLast?.state === 'fight', null, { timeout: 30000 });
// o "jogador" do teste: anda até o alvo mais próximo e ataca (teclado e mouse virtuais do jogo real)
const perseguir = (c) => c.page.evaluate(() => {
  const g = window.game;
  window.__chase = setInterval(() => {
    const me = g.player, foes = [...(g.netActors?.values() ?? []), ...(g.netMobs?.values() ?? [])].filter((a) => a !== me && !a.dead && a.mark !== 'ally' && a.team !== 1 || (a.kind === 'mob' && !a.dead));
    const tg = foes.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    g.input.keys.clear();
    if (!tg) { g.input.mouse.down = false; return; }
    const dx = tg.x - me.x, dy = tg.y - me.y, d = Math.hypot(dx, dy) || 1;
    let mx = dx / d, my = dy / d;
    for (const o of g.world.layout.obstacles) { // contorna pilares (o caminho reto até o alvo costuma passar por um)
      if (!o.block) continue;
      const ox = o.x - me.x, oy = o.y - me.y, od = Math.hypot(ox, oy);
      if (od < 120 && (ox * mx + oy * my) / od > 0.5) { const side = mx * oy - my * ox > 0 ? -1 : 1; mx += -my * side * 1.6; my += mx * side * 1.6 / 1.6; break; }
    }
    if (d > 60) { if (Math.abs(mx) > 0.35) g.input.keys.add(mx > 0 ? 'd' : 'a'); if (Math.abs(my) > 0.35) g.input.keys.add(my > 0 ? 's' : 'w'); }
    g.input.mouse.x = (tg.x - g.cam.x) * g.renderer.zoom; g.input.mouse.y = (tg.y - g.cam.y) * g.renderer.zoom; g.input.mouse.down = true;
  }, 50);
});
const parar = (c) => c.page.evaluate(() => { clearInterval(window.__chase); window.game.input.keys.clear(); window.game.input.mouse.down = false; });

test('1×1 no jogo real: fila pelo painel, partida renderizada, dano confirmado pelo servidor, recompensa gravada e volta à vila', async ({ browser }) => {
  test.setTimeout(120000);
  const A = await entrar(browser, await conta('a1@x.com', 'Alfa', 'warrior'));
  const B = await entrar(browser, await conta('b1@x.com', 'Beta', 'warrior'));
  await fila(A, '1v1'); await fila(B, '1v1');
  await naPartida(A); await naPartida(B);
  for (const c of [A, B]) {
    const info = await c.page.evaluate(() => ({ mode: window.game.mode, n: window.game.netActors.size, zone: window.game.world.zone.name, marks: [...window.game.netActors.values()].map((a) => a.mark ?? 'eu').sort() }));
    expect(info.mode).toBe('net'); expect(info.n).toBe(2); expect(info.zone).toBe('Grande Arena dos Ecos');
    expect(info.marks).toEqual(['eu', 'foe']);
  }
  // A persegue e ataca; os efeitos (números de dano) e a vida de B vêm do servidor, nos dois navegadores
  await perseguir(A);
  await B.page.waitForFunction(() => window.game.player.hp < window.game.player.maxHp, null, { timeout: 30000 });
  await A.page.waitForFunction(() => window.game.world.texts.length > 0 || window.game.world.particles.length > 0, null, { timeout: 5000 });
  const hpB = await B.page.evaluate(() => window.game.player.hp);
  await A.page.waitForTimeout(500);
  const vistoPorA = await A.page.evaluate(() => [...window.game.netActors.values()].find((a) => a.mark === 'foe').hp);
  expect(Math.abs(vistoPorA - hpB)).toBeLessThan(80); // os dois concordam (diferença = 1–2 golpes de atraso no máximo)
  expect(await B.page.locator('#hud-hp-text').textContent()).toContain('/');
  await A.page.screenshot({ path: 'test-results/real-1v1.png' });
  await parar(A);
  // trapaça pelo console do navegador: o servidor recusa e a vida não muda
  const hp0 = await B.page.evaluate(() => window.game.player.hp);
  await A.page.evaluate(() => window.game.net.send({ t: 'damage', target: 1, amount: 99999 }));
  await B.page.waitForTimeout(400);
  expect(await B.page.evaluate(() => window.game.player.hp)).toBeGreaterThanOrEqual(hp0 - 0.01);
  // fim da partida decidido pelo servidor → tela de resultado com as recompensas gravadas
  const gold0 = db.character(A.who.id).doc.gold;
  game.hub.rooms.values().next().value.end(1, 'elimination');
  await expect(A.page.locator('#screen .result')).toContainText('Vitória');
  await expect(A.page.locator('#screen .result')).toContainText('Rating 1v1', { timeout: 8000 });
  await expect(B.page.locator('#screen .result')).toContainText('Derrota');
  await A.page.click('[data-action="net-leave"]');
  await expect(A.page.locator('#screen .result')).toHaveCount(0);
  await A.page.waitForFunction(() => window.game.mode === 'explore', null, { timeout: 8000 }); // busca o personagem oficial e entra na vila
  expect(await A.page.evaluate(() => window.game.char.gold)).toBeGreaterThan(gold0);        // personagem OFICIAL do servidor adotado
  expect(await A.page.evaluate(() => window.game.char.arena.wins)).toBe(1);
  expect(db.character(A.who.id).doc.arena.wins).toBe(1);
  expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
  await A.ctx.close(); await B.ctx.close();
});

test('grupo no jogo real: convidar pelo painel, aceitar, e a fila 2×2 coloca o grupo no mesmo time', async ({ browser }) => {
  test.setTimeout(120000);
  const [A, B, C, D] = [await entrar(browser, await conta('a2@x.com', 'Ana', 'warrior')), await entrar(browser, await conta('b2@x.com', 'Bia', 'cleric')),
    await entrar(browser, await conta('c2@x.com', 'Caio', 'mage')), await entrar(browser, await conta('d2@x.com', 'Davi', 'archer'))];
  await A.page.evaluate(() => window.game.ui.openPanel('party'));
  await A.page.fill('#party-name', 'Bia'); await A.page.click('[data-action="party-invite"]');
  await B.page.evaluate(() => window.game.ui.openPanel('party'));
  await expect(B.page.locator('.panel')).toContainText('Ana convidou você');
  await B.page.click('[data-action="party-accept"]');
  await expect(A.page.locator('.panel')).toContainText('Bia');
  await expect(B.page.locator('.panel')).toContainText('Ana');
  await fila(A, '2v2'); await fila(C, '2v2'); await fila(D, '2v2');
  for (const x of [A, B, C, D]) await naPartida(x);
  const marks = await Promise.all([A, B, C, D].map((x) => x.page.evaluate(() => ({ me: window.game.netInfo.you, team: window.game.netInfo.team, room: window.game.netInfo.room, marks: [...window.game.netActors.values()].map((a) => a.mark ?? 'eu') }))));
  expect(new Set(marks.map((m) => m.room)).size).toBe(1);
  expect(marks[0].team).toBe(marks[1].team); expect(marks[2].team).toBe(marks[3].team); expect(marks[0].team).not.toBe(marks[2].team);
  expect(marks[0].marks.filter((m) => m === 'ally').length).toBe(1); expect(marks[0].marks.filter((m) => m === 'foe').length).toBe(2);
  for (const x of [A, B, C, D]) { expect(x.errors).toEqual([]); await x.ctx.close(); }
  game.hub.rooms.clear();
});

test('cooperativo no jogo real: ondas e chefe vindos do servidor, recompensas e loot gravados', async ({ browser }) => {
  test.setTimeout(150000);
  const A = await entrar(browser, await conta('a3@x.com', 'Solo', 'mage', 12));
  await fila(A, 'coop');
  await naPartida(A);
  await A.page.waitForFunction(() => window.game.netMobs.size > 0, null, { timeout: 20000 });
  expect(await A.page.evaluate(() => window.game.world.zone.name)).toBe('Arena das Ondas');
  await A.page.screenshot({ path: 'test-results/real-coop.png' });
  // o servidor derruba os monstros (atalho de teste, passando pela regra normal de dano) e o jogo avança até o chefe
  const room = game.hub.rooms.values().next().value;
  const kill = setInterval(() => { const p = [...room.players.values()][0]?.actor; if (p && !p.dead && room.wave.state === 'fight') for (const m of room.mobs()) if (!m.dead) room.world.damage(p, m, 9999); }, 100);
  try {
    await expect(A.page.locator('#screen .result')).toContainText('Vitória cooperativa', { timeout: 90000 });
    await expect(A.page.locator('#screen .result')).toContainText('XP', { timeout: 8000 });
  } finally { clearInterval(kill); }
  const bossSeen = db.audits('coop_reward').length;
  expect(bossSeen).toBe(1);
  await A.page.click('[data-action="net-leave"]');
  await A.page.waitForFunction(() => window.game.mode === 'explore', null, { timeout: 8000 });
  const char = await A.page.evaluate(() => ({ inv: window.game.char.inventory.length, gold: window.game.char.gold, wins: window.game.char.arena.wins }));
  expect(char.inv).toBeGreaterThanOrEqual(1);          // loot do chefe, com ids do servidor
  expect(char.wins).toBe(0);                           // cooperativo não mexe no rating/vitórias de PvP
  expect(db.character(A.who.id).doc.inventory.length).toBe(char.inv);
  expect(A.errors).toEqual([]);
  await A.ctx.close();
});

test('servidor de partidas indisponível: o jogo avisa e continua (PvP online desligado, resto funciona)', async ({ browser }) => {
  const who = await conta('a4@x.com', 'Sozinho', 'archer');
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([t]) => localStorage.setItem('aetheria_session', t), [who.token]);
  await page.route('**/api/config', async (route) => { const r = await route.fetch(); const j = await r.json(); await route.fulfill({ response: r, json: { ...j, gameUrl: 'ws://127.0.0.1:1' } }); });
  await page.goto('/?api=' + encodeURIComponent(apiBase));
  await page.click(`[data-action="char-select"][data-arg="${who.id}"]`);
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  await page.waitForFunction(() => window.game.net === null, null, { timeout: 8000 });
  await page.evaluate(() => window.game.ui.openPanel('arena'));
  await expect(page.locator('.panel')).toContainText('Conectando');
  expect(errors).toEqual([]);
  await ctx.close();
});
