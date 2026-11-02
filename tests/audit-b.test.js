import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World } from '../public/src/game/sim.js';
import { XP_MULT } from '../public/src/data/mobs.js';
import { SCROLL_MAX } from '../public/src/shop.js';
import { TELEPORT_COMBAT_SEC } from '../server/hub.js';
import { recordEvent, blankJournal } from '../public/src/core/journal.js';

const MAIN = readFileSync('public/src/main.js', 'utf8');

test('B30: o carimbo da grade de obstáculos dá a volta sem duplicar a lista', () => {
  const w = new World('forest', { seed: 1, visuals: false });
  const a = { x: 800, y: 800, r: 14 };
  const base = [...w.nearObstacles(a)];
  const g = w.layout.grid;
  if (!g) return; // zona pequena demais para a grade (nada a testar)
  g.stamp = 0x7ffffff0; // quase no teto de Int32
  for (let i = 0; i < 40; i++) {
    const list = w.nearObstacles(a);
    assert.equal(list.length, base.length, 'sem obstáculos duplicados após a volta');
    assert.equal(new Set(list).size, list.length);
  }
  assert.ok(g.stamp < 100, 'carimbo reiniciado');
});

test('B20: XP de elite/chefe vem de uma constante só (servidor e jogo offline)', () => {
  assert.equal(XP_MULT.elite, 3); assert.equal(XP_MULT.boss, 10);
  assert.match(MAIN, /XP_MULT\.elite/);
  assert.match(readFileSync('server/zone.js', 'utf8'), /XP_MULT\.elite/);
  assert.doesNotMatch(MAIN, /m\.elite \? 4/);
});

test('B25: o teto de pergaminhos do jogo é o mesmo do save e a compra recusa no teto', () => {
  assert.equal(SCROLL_MAX, 99);
  assert.match(readFileSync('public/src/core/savedoc.js', 'utf8'), /scrolls: int\(doc\.scrolls, 0, 99, 0\)/);
  assert.match(MAIN, /scrolls \?\? 0\) \+ n > SCROLL_MAX/);
});

test('B15: o recuo da instância usa o mesmo intervalo de combate do teletransporte', () => {
  assert.equal(TELEPORT_COMBAT_SEC, 8);
  assert.match(readFileSync('server/hub.js', 'utf8'), /zoneLeave\(s\) \{[\s\S]*TELEPORT_COMBAT_SEC/);
});

test('teleport online: o evento sai uma vez, no zone_joined / zone_exit do pedido, e a recusa limpa o pedido', () => {
  // main.js não importa em Node (DOM): confere a fiação no texto
  assert.match(MAIN, /this\.teleportPending = true/);
  assert.match(MAIN, /enterNetZone\(m\) \{[\s\S]*?this\.fireTeleportEvent\(\)/);
  assert.match(MAIN, /leaveNetMatch\(exit = null\) \{[\s\S]*?this\.fireTeleportEvent\(\)/);
  assert.match(MAIN, /reject: \(m\) => \{[^}]*this\.teleportPending = false/);
  // o offline emite direto em teleport() e retorna antes quando é online (nunca conta duas vezes)
  const t = MAIN.slice(MAIN.indexOf('  teleport(id) {'), MAIN.indexOf('  fireTeleportEvent() {'));
  assert.ok(t.indexOf('teleportOnline(id)') < t.indexOf("gameEvent({ type: 'teleport' })"));
  // o diário conta o evento
  const doc = blankJournal();
  const r = recordEvent(doc, { type: 'teleport' });
  assert.ok(r && doc.stats?.teleports === 1);
});

test('B6/updateNet: mob desconhecido do servidor é ignorado com um único aviso (sem lançar a cada quadro)', () => {
  const i = MAIN.indexOf('mob desconhecido');
  assert.ok(i > 0);
  assert.match(MAIN.slice(i - 200, i + 400), /!MOBS\[sm\.mob\][\s\S]*netBadMobs[\s\S]*continue/);
});
