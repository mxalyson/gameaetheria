import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stickVector, nearestTarget, pickAim, aimModeFor, dragAim, interactTarget, skillLayout, TB_GAP, STICK_RADIUS, DEADZONE, stepRun, RUN_EDGE, RUN_HOLD_S } from '../public/src/touch-logic.js';
import { loadPrefs, changePref, resolveQuality, SCALE_MIN, SCALE_MAX } from '../public/src/prefs.js';
import { SKILLS } from '../public/src/data/skills.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('joystick: zona morta, direção e limite do botão', () => {
  assert.deepEqual(stickVector(0, 0), { x: 0, y: 0, mag: 0, knobX: 0, knobY: 0, raw: 0 });
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
  assert.ok(['medium', 'high'].includes(resolveQuality({ quality: 'auto' }, true)), 'celular: média ou alta conforme o aparelho (≥ 6 núcleos = alta)');
  assert.equal(resolveQuality({ quality: 'auto' }, false), 'high');
  assert.equal(resolveQuality({ quality: 'low' }, false), 'low');
  assert.equal(loadPrefs().scale, 'auto', 'sem localStorage usa o padrão');
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

test('barra de chefe: o chefe tem prioridade sobre elites, e elite só vale perto', async () => {
  const { pickBossTarget } = await import('../public/src/ui/boss-target.js');
  const p = { x: 0, y: 0 };
  const elite = { elite: true, x: 100, y: 0 }, boss = { boss: true, x: 500, y: 0 };
  assert.equal(pickBossTarget([elite, boss], p), boss);
  assert.equal(pickBossTarget([boss, elite], p), boss);
  assert.equal(pickBossTarget([elite], p), elite);
  assert.equal(pickBossTarget([{ boss: true, x: 900, y: 0 }], p), null, 'fora do raio');
  assert.equal(pickBossTarget([{ boss: true, dead: true, x: 10, y: 0 }], p), null, 'morto não conta');
});

test('escala automática da interface: acompanha a viewport (piso 60%, teto 100%) e o valor manual é preservado', async () => {
  const { autoScale, resolveScale, changePref: cp, loadPrefs: lp } = await import('../public/src/prefs.js');
  assert.equal(autoScale(874, 402), 70, 'iPhone deitado');
  assert.equal(autoScale(1280, 720), 100);
  assert.equal(autoScale(1920, 1080), 100, 'teto');
  assert.equal(autoScale(400, 200), 60, 'piso');
  assert.equal(resolveScale({ scale: 'auto' }, 874, 402), 70);
  assert.equal(resolveScale({ scale: 120 }, 874, 402), 120, 'prefs antigas mantêm o valor escolhido');
  assert.equal(cp({ scale: 'auto', quality: 'auto', controls: 'auto' }, 'scale:+10', 874, 402).scale, 80, 'ajuste manual parte do valor automático (70+10, arredondado ao passo de 10)');
  assert.equal(cp({ scale: 90, quality: 'auto', controls: 'auto' }, 'scale:auto').scale, 'auto');
  assert.equal(lp().scale, 'auto', 'padrão inicial');
});

test('segurar para explicar: só vale parado e depois de ~0,4 s', async () => {
  const { isHold, HOLD_MS } = await import('../public/src/touch-logic.js');
  assert.equal(HOLD_MS, 400);
  assert.equal(isHold(100, 0), false, 'toque curto continua conjurando');
  assert.equal(isHold(HOLD_MS, 0), true);
  assert.equal(isHold(900, 5), true, 'tremor do dedo não cancela');
  assert.equal(isHold(900, 40), false, 'arrastar é mirar na mão, não segurar');
});

test('botões de toque: distância entre centros >= 1,15 × (r1 + r2) e nada sai da tela, em vários tamanhos e escalas', () => {
  for (const [w, h] of [[844, 390], [874, 402], [667, 375], [932, 430], [1280, 720]]) for (const ui of [0.6, 0.7, 0.8, 0.9, 1]) {
    const L = skillLayout(w, h, ui, { right: 0, bottom: 0 }), ks = Object.keys(L.items);
    for (let i = 0; i < ks.length; i++) {
      const a = L.items[ks[i]];
      assert.ok(a.sx - a.sr >= 0 && a.sx + a.sr <= w && a.sy - a.sr >= 0 && a.sy + a.sr <= h, `${ks[i]} fora da tela ${w}x${h} ui ${ui}`);
      for (let j = i + 1; j < ks.length; j++) {
        const b = L.items[ks[j]];
        assert.ok(Math.hypot(a.sx - b.sx, a.sy - b.sy) >= TB_GAP * (a.sr + b.sr) - 1e-6, `${ks[i]} x ${ks[j]} sobrepõem em ${w}x${h} ui ${ui}`);
      }
    }
    // alvo de toque físico: a habilidade (50 px) na escala mínima 0,8 continua com 40 px
    assert.ok(L.items.s0.d * L.scale >= 40 - 1e-6);
  }
});

test('correr: joystick na borda (>90% do raio) por 0,25 s ativa; soltar ou voltar ao meio desliga', () => {
  assert.ok(stickVector(STICK_RADIUS * 0.95, 0).raw > RUN_EDGE);
  assert.ok(stickVector(STICK_RADIUS * 0.85, 0).raw < RUN_EDGE);
  const st = { t: 0, on: false };
  assert.equal(stepRun(st, 0.95, 0.1), false);
  assert.equal(stepRun(st, 0.95, 0.1), false);
  assert.equal(stepRun(st, 0.95, 0.06), true); // 0,26 s
  assert.equal(stepRun(st, 0.7, 0.05), true); // histerese: continua enquanto passar de metade do raio
  assert.equal(stepRun(st, 0.3, 0.05), false); // voltou ao meio
  assert.equal(stepRun(st, 0.95, 0.1), false); // tem que esperar 0,25 s de novo
  const st2 = { t: 0, on: false };
  stepRun(st2, 0.95, 0.2); stepRun(st2, 0.5, 0.05); // saiu da borda antes de 0,25 s: zera
  assert.equal(stepRun(st2, 0.95, 0.2), false);
  assert.equal(RUN_HOLD_S, 0.25);
});

import { carryCast } from '../public/src/touch-logic.js';
// Telas de 90/120 Hz: quadros sem tick fixo não podem engolir o toque de habilidade.
test('carryCast: o pedido de habilidade (com a mira do toque) espera o próximo tick em vez de sumir', () => {
  let hold = carryCast(null, { cast: 2, aimX: 10, aimY: 20, mx: 1 }); // quadro do toque, sem tick
  assert.deepEqual(hold, { cast: 2, aimX: 10, aimY: 20 });
  const next = { cast: null, aimX: 99, aimY: 99, mx: 0 }; // quadro seguinte: o toque já saiu da fila
  hold = carryCast(hold, next);
  assert.equal(next.cast, 2); assert.equal(next.aimX, 10); assert.equal(next.aimY, 20); assert.equal(next.mx, 0, 'movimento atual não muda');
  // depois que um tick roda, main.js zera o hold: sem pedido guardado, nada é reaplicado
  const later = { cast: null, aimX: 1, aimY: 1 };
  assert.equal(carryCast(null, later), null); assert.equal(later.cast, null);
  // pedido novo substitui o guardado
  assert.equal(carryCast({ cast: 0, aimX: 0, aimY: 0 }, { cast: 1, aimX: 5, aimY: 6 }).cast, 1);
  assert.equal(carryCast({ cast: 0 }, undefined), null, 'herói sem intenção (morto) descarta');
});
