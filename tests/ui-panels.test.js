// UI pura (sem DOM): selo +N, cartão do mapa-múndi e rodapé da mochila.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UI, plusBadge } from '../public/src/ui/ui.js';
import { WORLD_ROUTE } from '../public/src/data/zones.js';
import { MAX_PLUS } from '../public/src/core/enhance.js';

const mk = (over = {}) => {
  const ui = Object.create(UI.prototype);
  ui.open = new Set();
  ui.game = { mode: 'explore', world: { zoneId: 'town' }, inNetZone: () => false, char: { visited: { forest: true }, scrolls: 2, gold: 1234, potions: 3, inventory: [], equipment: {} }, ...over };
  return ui;
};

test('selo +N: dourado, laranja no +6/+7 e MAX no máximo', () => {
  assert.equal(plusBadge({ plus: 0 }), '');
  assert.match(plusBadge({ plus: 3 }), />\+3</);
  assert.doesNotMatch(plusBadge({ plus: 3 }), /hi|max/);
  assert.match(plusBadge({ plus: 6 }), /plus-b hi/);
  assert.match(plusBadge({ plus: MAX_PLUS }), /plus-b max[^>]*>MAX</);
  assert.equal(MAX_PLUS, 8);
});

test('mapa: nó visitado oferece viagem com custo; Vila é grátis; bloqueado explica o motivo', () => {
  const ui = mk();
  assert.match(ui.mapCard('forest', 'town'), /data-action="teleport" data-arg="forest"[^>]*>Viajar para Bosque Verdejante — gasta 1 Pergaminho/);
  assert.match(ui.mapCard('plains', 'town'), /Ainda não visitado/);
  assert.match(ui.mapCard('town', 'forest'), /grátis/);
  assert.match(ui.mapCard('town', 'town'), /Você está aqui/);
  ui.game.char.scrolls = 0;
  assert.match(ui.mapCard('forest', 'town'), /disabled/);
});

test('mapa na instância online: só a Vila viaja (zone_leave); outros pedem voltar à Vila', () => {
  const ui = mk({ mode: 'net', inNetZone: () => true, world: { zoneId: 'forest' } });
  assert.match(ui.mapCard('town', 'forest'), /data-arg="town"/);
  assert.match(ui.mapCard('forest', 'forest'), /Você está aqui/);
  ui.game.char.visited.ruins = true;
  assert.match(ui.mapCard('ruins', 'forest'), /volte à Vila/);
});

test('panel_map desenha os todos os nós da rota e nenhum botão de casa/lista antiga', () => {
  const ui = mk();
  const html = ui.panel_map();
  assert.equal((html.match(/class="mp-node/g) ?? []).length, WORLD_ROUTE.length);
  assert.doesNotMatch(html, /portal ⟵|map-link/);
  assert.match(html, /mp-node here/);
});

test('mochila: ouro no rodapé como valor, fora do HUD', () => {
  const ui = mk();
  const html = ui.panel_inventory();
  assert.match(html, /inv-gold[^>]*>.*<b>1234<\/b>/s);
});
