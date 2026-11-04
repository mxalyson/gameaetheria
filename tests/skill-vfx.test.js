import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSkillVfx, drawSkillVfx, drawSkillProjectile, trackActors } from '../public/src/render/skill-vfx.js';
import { SKILLS } from '../public/src/data/skills.js';
import { CLASSES } from '../public/src/data/classes.js';
import { useFakeKit as _fake } from '../public/src/render/vfx-kit.js';
_fake(); // kit de mentira: sem ele (não carregado) os projéteis caem no desenho simples do renderer

// Efeitos das habilidades (etapa 2): só apresentação. Cada habilidade REAL gera o seu efeito, nenhum desenho recebe número inválido e o que venceu é descartado.
const KIND = { whirlwind: 'whirl', charge: 'dashtrail', warcry: 'warcry', fireball: 'muzzle', frostnova: 'frost', blink: 'blink', rain: 'rain', pierce: 'pierce', roll: 'roll', holylight: 'sun', divineshield: 'bubble', judgement: 'beam' };

// contexto 2D de mentira: grava os números recebidos para provar que nenhum é NaN/infinito
function fakeCtx(bad) {
  const grad = { addColorStop() {} };
  const handler = {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) bad.push([k, a]); return grad; };
      return (...a) => { for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) bad.push([k, a]); };
    },
    set(t, k, v) { t[k] = v; return true; },
  };
  return new Proxy({}, handler);
}
const mkWorld = () => ({ time: 5, actors: [], svfx: [] });
const mkActor = (classId) => ({ id: 3, x: 400, y: 300, facing: 0.4, dead: false, classId, kind: 'player', r: 14 });

test('as 12 habilidades reais geram exatamente o seu efeito; habilidade desconhecida ou sem ator não gera nada', () => {
  const ids = Object.values(CLASSES).flatMap((c) => c.skills);
  assert.equal(ids.length, 12);
  for (const id of ids) {
    const w = mkWorld(), a = mkActor('warrior');
    const f = spawnSkillVfx(w, { actor: a, skill: id, ang: 0.3, tx: id === 'rain' ? 600 : undefined, ty: id === 'rain' ? 320 : undefined });
    assert.equal(f.kind, KIND[id], id); assert.equal(w.svfx.length, 1);
    assert.ok(f.life > 0.2 && f.life <= 7, `${id}: duração ${f.life}`);
  }
  assert.equal(spawnSkillVfx(mkWorld(), { actor: mkActor('mage'), skill: 'inexistente' }), null);
  assert.equal(spawnSkillVfx(mkWorld(), { actor: null, skill: 'fireball' }), null);
  // buffs duram o que a habilidade dura (dados reais) + folga
  assert.ok(spawnSkillVfx(mkWorld(), { actor: mkActor('cleric'), skill: 'divineshield' }).life >= SKILLS.divineshield.dur);
});

test('o ciclo de vida inteiro de cada efeito (e dos 3 projéteis) só manda números válidos ao desenho; vencidos são descartados', () => {
  const bad = [];
  for (const lite of [false, true]) for (const id of Object.keys(KIND)) {
    const w = mkWorld(), a = mkActor(id === 'blink' ? 'mage' : 'warrior'); w.actors.push(a);
    trackActors(w); a.x += 120; // teleporte: origem ≠ destino
    const f = spawnSkillVfx(w, { actor: a, skill: id, ang: 1.1, tx: 650, ty: 340 });
    const g = fakeCtx(bad);
    for (let t = 0; t <= f.life + 0.1; t += 1 / 30) { w.time = 5 + t; a.x += 3; drawSkillVfx(g, w, lite); }
    assert.equal(w.svfx.length, 0, `${id}: efeito vencido deve sair da lista`);
  }
  const g = fakeCtx(bad);
  const base = { x: 100, y: 100, vx: 400, vy: 0, ang: 0, color: '#ff8a3d', radius: 11, src: { kind: 'player', classId: 'mage' } };
  assert.equal(drawSkillProjectile(g, { ...base, explode: 80, pierce: false, stun: 0 }, 1), true, 'bola de fogo');
  assert.equal(drawSkillProjectile(g, { ...base, src: { kind: 'player', classId: 'archer' }, vx: 820, radius: 6, explode: 0, pierce: true, stun: 0 }, 1), true, 'tiro perfurante');
  assert.equal(drawSkillProjectile(g, { ...base, src: { kind: 'player', classId: 'cleric' }, vx: 560, radius: 9, explode: 0, pierce: false, stun: 1.5 }, 1), true, 'julgamento');
  assert.equal(drawSkillProjectile(g, { ...base, radius: 6, explode: 0, pierce: false, stun: 0 }, 1), true, 'orbe básico do mago também é pintado');
  assert.equal(drawSkillProjectile(g, { ...base, src: { kind: 'mob' } }, 1), false, 'projétil de mob segue no desenho antigo');
  assert.equal(drawSkillProjectile(g, { ...base, explode: 80, src: { kind: 'spirit' } }, 1), false, 'spirit não usa efeito de habilidade');
  assert.deepEqual(bad, [], 'nenhum desenho pode receber NaN/infinito');
});

test('limite de efeitos simultâneos (evita acumular se o jogador spammar)', () => {
  const w = mkWorld(), a = mkActor('warrior');
  for (let i = 0; i < 80; i++) spawnSkillVfx(w, { actor: a, skill: 'whirlwind', ang: 0 });
  assert.ok(w.svfx.length <= 22, 'passou do teto: ' + w.svfx.length);
});

