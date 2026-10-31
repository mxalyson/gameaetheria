// Medição de custo do servidor: N salas (8 atores de IA em 4×4) avançando em passos fixos de 60 Hz, sem rede.
// Uso: npm run bench:net -- --rooms 10 --seconds 20 [--2v2]. É MEDIÇÃO nesta máquina, não promessa de capacidade.
import { performance } from 'node:perf_hooks';
import { MatchRoom } from '../server/room.js';
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter } from '../public/src/core/progression.js';
import { CLASSES } from '../public/src/data/classes.js';
import { generateRivalForPower } from '../public/src/core/rival.js';
import { TICK_DT, SNAPSHOT_EVERY } from '../public/src/core/protocol.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const ROOMS = arg('rooms', 10), SECONDS = arg('seconds', 20), MODE = process.argv.includes('--2v2') ? '2v2' : '4v4';
const size = MODE === '4v4' ? 4 : 2;

const rng = makeRng(1);
const base = newCharacter('B', 'warrior', rng); base.level = 15;
const send = { stats: { staleInputs: 0 }, to() {}, raw() {} };
const rooms = [];
for (let r = 0; r < ROOMS; r++) {
  const entries = [];
  for (let t = 1; t <= 2; t++) for (let i = 0; i < size; i++) entries.push({ team: t, bot: true, session: null, doc: generateRivalForPower(rng, base, 400, { classId: Object.keys(CLASSES)[i % 4] }) });
  const room = new MatchRoom({ id: r + 1, mode: MODE, entries, seed: r + 1, send });
  room.countdown = 0.01; // pula a contagem
  rooms.push(room);
}

const ticks = Math.round(SECONDS / TICK_DT), samples = [];
for (let t = 0; t < ticks; t++) {
  const t0 = performance.now();
  for (const room of rooms) if (!room.closed) room.step();
  samples.push(performance.now() - t0);
}
const sorted = [...samples].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const mean = samples.reduce((s, x) => s + x, 0) / samples.length;
const budget = TICK_DT * 1000;
const snapBytes = rooms.reduce((s, r) => s + (r.bytes ?? 0), 0) / rooms.length;
const humansPerRoom = size * 2;
console.log(`Salas ${MODE}: ${ROOMS} × ${humansPerRoom} atores = ${ROOMS * humansPerRoom} atores · ${SECONDS}s simulados (${ticks} ticks, snapshot a cada ${SNAPSHOT_EVERY})`);
console.log(`CPU por tick (todas as salas): média ${mean.toFixed(2)} ms · p95 ${pct(0.95).toFixed(2)} ms · p99 ${pct(0.99).toFixed(2)} ms · máx ${sorted[sorted.length - 1].toFixed(2)} ms (um tick a 60 Hz dura ${budget.toFixed(1)} ms)`);
console.log(`CPU por sala: ${(mean / ROOMS).toFixed(3)} ms/tick · uso de 1 núcleo ≈ ${((mean / budget) * 100).toFixed(0)}% (incluindo a montagem dos snapshots, sem envio)`);
console.log(`Snapshot: ≈ ${snapBytes.toFixed(0)} bytes · a 20 Hz ≈ ${((snapBytes * 20) / 1024).toFixed(1)} KB/s por jogador conectado (JSON, sem compressão)`);
console.log(`Salas ainda em partida: ${rooms.filter((r) => r.state === 'fight').length}/${ROOMS}`);
