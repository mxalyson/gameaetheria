import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportCanvasFailure, onCanvasPressure, canvasFails, installCanvasGuard, _resetGuard } from '../public/src/render/memguard.js';
import { mobIdsOf, releaseMobs } from '../public/src/render/mob-sprites.js';
import { ZONES } from '../public/src/data/zones.js';

// iPhone (Safari): passando do teto de memória de canvas, getContext('2d') devolve null em silêncio. A guarda conta e avisa (no máximo 1 vez a cada 3 s).
test('memguard: avisa quem se inscreveu, no máximo 1 vez a cada 3 s, e conta todas as falhas', () => {
  _resetGuard();
  const got = []; onCanvasPressure((n) => got.push(n));
  assert.equal(reportCanvasFailure(1000), true);
  assert.equal(reportCanvasFailure(2000), false, 'dentro de 3 s não repete o aviso');
  assert.equal(reportCanvasFailure(4100), true);
  assert.deepEqual(got, [1, 3]); assert.equal(canvasFails(), 3);
  onCanvasPressure(() => { throw new Error('x'); });
  assert.doesNotThrow(() => reportCanvasFailure(9000), 'quem reage não derruba o desenho');
});

test('memguard: getContext envolvido detecta o null do Safari (canvas com tamanho) e ignora canvas vazio', () => {
  _resetGuard();
  const proto = { getContext(type) { return this.fail ? null : { type }; } };
  globalThis.HTMLCanvasElement = function () {}; globalThis.HTMLCanvasElement.prototype = proto;
  installCanvasGuard(); installCanvasGuard(); // 2ª vez não envolve de novo
  const ok = Object.assign(Object.create(proto), { width: 10, height: 10 });
  const bad = Object.assign(Object.create(proto), { width: 2048, height: 2048, fail: true });
  const empty = Object.assign(Object.create(proto), { width: 0, height: 0, fail: true });
  assert.deepEqual(ok.getContext('2d'), { type: '2d' });
  assert.equal(bad.getContext('2d'), null); assert.equal(canvasFails(), 1);
  empty.getContext('2d'); assert.equal(canvasFails(), 1, 'canvas 0×0 (liberado) não conta');
  delete globalThis.HTMLCanvasElement;
});

test('mobIdsOf: criaturas, chefe e pré-carga da zona (o resto é liberado ao trocar de zona)', () => {
  const f = mobIdsOf(ZONES.forest);
  for (const [id] of ZONES.forest.mobs) assert.ok(f.has(id));
  assert.ok(f.has(ZONES.forest.boss.id));
  assert.equal(mobIdsOf(ZONES.town).size, 0, 'a Vila não tem monstros');
  if (ZONES.crypt?.preload?.includes('echolord')) assert.ok(mobIdsOf(ZONES.crypt).has('echolord_p2'));
  assert.equal(releaseMobs(new Set()), 0, 'sem nada carregado não há o que liberar');
});
