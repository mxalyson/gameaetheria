import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHmac } from 'node:crypto';
import { openDb } from '../server/db.js';
import { createApi, newOfficialCharacter } from '../server/api.js';
import { verifyGoogleIdToken, passwordProblem, hashPassword, verifyPassword, validEmail } from '../server/auth.js';
import { checkSave } from '../server/plausible.js';
import { exportSave, SAVE_VERSION } from '../public/src/core/savedoc.js';

// ---------- utilitários ----------
const CLIENT_ID = 'cliente-teste.apps.googleusercontent.com';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwt(payload, { header = { alg: 'RS256', kid: 'k1', typ: 'JWT' }, key = privateKey } = {}) {
  const data = b64u(header) + '.' + b64u(payload);
  return data + '.' + sign('RSA-SHA256', Buffer.from(data), key).toString('base64url');
}
const NOW = () => Math.floor(Date.now() / 1000);
const goodClaims = (extra = {}) => ({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'g-123', email: 'g@exemplo.com', email_verified: true, iat: NOW(), exp: NOW() + 600, ...extra });

async function setup({ google = false, origins = ['http://localhost:5174'] } = {}) {
  const db = openDb(':memory:');
  const clock = { t: Date.now() }; // relógio injetável: os testes avançam o tempo sem esperar
  const api = createApi(db, { strictPve: false, /* estes testes cobrem os limites de plausibilidade clássicos; o modo estrito (padrão) é de pve-strict.test.js */ googleClientId: google ? CLIENT_ID : null, origins, now: () => clock.t, fetchJwks: async () => [JWK] });
  const server = api.server();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, token, headers = {}) => {
    const res = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
  };
  return { db, api, server, call, clock, close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); db.close(); }) };
}
const PW = 'segredo-bom-123';
const register = async (s, email = 'ana@exemplo.com') => (await s.call('POST', '/api/register', { email, password: PW })).body;

// ---------- senhas e contas ----------
test('política de senha e e-mail', () => {
  assert.ok(passwordProblem('curta'));
  assert.ok(passwordProblem('12345678'));
  assert.ok(passwordProblem('x'.repeat(200)));
  assert.ok(passwordProblem('aaaaaaaaaa'));
  assert.ok(passwordProblem('minhaconta-ana-1', 'minhaconta@x.com'));
  assert.equal(passwordProblem('segredo-bom-123', 'ana@x.com'), null);
  assert.equal(validEmail('a@b.co'), true);
  for (const e of ['', 'a@b', '@x.com', 'a b@x.com', '<a>@x.com', 'x'.repeat(260) + '@x.com']) assert.equal(validEmail(e), false, e);
});

test('senha: scrypt com sal único; verificação correta e em tempo constante', async () => {
  const h1 = await hashPassword('abc12345'), h2 = await hashPassword('abc12345');
  assert.notEqual(h1, h2);
  assert.ok(h1.startsWith('scrypt$'));
  assert.equal(await verifyPassword('abc12345', h1), true);
  assert.equal(await verifyPassword('abc12346', h1), false);
  assert.equal(await verifyPassword('x', 'lixo'), false);
});

test('cadastro: devolve sessão e 8 códigos de recuperação; nada sensível fica em claro no banco', async () => {
  const s = await setup();
  const r = await s.call('POST', '/api/register', { email: ' Ana@Exemplo.com ', password: PW });
  assert.equal(r.status, 201);
  assert.equal(r.body.account.email, 'ana@exemplo.com');
  assert.equal(r.body.recoveryCodes.length, 8);
  assert.ok(r.body.token.length >= 32);
  const acc = s.db.accountByEmail('ana@exemplo.com');
  assert.ok(acc.pw_hash.startsWith('scrypt$') && !acc.pw_hash.includes(PW));
  const rows = s.db.raw.prepare('select hash from sessions').all(), codes = s.db.raw.prepare('select hash from recovery_codes').all();
  assert.ok(rows.every((x) => x.hash !== r.body.token) && rows.length === 1, 'sessão guardada só como hash');
  assert.ok(codes.every((x) => !r.body.recoveryCodes.includes(x.hash)));
  assert.equal(JSON.stringify(r.body).includes('pw_hash'), false);
  await s.close();
});

