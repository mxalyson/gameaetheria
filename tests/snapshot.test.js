import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter } from '../public/src/core/progression.js';
import { SnapshotDecoder, F, KEYFRAME_EVERY } from '../public/src/core/snapshot.js';
import { DeltaEncoder, actorTuple, mobTuple, mobStatic } from '../server/snapshot.js';
import { MatchRoom } from '../server/room.js';
import { CoopRoom } from '../server/coop.js';
import { Hub } from '../server/hub.js';

// Snapshots por delta: o cliente reconstrói o mesmo estado do servidor, inclusive após quadro-chave, monstros novos/removidos e reconexão.
const rng = makeRng(31);
const doc = (classId, level = 10) => { const c = newCharacter('N' + classId, classId, rng); c.level = level; return c; };
// "sessão" falsa que captura o que o servidor enviaria
function fakeSession(log) { const s = { ws: {}, room: null, player: null, char: null }; s.log = log; return s; }
function capture() { const log = []; return { log, send: { stats: { staleInputs: 0 }, to: (s, m) => log.push(['to', m]), raw: (s, t) => s.log.push(JSON.parse(t)) } }; }

test('codificador: só vai o que mudou; quadro-chave a cada KEYFRAME_EVERY; quem não mudou não aparece', () => {
  const enc = new DeltaEncoder();
  const A = { id: 1, x: 10, y: 10, hp: 100, facing: 0, dead: false, moving: false, swing: 0, stunT: 0, shield: 0 };
  const B = { ...A, id: 2 };
  const f0 = enc.frame([actorTuple(A, true), actorTuple(B, true)]);
  assert.equal(f0.k, 1); assert.equal(f0.a.length, 2, 'o primeiro é quadro-chave');
  A.x = 12;
  const f1 = enc.frame([actorTuple(A, true), actorTuple(B, true)]);
  assert.equal(f1.k, 0); assert.deepEqual(f1.a.map((t) => t[0]), [1], 'só o A mudou');
  const f2 = enc.frame([actorTuple(A, true), actorTuple(B, true)]);
  assert.equal(f2.a.length, 0, 'nada mudou: nada vai');
  for (let i = 0; i < KEYFRAME_EVERY - 3; i++) enc.frame([actorTuple(A, true), actorTuple(B, true)]);
  const fk = enc.frame([actorTuple(A, true), actorTuple(B, true)]);
  assert.equal(fk.k, 1); assert.equal(fk.a.length, 2);
  // sem commit (reconexão) não altera o estado
  const before = enc.count;
  enc.frame([actorTuple(A, true)], [], new Map(), { commit: false, forceKey: true });
  assert.equal(enc.count, before);
});

test('decodificador: reconstrói jogadores e monstros (novo, atualizado, removido) a partir de deltas', () => {
  const dec = new SnapshotDecoder().init({ you: 1, players: [{ id: 1, team: 1, name: 'A', classId: 'mage', level: 10, maxHp: 300 }, { id: 2, team: 2, name: 'B', classId: 'warrior', level: 10, maxHp: 500, bot: true }] });
  const enc = new DeltaEncoder();
  const mob = { id: 9, mobId: 'slime', level: 4, boss: false, elite: false, maxHp: 80, x: 5, y: 5, hp: 80, facing: 1, dead: false, moving: true, swing: 0 };
  const P1 = { id: 1, x: 100, y: 200, hp: 250, facing: 1.57, dead: false, moving: true, swing: 0.1, stunT: 0, shield: 7 };
  const P2 = { id: 2, x: 300, y: 400, hp: 500, facing: 3, dead: false, moving: false, swing: 0, stunT: 1, shield: 0 };
  const send = (mobs) => dec.apply({ ...enc.frame([actorTuple(P1, true), actorTuple(P2, false)], mobs.map(mobTuple), new Map(mobs.map((m) => [m.id, mobStatic(m)]))), me: { spd: 205, c: [0.2, 0, 3, 0] }, events: [] });
  let s = send([mob]);
  const a1 = s.actors.find((a) => a.id === 1), a2 = s.actors.find((a) => a.id === 2);
  assert.deepEqual([a1.x, a1.y, a1.hp, a1.facing, a1.moving, a1.swing, a1.shield], [100, 200, 250, 1.57, true, true, 7]);
  assert.equal(a1.name, 'A'); assert.equal(a1.maxHp, 300); assert.equal(a1.spd, 205); assert.deepEqual(a1.cds, { basic: 0.2, s0: 0, s1: 3, s2: 0 });
  assert.equal(a2.stun, true); assert.equal(a2.online, false); assert.equal(a2.bot, true); assert.equal(a2.spd, undefined, 'velocidade só do dono');
  assert.equal(s.mobs.length, 1); assert.equal(s.mobs[0].mob, 'slime'); assert.equal(s.mobs[0].maxHp, 80);
  P1.x = 111; mob.x = 9; mob.hp = 40;
  s = send([mob]);
  assert.equal(s.actors.find((a) => a.id === 1).x, 111); assert.equal(s.actors.find((a) => a.id === 2).x, 300, 'quem não mudou continua no lugar');
  assert.equal(s.mobs[0].x, 9); assert.equal(s.mobs[0].hp, 40); assert.equal(s.mobs[0].mob, 'slime', 'o tipo vem do estático, não se repete');
  s = send([]); // o monstro some
  assert.equal(s.mobs.length, 0);
  P2.dead = true; s = send([]);
  assert.equal(s.actors.find((a) => a.id === 2).dead, true);
});

