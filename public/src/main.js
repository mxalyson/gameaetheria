import { Renderer } from './render/renderer.js';
import { Input } from './input.js';
import { UI } from './ui/ui.js';
import { World, makeHeroActor, makeMobActor, makeSpiritActor } from './game/sim.js';
import { makeRng } from './core/rng.js';
import { computeStats, canEquip, itemScore } from './core/stats.js';
import { addXp, mobXp, newCharacter, createSpirit, addSpiritXp, spiritPower, xpToNext } from './core/progression.js';
import { generateItem, rollMobLoot, rollRarity } from './core/loot.js';
import { generateRival } from './core/rival.js';
import { eloDelta, tierFor } from './core/combat.js';
import { loadChar, saveChar } from './save.js';
import { PRICES } from './shop.js';
import { CLASSES } from './data/classes.js';
import { MOBS, NORMAL_MOBS, BOSS_MOBS } from './data/mobs.js';
import { ZONES } from './data/zones.js';
import { RARITY, INVENTORY_SIZE, SLOTS } from './data/items.js';
import { SPIRITS, SPIRIT_RARITY_MUL, MAX_SPIRITS } from './data/spirits.js';

const TOWN = ZONES.town.spawn;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.canvas);
    this.ui = new UI(this);
    this.minimap = document.getElementById('minimap');
    this.rng = makeRng();
    this.char = null;
    this.world = null;
    this.player = null;
    this.rival = null;
    this.mode = 'title'; // title | explore | pvp | waves | ended
    this.potionCd = 0;
    this.portalCd = 0;
    this.saveT = 15;
    this.mmT = 0;
    this.shopStock = [];
    this.shopLevel = 0;
    this.titleWorld = new World('town');
    this.ui.showTitle(loadChar());
    addEventListener('beforeunload', () => this.save());
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.mode === 'title') {
      const w = this.titleWorld;
      w.update(dt);
      const cam = this.renderer.camera(w, { x: 850 + Math.cos(w.time * 0.1) * 320, y: 640 + Math.sin(w.time * 0.13) * 200 });
      this.renderer.draw(w, cam, {});
    } else {
      this.step(dt);
      const p = this.player;
      this.renderer.draw(this.world, this.cam, { player: p, nearNpc: this.nearNpc?.id, lowHp: !p.dead && p.hp < p.maxHp * 0.25 });
      if ((this.mmT -= dt) <= 0) { this.renderer.drawMinimap(this.minimap, this.world, p); this.mmT = 0.15; }
      this.ui.updateHud(this);
    }
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------- ações da UI ----------------
  act(action, arg) {
    switch (action) {
      case 'continue': this.loadGame(loadChar()); break;
      case 'new-char': this.ui.showCreate(!!loadChar()); break;
      case 'back-title': this.ui.showTitle(loadChar()); break;
      case 'pick-class': this.ui.createClass = arg; this.ui.showCreate(!!loadChar()); break;
      case 'create': {
        const name = (document.getElementById('char-name')?.value ?? '').trim() || CLASSES[this.ui.createClass].name;
        this.newGame(name, this.ui.createClass);
        break;
      }
      case 'close': this.ui.close(arg); break;
      case 'toggle': this.ui.toggle(arg); break;
      case 'item': this.ui.isOpen('shop') ? this.sell(arg) : this.equip(arg); break;
      case 'unequip': this.unequip(arg); break;
      case 'alloc': this.alloc(arg); break;
      case 'sort-inv': this.sortInventory(); break;
      case 'buy-potion': this.buyPotion(Number(arg)); break;
      case 'buy-item': this.buyItem(Number(arg)); break;
      case 'sell-bulk': this.sellBulk(Number(arg)); break;
      case 'buy-essence': this.buyEssence(arg); break;
      case 'spirit-on': this.setSpirit(arg); break;
      case 'spirit-free': this.freeSpirit(arg); break;
      case 'duel': this.startDuel(); break;
      case 'waves': this.startWaves(); break;
      case 'return-town': this.ui.hideScreen(); this.enterZone('town', TOWN.x, TOWN.y); break;
    }
  }

  // ---------------- ciclo de vida ----------------
  newGame(name, classId) {
    const char = newCharacter(name, classId, this.rng);
    const starter = createSpirit(this.rng, { rarity: 'common' });
    char.spirits.push(starter);
    char.activeSpirit = starter.id;
    saveChar(char);
    this.loadGame(char, true);
  }

  loadGame(char, fresh = false) {
    if (!char) return;
    // Migração leve para saves antigos.
    char.arena = { rating: 1000, wins: 0, losses: 0, bestWave: 0, ...char.arena };
    char.spirits ??= [];
    char.inventory ??= [];
    char.alloc ??= { str: 0, agi: 0, int: 0, vit: 0 };
    this.char = char;
    this.ui.hideScreen();
    this.ui.setupHud(char);
    this.enterZone('town', TOWN.x, TOWN.y);
    if (fresh) {
      this.ui.toast(`Bem-vindo, ${char.name}!`, 'Siga o portal a leste para o Bosque Verdejante', 'gold');
      this.ui.log('WASD move · mouse mira · <b>clique</b> ataca · <b>1 2 3</b> habilidades', '#cfe8ff');
      this.ui.log('<b>E</b> conversa · <b>I</b> inventário · <b>C</b> personagem · <b>P</b> spirits · <b>Q</b> poção · <b>H</b> volta à vila', '#cfe8ff');
      const sp = SPIRITS[char.spirits[0].type];
      this.ui.log(`Um spirit te acompanha: <b style="color:${sp.color}">${sp.name}</b> (${sp.element}).`, sp.color);
    }
  }

  enterZone(zoneId, x, y, mode = 'explore') {
    const prev = this.player;
    const ratio = prev && !prev.dead ? prev.hp / prev.maxHp : 1;
    this.world = new World(zoneId);
    this.mode = mode;
    this.player = this.world.add(makeHeroActor(this.char, x, y));
    if (!this.world.zone.safe && mode === 'explore') this.player.hp = Math.max(1, Math.round(this.player.maxHp * ratio));
    this.spawnSpirit(this.player, this.char);
    this.world.populate(this.char.level);
    this.rival = null;
    this.waves = null;
    this.portalCd = 1;
    this.cam = this.renderer.camera(this.world, this.player);
    this.ui.banner(null);
    const z = this.world.zone;
    this.ui.toast(z.name, z.level ? `Nível ${z.level[0]}–${z.level[1]}${z.scale ? '+' : ''}` : z.safe ? 'Zona segura' : '');
    if (zoneId === 'town') this.refreshShop();
    this.save();
  }

  save() { if (this.char) saveChar(this.char); }

  spawnSpirit(owner, char) {
    const w = this.world;
    w.actors = w.actors.filter((a) => !(a.kind === 'spirit' && a.owner === owner.id));
    const sp = char.spirits.find((s) => s.id === char.activeSpirit);
    owner.speedMul = sp?.type === 'zephyr' ? 1.12 : 1;
    if (sp) w.add(makeSpiritActor(sp, owner));
  }

  refreshStats() {
    const p = this.player, st = computeStats(this.char);
    const ratio = p.hp / p.maxHp;
    p.stats = st;
    p.maxHp = st.maxHp;
    p.hp = Math.max(1, Math.round(st.maxHp * ratio));
    p.level = this.char.level;
  }

  // ---------------- loop de jogo ----------------
  step(dt) {
    const p = this.player, w = this.world, inp = this.input;
    this.potionCd = Math.max(0, this.potionCd - dt);
    this.portalCd -= dt;

    if (inp.hit('escape')) this.ui.closePanels();
    if (inp.hit('i') || inp.hit('b')) this.ui.toggle('inventory');
    if (inp.hit('c')) this.ui.toggle('character');
    if (inp.hit('p')) this.ui.toggle('spirits');
    if (inp.hit('q')) this.usePotion();
    if (inp.hit('h')) this.hearth();
    if (inp.hit('e') && this.nearNpc) this.talk(this.nearNpc);

    if (this.mode === 'ended') {
      w.updateVisuals(dt);
    } else {
      const intents = {};
      if (!p.dead) {
        let cast = null;
        ['1', '2', '3'].forEach((k, i) => { if (inp.hit(k)) cast = i; });
        intents[p.id] = {
          mx: (inp.held('d', 'arrowright') ? 1 : 0) - (inp.held('a', 'arrowleft') ? 1 : 0),
          my: (inp.held('s', 'arrowdown') ? 1 : 0) - (inp.held('w', 'arrowup') ? 1 : 0),
          aimX: inp.mouse.x + this.cam.x, aimY: inp.mouse.y + this.cam.y,
          attack: inp.mouse.down, cast,
        };
      }
      w.update(dt, intents);
      this.handleEvents();
      if (this.mode === 'explore') { w.updateSpawns(dt, p); this.checkPortals(); this.regen(dt); }
      else if (this.mode === 'waves') this.updateWaves(dt);
      else if (this.mode === 'pvp') this.updateDuel(dt);
      this.collectDrops();
    }

    this.nearNpc = (w.zone.npcs ?? []).find((n) => Math.hypot(n.x - p.x, n.y - p.y) < 80) ?? null;
    const target = this.renderer.camera(w, p), k = Math.min(1, dt * 8);
    this.cam = { x: this.cam.x + (target.x - this.cam.x) * k, y: this.cam.y + (target.y - this.cam.y) * k };
    if ((this.saveT -= dt) <= 0) { this.save(); this.saveT = 15; }
  }

  handleEvents() {
    const events = this.world.events.splice(0);
    for (const ev of events) {
      if (ev.type !== 'death') continue;
      const a = ev.actor;
      if (a.kind === 'mob') this.onMobKilled(a);
      else if (a === this.player) this.onPlayerDeath();
      else if (a.kind === 'rival') this.endDuel(true);
    }
  }

  checkPortals() {
    if (this.portalCd > 0) return;
    const p = this.player;
    for (const pt of this.world.zone.portals ?? []) {
      if (Math.hypot(pt.x - p.x, pt.y - p.y) < 50) { this.enterZone(pt.to, pt.tx, pt.ty); return; }
    }
  }

  regen(dt) {
    const p = this.player;
    if (p.dead) return;
    const safe = this.world.zone.safe;
    if (safe || this.world.time - p.lastCombat > 5) this.world.heal(p, p.maxHp * (safe ? 0.25 : 0.03) * dt, true);
  }

  talk(npc) {
    if (npc.role === 'shop') this.ui.openPanel('shop');
    else if (npc.role === 'arena') this.ui.openPanel('arena');
    else if (npc.role === 'spirit') this.ui.openPanel('sage');
  }

  usePotion() {
    const p = this.player, c = this.char;
    if (this.mode === 'pvp') return this.ui.log('Poções são proibidas no duelo.', '#ffb4a8');
    if (p.dead || this.potionCd > 0) return;
    if (!c.potions) return this.ui.log('Sem poções! Compre com a Mercadora Lia.', '#ffb4a8');
    if (p.hp >= p.maxHp) return;
    c.potions--;
    this.potionCd = 8;
    this.world.heal(p, p.maxHp * 0.35);
    this.world.burst(p.x, p.y, '#ff7a8a', 14, 120);
  }

  hearth() {
    if (this.mode !== 'explore' || this.world.zoneId === 'town' || this.player.dead) return;
    if (this.world.time - this.player.lastCombat < 4) return this.ui.log('Não é possível retornar em combate.', '#ffb4a8');
    this.enterZone('town', TOWN.x, TOWN.y);
  }

  // ---------------- progresso / loot ----------------
  onMobKilled(m) {
    const M = MOBS[m.mobId];
    this.grantXp(mobXp(m.level, this.char.level, M.xp * (m.boss ? 10 : m.elite ? 3 : 1)));
    for (const l of rollMobLoot(this.rng, m, this.char.classId)) this.dropAt(m.x, m.y, l);
    if (m.boss) {
      this.ui.toast(`${M.name} derrotado!`, 'Tesouros caíram no chão', 'gold');
      this.ui.log(`Você derrotou <b>${M.name}</b>! Ele retorna em 90s.`, '#ffd27a');
    }
  }

  grantXp(amount) {
    const c = this.char;
    const gained = addXp(c, amount);
    const sp = c.spirits.find((s) => s.id === c.activeSpirit);
    if (sp && addSpiritXp(sp, amount * 0.6, c.level)) {
      const actor = this.world.actors.find((a) => a.kind === 'spirit' && a.owner === this.player.id);
      if (actor) { actor.stats.power = spiritPower(sp); actor.level = sp.level; }
      this.ui.log(`${SPIRITS[sp.type].name} subiu para o nível ${sp.level}!`, SPIRITS[sp.type].color);
    }
    if (gained) this.onLevelUp();
  }

  onLevelUp() {
    const p = this.player;
    this.refreshStats();
    p.hp = p.maxHp;
    this.world.fx.push({ type: 'ring', x: p.x, y: p.y, r: 120, color: '#ffd34d', t: 0, life: 0.8, follow: p });
    this.world.burst(p.x, p.y, '#ffd34d', 40, 260);
    this.ui.toast(`Nível ${this.char.level}!`, `+5 pontos de atributo — abra o personagem (C)`, 'gold');
    this.ui.log(`Você alcançou o nível <b>${this.char.level}</b>.`, '#ffd34d');
    if (this.ui.anyOpen()) this.ui.render();
    this.save();
  }

  dropAt(x, y, loot) {
    const r = this.rng;
    this.world.drops.push({ ...loot, x, y, vx: r.range(-90, 90), vy: r.range(-90, 90), t: 0 });
  }

  collectDrops() {
    const p = this.player, c = this.char, w = this.world;
    if (p.dead) return;
    let changed = false;
    for (const d of w.drops) {
      if (d.t < 0.4 || Math.hypot(d.x - p.x, d.y - p.y) > 44) continue;
      if (d.kind === 'gold') {
        c.gold += d.amount;
        w.texts.push({ x: p.x, y: p.y - 34, t: 0, life: 0.8, text: `+${d.amount} 🪙`, size: 13, color: '#ffd34d' });
      } else if (d.kind === 'potion') {
        c.potions += d.amount;
        this.ui.log(`+${d.amount} 🧪 Poção de Vida`, '#ff9aa8');
      } else if (d.kind === 'item') {
        if (c.inventory.length >= INVENTORY_SIZE) {
          if (!d.warned) { this.ui.log('Inventário cheio! Venda itens na vila.', '#ffb4a8'); d.warned = true; }
          continue;
        }
        c.inventory.push(d.item);
        const R = RARITY[d.item.rarity];
        this.ui.log(`Obtido: <b style="color:${R.color}">${d.item.name}</b> (${R.name})`, '#e8e6f0');
        if (R.index >= 3) this.ui.toast(d.item.name, `Item ${R.name}!`, 'gold');
      } else if (d.kind === 'essence') {
        this.gainSpirit(createSpirit(this.rng, { luck: d.luck, level: Math.max(1, c.level - 2) }));
      }
      d.taken = true;
      changed = true;
    }
    if (changed) {
      w.drops = w.drops.filter((d) => !d.taken);
      if (this.ui.anyOpen()) this.ui.render();
    }
  }

  gainSpirit(sp) {
    const c = this.char;
    if (c.spirits.length >= MAX_SPIRITS) {
      c.gold += 100;
      this.ui.log('Limite de spirits atingido — a essência virou 100 🪙.', '#ffb4a8');
      return false;
    }
    c.spirits.push(sp);
    const S = SPIRITS[sp.type], R = RARITY[sp.rarity];
    this.ui.toast(`Novo spirit: ${S.name}`, `${R.name} · ${S.element} · ${S.role}`, 'gold');
    this.ui.log(`Essência despertou <b style="color:${S.color}">${S.name}</b> (${R.name})! Veja em <b>P</b>.`, S.color);
    if (!c.activeSpirit) this.setSpirit(sp.id);
    this.save();
    return true;
  }

  // ---------------- inventário / atributos ----------------
  findItem(id) {
    const c = this.char;
    return c.inventory.find((i) => i.id === id) ?? Object.values(c.equipment).find((i) => i?.id === id) ?? this.shopStock.find((i) => i.id === id);
  }

  equip(id) {
    const c = this.char, idx = c.inventory.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const it = c.inventory[idx], ok = canEquip(c, it);
    if (!ok.ok) return this.ui.log(ok.reason, '#ffb4a8');
    const prev = c.equipment[it.slot];
    c.equipment[it.slot] = it;
    c.inventory.splice(idx, 1);
    if (prev) c.inventory.splice(idx, 0, prev);
    this.refreshStats();
    this.ui.render();
    this.save();
  }

  unequip(slot) {
    const c = this.char;
    if (!c.equipment[slot]) return;
    if (c.inventory.length >= INVENTORY_SIZE) return this.ui.log('Inventário cheio.', '#ffb4a8');
    c.inventory.push(c.equipment[slot]);
    delete c.equipment[slot];
    this.refreshStats();
    this.ui.render();
    this.save();
  }

  sell(id) {
    const c = this.char, idx = c.inventory.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const it = c.inventory.splice(idx, 1)[0];
    c.gold += it.value;
    this.ui.log(`Vendido: ${it.name} (+${it.value} 🪙)`, '#ffd34d');
    this.ui.render();
    this.save();
  }

  sellBulk(maxRarity) {
    const c = this.char;
    const sold = c.inventory.filter((i) => RARITY[i.rarity].index <= maxRarity);
    if (!sold.length) return;
    const gold = sold.reduce((s, i) => s + i.value, 0);
    c.inventory = c.inventory.filter((i) => RARITY[i.rarity].index > maxRarity);
    c.gold += gold;
    this.ui.log(`${sold.length} itens vendidos (+${gold} 🪙)`, '#ffd34d');
    this.ui.render();
    this.save();
  }

  sortInventory() {
    this.char.inventory.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || itemScore(b) - itemScore(a));
    this.ui.render();
  }

  alloc(stat) {
    const c = this.char;
    if (c.statPoints <= 0) return;
    const n = this.input.held('shift') ? Math.min(5, c.statPoints) : 1;
    c.alloc[stat] += n;
    c.statPoints -= n;
    this.refreshStats();
    this.ui.render();
    this.save();
  }

  // ---------------- lojas ----------------
  refreshShop() {
    const c = this.char;
    if (this.shopLevel === c.level && this.shopStock.length) return;
    this.shopLevel = c.level;
    const cls = CLASSES[c.classId];
    const rar = () => { const r = rollRarity(this.rng, 0.8); return r === 'common' ? 'uncommon' : r; };
    this.shopStock = [
      generateItem(this.rng, c.level, { slot: 'weapon', weaponType: cls.weapon, rarityId: rar() }),
      ...[0, 1, 2].map(() => generateItem(this.rng, c.level, { slot: this.rng.pick(SLOTS.slice(1)), rarityId: rar() })),
    ];
  }

  spend(cost) {
    if (this.char.gold < cost) { this.ui.log('Ouro insuficiente.', '#ffb4a8'); return false; }
    this.char.gold -= cost;
    return true;
  }

  buyPotion(n) {
    if (!this.spend(PRICES.potion(this.char.level) * n)) return;
    this.char.potions += n;
    this.ui.render();
    this.save();
  }

  buyItem(i) {
    const it = this.shopStock[i];
    if (!it) return;
    if (this.char.inventory.length >= INVENTORY_SIZE) return this.ui.log('Inventário cheio.', '#ffb4a8');
    if (!this.spend(it.value * PRICES.itemMarkup)) return;
    this.shopStock.splice(i, 1);
    this.char.inventory.push(it);
    this.ui.log(`Comprado: <b style="color:${RARITY[it.rarity].color}">${it.name}</b>`);
    this.ui.render();
    this.save();
  }

  buyEssence(kind) {
    const c = this.char;
    if (c.spirits.length >= MAX_SPIRITS) return this.ui.log('Limite de spirits atingido. Liberte algum primeiro.', '#ffb4a8');
    const cost = kind === 'prism' ? PRICES.prism(c.level) : PRICES.essence(c.level);
    if (!this.spend(cost)) return;
    const rarity = kind === 'prism' ? this.rng.weighted([['rare', 70], ['epic', 25], ['legendary', 5]]) : undefined;
    this.gainSpirit(createSpirit(this.rng, { rarity, luck: 0.4, level: Math.max(1, c.level - 2) }));
    this.ui.render();
  }

  setSpirit(id) {
    this.char.activeSpirit = id;
    this.spawnSpirit(this.player, this.char);
    this.ui.render();
    this.save();
  }

  freeSpirit(id) {
    const c = this.char, sp = c.spirits.find((s) => s.id === id);
    if (!sp) return;
    const gold = Math.round(30 * sp.level * SPIRIT_RARITY_MUL[sp.rarity]);
    if (!confirm(`Libertar ${SPIRITS[sp.type].name} (Nv ${sp.level})? Você recebe ${gold} de ouro.`)) return;
    c.spirits = c.spirits.filter((s) => s.id !== id);
    c.gold += gold;
    if (c.activeSpirit === id) { c.activeSpirit = c.spirits[0]?.id ?? null; this.spawnSpirit(this.player, c); }
    this.ui.render();
    this.save();
  }

  // ---------------- arena PvP ----------------
  startDuel() {
    this.ui.closePanels();
    const rc = generateRival(this.rng, this.char);
    this.enterZone('arena', 550, 840, 'pvp');
    this.player.facing = -Math.PI / 2;
    const r = this.world.add(makeHeroActor(rc, 550, 260, 'rival', 2));
    this.spawnSpirit(r, rc);
    this.rival = r;
    this.rivalChar = rc;
    this.world.frozen = 3.2;
    this.duelGo = 0;
    this.ui.log(`Oponente: <b>${rc.name}</b> — ${CLASSES[rc.classId].name} Nv ${rc.level} · rating ${rc.arena.rating}`, '#ffb4a8');
  }

  updateDuel(dt) {
    const w = this.world;
    if (w.frozen > 0) {
      const rc = this.rivalChar;
      this.ui.banner(`${CLASSES[rc.classId].icon} ${rc.name} — ${Math.ceil(w.frozen)}`);
    } else if (this.duelGo < 1) {
      this.duelGo += dt;
      this.ui.banner(this.duelGo < 1 ? 'LUTE!' : null);
    }
  }

  endDuel(won) {
    if (this.mode !== 'pvp') return;
    this.mode = 'ended';
    const c = this.char, rc = this.rivalChar, a = c.arena;
    const oldTier = tierFor(a.rating);
    const delta = eloDelta(a.rating, rc.arena.rating, won);
    a.rating = Math.max(0, a.rating + delta);
    if (won) a.wins++; else a.losses++;
    const gold = won ? 40 + c.level * 8 : 10 + c.level * 2;
    c.gold += gold;
    const lines = [`Rating: ${a.rating} (${delta >= 0 ? '+' : ''}${delta})`, `+${gold} 🪙`];
    const newTier = tierFor(a.rating);
    if (newTier.name !== oldTier.name) lines.push(`Nova liga: <b style="color:${newTier.color}">${newTier.name}</b>`);
    if (won && this.rng.chance(0.35)) {
      const it = generateItem(this.rng, c.level, { classId: c.classId, luck: 1.2 });
      if (c.inventory.length < INVENTORY_SIZE) {
        c.inventory.push(it);
        lines.push(`Prêmio: <b style="color:${RARITY[it.rarity].color}">${it.name}</b>`);
      } else { c.gold += it.value; lines.push(`Prêmio convertido em ${it.value} 🪙 (inventário cheio)`); }
    }
    this.grantXp(xpToNext(c.level) * (won ? 0.12 : 0.04));
    this.ui.banner(null);
    this.ui.showResult({
      title: won ? 'Vitória!' : 'Derrota',
      sub: `vs ${rc.name} · ${CLASSES[rc.classId].name} Nv ${rc.level}`,
      lines, tone: won ? 'win' : 'lose',
    });
    this.save();
  }

  // ---------------- arena PvE (ondas) ----------------
  startWaves() {
    this.ui.closePanels();
    this.enterZone('waves', 550, 550, 'waves');
    this.waves = { n: 0, state: 'rest', t: 3, gold: 0 };
  }

  updateWaves(dt) {
    const W = this.waves;
    if (!W || this.player.dead) return;
    const alive = this.world.actors.filter((a) => a.kind === 'mob' && !a.dead).length;
    if (W.state === 'fight') {
      if (alive) { this.ui.banner(`Onda ${W.n} · ${alive} inimigo${alive > 1 ? 's' : ''}`); return; }
      const reward = 15 + W.n * this.char.level * 2;
      this.char.gold += reward;
      W.gold += reward;
      W.state = 'rest';
      W.t = 4;
      this.char.arena.bestWave = Math.max(this.char.arena.bestWave, W.n);
      this.world.heal(this.player, this.player.maxHp * 0.2);
      this.ui.toast(`Onda ${W.n} vencida!`, `+${reward} 🪙 · +20% de vida`, 'gold');
    } else {
      W.t -= dt;
      this.ui.banner(`Próxima onda em ${Math.max(1, Math.ceil(W.t))}…`);
      if (W.t <= 0) this.spawnWave(++W.n);
    }
  }

  spawnWave(n) {
    const w = this.world, c = this.char, p = this.player;
    this.waves.state = 'fight';
    const lvl = Math.min(30, c.level + Math.floor((n - 1) / 3));
    const spawn = (id, opts) => {
      const ang = this.rng.next() * Math.PI * 2;
      const m = w.add(makeMobActor(id, lvl, 550 + Math.cos(ang) * 430, 550 + Math.sin(ang) * 430, opts));
      m.ai.target = p.id;
      m.ai.state = 'chase';
      w.burst(m.x, m.y, '#b48cff', 16, 160);
    };
    if (n % 10 === 0) spawn(this.rng.pick(BOSS_MOBS));
    const count = Math.min(14, 2 + n);
    for (let i = 0; i < count; i++) spawn(this.rng.pick(NORMAL_MOBS), { elite: n % 5 === 0 && i === 0 });
  }

  onPlayerDeath() {
    const c = this.char;
    if (this.mode === 'pvp') return this.endDuel(false);
    if (this.mode === 'waves') {
      const W = this.waves;
      const cleared = W.n - (W.state === 'fight' ? 1 : 0);
      c.arena.bestWave = Math.max(c.arena.bestWave, cleared);
      this.mode = 'ended';
      this.ui.banner(null);
      this.ui.showResult({ title: 'Fim do desafio', lines: [`Ondas vencidas: <b>${cleared}</b>`, `Recorde: ${c.arena.bestWave}`, `Ouro ganho: ${W.gold} 🪙`], tone: 'lose' });
      this.save();
      return;
    }
    const lost = Math.floor(c.gold * 0.1);
    c.gold -= lost;
    this.mode = 'ended';
    this.ui.showResult({ title: 'Você caiu…', sub: this.world.zone.name, lines: [lost ? `Perdeu ${lost} 🪙` : 'Nada foi perdido.'], button: 'Renascer na vila', tone: 'lose' });
    this.save();
  }
}

window.game = new Game();
