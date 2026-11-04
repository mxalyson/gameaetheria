import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QualityGovernor, GRACE_SEC, FPS_LIMIT, WINDOW_SEC } from '../public/src/quality-governor.js';

const fresh = () => { const g = new QualityGovernor(); g.graceLeft = 0; return g; }; // sem a carência de abertura
const run = (g, fps, sec, cur) => { let out = null; for (let i = 0; i < fps * sec; i++) out = g.update(1 / fps, true, cur) ?? out; return out; };

test('governador: 60 FPS nunca rebaixa', () => {
  const g = fresh();
  assert.equal(run(g, 60, 30, 'high'), null);
  assert.equal(g.cap, 'high');
});

test('governador: FPS baixo rebaixa alta → média → baixa e para na baixa', () => {
  const g = fresh();
  assert.equal(run(g, 15, 11, 'high'), 'medium');
  assert.equal(run(g, 15, 25, 'medium'), 'low');
  assert.equal(run(g, 10, 30, 'low'), null);
  assert.equal(g.cap, 'low');
});

test('governador: nunca sobe de volta, mesmo com FPS ótimo depois', () => {
  const g = fresh();
  run(g, 15, 11, 'high');
  assert.equal(g.cap, 'medium');
  run(g, 60, 60, 'medium');
  assert.equal(g.cap, 'medium');
  assert.equal(g.apply('high'), 'medium');
  assert.equal(g.apply('low'), 'low');
});

test('governador: pausas longas e modo inativo não contam', () => {
  const g = fresh();
  for (let i = 0; i < 50; i++) g.update(3, true, 'high'); // aba oculta
  for (let i = 0; i < 500; i++) g.update(0.1, false, 'high'); // escolha manual
  assert.equal(g.cap, 'high');
});

test('governador: respeita o tempo de assentar após rebaixar', () => {
  const g = fresh();
  assert.equal(run(g, 15, 10.1, 'high'), 'medium');
  assert.equal(run(g, 15, 5, 'medium'), null); // 2 s de assentar + janela de 10 s ainda incompleta
});

test('governador: ignora os primeiros 15 s e a janela é de 10 s com limite de 20 FPS', () => {
  assert.equal(GRACE_SEC, 15); assert.equal(WINDOW_SEC, 10); assert.equal(FPS_LIMIT, 20);
  const g = new QualityGovernor();
  assert.equal(run(g, 10, 14, 'high'), null); // FPS péssimo, mas dentro da carência
  assert.equal(g.cap, 'high');
  assert.equal(run(g, 10, 12, 'high'), 'medium'); // passada a carência, a janela completa rebaixa
});

test('governador: 24 FPS (jogável) não rebaixa; grace() reinicia a carência (troca de zona)', () => {
  const g = fresh();
  assert.equal(run(g, 24, 60, 'high'), null);
  g.grace();
  assert.equal(run(g, 5, 14, 'high'), null);
  assert.equal(g.cap, 'high');
});

test('governador: aviso só 1 vez por sessão', () => {
  const g = fresh();
  assert.equal(g.shouldNotify(), true);
  assert.equal(g.shouldNotify(), false);
});
