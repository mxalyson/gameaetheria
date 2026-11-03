import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { NPC_ART } from '../public/src/render/npc-sprites.js';
import { ZONES } from '../public/src/data/zones.js';

// NPCs pintados: todo id em NPC_ART é um NPC da vila e tem imagem + medidas coerentes e leves.
const townNpcs = new Set(ZONES.town.npcs.map((n) => n.id));
test('NPCs pintados: ids existem na vila e os arquivos estão íntegros', () => {
  for (const id of NPC_ART) {
    assert.ok(townNpcs.has(id), 'NPC desconhecido: ' + id);
    assert.ok(existsSync(`public/assets/npcs/${id}.webp`) && existsSync(`public/assets/npcs/${id}.json`), 'arquivos de ' + id);
    const m = JSON.parse(readFileSync(`public/assets/npcs/${id}.json`, 'utf8'));
    assert.ok(m.w > 40 && m.h > 80 && m.ax >= 0 && m.ax <= m.w && m.ay > m.h * 0.9 && m.ay <= m.h, 'medidas de ' + id);
    assert.ok(statSync(`public/assets/npcs/${id}.webp`).size < 120_000, id + ' pesado demais');
  }
});

test('Ferreiro Brok: NPC da vila com arte, fala e painel âncora da loja', async () => {
  const { DIALOGS } = await import('../public/src/data/dialogs.js');
  const smith = ZONES.town.npcs.find((n) => n.id === 'smith');
  assert.ok(smith && smith.name === 'Ferreiro Brok' && smith.role === 'smith');
  assert.ok(NPC_ART.has('smith'), 'smith sem arte registrada');
  assert.equal(DIALOGS.smith.service.panel, 'shop:smith');
  const ui = readFileSync('public/src/ui/ui.js', 'utf8');
  assert.ok(ui.includes('id="smith-section"'), 'âncora do Ferreiro na loja');
});

test('ícones de interface pintados existem (casa e zonas); emoji só como reserva', () => {
  for (const f of ['home', 'zone-town', 'zone-forest', 'zone-plains', 'zone-ruins', 'zone-glacier']) assert.ok(existsSync(`public/assets/icons/ui/${f}.webp`), f);
  assert.ok(existsSync('public/assets/props/chest.webp'), 'baú pintado');
});

test('NPCs de classe e do Porto: arte pintada ou alias, sem desenho por código', async () => {
  const { NPC_ALIAS } = await import('../public/src/render/npc-sprites.js');
  for (const id of ['master_warrior', 'master_mage', 'master_archer', 'master_cleric']) assert.ok(NPC_ART.has(id), id);
  for (const id of ['banker', 'hunter', 'dealer', 'duelist', 'captain']) assert.ok(NPC_ART.has(NPC_ALIAS[id]?.art), 'alias de ' + id);
  const r = readFileSync('public/src/render/renderer.js', 'utf8');
  assert.ok(!/NPC_LOOK = \{[^}]*(master_|bank|harborshop|duel)/.test(r), 'NPC_LOOK ainda cobre NPCs com arte');
});

test('mestres de classe: espaçados (>= 110 px) e fora da casa', () => {
  const m = ZONES.town.npcs.filter((n) => n.role === 'master').sort((a, b) => a.x - b.x);
  assert.equal(m.length, 4);
  for (let i = 1; i < m.length; i++) assert.ok(m[i].x - m[i - 1].x >= 110, 'mestres juntos demais');
  for (const h of ZONES.town.houses) for (const n of m) assert.ok(n.x < h.x - 30 || n.x > h.x + h.w + 30 || n.y < h.y - 60 || n.y > h.y + h.h + 20, `${n.id} na casa`);
});

test('stackLabels: nomes colados sobem em degraus; distantes ficam no lugar', async () => {
  const { stackLabels } = await import('../public/src/render/safe-box.js');
  assert.deepEqual(stackLabels([{ x: 0, w: 100, y: 0 }, { x: 300, w: 100, y: 0 }]), [0, 0]);
  const l = stackLabels([{ x: 80, w: 100, y: 0 }, { x: 0, w: 100, y: 0 }, { x: 40, w: 100, y: 0 }]);
  assert.equal(l[1], 0, 'o mais à esquerda fica no lugar');
  assert.equal(new Set(l).size, 3, 'três nomes sobrepostos precisam de três degraus');
  assert.ok(Math.max(...stackLabels(Array.from({ length: 8 }, () => ({ x: 0, w: 80, y: 0 })))) <= 42);
});
