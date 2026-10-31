import test from 'node:test';
import assert from 'node:assert/strict';
import { deathPose, hurtPulse, DEATH } from '../public/labs/iso-poc/src/death.js';

test('morte: sobressalto para trás, tomba até 90° para o lado pedido e acaba no tempo total', () => {
  const a = deathPose(0.07, 1), b = deathPose(DEATH.recoil + DEATH.fall * 0.5, 1), c = deathPose(DEATH.recoil + DEATH.fall + 0.5, 1);
  assert.ok(a.rot < 0, 'recua primeiro (lado oposto)');
  assert.ok(b.rot > 0 && b.rot < c.rot, 'tomba progressivamente');
  assert.ok(Math.abs(c.rot - Math.PI / 2) < 0.06, 'termina deitado (~90°)');
  assert.ok(deathPose(0.07, -1).rot > 0 && deathPose(DEATH.total, -1).rot < 0, 'espelha para o outro lado');
  assert.equal(deathPose(DEATH.total - 0.01, 1).done, false);
  assert.equal(deathPose(DEATH.total, 1).done, true);
});

test('morte: rotação monotônica ao tombar, opacidade só cai no fim e a poeira sobe uma vez', () => {
  let prev = -Infinity, dust = 0, aPrev = 1;
  for (let t = DEATH.recoil; t < DEATH.recoil + DEATH.fall; t += 0.01) { const r = deathPose(t, 1).rot; assert.ok(r >= prev - 1e-9); prev = r; }
  for (let t = 0; t <= DEATH.total + 0.1; t += 0.01) {
    const p = deathPose(t, 1);
    assert.ok(p.alpha <= aPrev + 1e-9, 'alpha não volta a subir'); aPrev = p.alpha;
    assert.ok(p.squash > 0.8 && p.squash < 1.1);
    if (p.impact) dust++;
  }
  assert.equal(deathPose(DEATH.recoil + DEATH.fall + DEATH.lie - 0.05, 1).alpha, 1);
  assert.ok(deathPose(DEATH.total, 1).alpha < 1e-9);
  assert.ok(dust >= 1 && dust <= 14, 'impacto no chão dura só um instante');
});

test('dano recebido: pulso máximo no golpe, some em ~0,45 s e fica em 0 antes de existir', () => {
  assert.equal(hurtPulse(-1), 0);
  assert.equal(hurtPulse(0), 1);
  assert.ok(hurtPulse(0.2) > 0 && hurtPulse(0.2) < 1);
  assert.equal(hurtPulse(0.5), 0);
});
