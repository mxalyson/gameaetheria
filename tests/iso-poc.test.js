import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeIso, TILT_2_1, TILT_30, screenDirToWorld, worldDirToScreen, dirSector, facingSector, SECTORS, sortByDepth, isBehind, footprintDepth } from '../public/labs/iso-poc/src/iso.js';
import { followStep, clampFocus, clampZoom, ZOOM_MIN, ZOOM_MAX } from '../public/labs/iso-poc/src/camera.js';
import { Animator, chooseClip, MAGE_CLIPS, SLIME_CLIPS } from '../public/labs/iso-poc/src/anim.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('projeção: ida e volta é exata, em 2:1 e em 30°, com qualquer escala e altura', () => {
  for (const tilt of [TILT_2_1, TILT_30]) for (const scale of [0.6, 1, 1.7]) {
    const iso = makeIso({ tilt, scale });
    for (const [x, y, z] of [[0, 0, 0], [123.4, 77.7, 0], [2800, 1900, 0], [500, 1200, 64]]) {
      const s = iso.toScreen(x, y, z), w = iso.toWorld(s.x, s.y, z);
      close(w.x, x, 1e-7); close(w.y, y, 1e-7);
    }
  }
});

test('projeção 2:1: eixos do mundo andam em diagonal na tela, proporção 2:1', () => {
  const iso = makeIso();
  assert.deepEqual(iso.toScreen(10, 0), { x: 10, y: 5 });   // +x: direita e para baixo
  assert.deepEqual(iso.toScreen(0, 10), { x: -10, y: 5 });  // +y: esquerda e para baixo
  assert.deepEqual(iso.toScreen(10, 10), { x: 0, y: 10 });  // diagonal: direto para baixo
  assert.equal(iso.toScreen(0, 0, 30).y, -30, 'altura sobe na tela');
  assert.ok(Math.abs(makeIso({ tilt: TILT_30 }).toScreen(10, 0).y / 10 - 0.5774) < 1e-3, '30°: razão ≈ 0,577');
});

test('matriz do plano do chão bate com toScreen', () => {
  const iso = makeIso({ scale: 1.3 });
  const [a, b, c, d] = iso.matrix();
  const s = iso.toScreen(40, 90);
  close(a * 40 + c * 90, s.x); close(b * 40 + d * 90, s.y);
});

test('WASD/joystick relativo à tela: W sobe na tela, D vai para a direita, sempre com velocidade 1', () => {
  for (const tilt of [TILT_2_1, TILT_30]) {
    for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const w = screenDirToWorld(dx, dy, tilt);
      close(Math.hypot(w.x, w.y), 1);
      const s = worldDirToScreen(w.x, w.y, tilt);
      assert.ok(s.x * dx + s.y * dy > 0, 'a direção na tela é a pedida');
      close(Math.atan2(s.x, s.y * 1) - Math.atan2(dx * 1, dy * 1) + 0, Math.atan2(s.x, s.y) - Math.atan2(dx, dy));
    }
  }
  const up = screenDirToWorld(0, -1);
  assert.ok(up.x < 0 && up.y < 0, 'W = (-1,-1) no mundo');
  assert.deepEqual(screenDirToWorld(0, 0), { x: 0, y: 0 });
});

test('8 setores: cada direção da tela cai no setor certo, em 2:1 e 30°', () => {
  const casos = { S: [0, 1], SE: [1, 1], E: [1, 0], NE: [1, -1], N: [0, -1], NW: [-1, -1], W: [-1, 0], SW: [-1, 1] };
  for (const tilt of [TILT_2_1, TILT_30]) {
    for (const [nome, [dx, dy]] of Object.entries(casos)) {
      const w = screenDirToWorld(dx, dy, tilt);
      assert.equal(SECTORS[dirSector(w.x, w.y, tilt)], nome, `${nome} @tilt ${tilt.toFixed(3)}`);
    }
  }
  // `facing` do jogo: +x do mundo é sudeste na tela; +y é sudoeste.
  assert.equal(SECTORS[facingSector(0)], 'SE');
  assert.equal(SECTORS[facingSector(Math.PI / 2)], 'SW');
  assert.equal(SECTORS[facingSector(Math.PI)], 'NW');
  assert.equal(SECTORS[facingSector(-Math.PI / 2)], 'NE');
  assert.equal(dirSector(0, 0), 0, 'parado mantém a frente');
});