test('mini-chefe, esbirro e acampamento: marcas, nome, raio e vida chegam ao cliente; mob comum não ganha campos', () => {
  const dec = new SnapshotDecoder().init({ you: 1, players: [{ id: 1, team: 1, name: 'A', classId: 'mage', level: 10, maxHp: 300 }] });
  const enc = new DeltaEncoder();
  const base = { level: 8, boss: false, x: 5, y: 5, hp: 900, facing: 0, dead: false, moving: false, swing: 0 };
  const mb = { ...base, id: 20, mobId: 'wolf', elite: true, miniboss: true, name: 'Alfa da Matilha', r: 40.4, maxHp: 900 };
  const su = { ...base, id: 21, mobId: 'wisp', elite: false, summoned: true, maxHp: 50 };
  const cp = { ...base, id: 22, mobId: 'slime', elite: false, camp: 'c1', maxHp: 60 };
  const plain = { ...base, id: 23, mobId: 'slime', elite: false, maxHp: 60 };
  const mobs = [mb, su, cp, plain];
  const f = enc.frame([actorTuple({ id: 1, x: 0, y: 0, hp: 1, facing: 0, shield: 0 }, true)], mobs.map(mobTuple), new Map(mobs.map((m) => [m.id, mobStatic(m)])));
  assert.deepEqual(Object.keys(f.n.find((n) => n.id === 23)), Object.keys(mobStatic(plain)));
  assert.equal('mb' in f.n.find((n) => n.id === 23), false);
  assert.ok(JSON.stringify(f.n.find((n) => n.id === 20)).length < 130, 'estático do mini-chefe continua pequeno');
  const s = dec.apply({ ...f, events: [] });
  const g = (id) => s.mobs.find((m) => m.id === id);
  assert.deepEqual([g(20).miniboss, g(20).name, g(20).r, g(20).maxHp, g(20).elite], [true, 'Alfa da Matilha', 40, 900, true]);
  assert.equal(g(21).summoned, true); assert.equal(g(22).camp, 'c1');
  assert.equal(g(23).miniboss, false); assert.equal(g(23).summoned, false); assert.equal(g(23).camp, undefined);
});

test('decodificador ignora ids desconhecidos e mensagens vazias sem quebrar (entrada hostil/corrompida)', () => {
  const dec = new SnapshotDecoder().init({ you: 1, players: [{ id: 1, team: 1, name: 'A', classId: 'mage', level: 1, maxHp: 10 }] });
  for (const m of [{}, { a: [[99, 1, 2, 3, 4, 0, 0]] }, { m: [[5, 1, 1, 1, 1, 0]] }, { g: [123] }, { a: [[1]] }, { a: null, m: null }]) assert.doesNotThrow(() => dec.apply({ k: 0, ...m, events: [] }));
  assert.equal(dec.apply({ k: 1, a: [[1, 5, 6, 7, 100, F.DEAD | F.OFFLINE, 0]], events: [] }).actors[0].dead, true);
});

test('sala PvP: o estado decodificado no cliente bate com o do servidor ao longo de uma partida (inclui quadro-chave e reconexão)', () => {
  const { send } = capture();
  const s1 = fakeSession([]), s2 = fakeSession([]);
  const entries = [{ team: 1, session: s1, doc: doc('warrior') }, { team: 2, session: s2, doc: doc('mage') }, { team: 1, bot: true, doc: doc('archer') }, { team: 2, bot: true, doc: doc('cleric') }];
  const room = new MatchRoom({ id: 1, mode: '2v2', entries, seed: 77, send });
  const you = s1.player.actor.id;
  const players = [...room.players.values()].map((p) => ({ id: p.actor.id, team: p.team, name: p.name, classId: p.classId, level: p.actor.level, maxHp: p.actor.maxHp, bot: p.bot }));
  const dec = new SnapshotDecoder().init({ you, players });
  let checked = 0;
  for (let t = 0; t < 60 * 30; t++) {
    room.step();
    if (t % 3 === 2 && s1.log.length) {
      const last = s1.log[s1.log.length - 1]; s1.log.length = 0;
      const full = dec.apply(last);
      for (const a of full.actors) {
        const sa = room.players.get(a.id).actor;
        assert.ok(Math.abs(a.x - sa.x) <= 0.06 && Math.abs(a.y - sa.y) <= 0.06, `posição de ${a.name} em t=${t}`);
        assert.equal(a.hp, Math.round(sa.hp)); assert.equal(a.dead, sa.dead);
      }
      checked++;
    }
  }
  assert.ok(checked > 400);
  // reconexão: um decodificador novo, só com match_found + quadro-chave, chega ao mesmo estado
  s1.log.length = 0;
  room.sendKeyframe(s1);
  const fresh = new SnapshotDecoder().init({ you, players });
  const full = fresh.apply(s1.log[0]);
  assert.equal(full.actors.length, 4);
  for (const a of full.actors) assert.ok(Math.abs(a.x - room.players.get(a.id).actor.x) <= 0.06);
  assert.ok(s1.log[0].k === 1);
});

