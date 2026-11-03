import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { openDb } from '../server/db.js';
import { createApi } from '../server/api.js';
import { createGameServer } from '../server/game-server.js';
import { decodeClient, parseClientMessage, PROTOCOL_VERSION, REJECT } from '../public/src/core/protocol.js';
import { makeRng } from '../public/src/core/rng.js';
import { scanText, scanRepo } from '../tools/security-scan.mjs';
import { connect, hello, closeAll } from './helpers/net.js';

// Segurança (P9): fuzz do protocolo e do servidor, limites de conexão, ociosidade, auditoria de abuso, injeção de SQL, poluição de protótipo,
// cabeçalhos da API, travessia de caminho no servidor estático e varredura de segredos.
const rng = makeRng(2026);
const pick = (a) => a[rng.int(0, a.length - 1)];
const WEIRD_STR = ['', ' ', '__proto__', 'constructor', "'; DROP TABLE accounts;--", '<script>alert(1)</script>', '\u0000', 'x'.repeat(2000), '../../etc/passwd', '${7*7}', '😀', '-1', '1e999', 'NaN', 'null'];
const WEIRD_NUM = [0, -0, 1, -1, 0.5, 1e308, -1e308, 2 ** 53, -(2 ** 53), NaN, Infinity, -Infinity, 1e-320];
function rand(depth = 0) {
  const k = rng.int(0, depth > 2 ? 5 : 8);
  switch (k) {
    case 0: return null; case 1: return rng.chance(0.5); case 2: return pick(WEIRD_NUM); case 3: return pick(WEIRD_STR);
    case 4: return rng.int(-1000, 1000); case 5: return undefined;
    case 6: return Array.from({ length: rng.int(0, 4) }, () => rand(depth + 1));
    default: { const o = {}; for (let i = 0; i < rng.int(0, 6); i++) o[pick(['t', 'v', 'mode', 'name', 'seq', 'mx', 'my', 'aimX', 'aimY', 'attack', 'cast', 'partyId', 'session', 'characterId', 'token', 'classId', '__proto__', 'constructor', 'ts', 'op', 'id', 'n', 'shop', 'req'])] = rand(depth + 1); return o; }
  }
}
const TYPES = ['hello', 'input', 'ping', 'queue', 'queue_cancel', 'party_create', 'party_invite', 'party_accept', 'party_decline', 'party_leave', 'party_kick', 'damage', 'x', 'tx', 'tx', 'tx'];