test('cadastro recusa e-mail repetido, e-mail inválido e senha fraca', async () => {
  const s = await setup();
  await register(s);
  assert.equal((await s.call('POST', '/api/register', { email: 'ana@exemplo.com', password: PW })).status, 409);
  assert.equal((await s.call('POST', '/api/register', { email: 'nao-e-email', password: PW })).body.error, 'bad_email');
  assert.equal((await s.call('POST', '/api/register', { email: 'b@exemplo.com', password: '12345678' })).body.error, 'weak_password');
  await s.close();
});

test('login: sucesso; erro igual para e-mail inexistente e senha errada; bloqueio após 5 falhas e liberação com o tempo', async () => {
  const s = await setup();
  await register(s);
  const ok = await s.call('POST', '/api/login', { email: 'ana@exemplo.com', password: PW });
  assert.equal(ok.status, 200); assert.ok(ok.body.token);
  const wrongPw = await s.call('POST', '/api/login', { email: 'ana@exemplo.com', password: 'errada-errada' });
  const noUser = await s.call('POST', '/api/login', { email: 'ninguem@exemplo.com', password: 'errada-errada' });
  assert.equal(wrongPw.status, 401); assert.deepEqual(wrongPw.body, noUser.body, 'mesma resposta: não revela quais e-mails existem');
  for (let i = 0; i < 4; i++) { s.clock.t += 61_000; await s.call('POST', '/api/login', { email: 'ana@exemplo.com', password: 'errada-errada' }); }
  s.clock.t += 61_000;
  const locked = await s.call('POST', '/api/login', { email: 'ana@exemplo.com', password: PW });
  assert.equal(locked.status, 429); assert.equal(locked.body.error, 'locked', 'senha certa também é recusada durante o bloqueio');
  s.clock.t += 16 * 60_000;
  assert.equal((await s.call('POST', '/api/login', { email: 'ana@exemplo.com', password: PW })).status, 200);
  await s.close();
});

test('limite de taxa nas rotas de login/cadastro por IP', async () => {
  const s = await setup();
  let last;
  for (let i = 0; i < 12; i++) last = await s.call('POST', '/api/login', { email: `x${i}@exemplo.com`, password: 'qualquer-senha' });
  assert.equal(last.status, 429);
  assert.equal(last.body.error, 'rate_limit');
  await s.close();
});

test('sessões: sem token ou token inválido = 401; expirada = 401; logout encerra', async () => {
  const s = await setup();
  const { token } = await register(s);
  assert.equal((await s.call('GET', '/api/me')).status, 401);
  assert.equal((await s.call('GET', '/api/me', undefined, 'x'.repeat(43))).status, 401);
  assert.equal((await s.call('GET', '/api/me', undefined, token)).status, 200);
  assert.equal((await s.call('POST', '/api/logout', {}, token)).status, 200);
  assert.equal((await s.call('GET', '/api/me', undefined, token)).status, 401);
  const t2 = (await s.call('POST', '/api/login', { email: 'ana@exemplo.com', password: PW })).body.token;
  s.clock.t += 15 * 24 * 3600 * 1000;
  assert.equal((await s.call('GET', '/api/me', undefined, t2)).status, 401, 'sessão expira em 14 dias');
  await s.close();
});

test('recuperação: código de uso único redefine a senha, encerra sessões e gera códigos novos', async () => {
  const s = await setup();
  const r = await register(s);
  const code = r.recoveryCodes[0];
  const bad = await s.call('POST', '/api/recover', { email: 'ana@exemplo.com', code: 'aaaaa-bbbbb', newPassword: 'nova-senha-456' });
  assert.equal(bad.status, 400);
  const ok = await s.call('POST', '/api/recover', { email: 'ana@exemplo.com', code, newPassword: 'nova-senha-456' });
  assert.equal(ok.status, 200); assert.equal(ok.body.recoveryCodes.length, 8);
  assert.equal((await s.call('GET', '/api/me', undefined, r.token)).status, 401, 'sessões antigas encerradas');
  s.clock.t += 61_000;
  assert.equal((await s.call('POST', '/api/login', { email: 'ana@exemplo.com', password: PW })).status, 401, 'senha antiga não vale');
  s.clock.t += 61_000;
  assert.equal((await s.call('POST', '/api/login', { email: 'ana@exemplo.com', password: 'nova-senha-456' })).status, 200);
  s.clock.t += 61_000;
  assert.equal((await s.call('POST', '/api/recover', { email: 'ana@exemplo.com', code, newPassword: 'outra-senha-789' })).status, 400, 'o mesmo código não vale duas vezes');
  await s.close();
});

