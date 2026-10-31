import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnVfx, stepVfx, HERO_FX, KIND_BY_STYLE } from '../public/labs/iso-poc/src/vfx.js';

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('vfx: cada herói tem estilo, cor e miolo, e cada estilo vira um efeito', () => {
  for (const id of ['paladino', 'aprendiz', 'franco', 'sacerdote']) {
    const f = HERO_FX[id];
    assert.ok(f.color.startsWith('#') && f.core.startsWith('#'), id);
    assert.ok(KIND_BY_STYLE[f.style], `${id} estilo ${f.style}`);
  }
});

test('vfx: nasce com vida e partículas por tipo; expira e sai da lista', () => {
  const list = [];
  const sw = spawnVfx(list, 'swing', { x: 10, y: 20, ang: 0.5, color: '#fff', core: '#fff' }, seq([0.5]));
  const ca = spawnVfx(list, 'cast', { x: 0, y: 0, color: '#0ff', core: '#fff' }, seq([0.1, 0.9, 0.5]));
  assert.equal(sw.parts.length, 0);
  assert.equal(ca.parts.length, 11);
  assert.equal(list.length, 2);
  stepVfx(list, sw.life * 0.5);
  assert.equal(list.length, 2);
  stepVfx(list, sw.life * 0.6); // swing (0,3 s) acaba antes de cast (0,5 s)
  assert.equal(list.length, 1);
  stepVfx(list, 1);
  assert.equal(list.length, 0);
});

test('vfx: habilidade ("big") dura mais no golpe e na prece, e a lista tem teto', () => {
  const list = [];
  const a = spawnVfx(list, 'swing', { x: 0, y: 0, color: '#fff', core: '#fff' });
  const b = spawnVfx(list, 'swing', { x: 0, y: 0, big: true, color: '#fff', core: '#fff' });
  assert.ok(b.life > a.life);
  for (let i = 0; i < 200; i++) spawnVfx(list, 'impact', { x: 0, y: 0, color: '#fff', core: '#fff' });
  assert.ok(list.length <= 48);
});

test('vfx: faíscas do tiro abrem em leque estreito; do impacto, em círculo', () => {
  const m = spawnVfx([], 'muzzle', { x: 0, y: 0, color: '#fff', core: '#fff' }, seq([0, 1]));
  assert.ok(m.parts.every((p) => Math.abs(p.a) <= 0.81));
  const im = spawnVfx([], 'impact', { x: 0, y: 0, color: '#fff', core: '#fff' }, seq([0.99]));
  assert.ok(im.parts.every((p) => p.a > 6));
});