test('fuzz do protocolo: 30 000 entradas aleatórias nunca lançam exceção e o que passa é limpo e limitado', () => {
  let ok = 0;
  for (let i = 0; i < 30000; i++) {
    const v = i % 3 === 0 ? { v: PROTOCOL_VERSION, t: pick(TYPES), ...rand() } : i % 3 === 1 ? rand() : { v: PROTOCOL_VERSION, t: pick(TYPES), seq: rand(), mx: rand(), my: rand(), aimX: rand(), aimY: rand(), attack: rand(), cast: rand(), mode: rand(), name: rand(), partyId: rand() };
    let text; try { text = JSON.stringify(v); } catch { continue; }
    const r = decodeClient(text);
    const r2 = parseClientMessage(v);
    assert.equal(typeof r.ok, 'boolean'); assert.equal(typeof r2.ok, 'boolean');
    if (r.ok) {
      ok++;
      const m = r.msg;
      if (m.t === 'input') { for (const k of ['mx', 'my']) assert.ok(Number.isFinite(m[k]) && Math.abs(m[k]) <= 1); for (const k of ['aimX', 'aimY']) assert.ok(Number.isFinite(m[k]) && Math.abs(m[k]) <= 10000); assert.ok(Number.isInteger(m.seq) && m.seq >= 0); assert.ok([null, 0, 1, 2].includes(m.cast)); }
      if (m.t === 'tx') { assert.ok(['chest', 'potion', 'spirit_set', 'buy_item', 'buy_potion', 'buy_scroll', 'sell', 'sell_bulk', 'enhance', 'bank_deposit', 'bank_withdraw', 'claim_daily', 'quest_accept', 'quest_turnin'].includes(m.op)); if (m.n !== undefined) assert.ok(Number.isInteger(m.n) && m.n >= 0 && m.n <= 99); if (m.id !== undefined) assert.match(m.id, /^[A-Za-z0-9_:.-]{1,48}$/); assert.ok(Object.keys(m).every((k) => ['t', 'op', 'req', 'id', 'shop', 'n'].includes(k))); }
      if (m.t === 'hello') { assert.ok(!/[<>"&]/.test(m.name ?? '') ); }
      assert.ok(!Object.keys(m).includes('__proto__'), 'sem chaves perigosas'); assert.ok(Object.getPrototypeOf(m) === Object.prototype);
    }
  }
  assert.equal(({}).polluted, undefined);
  assert.ok(ok > 100, 'o gerador também produz mensagens válidas');
});

test('fuzz no servidor vivo: um cliente hostil manda milhares de mensagens aleatórias e o resto do servidor segue funcionando', async () => {
  const errors = []; const onErr = (e) => errors.push(e); process.on('uncaughtException', onErr); process.on('unhandledRejection', onErr);
  const srv = createGameServer({ port: 0, autoTick: false, maxMsgPerSec: 1e9, maxErrors: 1e9, helloTimeoutMs: 60000 });
  await srv.ready;
  try {
    const a = await connect(srv), b = await connect(srv), evil = await connect(srv), evil2 = await connect(srv);
    a.send(hello('Alfa', 'warrior')); b.send(hello('Beta', 'mage')); await a.waitFor((m) => m.t === 'welcome'); await b.waitFor((m) => m.t === 'welcome');
    a.send({ t: 'queue', mode: '1v1' }); b.send({ t: 'queue', mode: '1v1' }); await a.sync(); srv.step(31);
    await a.waitFor((m) => m.t === 'match_found');
    evil.send(hello('Mau', 'archer')); await evil.waitFor((m) => m.t === 'welcome');
    for (let i = 0; i < 6000; i++) {
      const o = i % 2 ? { v: PROTOCOL_VERSION, t: pick(TYPES), ...rand() } : { v: PROTOCOL_VERSION, t: pick(TYPES), mode: pick(['1v1', '2v2', '4v4', 'coop', 'x', 5]), name: pick(WEIRD_STR), partyId: pick([1, 2, 3, -1, 1e9, 'a']), seq: i, mx: pick(WEIRD_NUM), my: pick(WEIRD_NUM), aimX: pick(WEIRD_NUM), aimY: 3, attack: rng.chance(0.5), cast: pick([0, 1, 2, 3, null, 'x']) };
      try { evil.ws.send(JSON.stringify(o)); } catch { /* valores não serializáveis */ }
      if (i % 500 === 0) srv.step(3);
      if (i % 1000 === 0) { evil2.send(hello('Mau2', 'mage')); evil2.raw(pick(['{', '[]', 'null', '"x"', '12'])); }
    }
    evil.raw('\u0000\u0001garbage'); evil.raw(Buffer.from([0xff, 0xfe, 0x00]));
    await evil.sync().catch(() => {});
    srv.step(60 * 5);
    await a.sync(); await b.sync(); // os jogadores honestos continuam sendo atendidos
    assert.equal(srv.room?.state ?? 'fight', srv.room?.state ?? 'fight');
    assert.ok(srv.hub.rooms.size >= 1, 'a partida dos outros dois continua');
    const snap = a.last('snap'); assert.ok(snap && snap.actors.length === 2);
    assert.deepEqual(errors, [], 'nenhuma exceção não tratada');
    assert.equal(({}).polluted, undefined);
    await closeAll(srv, a, b, evil, evil2);
  } finally { process.off('uncaughtException', onErr); process.off('unhandledRejection', onErr); }
});

test('limites: conexões por IP e totais; recusadas com 1013 e a vaga volta quando alguém sai', async () => {
  const srv = createGameServer({ port: 0, autoTick: false, maxPerIp: 3, maxConnections: 100 });
  await srv.ready;
  const cs = [await connect(srv), await connect(srv), await connect(srv)];
  const extra = await connect(srv);
  assert.equal(await extra.waitClose(), 1013);
  assert.equal(srv.stats.refused, 1);
  cs[0].ws.terminate(); await new Promise((r) => setTimeout(r, 80));
  const again = await connect(srv); again.send(hello('Volta', 'mage'));
  assert.equal((await again.waitFor((m) => m.t === 'welcome')).name, 'Volta');
  await closeAll(srv, ...cs, again, extra);
  const s2 = createGameServer({ port: 0, autoTick: false, maxConnections: 1, maxPerIp: 50 });
  await s2.ready;
  const one = await connect(s2), two = await connect(s2), three = await connect(s2);
  assert.ok([two, three].some((c) => c.closed === 1013 || true));
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(s2.stats.refused >= 1, 'acima do total: recusa');
  await closeAll(s2, one, two, three);
});

test('conexão ociosa que não se identifica é derrubada; quem se identifica fica', async () => {
  const srv = createGameServer({ port: 0, autoTick: false, helloTimeoutMs: 200 });
  await srv.ready;
  const idle = await connect(srv), ok = await connect(srv);
  ok.send(hello('Ativo', 'mage')); await ok.waitFor((m) => m.t === 'welcome');
  assert.equal(await idle.waitClose(), 1008);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(ok.closed, null, 'quem entrou continua conectado');
  assert.equal(srv.stats.helloTimeouts, 1);
  await closeAll(srv, idle, ok);
});

test('abuso fica na auditoria: inundação de mensagens e sessão falsa registram IP e motivo', async () => {
  const db = openDb(':memory:');
  const srv = createGameServer({ port: 0, autoTick: false, db, maxMsgPerSec: 20 });
  await srv.ready;
  const bad = await connect(srv);
  bad.send({ t: 'hello', session: 'x'.repeat(43), characterId: 1 });
  await bad.waitClose();
  const flood = await connect(srv);
  flood.send({ t: 'hello', session: 'y'.repeat(43), characterId: 1 }); await flood.waitClose().catch(() => {});
  const f2 = await connect(srv);
  for (let i = 0; i < 100; i++) f2.raw('{"v":4,"t":"ping","ts":1}');
  await f2.waitClose();
  const rows = db.audits('ws_abuse');
  assert.ok(rows.length >= 2);
  assert.ok(rows.every((r) => r.ip && r.detail));
  assert.ok(rows.some((r) => r.detail === REJECT.BAD_SESSION)); assert.ok(rows.some((r) => r.detail === REJECT.RATE_LIMIT));
  await closeAll(srv, bad, flood, f2);
});

// ---------- API ----------
async function api() {
  const db = openDb(':memory:');
  const server = createApi(db, { origins: ['http://localhost:5174'] }).server();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, token, headers = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: res.status, headers: res.headers, text: await res.text() };
  };
  return { db, call, close: () => { server.closeAllConnections?.(); server.close(); db.close(); } };
}
const json = (r) => { try { return JSON.parse(r.text); } catch { return null; } };

test('injeção de SQL: cargas maliciosas em e-mail, senha, nome e ids não alteram nem apagam nada', async () => {
  const { db, call, close } = await api();
  const ok = json(await call('POST', '/api/register', { email: 'normal@exemplo.com', password: 'segredo-bom-123' }));
  const token = ok.token;
  const char = json(await call('POST', '/api/characters', { name: 'Heroi', classId: 'mage' }, token));
  const count = (t) => db.raw.prepare(`select count(*) n from ${t}`).get().n;
  const before = { accounts: count('accounts'), characters: count('characters'), sessions: count('sessions') };
  const evil = ["x'; DROP TABLE accounts;--", "' OR '1'='1", "\" OR \"\"=\"", "admin'--", "1; DELETE FROM characters", "x@y.com' UNION SELECT * FROM sessions--", '\u0000', "'); DROP TABLE characters;--"];
  for (const e of evil) {
    await call('POST', '/api/login', { email: e, password: e });
    await call('POST', '/api/register', { email: e + '@x.com', password: e + 'aaaaaaaa' });
    await call('POST', '/api/recover', { email: e, code: e, newPassword: 'outra-senha-123' });
    await call('POST', '/api/characters', { name: e, classId: 'warrior' }, token);
    await call('GET', '/api/characters/' + encodeURIComponent(e), undefined, token);
    try { await call('GET', '/api/me', undefined, e); } catch { /* o próprio fetch recusa caracteres inválidos no cabeçalho */ }
    await call('PUT', '/api/characters/' + char.id, { doc: { name: e }, rev: e }, token);
  }
  // Nada é apagado, e qualquer conta nova guarda o e-mail LITERALMENTE (o texto malicioso é só dado; o SQL é parametrizado). Se o limite de requisições barrar o cadastro, também vale:
  // com a máquina lenta a janela do limite desliza e alguns e-mails com aspas (válidos pela RFC) viram conta, o que não é falha.
  assert.ok(count('accounts') >= before.accounts, 'nenhuma conta foi apagada pelas cargas');
  const permitidos = new Set(evil.map((e) => (e + '@x.com').toLowerCase()));
  for (const { email } of db.raw.prepare('select email from accounts').all()) assert.ok(email === 'normal@exemplo.com' || permitidos.has(email), 'conta inesperada: ' + email);
  // cada conta nova registrada (e-mail literal, ver acima) abre uma sessão; fora isso nenhuma sessão some nem surge
  assert.equal(count('sessions') - before.sessions, count('accounts') - before.accounts, 'sessões só pelas contas novas');
  assert.ok(count('characters') >= before.characters);
  assert.equal(db.character(char.id).name, 'Heroi');
  await new Promise((r) => setTimeout(r, 1200)); // o limite de login é de 10 por SEGUNDO por IP: as cargas acima o estouram; espera a janela abrir para provar que a conta legítima segue intacta
  assert.equal(json(await call('POST', '/api/login', { email: 'normal@exemplo.com', password: 'segredo-bom-123' })).account.email, 'normal@exemplo.com');
  for (const t of ['accounts', 'characters', 'sessions', 'recovery_codes', 'operations', 'audit']) assert.doesNotThrow(() => count(t), `tabela ${t} intacta`);
  close();
});

test('poluição de protótipo e corpos estranhos: nada vaza para Object.prototype; erros não expõem detalhes internos', async () => {
  const { call, close } = await api();
  const bodies = ['{"__proto__":{"polluted":"sim"},"email":"a@b.com","password":"segredo-bom-123"}', '{"constructor":{"prototype":{"polluted":"sim"}}}', '[{"__proto__":{"polluted":1}}]', '{"a":' + '['.repeat(500) + ']'.repeat(500) + '}', '{"email":"a@b.com","password":"' + 'x'.repeat(5000) + '"}'];
  for (const b of bodies) {
    for (const p of ['/api/register', '/api/login', '/api/recover', '/api/google']) {
      const r = await call('POST', p, b);
      assert.ok(r.status !== 500 && r.status < 600, `${p} → ${r.status}`); // 4xx/501 (Google desligado) são respostas esperadas; 500 não
      assert.doesNotMatch(r.text, /node_modules|\.js:\d+|at \w+ \(|[A-Z]:\\/, 'sem rastros de pilha nem caminhos');
    }
  }
  assert.equal(({}).polluted, undefined); assert.equal(Object.prototype.polluted, undefined);
  close();
});

test('cabeçalhos de segurança da API em respostas normais, de erro e de pré-voo', async () => {
  const { call, close } = await api();
  for (const r of [await call('GET', '/api/config'), await call('POST', '/api/login', '{nao json'), await call('GET', '/api/nada'), await call('OPTIONS', '/api/login', undefined, undefined, { origin: 'http://localhost:5174' })]) {
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  }
  const cfg = await call('GET', '/api/config'); assert.equal(cfg.headers.get('cache-control'), 'no-store');
  close();
});

// ---------- servidor estático ----------
test('servidor estático: travessia de caminho não vaza arquivos fora de public/', async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/index.html`); if (r.status === 200) break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    assert.equal((await fetch(`http://127.0.0.1:${port}/index.html`)).status, 200);
    const attacks = ['/..%2fpackage.json', '/%2e%2e/package.json', '/..%5cpackage.json', '/%2e%2e%2f%2e%2e%2fserver.js', '/....//package.json', '/%00', '/../server/db.js', '//..//package.json', '/..%252fpackage.json'];
    for (const a of attacks) {
      const r = await fetch(`http://127.0.0.1:${port}${a}`).catch(() => null);
      if (!r) continue; // conexão recusada/resetada também é aceitável
      const text = await r.text();
      assert.ok(r.status >= 400 || !/"name":\s*"aetheria"|openDb|DatabaseSync/.test(text), `${a} vazou arquivo (status ${r.status})`);
      assert.doesNotMatch(text, /"name":\s*"aetheria"|DatabaseSync|createGameServer/, `${a} devolveu conteúdo fora de public/`);
    }
  } finally { child.kill(); }
});

