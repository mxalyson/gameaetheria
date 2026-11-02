import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stickVector, nearestTarget, pickAim, aimModeFor, dragAim, interactTarget, STICK_RADIUS, DEADZONE } from '../public/src/touch-logic.js';
import { loadPrefs, changePref, resolveQuality, SCALE_MIN, SCALE_MAX } from '../public/src/prefs.js';
import { SKILLS } from '../public/src/data/skills.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('joystick: zona morta, direção e limite do botão', () => {
  assert.deepEqual(stickVector(0, 0), { x: 0, y: 0, mag: 0, knobX: 0, knobY: 0 });
  const tremor = stickVector(STICK_RADIUS * DEADZONE * 0.9, 0);
  assert.equal(tremor.mag, 0, 'dentro da zona morta não move');
  const full = stickVector(500, 0);
  close(full.mag, 1); close(full.x, 1); close(full.y, 0);
  close(full.knobX, STICK_RADIUS, 1e-9);
  const diag = stickVector(1000, 1000);
  close(Math.hypot(diag.x, diag.y), 1);
  const half = stickVector(0, STICK_RADIUS * 0.59);
  assert.ok(half.mag > 0.4 && half.mag < 0.6, `analógico ~0.5: ${half.mag}`);
  assert.ok(half.y > 0, 'y positivo = para baixo na tela');
});

test('alvo mais próximo respeita alcance e ignora mortos', () => {
  const p = { x: 0, y: 0 };
  const a = { x: 100, y: 0 }, b = { x: 50, y: 0, dead: true }, c = { x: 700, y: 0 };
  assert.equal(nearestTarget(p, [c, b, a]), a);
  assert.equal(nearestTarget(p, [c]), null, 'fora do alcance');
});

test('mira: arrasto manda; senão inimigo; senão movimento; senão a direção em que está virado', () => {
  const p = { x: 0, y: 0, facing: Math.PI / 2 }; // virado para baixo
  const foe = { x: 200, y: 0 };
  assert.deepEqual(pickAim({ player: p, enemies: [foe], move: { x: 0, y: 0 }, override: { x: 0, y: -1 } }), { x: 0, y: -260 });
  assert.deepEqual(pickAim({ player: p, enemies: [foe], move: { x: 0, y: 0 } }), { x: 200, y: 0 });
  assert.deepEqual(pickAim({ player: p, enemies: [], move: { x: 1, y: 0 } }), { x: 260, y: 0 });
  const f = pickAim({ player: p, enemies: [], move: { x: 0, y: 0 } });
  close(f.x, 0, 1e-9); close(f.y, 260, 1e-9);
});

test('esquiva e teleporte seguem o movimento, mesmo com inimigo por perto', () => {
  const p = { x: 0, y: 0, facing: 0 };
  const foe = { x: 0, y: 150 };
  const mv = { x: 1, y: 0 };
  assert.equal(aimModeFor(SKILLS.roll), 'move');
  assert.equal(aimModeFor(SKILLS.blink), 'move');
  assert.equal(aimModeFor(SKILLS.charge), 'enemy', 'investida mira no inimigo');
  assert.equal(aimModeFor(SKILLS.fireball), 'enemy');
  assert.deepEqual(pickAim({ player: p, enemies: [foe], move: mv, mode: aimModeFor(SKILLS.roll), reach: 200 }), { x: 200, y: 0 });
  assert.deepEqual(pickAim({ player: p, enemies: [foe], move: mv, mode: aimModeFor(SKILLS.fireball) }), { x: 0, y: 150 });
});

test('arrastar botão de skill: toque curto = auto-mira; arrasto = mira manual', () => {
  assert.equal(dragAim(5, 5), null);
  const d = dragAim(0, -80);
  close(d.x, 0); close(d.y, -1);
});

test('preferências: limites, valores inválidos e qualidade automática', () => {
  assert.equal(changePref({ scale: 100, quality: 'auto', controls: 'auto' }, 'scale:+10').scale, 110);
  assert.equal(changePref({ scale: SCALE_MAX, quality: 'auto', controls: 'auto' }, 'scale:+10').scale, SCALE_MAX);
  assert.equal(changePref({ scale: SCALE_MIN, quality: 'auto', controls: 'auto' }, 'scale:-10').scale, SCALE_MIN);
  assert.equal(changePref({ scale: 100, quality: 'auto', controls: 'auto' }, 'quality:low').quality, 'low');
  assert.equal(changePref({ scale: 100, quality: 'auto', controls: 'auto' }, 'quality:ultra').quality, 'auto', 'valor inválido volta ao padrão');
  assert.equal(changePref({ scale: 100, quality: 'auto', controls: 'auto' }, 'controls:touch').controls, 'touch');
  assert.equal(resolveQuality({ quality: 'auto' }, true), 'medium');
  assert.equal(resolveQuality({ quality: 'auto' }, false), 'high');
  assert.equal(resolveQuality({ quality: 'low' }, false), 'low');
  assert.equal(loadPrefs().scale, 100, 'sem localStorage usa o padrão');
});

test('interagir: NPC tem prioridade, depois baú; longe devolve null', () => {
  const world = { zone: { npcs: [{ id: 'lia', x: 100, y: 100 }], chests: [{ id: 'c1', x: 400, y: 400 }, { id: 'c2', x: 110, y: 100 }] } };
  const at = (x, y) => ({ x, y });
  assert.equal(interactTarget(at(100, 150), world).kind, 'npc');
  assert.equal(interactTarget(at(100, 150), world).ref.id, 'lia');
  assert.equal(interactTarget(at(400, 440), world).kind, 'chest');
  assert.equal(interactTarget(at(400, 440), world).ref.id, 'c1');
  assert.equal(interactTarget(at(110, 100), world).kind, 'npc', 'NPC e baú juntos: conversa primeiro');
  assert.equal(interactTarget(at(900, 900), world), null);
  assert.equal(interactTarget(at(0, 0), { zone: {} }), null);
  assert.equal(interactTarget(null, world), null);
});