test('profundidade: ordem esperada para pontos e para objetos com pegada', () => {
  const itens = [{ id: 'frente', x: 500, y: 500, depth: 1000 }, { id: 'atras', x: 100, y: 100, depth: 200 }, { id: 'meio', x: 300, y: 300, depth: 600 }];
  assert.deepEqual(sortByDepth(itens).map((i) => i.id), ['atras', 'meio', 'frente']);
  const casa = { minX: 380, maxX: 570, minY: 300, maxY: 430 };
  const aTras = { minX: 100, maxX: 130, minY: 100, maxY: 130 }, aFrente = { minX: 600, maxX: 630, minY: 500, maxY: 530 }, aoLado = { minX: 450, maxX: 480, minY: 450, maxY: 480 };
  assert.ok(isBehind(aTras, casa) && !isBehind(casa, aTras));
  assert.ok(isBehind(casa, aFrente));
  assert.ok(isBehind(casa, aoLado), 'quem está à frente (y maior) fica na frente');
  assert.ok(footprintDepth(casa) < footprintDepth(aFrente));
});

test('câmera: segue sem tremer, independente da taxa de quadros, com antecipação e limites', () => {
  const a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
  for (let i = 0; i < 60; i++) followStep(a, { x: 100, y: 50 }, { x: 0, y: 0 }, 1 / 60);
  for (let i = 0; i < 20; i++) followStep(b, { x: 100, y: 50 }, { x: 0, y: 0 }, 3 / 60);
  assert.ok(Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01, 'mesmo resultado em 60 e 20 fps');
  assert.ok(a.x > 99.5, 'convergiu');
  const c = { x: 0, y: 0 };
  for (let i = 0; i < 300; i++) followStep(c, { x: 0, y: 0 }, { x: 200, y: 0 }, 1 / 60);
  assert.ok(c.x > 50 && c.x <= 140.01, `antecipação limitada: ${c.x}`);
  assert.deepEqual(clampFocus({ x: -50, y: 9999 }, { w: 2800, h: 1900 }, 100), { x: 100, y: 1800 });
  assert.equal(clampZoom(0.1), ZOOM_MIN); assert.equal(clampZoom(9), ZOOM_MAX); assert.equal(clampZoom(1.2), 1.2);
});

test('animação: loop, clipe único, quadro de disparo e prioridades', () => {
  const an = new Animator(MAGE_CLIPS);
  an.update(0.5);
  assert.ok(an.frame >= 0 && an.frame < MAGE_CLIPS.idle.frames && !an.finished);
  chooseClip(an, { moving: true });
  assert.equal(an.name, 'walk');
  chooseClip(an, { attackStart: true, moving: true });
  assert.equal(an.name, 'attack'); assert.equal(an.frame, 0); assert.equal(an.released, false);
  an.update(MAGE_CLIPS.attack.release / MAGE_CLIPS.attack.fps + 0.001);
  assert.equal(an.released, true, 'projétil sai no quadro configurado');
  chooseClip(an, { moving: true, hurt: true });
  assert.equal(an.name, 'attack', 'dano não interrompe um ataque em andamento');
  an.update(1);
  assert.equal(an.finished, true);
  chooseClip(an, { moving: false });
  assert.equal(an.name, 'idle', 'terminou o clipe: volta a parar');
  chooseClip(an, { hurt: true });
  assert.equal(an.name, 'hit');
  chooseClip(an, { skillStart: true });
  assert.equal(an.name, 'skill', 'skill tem prioridade sobre ferido');
  const sl = new Animator(SLIME_CLIPS);
  chooseClip(sl, { dead: true }, { move: 'move', attack: 'attack', skill: null, death: 'death' });
  assert.equal(sl.name, 'death');
  chooseClip(sl, { moving: true }, { move: 'move', attack: 'attack', skill: null, death: 'death' });
  assert.equal(sl.name, 'death', 'morto não volta a andar');
});