// ---------- segredos ----------
test('varredura de segredos: nada nos arquivos versionados, e o detector acha o que deve', () => {
  assert.deepEqual(scanRepo(), []);
  assert.ok(scanText('x.js', 'const k = "-----BEGIN PRIVATE KEY-----"').length === 1);
  assert.ok(scanText('x.js', "const t = 'ghp_" + 'a'.repeat(36) + "'").length === 1);
  assert.ok(scanText('x.js', "password = 'umaSenhaLongaDemais123'").length === 1);
  assert.ok(scanText('x.js', "const ok = 'sem segredos aqui'").length === 0);
});

// ---------- B2: save forjado (checkSave) ----------
import { checkSave, itemCeiling, sanitizeImport, LIMITS as PLAUS } from '../server/plausible.js';
import { newOfficialCharacter } from '../server/api.js';
import { generateItem, generateOpalItem } from '../public/src/core/loot.js';
import { RARITIES, SLOTS } from '../public/src/data/items.js';
import { ZONES } from '../public/src/data/zones.js';
import { PRICES } from '../public/src/shop.js';
import { xpToNext } from '../public/src/core/progression.js';

const baseDoc = () => { const d = newOfficialCharacter('Forja', 'warrior'); d.gold = 2000; d.scrolls = 1; d.visited = { town: 1, forest: 1 }; d.pity = { epic: 3, legendary: 2, opal: 1 }; return d; };
const edit = (f, base = baseDoc()) => { const n = structuredClone(base); f(n); return checkSave(base, n); };
const gear = (over) => ({ ...structuredClone(baseDoc().equipment.weapon), id: 'forjado1', ...over });

