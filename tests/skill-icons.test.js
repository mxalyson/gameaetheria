import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { SKILLS } from '../public/src/data/skills.js';
import { CLASSES } from '../public/src/data/classes.js';
import { skillIconUrl, POTION_ICON } from '../public/src/render/skill-icons.js';

// Ícones das habilidades (etapa 1): toda habilidade REAL tem arte, cada classe usa 3 ícones distintos e os arquivos são leves.
test('as 12 habilidades das 4 classes têm ícone, sem repetição, e a poção também', () => {
  const ids = Object.values(CLASSES).flatMap((c) => c.skills);
  assert.equal(ids.length, 12); assert.equal(new Set(ids).size, 12);
  for (const id of ids) {
    assert.ok(SKILLS[id], id);
    const f = 'public/' + skillIconUrl(id);
    assert.ok(existsSync(f), `falta ${f}`);
    assert.ok(statSync(f).size > 3000 && statSync(f).size < 80_000, `${f}: tamanho estranho`);
  }
  assert.ok(existsSync('public/' + POTION_ICON));
});
