import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { spawnSkillVfx, drawSkillVfx } from '../public/src/render/skill-vfx.js';
import { skillIconUrl } from '../public/src/render/skill-icons.js';
import { SKILLS } from '../public/src/data/skills.js';
import { CLASSES } from '../public/src/data/classes.js';

// Habilidades de Maestria (s3): efeito visual válido durante todo o ciclo e ícone presente (provisório: recolor dourado, tools/skill-icon-gold.py).
function fakeCtx(bad) {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) bad.push([k, a]); return grad; };
      return (...a) => { for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) bad.push([k, a]); };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

test('as 4 habilidades de Maestria têm dados completos, ícone leve e efeito visual sem NaN', () => {
  const bad = [];
  for (const [cid, cls] of Object.entries(CLASSES)) {
    const id = cls.mastery, s = SKILLS[id];
    assert.ok(s && s.name && s.desc && s.cd >= 30 && s.cd <= 45, id);
    const f = 'public/' + skillIconUrl(id);
    assert.ok(existsSync(f) && statSync(f).size > 3000 && statSync(f).size < 80_000, f);
    for (const lite of [false, true]) {
      const w = { time: 5, actors: [], svfx: [] }, a = { id: 3, x: 400, y: 300, facing: 0.4, dead: false, classId: cid, kind: 'player', r: 14 };
      w.actors.push(a);
      const fx = spawnSkillVfx(w, { actor: a, skill: id, ang: 0.3, tx: 650, ty: 340 });
      assert.ok(fx && fx.life > 0.5 && fx.life <= 7, `${id}: duração ${fx?.life}`);
      const g = fakeCtx(bad);
      for (let t = 0; t <= fx.life + 0.1; t += 1 / 30) { w.time = 5 + t; a.x += 2; drawSkillVfx(g, w, lite); }
      assert.equal(w.svfx.length, 0, `${id}: efeito vencido deve sair da lista`);
    }
  }
  assert.deepEqual(bad, []);
});