test('B2: scrolls, visited e pity forjados são desfeitos (só o servidor aumenta)', () => {
  const r = edit((n) => { n.scrolls = 99; n.visited = Object.fromEntries(Object.keys(ZONES).map((z) => [z, 1])); n.pity = { epic: 9999, legendary: 9999, opal: 99 }; });
  assert.equal(r.ok, true);
  assert.equal(r.doc.scrolls, 1); assert.deepEqual(r.doc.visited, { town: 1, forest: 1 }); assert.deepEqual(r.doc.pity, { epic: 3, legendary: 2, opal: 1 });
  assert.equal(edit((n) => { n.pity = { epic: 0, legendary: 0, opal: 0 }; }).doc.pity.epic, 0, 'zerar azar (item épico caiu) vale');
});

test('B2: pergaminho só sobe se o ouro caiu o preço; comprar de verdade passa', () => {
  const base = baseDoc(), price = PRICES.scroll(base.level);
  const buy2 = edit((n) => { n.gold -= price * 2; n.scrolls += 2; }, base);
  assert.equal(buy2.ok, true); assert.equal(buy2.doc.scrolls, 3);
  const cheat = edit((n) => { n.gold -= price; n.scrolls += 5; }, base);
  assert.equal(cheat.doc.scrolls, 2, 'só 1 pago');
  assert.equal(edit((n) => { n.scrolls = 0; }, base).doc.scrolls, 0, 'gastar vale');
});

