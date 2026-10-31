import { test, expect } from '@playwright/test';
import { createGameServer } from '../../server/game-server.js';
import { PROTOCOL_VERSION } from '../../public/src/core/protocol.js';

// Prova de conceito do multiplayer: DOIS navegadores reais no mesmo servidor autoritativo (laboratório net-poc).
let srv;
test.beforeAll(async () => { srv = createGameServer({ port: 0, seed: 4242 }); await srv.ready; });
test.afterAll(async () => { await srv.close(); });

const url = (name, cls) => `/labs/net-poc/index.html?auto=1&server=ws://127.0.0.1:${srv.port}&name=${name}&class=${cls}`;

async function abrir(browser, name, cls) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url(name, cls));
  await page.waitForFunction(() => window.net?.me != null, null, { timeout: 10000 });
  await page.evaluate(() => window.net.manual());
  return { ctx, page, errors };
}

test('dois navegadores: entram na mesma sala, se veem, movimento sincronizado, ataques e dano validados pelo servidor, reconexão', async ({ browser }) => {
  test.setTimeout(90000);
  srv.world.actors.length = 0; srv.players.clear(); srv.room.state = 'waiting';
  const A = await abrir(browser, 'Alfa', 'warrior');
  const B = await abrir(browser, 'Beta', 'mage');

  // 1. cada um enxerga os dois jogadores e a luta começa
  for (const c of [A, B]) {
    await c.page.waitForFunction(() => window.net.state === 'fight' && window.net.last?.actors.length === 2, null, { timeout: 15000 });
  }
  const ids = await A.page.evaluate(() => ({ me: window.net.me, names: window.net.last.actors.map((a) => a.name).sort() }));
  expect(ids.names).toEqual(['Alfa', 'Beta']);
  const idB = await B.page.evaluate(() => window.net.me);
  expect(ids.me).not.toBe(idB);

  // 2. movimento: A anda para cima; B (outro navegador) vê o A se mexer, e a posição prevista de A bate com a do servidor
  const y0 = await B.page.evaluate((id) => window.net.last.actors.find((a) => a.id === id).y, ids.me);
  await A.page.evaluate(() => window.net.setInput({ mx: 0, my: -1, aimX: 550, aimY: -5000 }));
  await A.page.waitForTimeout(1200);
  await A.page.evaluate(() => window.net.setInput({ mx: 0, my: 0 }));
  await A.page.waitForTimeout(500);
  const view = await B.page.evaluate((id) => window.net.last.actors.find((a) => a.id === id).y, ids.me);
  const own = await A.page.evaluate(() => ({ srv: window.net.srv.y, pred: window.net.pred.y }));
  expect(y0 - view).toBeGreaterThan(150);             // andou ~1,2 s × 200 px/s
  expect(y0 - view).toBeLessThan(260);                // e não mais que a velocidade permite
  expect(Math.abs(own.srv - own.pred)).toBeLessThan(25); // predição corrigida pelo servidor

  // 3. tentativa de trapaça pelo navegador: dano falso é recusado e a vida do alvo não muda
  const hp0 = await B.page.evaluate(() => window.net.srv.hp);
  await A.page.evaluate(([target, v]) => window.net.sendRaw(JSON.stringify({ v, t: 'damage', target, amount: 99999 })), [idB, PROTOCOL_VERSION]);
  await A.page.waitForFunction(() => window.net.rejects.includes('bad_message'), null, { timeout: 5000 });
  await B.page.waitForTimeout(400);
  expect(await B.page.evaluate(() => window.net.srv.hp)).toBe(hp0);

  // 4. ataque real: A persegue o B e bate; o dano chega aos DOIS navegadores como eventos do servidor e a vida de B cai
  await A.page.evaluate(() => window.net.setInput({ mx: 0, my: -1, attack: true, aimX: 550, aimY: -5000 }));
  await B.page.waitForFunction((hp) => window.net.srv.hp < hp, hp0, { timeout: 15000 });
  const hits = async (p) => p.evaluate(() => window.net.events.filter((e) => e.e === 'hit').length);
  await A.page.waitForTimeout(600);
  expect(await hits(A.page)).toBeGreaterThan(0);
  expect(await hits(B.page)).toBeGreaterThan(0);
  const hpA = await A.page.evaluate(() => window.net.last.actors.find((a) => a.slot === 2).hp);
  const hpB = await B.page.evaluate(() => window.net.srv.hp);
  expect(hpA).toBe(hpB); // os dois navegadores concordam sobre a vida de B

  // 5. B perde a conexão: A vê "offline"; B volta com o token, no mesmo personagem
  await A.page.evaluate(() => window.net.setInput({ mx: 0, my: 0, attack: false }));
  await B.page.evaluate(() => window.net.ws.close());
  await A.page.waitForFunction((id) => window.net.last.actors.find((a) => a.id === id)?.online === false, idB, { timeout: 5000 });
  await B.page.waitForFunction(() => window.net.connected && window.net.last?.actors.every((a) => a.online), null, { timeout: 8000 });
  expect(await B.page.evaluate(() => window.net.me)).toBe(idB);

  expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
  await A.ctx.close(); await B.ctx.close();
});
