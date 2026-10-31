import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createApi } from '../server/api.js';
import { createGameServer } from '../server/game-server.js';
import { readConfig, makeLogger, createOps, gracefulShutdown } from '../server/ops.js';
import { restore } from '../tools/db-restore.mjs';
import { connect, hello } from './helpers/net.js';

// Operação (P10): configuração validada, saúde/prontidão/métricas, desligamento limpo, logs JSON, backup → restauração.
const get = (port, path, headers = {}) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path, headers }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ status: r.statusCode, body: b, headers: r.headers })); }).on('error', rej));

test('readConfig: padrões seguros e erros claros para valores inválidos', () => {
  const c = readConfig({});
  assert.equal(c.apiPort, 5176); assert.equal(c.gamePort, 5175); assert.equal(c.host, '127.0.0.1'); assert.equal(c.metricsToken, null); assert.deepEqual(c.warnings, []);
  assert.throws(() => readConfig({ API_PORT: 'abc' }), /API_PORT inválido/);
  assert.throws(() => readConfig({ GAME_PORT: '70000' }), /GAME_PORT inválido/);
  assert.throws(() => readConfig({ API_PORT: '6000', GAME_PORT: '6000' }), /não podem ser iguais/);
  assert.throws(() => readConfig({ ALLOWED_ORIGINS: 'https://a.com/' }), /origem inválida/);
  assert.throws(() => readConfig({ ALLOWED_ORIGINS: 'a.com' }), /origem inválida/);
  assert.throws(() => readConfig({ METRICS_TOKEN: 'curto' }), /muito curto/);
  assert.throws(() => readConfig({ LOG_LEVEL: 'tudo' }), /LOG_LEVEL/);
  // exposição pública sem TLS gera avisos (não erro)
  const w = readConfig({ HOST: '0.0.0.0', GAME_URL: 'ws://x.com:5175', ALLOWED_ORIGINS: 'http://meusite.com' }).warnings;
  assert.ok(w.some((s) => /wss:\/\//.test(s)) && w.some((s) => /http:\/\/ que não é local/.test(s)));
  assert.ok(readConfig({ HOST: '0.0.0.0' }).warnings.some((s) => /sem GAME_URL/.test(s)));
});

test('logger: uma linha JSON por evento e respeita o nível', () => {
  const lines = []; const log = makeLogger((l) => lines.push(l), 'warn');
  log.info('ignorado'); log.warn('atenção', { x: 1 }); log.error('falha');
  assert.equal(lines.length, 2);
  const a = JSON.parse(lines[0]); assert.equal(a.level, 'warn'); assert.equal(a.msg, 'atenção'); assert.equal(a.x, 1); assert.ok(a.t);
});

test('healthz / readyz / metrics (token) e desligamento limpo avisa os clientes', async () => {
  const db = openDb(':memory:');
  const game = createGameServer({ port: 0, host: '127.0.0.1', db: null, allowGuests: true });
  await game.ready;
  const TOKEN = 'um-token-de-metricas-bem-longo';
  const ops = createOps({ db, game, metricsToken: TOKEN });
  const api = createApi(db, {});
  const srv = api.server((req, res) => { if (!ops.handler(req, res)) res.writeHead(404).end(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;

  assert.equal((await get(port, '/healthz')).status, 200);
  assert.equal((await get(port, '/readyz')).status, 200);
  assert.equal((await get(port, '/nada')).status, 404);
  assert.equal((await get(port, '/metrics')).status, 401, 'sem token');
  assert.equal((await get(port, '/metrics', { authorization: 'Bearer errado-errado-errado' })).status, 401, 'token errado');
  const m = await get(port, '/metrics', { authorization: 'Bearer ' + TOKEN });
  assert.equal(m.status, 200);
  const j = JSON.parse(m.body);
  for (const k of ['uptimeSec', 'connections', 'rooms', 'messages', 'rssMB', 'heapMB']) assert.ok(k in j, k);

  // sem METRICS_TOKEN configurado a rota não existe
  const ops2 = createOps({ db, game, metricsToken: null });
  assert.equal(ops2.handler({ method: 'GET', url: '/metrics', headers: {} }, { writeHead() {}, end() {} }), false);

  const c = await connect(game); c.send(hello('Ana', 'warrior')); await c.waitFor((x) => x.t === 'welcome');
  const lines = []; const log = makeLogger((l) => lines.push(l));
  const done = gracefulShutdown({ ops, game, httpServer: srv, db, log, graceMs: 50 });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(ops.ready().ok, false, 'durante o desligamento não está mais pronto');
  const note = await c.waitFor((x) => x.t === 'notice' && x.code === 'server_closing');
  assert.ok(note.retryMs > 0);
  await done;
  assert.ok(lines.some((l) => JSON.parse(l).msg === 'desligado'));
});

test('backup → restauração: dados voltam, cópia anterior é guardada, backup corrompido e banco em uso são recusados', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aeth-'));
  const live = join(dir, 'live.db'), bak = join(dir, 'bak.db');
  const db = openDb(live);
  db.raw.exec("insert into accounts (email, pw_hash, created) values ('a@b.c','x',1)");
  db.raw.exec(`VACUUM INTO '${bak.split('\\').join('/')}'`);
  db.raw.exec("insert into accounts (email, pw_hash, created) values ('novo@b.c','x',2)");
  db.close();
  const r = restore(bak, live);
  assert.ok(r.previous && existsSync(r.previous), 'guardou o banco anterior');
  const back = openDb(live);
  const n = back.raw.prepare('select count(*) n from accounts').get().n;
  back.close();
  assert.equal(n, 1, 'voltou ao estado do backup');
  // corrompido / inexistente
  const bad = join(dir, 'ruim.db'); writeFileSync(bad, 'isto não é um banco sqlite');
  assert.throws(() => restore(bad, join(dir, 'x.db')));
  assert.throws(() => restore(join(dir, 'nao-existe.db'), live), /não encontrado/);
  // em uso: servidor ligado deixa o -wal com dados
  const open = openDb(live); open.raw.exec("insert into accounts (email, pw_hash, created) values ('uso@b.c','x',3)");
  assert.throws(() => restore(bak, live), /em uso/);
  open.close();
});
