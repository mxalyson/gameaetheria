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
  assert.equal((html.match(/class="mp-node/g) ?? []).length, WORLD_ROUTE.length + 1, 'rota + o nó da masmorra'); // Cripta dos Ecos: nó extra, fora da rota de viagem
  assert.match(html, /mp-node dungeon[^>]*data-arg="crypt"/);
  assert.ok(!WORLD_ROUTE.includes('crypt'), 'a masmorra não é parada de viagem');
  assert.doesNotMatch(html, /portal ⟵|map-link/);
  assert.match(html, /mp-node here/);
});

test('mochila: ouro no rodapé como valor, fora do HUD', () => {
  const ui = mk();
  const html = ui.panel_inventory();
  assert.match(html, /inv-gold[^>]*>.*<b>1234<\/b>/s);
});

test('mapa: Cripta dos Ecos trava por nível/Ruínas/servidor, mostra a espera e libera o botão de entrada (chave gasta só com espera)', () => {
  const ui = mk({ txOnline: true });
  const c = ui.game.char;
  Object.assign(c, { level: 10, echo: { frags: 7, keys: 1, entry: 0 } });
  assert.match(ui.mapCard('crypt', 'town'), /Nível 20 para entrar/);
  c.level = 25; assert.match(ui.mapCard('crypt', 'town'), /Ruínas Sombrias a pé/);
  c.visited.ruins = true;
  assert.match(ui.mapCard('crypt', 'town'), /data-action="crypt-enter"[^>]*>Entrar na Cripta dos Ecos — grátis/);
  assert.match(ui.mapCard('crypt', 'town'), /7 fragmentos · 1 Chave/);
  c.echo.entry = Date.now() - 60_000; // entrou há 1 min: espera, mas há Chave
  assert.match(ui.mapCard('crypt', 'town'), /gasta 1 Chave de Eco/);
  c.echo.keys = 0; assert.match(ui.mapCard('crypt', 'town'), /disabled[\s\S]*Chave de Eco/);
  ui.game.txOnline = false; assert.match(ui.mapCard('crypt', 'town'), /servidor de partidas/);
  ui.game.txOnline = true; ui.game.inNetZone = () => true; assert.match(ui.mapCard('crypt', 'town'), /volte à Vila/);
});

test('Ferreiro: Forja do Eco lista as duas receitas, bloqueia sem fragmentos e marca o que já foi forjado', () => {
  const ui = mk();
  const c = ui.game.char; Object.assign(c, { level: 25, classId: 'archer', gold: 5000, echo: { frags: 45, keys: 0, entry: 0 } });
  let h = ui.echoForge();
  assert.match(h, /Arco do Eco/); assert.match(h, /Gibão do Eco/); assert.match(h, /45 fragmentos/);
  assert.match(h, /data-arg="eco_weapon"[^>]*>/); assert.doesNotMatch(h.match(/data-arg="eco_weapon"[^>]*>/)[0], /disabled/);
  assert.match(h.match(/data-arg="eco_armor"[^>]*>/)[0], /disabled/, '60 fragmentos: faltam');
  c.equipment.weapon = { eco: true, slot: 'weapon' };
  assert.match(ui.echoForge(), /Já forjado/);
});

test('especialização: primeira escolha grátis; trocar mostra o Selo; o Selo (15.000) só é vendido quando aberto pelo Mestre de Classe', () => {
  const ui = mk();
  const char = { classId: 'mage', level: 20, gold: 20000, seals: 0, spec: null, quests: { done: {} } };
  let html = ui.specBlock(char);
  assert.match(html, /A primeira escolha é grátis/); assert.match(html, />Escolher</);
  assert.equal((html.match(/data-action="spec"/g) ?? []).length, 2); assert.doesNotMatch(html, /buy-seal/);
  Object.assign(char, { spec: 'arcane' });
  html = ui.specBlock(char);
  assert.match(html, /Trocar · 1 Selo/); assert.match(html, /disabled/, 'sem Selo o botão de trocar fica desabilitado');
  assert.match(html, /Mestre de Classe, na Vila, vende/); assert.doesNotMatch(html, /buy-seal/);
  ui.specMaster = true; // painel aberto pelo serviço do Mestre ('character:master')
  html = ui.specBlock(char);
  assert.match(html, /data-action="buy-seal"/); assert.match(html, /15\.000/);
  char.gold = 100; assert.match(ui.specBlock(char), /buy-seal"\s+disabled/);
  char.seals = 2; char.gold = 20000;
  html = ui.specBlock(char);
  assert.match(html, /Você tem <b>2<\/b>/); assert.doesNotMatch(html, /data-action="spec"[^>]*disabled/);
  assert.doesNotMatch(html, /tecla/i);
});