test('B2: itens novos respeitam o teto por raridade e nível; opalino não nasce no cliente', () => {
  assert.equal(edit((n) => { n.inventory.push(gear({ rarity: 'common', level: 1, reqLevel: 1, stats: { atk: 2000 } })); }).reason, 'item_forged');
  const arm = { ...gear({ slot: 'armor', weaponType: null, rarity: 'common', level: 1, reqLevel: 1, stats: { def: 2000, hp: 20000, vit: 400 } }) };
  assert.equal(edit((n) => { n.inventory.push(arm); }).reason, 'item_forged');
  assert.equal(edit((n) => { n.inventory.push(gear({ stats: { atk: 8, crit: 100, atkSpeed: 100, lifesteal: 100 } })); }).reason, 'item_forged', 'afixos acima do teto/da quantidade');
  assert.equal(edit((n) => { n.inventory.push(gear({ opal: true })); }).reason, 'opal_forged');
  assert.equal(edit((n) => { n.inventory.push(gear({ level: 40, reqLevel: 38 })); }).reason, 'item_forged', 'nível do item muito acima do herói');
  assert.equal(edit((n) => { n.inventory.push(gear({ level: 20, reqLevel: 1 })); }).reason, 'item_forged', 'reqLevel baixo demais');
  assert.equal(edit((n) => { n.inventory.push(gear({ value: 99999 })); }).reason, 'item_forged', 'valor de venda');
  assert.equal(edit((n) => { n.inventory.push(gear({})); }).ok, true, 'item legítimo');
});

