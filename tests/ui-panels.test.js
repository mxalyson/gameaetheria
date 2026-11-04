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
  assert.match(ui.mapCard('crypt', 'town'), /7 fragmentos · <img[^>]*> 1 Chave/);
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
  // painel normal (menu): só informa; nenhum botão de escolher/trocar/comprar
  let html = ui.specBlock(char);
  assert.match(html, /fale com o Mestre da sua classe ou com um mentor no Porto/); assert.doesNotMatch(html, /data-action="(spec|buy-seal)"/);
  Object.assign(char, { spec: 'arcane' });
  html = ui.specBlock(char);
  assert.match(html, /Arcano/); assert.match(html, /fale com o Mestre/); assert.doesNotMatch(html, /data-action="(spec|buy-seal)"/); assert.doesNotMatch(html, /Trocar/);
  // painel do Mestre de Classe ('character:master'): escolha, troca e Selo
  ui.specMaster = true;
  Object.assign(char, { spec: null });
  html = ui.specBlock(char);
  assert.match(html, /A primeira escolha é grátis/); assert.match(html, />Escolher</);
  assert.equal((html.match(/data-action="spec"/g) ?? []).length, 2);
  Object.assign(char, { spec: 'arcane' });
  html = ui.specBlock(char);
  assert.match(html, /Trocar · 1 Selo/); assert.match(html, /disabled/, 'sem Selo o botão de trocar fica desabilitado');
  assert.match(html, /data-action="buy-seal"/); assert.match(html, /15\.000/);
  char.gold = 100; assert.match(ui.specBlock(char), /buy-seal"\s+disabled/);
  char.seals = 2; char.gold = 20000;
  html = ui.specBlock(char);
  assert.match(html, /Você tem <b>2<\/b>/); assert.doesNotMatch(html, /data-action="spec"[^>]*disabled/);
  assert.doesNotMatch(html, /tecla/i);
});

// ---- Ferreiro só aprimora; lojas têm abas Comprar/Vender; venda de épico+ pede confirmação; escudo na grade única ----
import { needsSellConfirm } from '../public/src/shop.js';

const item = (over = {}) => ({ id: 'i' + Math.random().toString(36).slice(2, 7), name: 'Espada', slot: 'weapon', weaponType: 'sword', rarity: 'common', level: 3, value: 40, stats: { str: 2 }, ...over });
const shopUi = (anchor, tab = 'buy', inventory = []) => { // `tab` ficou só por compatibilidade das chamadas: a loja não tem mais abas
  const ui = mk({ sellPrice: (it) => Math.floor(it.value / 2), shopStock: [item({ id: 'shop-1' })], harborStock: [] });
  Object.assign(ui.game.char, { level: 5, classId: 'warrior', inventory, potions: 2, scrolls: 1 });
  ui.open.add('shop'); ui.shopAnchor = anchor; ui.sel = new Set(); ui.selMode = false;
  return ui;
};

test('Ferreiro: painel só tem aprimorar e Forja do Eco; sem compra, estoque, venda nem lote', () => {
  const ui = shopUi('smith', 'buy', [item()]);
  ui.game.char.equipment = { weapon: item({ id: 'eq1' }) };
  const h = ui.panel_shop();
  assert.match(h, /Ferreiro Brok/); assert.match(h, /data-action="enhance"/); assert.match(h, /Forja do Eco/);
  assert.doesNotMatch(h, /buy-item|buy-potion|buy-scroll|sell-bulk|data-action="sell"|data-action="item"|shop-tab|Poções fresquinhas/);
  assert.equal(ui.sellMode(), false, 'tocar na mochila não vende no Ferreiro');
});

test('lojas da Vila e do Porto: painel único (sem abas), estoque à esquerda e venda pela mochila; sem Ferreiro dentro', () => {
  const ui = shopUi(null, 'buy');
  let h = ui.panel_shop();
  assert.match(h, /Mercadora Lia/); assert.match(h, /data-action="buy-potion"/); assert.match(h, /buy-item/);
  assert.doesNotMatch(h, /shop-tab|shop-tabs|>Comprar<|>Vender<|smith-section|Forja do Eco|data-action="enhance"|data-action="sell"/);
  assert.equal(ui.sellMode(), true);
  ui.shopAnchor = 'harbor'; assert.match(ui.panel_shop(), /Mercador do Porto/);
});

