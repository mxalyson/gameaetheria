import { test, expect } from '@playwright/test';
import { createGameServer } from '../../server/game-server.js';
import { PROTOCOL_VERSION } from '../../public/src/core/protocol.js';

// Multiplayer em navegadores REAIS no laboratório net-poc: fila, grupo com convite, partidas 1×1 e 2×2, trapaça recusada, reconexão.
let srv;
test.beforeEach(async () => { srv = createGameServer({ port: 0, seed: 4242 }); await srv.ready; });
test.afterEach(async () => { await srv.close(); });

const url = (name, cls) => `/labs/net-poc/index.html?auto=1&server=ws://127.0.0.1:${srv.port}&name=${name}&class=${cls}`;

async function abrir(browser, name, cls) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url(name, cls));
  await page.waitForFunction(() => window.net?.joined, null, { timeout: 10000 });
  await page.evaluate(() => window.net.manual());
  return { ctx, page, errors };
}
const fila = (c, modo) => c.page.click(`[data-q="${modo}"]`);
const emLuta = (c) => c.page.waitForFunction(() => window.net.state === 'fight' && window.net.last?.actors.length >= 2, null, { timeout: 20000 });

test('1×1 em dois navegadores: fila, partida, movimento, trapaça recusada, dano do servidor e reconexão', async ({ browser }) => {
  test.setTimeout(90000);
  const A = await abrir(browser, 'Alfa', 'warrior');
  const B = await abrir(browser, 'Beta', 'mage');
  await fila(A, '1v1'); await fila(B, '1v1');
  await emLuta(A); await emLuta(B);
  const ids = await A.page.evaluate(() => ({ me: window.net.me, names: window.net.last.actors.map((a) => a.name).sort(), team: window.net.team }));
  expect(ids.names).toEqual(['Alfa', 'Beta']);
  const idB = await B.page.evaluate(() => window.net.me);
  expect(ids.me).not.toBe(idB);

  // movimento: A anda; B (outro navegador) vê; a predição de A bate com o servidor
  const y0 = await B.page.evaluate((id) => window.net.last.actors.find((a) => a.id === id).y, ids.me);
  await A.page.evaluate(() => window.net.setInput({ mx: 1, my: 0, aimX: 900, aimY: -5000 }));
  await A.page.waitForTimeout(1000);
  await A.page.evaluate(() => window.net.setInput({ mx: 0, my: 0 }));
  await A.page.waitForTimeout(500);
  const x1 = await B.page.evaluate((id) => window.net.last.actors.find((a) => a.id === id).x, ids.me);
  const own = await A.page.evaluate(() => ({ srv: window.net.srv.x, pred: window.net.pred.x }));
  expect(x1).toBeGreaterThan(900 + 120); expect(x1).toBeLessThan(900 + 260); // ~1 s × 200 px/s, no máximo a velocidade permitida
  expect(Math.abs(own.srv - own.pred)).toBeLessThan(25);
  void y0;

  // trapaça pelo navegador: dano falso é recusado
  const hp0 = await B.page.evaluate(() => window.net.srv.hp);
  await A.page.evaluate(([target, v]) => window.net.sendRaw(JSON.stringify({ v, t: 'damage', target, amount: 99999 })), [idB, PROTOCOL_VERSION]);
  await A.page.waitForFunction(() => window.net.rejects.includes('bad_message'), null, { timeout: 5000 });
  await B.page.waitForTimeout(400);
  expect(await B.page.evaluate(() => window.net.srv.hp)).toBe(hp0);

  // A avança até o B e ataca (o servidor confirma os golpes)
  await A.page.evaluate(() => { const t = window.net.last.actors.find((a) => a.id !== window.net.me); window.net.setInput({ attack: true }); window.__chase = setInterval(() => { const l = window.net.last, me = l.actors.find((a) => a.id === window.net.me), tg = l.actors.find((a) => a.id !== window.net.me); const dx = tg.x - me.x, dy = tg.y - me.y, d = Math.hypot(dx, dy) || 1; window.net.setInput({ mx: d > 60 ? Math.sign(dx) * (Math.abs(dx) / d > 0.35 ? 1 : 0) : 0, my: d > 60 ? Math.sign(dy) * (Math.abs(dy) / d > 0.35 ? 1 : 0) : 0, aimX: tg.x, aimY: tg.y }); }, 60); void t; });
  await B.page.waitForFunction((hp) => window.net.srv.hp < hp, hp0, { timeout: 25000 });
  const hits = (p) => p.evaluate(() => window.net.events.filter((e) => e.e === 'hit').length);
  await A.page.waitForTimeout(600);
  expect(await hits(A.page)).toBeGreaterThan(0); expect(await hits(B.page)).toBeGreaterThan(0);
  expect(await A.page.evaluate(() => window.net.last.actors.find((a) => a.id !== window.net.me).hp)).toBe(await B.page.evaluate(() => window.net.srv.hp));
  await A.page.evaluate(() => { clearInterval(window.__chase); window.net.setInput({ mx: 0, my: 0, attack: false }); });

  // B perde a conexão: A vê "offline"; B volta com o token, no mesmo personagem e na mesma sala
  await B.page.evaluate(() => window.net.ws.close());
  await A.page.waitForFunction((id) => window.net.last.actors.find((a) => a.id === id)?.online === false, idB, { timeout: 5000 });
  await B.page.waitForFunction(() => window.net.connected && window.net.last?.actors.every((a) => a.online), null, { timeout: 8000 });
  expect(await B.page.evaluate(() => window.net.me)).toBe(idB);
  expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
  await A.ctx.close(); await B.ctx.close();
});

test('grupo e 2×2 em quatro navegadores: convite, aceitar, fila do líder, mesma equipe, outros dois do outro lado', async ({ browser }) => {
  test.setTimeout(90000);
  const [A, B, C, D] = [await abrir(browser, 'Ana', 'warrior'), await abrir(browser, 'Bia', 'cleric'), await abrir(browser, 'Caio', 'mage'), await abrir(browser, 'Davi', 'archer')];
  // A convida B pela interface; B aceita pelo botão
  await A.page.fill('#inv', 'Bia'); await A.page.click('#invite');
  await expect(B.page.locator('#invites')).toContainText('Ana convidou você');
  await B.page.click('#invites button:has-text("Aceitar")');
  await expect(A.page.locator('#party')).toContainText('Ana, Bia');
  await expect(B.page.locator('#party')).toContainText('líder Ana');
  // só o líder enfileira o grupo; C e D entram sozinhos
  await B.page.click('[data-q="2v2"]');
  await B.page.waitForFunction(() => window.net.rejects.includes('not_leader'));
  await fila(A, '2v2'); await fila(C, '2v2'); await fila(D, '2v2');
  for (const x of [A, B, C, D]) await emLuta(x);
  const info = await Promise.all([A, B, C, D].map((x) => x.page.evaluate(() => ({ team: window.net.team, room: window.net.room, mode: window.net.mode, n: window.net.last.actors.length }))));
  expect(new Set(info.map((i) => i.room)).size).toBe(1);
  expect(info.every((i) => i.mode === '2v2' && i.n === 4)).toBe(true);
  expect(info[0].team).toBe(info[1].team);              // o grupo joga junto
  expect(info[2].team).toBe(info[3].team);
  expect(info[0].team).not.toBe(info[2].team);          // contra os outros dois
  await A.page.screenshot({ path: 'test-results/net-2v2.png' });
  for (const x of [A, B, C, D]) { expect(x.errors).toEqual([]); await x.ctx.close(); }
});
