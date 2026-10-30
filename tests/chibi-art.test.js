// Testes das fichas e dos atlas de personagens em miniatura (laboratório). Os PNGs ficam em art-local/ (fora do Git):
// sem eles, os testes de atlas são ignorados em vez de falhar.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGNS, DESIGN_ORDER } from '../public/labs/iso-poc/src/sprites/designs.js';

const lab = fileURLToPath(new URL('../public/labs/iso-poc/', import.meta.url));

test('fichas: 5 personagens com os campos de design completos', () => {
  assert.deepEqual(DESIGN_ORDER, ['apprentice', 'sniper', 'paladin', 'priest', 'mystic']);
  for (const id of DESIGN_ORDER) {
    const d = DESIGNS[id];
    assert.equal(d.id, id);
    for (const k of ['name', 'role', 'hair', 'headgear', 'outfit', 'back', 'weapon', 'motion', 'notes']) assert.ok(d[k], `${id}.${k}`);
    for (const k of ['skin', 'hair', 'eye', 'primary', 'secondary', 'trim']) assert.equal(d.colors[k].length, 3, `${id}.colors.${k}`);
    assert.ok(d.skills.length >= 3, `${id}.skills`);
  }
});

const pngSize = (f) => { const b = fs.readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

for (const [kind, id] of ['atlas', 'atlas-rig'].flatMap((k) => ['paladino', 'aprendiz', 'franco', 'sacerdote'].map((i) => [k, i]))) {
  const dir = path.join(lab, 'art-local', kind, id);
  test(`${kind} ${id}: metadados batem com o tamanho dos PNGs`, { skip: !fs.existsSync(path.join(dir, `${id}.json`)) && 'atlas não gerado (art-local/ fora do Git)' }, () => {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
    assert.equal(meta.views, 8);
    assert.deepEqual(Object.keys(meta.clips).sort(), ['attack', 'hit', 'idle', 'skill', 'walk']);
    const cell = meta.frame.w * meta.scale;
    for (const [name, c] of Object.entries(meta.clips)) {
      const { w, h } = pngSize(path.join(dir, `${name}.png`));
      assert.equal(w, cell * c.frames, `${id}/${name} largura`);
      assert.equal(h, cell * 8, `${id}/${name} altura`);
      if (c.release != null) assert.ok(c.release > 0 && c.release < c.frames, `${id}/${name} release`);
    }
    assert.ok(meta.pivot.y > 0 && meta.pivot.y < meta.frame.h);
  });
}