test('mochila ao lado da loja: Selecionar vários liga a seleção; marcados ficam visíveis, com contador e total; equipados nunca entram', () => {
  const inv = [item({ id: 'c1', value: 40 }), item({ id: 'u1', rarity: 'uncommon', value: 80 }), item({ id: 'e1', rarity: 'epic', name: 'Lâmina Épica', value: 400 })];
  const ui = shopUi(null, 'buy', inv);
  ui.game.char.equipment = { weapon: item({ id: 'eq1' }) };
  let h = ui.panel_inventory();
  assert.match(h, /data-action="sel-toggle">Selecionar vários</); assert.doesNotMatch(h, /sell-selected|Marcar comuns/);
  assert.equal(ui.selecting(), false);
  ui.selMode = true; ui.sel = new Set();
  h = ui.panel_inventory();
  assert.match(h, /Marcar comuns/); assert.match(h, /Marcar até incomum/); assert.match(h, /data-action="sel-clear"/);
  assert.match(h, /sell-selected" disabled/, 'sem marcados, o botão fica desligado');
  assert.match(h, /<b>0<\/b> marcados/);
  ui.toggleSel = UI.prototype.toggleSel; ui.render = () => {};
  ui.toggleSel('c1'); ui.toggleSel('e1'); ui.toggleSel('eq1'); // equipado não está na mochila: ignorado
  assert.deepEqual([...ui.sel].sort(), ['c1', 'e1']);
  h = ui.panel_inventory();
  assert.equal((h.match(/class="cell sel /g) ?? []).length, 2, 'duas células marcadas'); assert.equal((h.match(/class="selmk"/g) ?? []).length, 2, 'check visível');
  assert.match(h, /<b>2<\/b> marcados · [\s\S]*?<b>220<\/b>/, '20 + 200 de ouro');
  assert.doesNotMatch(h, /sell-selected" disabled/);
  ui.toggleSel('c1'); assert.deepEqual([...ui.sel], ['e1'], 'tocar de novo desmarca');
  ui.markSel(1); // comuns + incomuns (nunca épico+: esse só por toque)
  assert.deepEqual([...ui.sel].sort(), ['c1', 'e1', 'u1']);
  assert.match(ui.panel_inventory(), /Toque nos itens para <b>marcar<\/b>/);
});

test('Ferreiro: a seleção de venda nunca existe (selecting() falso mesmo com selMode ligado)', () => {
  const ui = shopUi('smith', 'buy', [item()]);
  ui.selMode = true; assert.equal(ui.selecting(), false);
});

test('needsSellConfirm: épico, lendário, opala, Eco e forjado pedem confirmação; abaixo de épico não', () => {
  for (const r of ['common', 'uncommon', 'rare']) assert.equal(needsSellConfirm({ rarity: r }), false, r);
  for (const r of ['epic', 'legendary']) assert.equal(needsSellConfirm({ rarity: r }), true, r);
  assert.equal(needsSellConfirm({ rarity: 'rare', opal: true }), true);
  assert.equal(needsSellConfirm({ rarity: 'rare', eco: true }), true);
  assert.equal(needsSellConfirm({ rarity: 'rare', forged: true }), true);
  assert.equal(needsSellConfirm(null), false);
});

test('equipamento: escudo na mesma grade, logo depois da arma; classe sem escudo não deixa buraco', () => {
  const ui = mk({ sellPrice: () => 1 });
  const c = ui.game.char;
  Object.assign(c, { name: 'T', level: 5, classId: 'warrior', statPoints: 0, equipment: {}, arena: { rating: 1000, wins: 0, losses: 0, bestWave: 0 }, alloc: { str: 0, agi: 0, int: 0, vit: 0 }, spirits: [] });
  const slots = (h) => [...h.match(/<div class="equip-grid">[\s\S]*?<\/div>\s*<h3>Combate/)[0].matchAll(/<label>([^<]+)<\/label>/g)].map((m) => m[1]);
  const h = ui.panel_character();
  assert.deepEqual(slots(h), ['Arma', 'Escudo', 'Elmo', 'Armadura', 'Botas', 'Anel', 'Amuleto']);
  c.classId = 'mage'; assert.deepEqual(slots(ui.panel_character()), ['Arma', 'Elmo', 'Armadura', 'Botas', 'Anel', 'Amuleto']);
});

test('painel Habilidades e cartões de especialização: texto completo, sem teclas, com cadeado nas bloqueadas', async () => {
  const { newCharacter } = await import('../public/src/core/progression.js');
  const { makeRng } = await import('../public/src/core/rng.js');
  const char = newCharacter('T', 'warrior', makeRng(4));
  char.level = 6; char.spec = null;
  const ui = mk({ char });
  const html = ui.panel_skills();
  assert.match(html, /Golpe Giratório/);
  assert.match(html, /Ataque básico/);
  assert.match(html, /sk-lock[^>]*>.*Libera no Nv 10/s, 'Grito de Guerra ainda bloqueado');
  assert.match(html, /Libera no nível 15/);
  assert.doesNotMatch(html, /undefined|NaN|\[object|tecla/);
  char.level = 20;
  const cards = ui.skillCards('berserker');
  assert.match(cards, /Salto Brutal/);
  assert.match(cards, /Substitui/);
  assert.doesNotMatch(cards, /undefined|NaN/);
});
