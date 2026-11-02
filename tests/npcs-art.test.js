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