import { spawnEventVfx } from '../public/src/render/skill-vfx.js';
test('crítico, golpe absorvido e cura relevante geram efeito; hit comum e cura de regeneração não; cura repetida é limitada', () => {
  const w = mkWorld(), alvo = { ...mkActor('warrior'), maxHp: 200, r: 14 };
  assert.equal(spawnEventVfx(w, { type: 'hit', target: alvo, crit: true })?.kind, 'crit');
  assert.equal(spawnEventVfx(w, { type: 'hit', target: alvo, absorbed: true })?.kind, 'absorb');
  assert.equal(spawnEventVfx(w, { type: 'hit', target: alvo }), null, 'golpe comum já tem os efeitos antigos');
  assert.equal(spawnEventVfx(w, { type: 'heal', actor: alvo, amount: 2 }), null, 'regeneração pequena não gera efeito');
  assert.equal(spawnEventVfx(w, { type: 'heal', actor: alvo, amount: 30 })?.kind, 'heal');
  assert.equal(spawnEventVfx(w, { type: 'heal', actor: alvo, amount: 30 }), null, 'segunda cura em menos de 0,5 s é ignorada');
  w.time += 0.6; assert.equal(spawnEventVfx(w, { type: 'heal', actor: alvo, amount: 30 })?.kind, 'heal');
  // desenho sem número inválido durante todo o ciclo
  const bad = [], g = fakeCtx(bad);
  for (let t = 0; t < 1; t += 1 / 30) { w.time += 1 / 30; drawSkillVfx(g, w, false); }
  assert.deepEqual(bad, []);
  assert.equal(spawnEventVfx(w, { type: 'hit', target: null, crit: true }), null);
});

const KIND_ALL = { ...KIND, colossus: 1, meteor: 1, arrowstorm: 1, intervention: 1 };
// ---- kit de sprites (VFX pintados): com um kit de mentira, TODAS as habilidades em TODAS as especializações desenham só números válidos ----
import { useFakeKit } from '../public/src/render/vfx-kit.js';
import { SPECS } from '../public/src/data/specs.js';
import { vfxShake, drawBasicSlash } from '../public/src/render/skill-vfx.js';

test('kit de VFX: cada habilidade x especialização (e eventos crit/absorb/cura, projéteis, corte básico) só manda números válidos; pool não estoura; custo baixo', () => {
  useFakeKit();
  const bad = [], specs = [null, ...Object.values(SPECS).flatMap((o) => Object.keys(o))];
  const g = fakeCtx(bad);
  let t0 = performance.now(), frames = 0;
  for (const lite of [false, true]) for (const spec of specs) for (const id of Object.keys(KIND_ALL)) {
    const w = mkWorld(), a = { ...mkActor(id === 'blink' ? 'mage' : 'warrior'), spec }; w.actors.push(a);
    trackActors(w); a.x += 120;
    const f = spawnSkillVfx(w, { actor: a, skill: id, ang: 1.1, tx: 650, ty: 340 });
    for (let t = 0; t <= f.life + 0.1; t += 1 / 30) { w.time = 5 + t; a.x += 2; drawSkillVfx(g, w, lite); frames++; }
    assert.equal(w.svfx.length, 0, `${id}/${spec}`);
  }
  const w = mkWorld(), a = mkActor('warrior');
  for (const ev of [{ type: 'hit', target: a, crit: true }, { type: 'hit', target: a, absorbed: 5 }, { type: 'heal', actor: a, amount: 50 }]) spawnEventVfx(w, ev);
  for (let t = 0; t < 1; t += 1 / 30) { w.time = 5 + t; drawSkillVfx(g, w, false); }
  const proj = { x: 100, y: 100, vx: 400, vy: 0, ang: 0, color: '#fff', explode: 0, pierce: false, stun: 0, radius: 6 };
  for (const [cls, spec, extra] of [['mage', null, { explode: 80, radius: 11 }], ['mage', 'warlock', { explode: 60, radius: 11 }], ['mage', 'arcane', { pierce: true, radius: 9, vx: 760 }], ['mage', null, { radius: 7 }],
    ['archer', 'sniper', { pierce: true, vx: 1000 }], ['archer', 'gunslinger', { radius: 6, vx: 800 }], ['archer', null, { radius: 4, vx: 700 }], ['cleric', 'inquisitor', { stun: 1.8, radius: 9 }]]) {
    assert.equal(drawSkillProjectile(g, { ...proj, ...extra, src: { kind: 'player', classId: cls, spec } }, 1.3), true, `${cls}/${spec}`);
  }
  assert.equal(drawBasicSlash(g, { x: 1, y: 2, ang: 0.3, arc: 1.8, r: 74, t: 0.05, life: 0.2, color: '#ffe1d0' }), true);
  assert.deepEqual(bad, [], 'nenhum desenho pode receber NaN/infinito');
  const s = vfxShake({ time: 5, shake: { t0: 4.9, dur: 0.5, amp: 5 } });
  assert.ok(Number.isFinite(s.x) && Math.abs(s.x) <= 5);
  assert.ok(performance.now() - t0 < 4000, `${frames} quadros devem desenhar rápido (${(performance.now() - t0) | 0} ms)`);
});
