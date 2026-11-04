import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ZoneRoom } from '../server/zone.js';
import { newOfficialCharacter } from '../server/api.js';
import { makeRng } from '../public/src/core/rng.js';

// P11.6: otimizações de pico (separate, IA, reuso de objetos) NÃO podem mudar o resultado da simulação. O digest abaixo foi calculado ANTES
// das otimizações, com a sala real (ZoneRoom), 3 zonas, 2 heróis por sala (com spirit) atacando e usando habilidades por 1 800 ticks (30 s).
// Se uma mudança em game/sim.js, game/ai.js ou server/zone.js alterar qualquer posição, vida, abate ou evento, este teste falha.
// Mudou a REGRA do jogo de propósito (não uma otimização)? Recalcule com `node tests/zone-determinism.test.js --print` e atualize GOLDEN.
// 2026-11-04: so o digest de ruins mudou (vida/dano do Guardiao das Ruinas em data/mobs.js, devolvendo a dificuldade dos chefes).
// 2026-11-03: as Pedras de Retorno (data/zones.js `checkpoints`) entraram no layout como obstáculos pequenos (mudou a regra, não uma otimização): digests recalculados.
const GOLDEN = {
  forest: '23f05623e6d3ce1da8430a79a12818afaeb1fc23',
  plains: 'b5da17efd67aeeabfa5d6fab4e55449a59057dd2',
  ruins: 'c2c6574fb22d73151646fdd44ca9503ba0369309',
};

function run(zoneId) {
  const send = { stats: { staleInputs: 0 }, to() {}, raw() {} };
  const room = new ZoneRoom({ id: 1, key: 'd', zoneId, seed: 4242, db: null, send });
  room.world.clock = () => 5000; // relógio fixo: o ciclo de dia e noite não pode depender da hora real
  const rng = makeRng(99);
  const players = [];
  for (let i = 0; i < 2; i++) {
    const doc = { ...newOfficialCharacter('D' + i, ['warrior', 'mage'][i], 1234 + i), level: 9 };
    const s = { char: doc, name: doc.name, ws: {}, room: null, player: null, charId: null };
    players.push(room.join(s, { x: 600 + i * 50, y: 900 }));
  }
  const h = createHash('sha1');
  const r3 = (n) => Math.round(n * 1000) / 1000;
  let kills = 0;
  for (let t = 0; t < 1800; t++) {
    for (const p of players) if (t % 40 === 0) {
      const a = rng.next() * Math.PI * 2;
      p.input = { mx: Math.cos(a), my: Math.sin(a), aimX: p.actor.x + Math.cos(a) * 100, aimY: p.actor.y + Math.sin(a) * 100, attack: true, cast: t % 120 === 0 ? 0 : t % 200 === 0 ? 1 : null };
    }
    room.step();
    if (t % 30 === 0) {
      const state = room.world.actors.map((a, i) => [i, a.kind, r3(a.x), r3(a.y), r3(a.hp), a.dead ? 1 : 0]);
      h.update(JSON.stringify(state));
    }
    kills = room.players.size ? [...room.players.values()].reduce((s, p) => s + p.pend.kills.length, 0) : kills;
  }
  h.update(JSON.stringify({ kills, xp: players.map((p) => p.pend.xp), gold: players.map((p) => p.pend.gold), n: room.world.actors.length, rng: room.rng.next() }));
  return { digest: h.digest('hex'), kills };
}

if (process.argv.includes('--print')) {
  for (const z of Object.keys(GOLDEN)) console.log(z, run(z));
} else {
  test('sala de zona: simulação determinística (mesma semente, mesmo resultado, duas execuções iguais)', () => {
    for (const z of Object.keys(GOLDEN)) assert.equal(run(z).digest, run(z).digest, z);
  });
  test('sala de zona: digest igual ao calculado antes das otimizações de P11.6 (3 zonas, 2 heróis, spirit, 1 800 ticks)', () => {
    for (const z of Object.keys(GOLDEN)) {
      const r = run(z);
      if (z === 'forest') assert.ok(r.kills > 0, 'o cenário precisa matar monstros para exercitar loot e IA');
      assert.equal(r.digest, GOLDEN[z], `${z}: a simulação mudou`);
    }
  });
}