// ---------- Google ----------
test('Google: aceita token válido e recusa assinatura, emissor, público, validade, algoritmo e e-mail não verificado', async () => {
  const opts = { clientId: CLIENT_ID, fetchJwks: async () => [JWK], nowSec: NOW() };
  assert.equal((await verifyGoogleIdToken(jwt(goodClaims()), opts)).sub, 'g-123');
  const rejects = async (token, re) => assert.rejects(() => verifyGoogleIdToken(token, opts), (e) => { assert.match(e.message, re); return true; });
  await rejects(jwt(goodClaims({ aud: 'outro-cliente' })), /público/);
  await rejects(jwt(goodClaims({ iss: 'https://evil.example' })), /emissor/);
  await rejects(jwt(goodClaims({ exp: NOW() - 10 })), /expirado/);
  await rejects(jwt(goodClaims({ email_verified: false })), /verificado/);
  await rejects(jwt(goodClaims({ email_verified: 'true' })), /verificado/);
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await rejects(jwt(goodClaims(), { key: other }), /assinatura/);
  const good = jwt(goodClaims()).split('.');
  await rejects([good[0], b64u(goodClaims({ sub: 'outro' })), good[2]].join('.'), /assinatura/); // payload adulterado
  await rejects(b64u({ alg: 'none', kid: 'k1' }) + '.' + b64u(goodClaims()) + '.', /algoritmo/);
  const hs = b64u({ alg: 'HS256', kid: 'k1' }) + '.' + b64u(goodClaims());
  await rejects(hs + '.' + createHmac('sha256', 'x').update(hs).digest('base64url'), /algoritmo/); // confusão RS256/HS256
  await rejects(jwt(goodClaims(), { header: { alg: 'RS256', kid: 'desconhecida' } }), /chave/);
  await rejects('lixo', /formato/); await rejects(null, /formato/); await rejects('a.b.c', /formato/);
});

test('Google via API: cria conta, repete login na mesma conta, vincula e-mail existente; desligado sem client id', async () => {
  const off = await setup({ google: false });
  assert.equal((await off.call('POST', '/api/google', { idToken: jwt(goodClaims()) })).status, 501);
  await off.close();
  const s = await setup({ google: true });
  assert.equal((await s.call('GET', '/api/config')).body.googleClientId, CLIENT_ID);
  const first = await s.call('POST', '/api/google', { idToken: jwt(goodClaims()) });
  assert.equal(first.status, 200); assert.equal(first.body.isNew, true); assert.equal(first.body.account.google, true);
  const again = await s.call('POST', '/api/google', { idToken: jwt(goodClaims()) });
  assert.equal(again.body.isNew, false); assert.equal(again.body.account.id, first.body.account.id);
  await register(s, 'ana@exemplo.com');
  const link = await s.call('POST', '/api/google', { idToken: jwt(goodClaims({ sub: 'g-999', email: 'ana@exemplo.com' })) });
  assert.equal(link.body.isNew, false); assert.equal(link.body.account.hasPassword, true); assert.equal(link.body.account.google, true);
  assert.equal((await s.call('POST', '/api/google', { idToken: jwt(goodClaims({ aud: 'x' })) })).status, 401);
  await s.close();
});

