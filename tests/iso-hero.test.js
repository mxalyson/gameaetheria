import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IsoHero, PX_PER_TILE } from '../public/src/game/iso-hero.js';
import { newCharacter } from '../public/src/core/progression.js';
import { makeRng } from '../public/src/core/rng.js';
import { SKILLS } from '../public/src/data/skills.js';

// Terreno de teste: chão plano de 10x10 com uma parede (água) em x >= 5.
const terrain = {
  heightAt: (x, y) => (x < 0 || y < 0 || x > 10 || y > 10 || x >= 5 ? null : 1),
  blocked: (x, y, r) => Math.hypot(x - 2, y - 2) < 0.3 + r,
};
const mk = (x = 1, y = 1) => {
  const h = new IsoHero(newCharacter('T', 'warrior', makeRng(3)), x, y, { seed: 5 });
  h.gz = h.z = 1;
  return h;
};
const idle = { mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, skill: false };
const run = (h, intent, secs, targets = []) => {
  const ev = [];
  for (let t = 0; t < secs; t += 1 / 60) ev.push(...h.update(1 / 60, intent, terrain, targets));
  return ev;
};

test('herói anda na velocidade do jogo e não atravessa terreno bloqueado', () => {
  const h = mk(1, 5);
  run(h, { ...idle, mx: 1, my: 0 }, 1);
  const expected = h.stats.moveSpeed / PX_PER_TILE;
  assert.ok(h.x > 1 + expected * 0.9 && h.x < 1 + expected * 1.05, `x=${h.x}`);
  run(h, { ...idle, mx: 1, my: 0 }, 3);
  assert.ok(h.x < 5, 'parou na borda do terreno bloqueado');
});

test('herói desliza em obstáculos em vez de grudar', () => {
  const h = mk(1.2, 1.2);
  run(h, { ...idle, mx: 1, my: 1 }, 1);
  assert.ok(Math.hypot(h.x - 2, h.y - 2) >= 0.3 + 0.22 - 1e-6, 'não entra no obstáculo');
  assert.ok(h.x + h.y > 2.5, 'continuou se movendo ao longo do obstáculo');
});

test('degrau de 2 ou mais de altura bloqueia; de 1 passa', () => {
  const h = mk(1, 5);
  const step = (dz) => ({ heightAt: (x) => (x > 1.5 ? 1 + dz : 1), blocked: () => false });
  h.update(0.5, { ...idle, mx: 1 }, step(1), []);
  assert.ok(h.x > 1.5, 'subiu degrau de 1');
  const g = mk(1, 5);
  g.update(0.5, { ...idle, mx: 1 }, step(2), []);
  assert.ok(g.x <= 1.5, 'barrado por degrau de 2');
});

test('ataque básico acerta só dentro do alcance e do arco, e respeita o cooldown', () => {
  const h = mk(1, 5);
  const front = { x: 1.8, y: 5, r: 0.3, def: 5 }, behind = { x: 0.2, y: 5, r: 0.3, def: 5 }, far = { x: 4, y: 5, r: 0.3, def: 5 };
  const ev = run(h, { ...idle, aimX: 9, aimY: 5, attack: true }, 0.5, [front, behind, far]).filter((e) => e.type === 'hit');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].target, front);
  assert.ok(ev[0].amount >= 1);
  assert.ok(h.cds.basic > 0, 'cooldown ativo');
  const again = run(h, { ...idle, aimX: 9, aimY: 5, attack: true }, 1.2, [front]).filter((e) => e.type === 'hit');
  assert.ok(again.length >= 1 && again.length <= 2, `golpes em 1.2s: ${again.length}`);
});

test('Golpe Giratório acerta em todas as direções, no raio da skill real, e tem o cooldown dos dados', () => {
  const h = mk(5 - 4, 5);
  const r = SKILLS.whirlwind.radius / PX_PER_TILE;
  const near = { x: 1 - r * 0.8, y: 5, r: 0.3, def: 5 }, side = { x: 1, y: 5 + r * 0.8, r: 0.3, def: 5 }, far = { x: 1, y: 5 - r * 2, r: 0.3, def: 5 };
  const ev = run(h, { ...idle, skill: true, aimX: 9, aimY: 5 }, 0.6, [near, side, far]).filter((e) => e.type === 'hit');
  assert.deepEqual(new Set(ev.map((e) => e.target)), new Set([near, side]));
  assert.equal(h.cooldownMax.skill, SKILLS.whirlwind.cd);
  assert.ok(h.cds.skill > SKILLS.whirlwind.cd - 1.5);
  const blocked = run(h, { ...idle, skill: true }, 0.2, [near]).filter((e) => e.type === 'swing');
  assert.equal(blocked.length, 0, 'não relança em cooldown');
});

test('dano é determinístico pela semente', () => {
  const dmg = () => {
    const h = mk(1, 5);
    return run(h, { ...idle, aimX: 9, aimY: 5, attack: true }, 0.5, [{ x: 1.8, y: 5, r: 0.3, def: 5 }]).find((e) => e.type === 'hit').amount;
  };
  assert.equal(dmg(), dmg());
});