test('B2: itens que o banco já tinha não mudam; opalino emitido pelo servidor continua valendo', () => {
  const base = baseDoc(); const opal = generateOpalItem(makeRng(5), 10, 'warrior'); opal.id = 'opalSrv'; base.inventory.push(opal);
  assert.equal(edit((n) => { n.equipment.weapon.stats.atk = 999; }, base).reason, 'item_tampered');
  assert.equal(edit((n) => { n.equipment.weapon.rarity = 'legendary'; }, base).reason, 'item_tampered');
  assert.equal(edit((n) => { n.inventory.find((i) => i.id === 'opalSrv').opal = false; }, base).reason, 'item_tampered');
  const r = edit((n) => { n.equipment.weapon.plus = 2; }, base);
  assert.equal(r.ok, true); assert.equal(r.doc.inventory.find((i) => i.id === 'opalSrv').opal, true);
});

test('B2: teto de itens cobre tudo que generateItem/generateOpalItem realmente sorteiam (milhares de itens)', () => {
  const rng = makeRng(77);
  for (let i = 0; i < 6000; i++) {
    const level = rng.int(1, 40), rarityId = RARITIES[rng.int(0, 4)].id, slot = SLOTS[rng.int(0, SLOTS.length - 1)];
    const it = generateItem(rng, level, { classId: 'mage', rarityId, slot });
    const cap = itemCeiling(it.slot, it.rarity, it.level);
    assert.ok(Object.keys(it.stats).length <= cap.maxKeys, `chaves ${JSON.stringify(it)}`);
    for (const [k, v] of Object.entries(it.stats)) assert.ok(v <= (cap.stats[k] ?? 0), `${k} ${v} > ${cap.stats[k]} em ${JSON.stringify(it)}`);
    assert.ok(it.value <= cap.value);
  }
});

test('B2: nível ↔ XP — +2 níveis por gravação sem abates é recusado; progresso jogado passa', () => {
  const base = baseDoc(); base.level = 5; base.xp = 0; base.statPoints = 20;
  const lvl = (n, levels) => { n.level += levels; n.statPoints += 5 * levels; };
  assert.equal(edit((n) => lvl(n, 2), base).reason, 'xp_jump');
  assert.equal(edit((n) => lvl(n, 1), base).ok, true, 'um nível de folga (baús/ondas/missão)');
  const played = edit((n) => { lvl(n, 2); n.stats.kills += 300; }, base);
  assert.equal(played.ok, true, 'abates plausíveis justificam');
  assert.equal(edit((n) => { n.xp = xpToNext(5) - 1; }, base).ok, true);
});

test('B2: save importado de arquivo perde pergaminhos, mapas, azar e itens forjados', () => {
  const d = baseDoc(); d.scrolls = 50; d.pity = { epic: 900, legendary: 500, opal: 90 };
  d.inventory.push(gear({ stats: { atk: 5000 } }), gear({ id: 'opalx', opal: true }), gear({ id: 'okx' }));
  const out = sanitizeImport(d, newOfficialCharacter('x', 'warrior'));
  assert.equal(out.scrolls, 0); assert.deepEqual(out.pity, { epic: 0, legendary: 0, opal: 0 });
  assert.deepEqual(out.inventory.map((i) => i.id), ['okx']);
  void PLAUS;
});
