import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QualityGovernor } from '../public/src/quality-governor.js';

const run = (g, fps, sec, cur) => { let out = null; for (let i = 0; i < fps * sec; i++) out = g.update(1 / fps, true, cur) ?? out; return out; };

test('governador: 60 FPS nunca rebaixa', () => {
  const g = new QualityGovernor();
  assert.equal(run(g, 60, 30, 'high'), null);
  assert.equal(g.cap, 'high');
});

test('governador: FPS baixo rebaixa alta → média → baixa e para na baixa', () => {
  const g = new QualityGovernor();
  assert.equal(run(g, 20, 5, 'high'), 'medium');
  assert.equal(run(g, 20, 10, 'medium'), 'low');
  assert.equal(run(g, 10, 20, 'low'), null);
  assert.equal(g.cap, 'low');
});

test('governador: nunca sobe de volta, mesmo com FPS ótimo depois', () => {
  const g = new QualityGovernor();
  run(g, 15, 5, 'high');
  assert.equal(g.cap, 'medium');
  run(g, 60, 60, 'medium');
  assert.equal(g.cap, 'medium');
  assert.equal(g.apply('high'), 'medium');
  assert.equal(g.apply('low'), 'low');
});

test('governador: pausas longas e modo inativo não contam', () => {
  const g = new QualityGovernor();
  for (let i = 0; i < 50; i++) g.update(3, true, 'high'); // aba oculta
  for (let i = 0; i < 500; i++) g.update(0.1, false, 'high'); // escolha manual
  assert.equal(g.cap, 'high');
});

test('governador: respeita o tempo de assentar após rebaixar', () => {
  const g = new QualityGovernor();
  assert.equal(run(g, 20, 4.1, 'high'), 'medium');
  assert.equal(run(g, 20, 3, 'medium'), null); // 2 s de assentar + janela de 4 s ainda incompleta
});