// ---------- personagens ----------
test('personagem criado pelo servidor: oficial, nome limpo, único; limite de 4 por conta; isolamento entre contas', async () => {
  const s = await setup();
  const a = await register(s, 'a@exemplo.com'), b = await register(s, 'b@exemplo.com');
  const c = await s.call('POST', '/api/characters', { name: '<b>Zé</b>', classId: 'mage' }, a.token);
  assert.equal(c.status, 201);
  assert.equal(c.body.character.name, 'bZéb'); assert.equal(c.body.character.level, 1); assert.equal(c.body.character.version, SAVE_VERSION);
  assert.equal(c.body.character.spirits.length, 1);
  assert.equal((await s.call('POST', '/api/characters', { name: 'bzéb', classId: 'mage' }, b.token)).body.error, 'name_taken', 'nome único sem diferenciar maiúsculas');
  assert.equal((await s.call('POST', '/api/characters', { name: 'X', classId: 'dragon' }, a.token)).status, 400);
  for (const n of ['Dois', 'Tres', 'Quatro']) assert.equal((await s.call('POST', '/api/characters', { name: n, classId: 'archer' }, a.token)).status, 201);
  assert.equal((await s.call('POST', '/api/characters', { name: 'Cinco', classId: 'archer' }, a.token)).body.error, 'slots_full');
  assert.equal((await s.call('GET', '/api/me', undefined, a.token)).body.characters.length, 4);
  assert.equal((await s.call('GET', `/api/characters/${c.body.id}`, undefined, b.token)).status, 404, 'a outra conta não enxerga');
  assert.equal((await s.call('PUT', `/api/characters/${c.body.id}`, { doc: c.body.character, rev: 0 }, b.token)).status, 404);
  assert.equal((await s.call('DELETE', `/api/characters/${c.body.id}`, undefined, b.token)).status, 404);
  assert.equal((await s.call('DELETE', `/api/characters/${c.body.id}`, undefined, a.token)).status, 200);
  assert.equal((await s.call('GET', `/api/characters/${c.body.id}`, undefined, a.token)).status, 404);
  await s.close();
});

test('importar save local: ids novos, arena reiniciada, trapaças limitadas; save inválido é recusado', async () => {
  const s = await setup();
  const { token } = await register(s);
  const local = newOfficialCharacter('Veterano', 'warrior');
  local.level = 12; local.gold = 5e12; local.arena = { rating: 4000, wins: 99, losses: 0, bestWave: 500 };
  const oldIds = [...local.spirits.map((x) => x.id), ...Object.values(local.equipment).map((x) => x.id)];
  const r = await s.call('POST', '/api/characters/import', { save: exportSave(local) }, token);
  assert.equal(r.status, 201);
  const d = r.body.character;
  assert.equal(d.level, 12); assert.equal(d.gold, 1e9);
  assert.equal(d.arena.rating, 1000); assert.equal(d.arena.wins, 0, 'rating/vitórias locais não valem');
  assert.ok(d.arena.bestWave <= 10);
  const newIds = [...d.spirits.map((x) => x.id), ...Object.values(d.equipment).map((x) => x.id)];
  assert.ok(newIds.every((id) => !oldIds.includes(id)), 'ids reemitidos pelo servidor');
  assert.equal(d.activeSpirit, d.spirits[0].id);
  const dup = await s.call('POST', '/api/characters/import', { save: exportSave(local) }, token);
  assert.equal(dup.status, 201); assert.notEqual(dup.body.character.name, d.name, 'nome repetido ganha sufixo');
  assert.equal((await s.call('POST', '/api/characters/import', { save: '{"classId":"dragon"}' }, token)).status, 422);
  assert.equal((await s.call('POST', '/api/characters/import', { save: 'não é json' }, token)).status, 422);
  await s.close();
});

