// Custo de CPU das salas de exploração: N instâncias (solo ou grupo de 4) numa zona, jogadores fictícios andando e atacando. `node tools/zone-bench.mjs [salas] [jogadores]`
import { ZoneRoom } from '../server/zone.js';
import { newOfficialCharacter } from '../server/api.js';
import { makeRng } from '../public/src/core/rng.js';

const rooms = Number(process.argv[2]) || 50, per = Number(process.argv[3]) || 1, ticks = 1800;
const rng = makeRng(7);
const sent = { stats: { staleInputs: 0 }, to() {}, raw() {} };
const list = [];
for (let r = 0; r < rooms; r++) {
  const room = new ZoneRoom({ id: r + 1, key: 'k' + r, zoneId: ['forest', 'plains', 'ruins'][r % 3], seed: 100 + r, db: null, send: sent });
  for (let i = 0; i < per; i++) {
    const doc = { ...newOfficialCharacter('B' + r + i, ['warrior', 'mage', 'archer', 'cleric'][i % 4]), level: 8 };
    if (process.env.NOSPIRIT) { doc.spirits = []; doc.activeSpirit = null; } // compara o custo sem o ator do spirit
    const s = { char: doc, name: doc.name, ws: {}, room: null, player: null };
    const p = room.join(s, { x: 600 + i * 40, y: 900 });
    p.input = { mx: 0, my: 0, aimX: 0, aimY: 0, attack: true, cast: null };
  }
  list.push(room);
}
const ms = [];
for (let t = 0; t < ticks; t++) {
  for (const room of list) for (const p of room.players.values()) if (t % 45 === 0) { const a = rng.next() * Math.PI * 2; p.input.mx = Math.cos(a); p.input.my = Math.sin(a); p.input.aimX = p.actor.x + Math.cos(a) * 100; p.input.aimY = p.actor.y + Math.sin(a) * 100; p.input.attack = true; p.input.cast = t % 90 === 0 ? 0 : null; }
  const t0 = performance.now();
  for (const room of list) room.step();
  ms.push(performance.now() - t0);
}
ms.sort((a, b) => a - b);
const avg = ms.reduce((s, x) => s + x, 0) / ms.length;
console.log(`${rooms} salas × ${per} jogador(es): média ${avg.toFixed(2)} ms/tick · p99 ${ms[Math.floor(ms.length * 0.99)].toFixed(2)} ms · máx ${ms[ms.length - 1].toFixed(2)} ms · ${(avg / 16.67 * 100).toFixed(0)}% de um núcleo · bytes/snapshot ${list[0].bytes}`);