test('sala cooperativa: monstros nascem, se movem e são removidos no cliente; reconexão traz todos os estáticos', () => {
  const { send } = capture();
  const s1 = fakeSession([]);
  const room = new CoopRoom({ id: 2, entries: [{ session: s1, doc: doc('warrior', 12), charId: null }], seed: 5, send });
  const you = s1.player.actor.id;
  const players = [{ id: you, team: 1, name: 'x', classId: 'warrior', level: 12, maxHp: s1.player.actor.maxHp }];
  const dec = new SnapshotDecoder().init({ you, players });
  let seenMobs = 0, lastCount = 0;
  for (let t = 0; t < 60 * 20; t++) {
    room.step();
    s1.player.actor.hp = s1.player.actor.maxHp; // mobs mais fortes: o herói parado do teste não pode morrer antes da sala ser medida
    if (room.state === 'fight' && room.wave.state === 'fight') for (const m of room.mobs()) if (!m.dead && m.id % 3 === 0) room.world.damage(s1.player.actor, m, 9999);
    if (t % 3 === 2 && s1.log.length) {
      const full = dec.apply(s1.log[s1.log.length - 1]); s1.log.length = 0;
      const live = room.mobs().filter((m) => !m.dead || m.deadT < 0.6);
      assert.equal(full.mobs.length, live.length, `monstros em t=${t}`);
      for (const m of full.mobs) { const sm = room.world.byId(m.id); assert.ok(sm); assert.equal(m.mob, sm.mobId); assert.equal(m.maxHp, sm.maxHp); assert.ok(Math.abs(m.x - sm.x) <= 0.06); }
      seenMobs = Math.max(seenMobs, full.mobs.length); lastCount = full.mobs.length;
    }
  }
  assert.ok(seenMobs >= 3);
  s1.log.length = 0; room.sendKeyframe(s1);
  const fresh = new SnapshotDecoder().init({ you, players }).apply(s1.log[0]);
  assert.equal(fresh.mobs.length, room.mobs().filter((m) => !m.dead || m.deadT < 0.6).length);
  assert.ok(fresh.mobs.every((m) => m.mob && m.maxHp > 0), 'estáticos completos após a reconexão');
  void lastCount;
});

test('banda: snapshot médio de uma partida 4×4 de IA fica abaixo de 700 bytes e do alvo de 20 KB/s por jogador', () => {
  let bytes = 0, n = 0;
  const send = { stats: { staleInputs: 0 }, to() {}, raw: (_s, t) => { bytes += t.length; n++; } };
  const entries = [];
  for (let t = 1; t <= 2; t++) for (let i = 0; i < 4; i++) entries.push({ team: t, bot: true, session: null, doc: doc(['warrior', 'mage', 'archer', 'cleric'][i], 12) });
  const room = new MatchRoom({ id: 3, mode: '4v4', entries, seed: 3, send });
  const p0 = [...room.players.values()][0]; p0.session = { ws: {}, player: p0 }; room.humans = () => [p0];
  room.countdown = 0.01;
  for (let t = 0; t < 60 * 40; t++) room.step();
  const avg = bytes / n;
  console.log(`# medição: snapshot 4×4 médio = ${avg.toFixed(0)} bytes ≈ ${(avg * 20 / 1024).toFixed(1)} KB/s por jogador a 20 Hz`);
  assert.ok(avg < 700, `snapshot médio ${avg}`);
  assert.ok(avg * 20 / 1024 < 20);
});

test('hub: no resume a sala manda match_found e depois um quadro-chave', () => {
  const sent = [];
  const hub = new Hub({ seed: 1, out: { send: (s, m) => sent.push(m), raw: (s, t) => sent.push(JSON.parse(t)) } });
  const mk = (n) => hub.createSession({ readyState: 1 }, { doc: doc(['warrior', 'mage'][n], 10), charId: null, accountId: null });
  const a = mk(0), b = mk(1);
  hub.enqueue(a, '1v1', () => {}); hub.enqueue(b, '1v1', () => {});
  for (let i = 0; i < 40; i++) hub.step();
  const kinds = sent.map((m) => m.t);
  const i = kinds.indexOf('match_found');
  assert.ok(i >= 0 && kinds[i + 1] === 'snap' && sent[i + 1].k === 1, 'match_found seguido de quadro-chave');
  assert.ok(sent[i].players.every((p) => p.maxHp > 0 && p.level > 0));
});