test('salvar na nuvem: revisão otimista, saltos absurdos recusados, arena e campos fixos pertencem ao servidor', async () => {
  const s = await setup();
  const { token } = await register(s);
  const c = (await s.call('POST', '/api/characters', { name: 'Nuvem', classId: 'cleric' }, token)).body;
  const doc = () => structuredClone(c.character);
  const put = (d, rev) => s.call('PUT', `/api/characters/${c.id}`, { doc: d, rev }, token);

  let d = doc(); d.gold += 300; d.xp += 50; d.level = 2;
  const ok = await put(d, 0);
  assert.equal(ok.status, 200); assert.equal(ok.body.rev, 1);
  assert.equal((await put(d, 0)).status, 409, 'revisão velha (outra aba/aparelho salvou antes)');
  d = ok.body.character;
  const cheat = (mut) => { const x = structuredClone(d); mut(x); return x; };
  assert.equal((await put(cheat((x) => { x.level = 9; }), 1)).body.message, 'Salvamento recusado: level_jump');
  assert.equal((await put(cheat((x) => { x.gold = 900000; }), 1)).status, 422);
  assert.equal((await put(cheat((x) => { x.level = 1; }), 1)).status, 422, 'nível não diminui');
  assert.equal((await put(cheat((x) => { x.classId = 'mage'; }), 1)).status, 422);
  assert.equal((await put(cheat((x) => { x.name = 'Outro'; }), 1)).status, 422);
  assert.equal((await put(cheat((x) => { x.created = 1; }), 1)).status, 422);
  assert.equal((await put(cheat((x) => { x.arena.bestWave = 400; }), 1)).status, 422);
  assert.equal((await put({ classId: 'dragon' }, 1)).status, 422);
  assert.equal((await put(d, 'x')).status, 400);
  const flood = cheat((x) => { for (let i = 0; i < 20; i++) x.inventory.push({ ...d.equipment.weapon, id: 'novo' + i }); });
  assert.equal((await put(flood, 1)).body.message, 'Salvamento recusado: item_flood');
  const rating = await put(cheat((x) => { x.arena.rating = 4999; x.arena.wins = 500; x.arena.ratings = { '2v2': 4000 }; x.gold += 5; }), 1);
  assert.equal(rating.status, 200);
  assert.equal(rating.body.character.arena.rating, 1000); assert.equal(rating.body.character.arena.wins, 0); assert.deepEqual(rating.body.character.arena.ratings, {});
  assert.equal(rating.body.character.gold, d.gold + 5, 'o resto do salvamento valeu');
  assert.ok(s.db.audits('save_rejected').length >= 8, 'tentativas recusadas ficam no registro de auditoria');
  await s.close();
});

test('checkSave (puro): item novo legítimo passa; muitos itens novos não', () => {
  const old = newOfficialCharacter('P', 'warrior'), neu = structuredClone(old);
  neu.gold += 100;
  assert.equal(checkSave(old, neu).ok, true);
  for (let i = 0; i < 13; i++) neu.inventory.push({ ...old.equipment.weapon, id: 'n' + i });
  assert.equal(checkSave(old, neu).reason, 'item_flood');
});

// ---------- HTTP geral ----------
test('CORS, tamanho do corpo, tipo de conteúdo e JSON inválido', async () => {
  const s = await setup();
  const pre = await s.call('OPTIONS', '/api/login', undefined, undefined, { origin: 'http://localhost:5174' });
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:5174');
  assert.equal((await s.call('OPTIONS', '/api/login', undefined, undefined, { origin: 'http://evil.example' })).status, 403);
  assert.equal((await s.call('GET', '/api/config', undefined, undefined, { origin: 'http://evil.example' })).status, 403);
  assert.equal((await s.call('POST', '/api/login', 'x'.repeat(20000), undefined, { 'content-type': 'application/json' })).status, 413);
  assert.equal((await s.call('POST', '/api/login', '{nao json')).body.error, 'bad_json');
  const wrong = await fetch(`http://127.0.0.1:${s.server.address().port}/api/login`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(wrong.status, 415);
  assert.equal((await s.call('GET', '/api/nada')).status, 401);
  assert.equal((await s.call('POST', '/api/login', [])).body.error, 'bad_json');
  await s.close();
});

// ---------- banco: operações idempotentes ----------
test('operação idempotente: a mesma opId aplica uma vez; erro desfaz tudo', async () => {
  const s = await setup();
  const { token } = await register(s);
  const c = (await s.call('POST', '/api/characters', { name: 'Op', classId: 'mage' }, token)).body;
  const add = (n) => (doc) => ({ doc: { ...doc, gold: doc.gold + n }, summary: { gold: n } });
  assert.equal(s.db.applyOperation('match:1:' + c.id, c.id, 'reward', add(100)).duplicate, false);
  assert.equal(s.db.applyOperation('match:1:' + c.id, c.id, 'reward', add(100)).duplicate, true);
  assert.equal(s.db.character(c.id).doc.gold, c.character.gold + 100);
  assert.throws(() => s.db.applyOperation('match:2:' + c.id, c.id, 'reward', () => { throw new Error('falhou'); }));
  assert.equal(s.db.applyOperation('match:2:' + c.id, c.id, 'reward', add(5)).duplicate, false, 'a falha não consumiu a opId');
  assert.equal(s.db.character(c.id).doc.gold, c.character.gold + 105);
  await s.close();
});
