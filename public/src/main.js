import { enhance, findGear } from './core/enhance.js';
import './no-zoom.js';
import { heroSpritesEnabled, preloadHero, showHeroLoading } from './render/hero-sprites.js';
import { Renderer } from './render/renderer.js';
import { Input } from './input.js';
import { UI, esc } from './ui/ui.js';
import { World, makeHeroActor, makeMobActor, makeSpiritActor } from './game/sim.js';
import { makeRng } from './core/rng.js';
import { computeStats, canEquip, itemScore } from './core/stats.js';
import { addXp, mobXp, newCharacter, createSpirit, addSpiritXp, spiritPower, xpToNext, evolveSpirit } from './core/progression.js';
import { generateItem, rollMobLoot, rollRarity } from './core/loot.js';
import { generateRivalForPower } from './core/rival.js';
import { eloDelta, tierFor } from './core/combat.js';
import { MODES, newMatch, controlTick, matchWinner, getRating, setRating, spawnSlots } from './core/match.js';
import { playerPower, pvpUnlocked, PVP_MIN_LEVEL } from './core/power.js';
import { chooseSpec, specInfo, activeSpec } from './core/specs.js';
import { loadChar, saveChar, takeLoadInfo, parseSave, exportSave } from './save.js';
import { cleanName } from './core/savedoc.js';
import { apiUrl, Online, CloudSave } from './online.js';
import { NetClient } from './net/client.js';
import { SnapshotDecoder } from './core/snapshot.js';
import { noticeText } from './ui/ui.js';
import { skillOf } from './core/specs.js';
import { spawnSkillVfx, spawnEventVfx } from './render/skill-vfx.js';
import { ensureJournal, recordEvent, offeredBy, readyFor, activeFor, acceptQuest, abandonQuest, turnInQuest, setTitle, openChest, chestReady } from './core/journal.js';
import { QUESTS } from './data/quests.js';
import { ACH } from './data/achievements.js';
import { PRICES } from './shop.js';
import { TouchControls } from './touch.js';
import { loadPrefs, savePrefs, changePref, resolveQuality } from './prefs.js';
import { CLASSES } from './data/classes.js';
import { MOBS, NORMAL_MOBS, BOSS_MOBS } from './data/mobs.js';
import { ZONES, teleportCost } from './data/zones.js';
import { RARITY, INVENTORY_SIZE, SLOTS } from './data/items.js';
import { SPIRITS, SPIRIT_RARITY_MUL, MAX_SPIRITS } from './data/spirits.js';

const TOWN = ZONES.town.spawn;
// Passo fixo da simulação (60 Hz): mesmo resultado em qualquer taxa de quadros — pré-requisito do servidor autoritativo.
// 60 Hz (e não 30) evita precisar interpolar o desenho no cliente; o servidor pode enviar snapshots a 20 Hz.
export const FIXED_DT = 1 / 60;
const MAX_TICKS = 8;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.canvas);
    this.ui = new UI(this);
    this.prefs = loadPrefs();
    this.touch = new TouchControls(this);
    this.portrait = matchMedia('(orientation: portrait) and (pointer: coarse)');
    this.applyPrefs();
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
    // Com API configurada o jogo exige conta (login → personagens na nuvem). Sem API, segue offline como antes.
    const base = apiUrl();
    this.online = null; this.cloud = null; this.charId = null;
    document.body.classList.remove('online');
    if (base) {
      this.online = new Online(base);
      document.body.classList.add('online'); // libera os botões que só fazem sentido com conta (grupo)
      this.cloud = new CloudSave(this.online, { onSync: (doc) => this.mergeServerFields(doc), onReject: (doc, e) => this.resync(doc, e) });
      this.bootOnline();
    } else {
      this.ui.showTitle(loadChar());
      this.reportLoad();
    }
    addEventListener('beforeunload', () => { if (this.online) { this.cloud?.flush({ keepalive: true }); } else this.save(); });
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.mode === 'title') {
      const w = this.titleWorld;
      w.update(dt);
      w.events.length = 0;
      const cam = this.renderer.camera(w, { x: 850 + Math.cos(w.time * 0.1) * 320, y: 640 + Math.sin(w.time * 0.13) * 200 });
      this.renderer.draw(w, cam, {});
    } else {
      // Celular em retrato: a tela pede para girar o aparelho; o mundo fica parado até voltar à horizontal.
      if (!this.portrait.matches) this.step(dt);
      const p = this.player;
      if (this.mode === 'explore' && this.char && ((this.marksT = (this.marksT ?? 0) - dt) <= 0)) { this.marksT = 0.4; this.questMarks = this.computeMarks(); this.chestsOpen = new Set((this.world.zone.chests ?? []).filter((c) => !chestReady(this.char, c.id)).map((c) => c.id)); }
      const exploring = this.mode === 'explore';
      this.renderer.draw(this.world, this.cam, { player: p, nearNpc: this.nearNpc?.id, nearChest: exploring ? this.nearChest : null, questMarks: exploring ? this.questMarks : null, chestsOpen: exploring ? this.chestsOpen : null, lowHp: !p.dead && p.hp < p.maxHp * 0.25 });
      if ((this.mmT -= dt) <= 0) { this.renderer.drawMinimap(this.minimap, this.world, p); this.mmT = 0.15; }
      this.ui.updateHud(this);
      this.touch.update(this);
    }
    this.cloud?.tick();
    if (this.net?.connected && (this.netPingT = (this.netPingT ?? 0) - dt) <= 0) { this.net.ping(); this.netPingT = 2; }
    if (this.net?.queue && this.mode === 'explore') { this.ui.banner(`🔎 Procurando ${this.net.queue.mode === 'coop' ? 'cooperativo' : this.net.queue.mode}… ${this.net.queue.waited}s`); this.netBanner = true; }
    else if (this.netBanner && this.mode === 'explore') { this.ui.banner(null); this.netBanner = false; }
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------- ações da UI ----------------
  act(action, arg) {
    switch (action) {
      case 'continue': this.loadGame(loadChar()); break;
      case 'quest-accept': this.questAccept(arg); break;
      case 'quest-turnin': this.questTurnIn(arg); break;
      case 'quest-abandon': abandonQuest(this.char, arg); this.save(); this.ui.render(); break;
      case 'set-title': setTitle(this.char, arg || null); this.save(); this.ui.render(); break;
      case 'dialog-service': this.ui.openPanel(arg); break;
      case 'net-queue': this.netQueue(arg); break;
      case 'net-cancel': this.net?.cancelQueue(); break;
      case 'net-leave': this.leaveNetMatch(); break;
      case 'party-invite': { const n = document.getElementById('party-name')?.value?.trim(); if (n) this.net?.invite(n); break; }
      case 'party-accept': this.net?.accept(Number(arg)); this.ui.render(); break;
      case 'party-decline': this.net?.decline(Number(arg)); this.ui.render(); break;
      case 'party-leave': this.net?.leaveParty(); break;
      case 'party-kick': this.net?.kick(arg); break;
      case 'auth-mode': this.showAuth(arg); break;
      case 'auth-login': case 'auth-register': case 'auth-recover': this.submitAuth(action); break;
      case 'auth-google': this.authGoogle(arg); break;
      case 'char-select': this.selectCharacter(Number(arg)); break;
      case 'char-delete': this.deleteCharacter(Number(arg)); break;
      case 'char-import-local': this.importLocalSave(); break;
      case 'chars-refresh': this.showChars(); break;
      case 'auth-back-login': this.showAuth('login'); break;
      case 'switch-char': this.leaveCharacter().then(() => this.showChars()); break;
      case 'logout': this.leaveCharacter().then(async () => { await this.online.logout(); this.showAuth('login'); }); break;
      case 'new-char': this.ui.showCreate(this.online ? false : !!loadChar()); break;
      case 'back-title': this.online ? this.showChars() : this.ui.showTitle(loadChar()); break;
      case 'pick-class': this.ui.createClass = arg; this.ui.showCreate(this.online ? false : !!loadChar()); break;
      case 'save-export': this.exportSave(); break;
      case 'save-import': this.importSave(); break;
      case 'create': {
        const name = cleanName((document.getElementById('char-name')?.value ?? '').trim() || CLASSES[this.ui.createClass].name);
        if (this.online) this.createOnline(name, this.ui.createClass); else this.newGame(name, this.ui.createClass);
        break;
      }
      case 'close': this.ui.close(arg); break;
      case 'toggle': this.togglePanel(arg); document.getElementById('menu-btns')?.classList.remove('open'); break;
      case 'item': this.ui.isOpen('shop') ? this.sell(arg) : this.equip(arg); break;
      case 'unequip': this.unequip(arg); break;
      case 'enhance': this.enhanceItem(arg); break;
      case 'alloc': this.alloc(arg); break;
      case 'spec': this.pickSpec(arg); break;
      case 'sort-inv': this.sortInventory(); break;
      case 'pref': this.setPref(arg); break;
      case 'fullscreen': this.toggleFullscreen(); document.getElementById('menu-btns')?.classList.remove('open'); break;
      case 'buy-potion': this.buyPotion(Number(arg)); break;
      case 'buy-item': this.buyItem(Number(arg)); break;
      case 'sell-bulk': this.sellBulk(Number(arg)); break;
      case 'buy-essence': this.buyEssence(arg); break;
      case 'spirit-on': this.setSpirit(arg); break;
      case 'spirit-free': this.freeSpirit(arg); break;
      case 'spirit-evolve': this.evolveSpirit(arg); break;
      case 'teleport': this.teleport(arg); break;
      case 'alloc-auto': this.allocAuto(); break;
      case 'duel': this.startMatch('1v1'); break;
      case 'match': this.startMatch(arg); break;
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
    ensureJournal(char);
    this.char = char;
    this.ui.hideScreen();
    this.ui.setupHud(char);
    this.touch.setup(char);
    if (heroSpritesEnabled()) showHeroLoading(preloadHero(char.classId)); // visual novo: espera o herói carregar
    this.enterZone('town', TOWN.x, TOWN.y);
    if (fresh) {
      this.ui.toast(`Bem-vindo, ${esc(char.name)}!`, 'Siga o portal a leste para o Bosque Verdejante', 'gold');
      // o tutorial segue o modo de controle (toque é o padrão; teclado e mouse só se escolhido nas opções)
      if (this.touch?.active) this.ui.log('Arraste à esquerda para andar · botão grande ataca · círculos menores são as habilidades', '#cfe8ff');
      else this.ui.log('Mover: arraste o botão esquerdo do mouse ou use as setas · clique ataca · habilidades nos botões', '#cfe8ff');
      this.ui.log('💬 conversa com NPCs · 🧪 poção · 🏠 volta à vila · 🎒 mochila · 🧙 personagem · 🔮 spirits · 📖 diário', '#cfe8ff');
      const sp = SPIRITS[char.spirits[0].type];
      this.ui.log(`Um spirit te acompanha: <b style="color:${sp.color}">${sp.name}</b> (${sp.element}).`, sp.color);
    }
  }

  enterZone(zoneId, x, y, mode = 'explore') {
    const prev = this.player;
    const ratio = prev && !prev.dead ? prev.hp / prev.maxHp : 1;
    this.world = new World(zoneId);
    this.mode = mode;
    if (ZONES[zoneId].mobs || zoneId === 'town') (this.char.visited ??= {})[zoneId] = 1; // desbloqueia o teletransporte para este mapa
    this.player = this.world.add(makeHeroActor(this.char, x, y));
    if (!this.world.zone.safe && mode === 'explore') this.player.hp = Math.max(1, Math.round(this.player.maxHp * ratio));
    this.spawnSpirit(this.player, this.char);
    this.world.populate(this.char.level);
    this.rival = null;
    this.match = null;
    this.waves = null;
    this.portalCd = 1;
    this.cam = this.renderer.camera(this.world, this.player);
    this.ui.banner(null);
    const z = this.world.zone;
    this.ui.toast(z.name, z.level ? `Nível ${z.level[0]}–${z.level[1]}${z.scale ? '+' : ''}` : z.safe ? 'Zona segura' : '');
    if (zoneId === 'town') this.refreshShop();
    this.save();
  }

  save() {
    if (this.online) { this.cloud?.markDirty(); return; } // online: o servidor é a fonte oficial; o localStorage não guarda o personagem
    if (this.char) saveChar(this.char);
  }

  // ---------------- modo online ----------------
  async bootOnline() {
    try {
      const cfg = await this.online.loadConfig();
      this.googleClientId = cfg.googleClientId ?? null;
      this.maxCharacters = cfg.maxCharacters ?? 4;
      if (this.online.hasSession) { await this.showChars(); return; }
      this.showAuth('login');
    } catch (e) {
      this.showAuth('login', e.status === 0 ? 'Sem conexão com o servidor. Verifique a internet e tente de novo.' : e.message);
    }
  }

  showAuth(mode = 'login', msg = '') {
    this.ui.showLogin(mode, msg, !!this.googleClientId);
    if (this.googleClientId && mode !== 'recover') this.loadGoogleButton();
  }

  // Botão "Entrar com Google" (Google Identity Services). O ID token vai ao NOSSO servidor, que o verifica; só carrega se o servidor tiver Google configurado.
  loadGoogleButton() {
    const init = () => {
      const el = document.getElementById('google-btn');
      if (!el || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({ client_id: this.googleClientId, callback: (r) => this.act('auth-google', r.credential) });
      window.google.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', text: 'signin_with', locale: 'pt-BR' });
    };
    if (window.google?.accounts?.id) return init();
    if (document.getElementById('gsi-script')) return;
    const s = document.createElement('script');
    s.id = 'gsi-script'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = init;
    document.head.appendChild(s);
  }

  async submitAuth(action) {
    const email = document.getElementById('acc-email')?.value ?? '', pass = document.getElementById('acc-pass')?.value ?? '';
    try {
      if (action === 'auth-login') { await this.online.login(email, pass); await this.showChars(); }
      else if (action === 'auth-register') { const r = await this.online.register(email, pass); this.ui.showRecoveryCodes(r.recoveryCodes); }
      else {
        const r = await this.online.recover(email, document.getElementById('acc-code')?.value ?? '', pass);
        this.ui.showRecoveryCodes(r.recoveryCodes, 'auth-back-login');
      }
    } catch (e) { this.showAuth(action === 'auth-login' ? 'login' : action === 'auth-register' ? 'register' : 'recover', e.message); }
  }

  async authGoogle(idToken) {
    try { await this.online.google(idToken); await this.showChars(); }
    catch (e) { this.showAuth('login', e.message); }
  }

  async showChars(msg = '') {
    try {
      const me = await this.online.me();
      this.account = me.account;
      this.ui.showCharacters(me.characters, { email: me.account.email ?? 'conta Google', maxCharacters: this.maxCharacters ?? 4, hasLocalSave: !!loadChar(), msg });
    } catch (e) { this.showAuth('login', e.status === 401 ? '' : e.message); }
  }

  async createOnline(name, classId) {
    try { const r = await this.online.createCharacter(name, classId); this.startOnline(r.id, r.character, r.rev); }
    catch (e) { this.ui.showCreate(false); this.ui.toast('Não foi possível criar', e.message, ''); }
  }

  async selectCharacter(id) {
    try { const r = await this.online.getCharacter(id); this.startOnline(id, r.character, r.rev); }
    catch (e) { this.showChars(e.message); }
  }

  startOnline(id, doc, rev) {
    this.charId = id;
    this.cloud.attach(id, rev, () => this.char);
    this.loadGame(doc);
    this.connectNet();
  }

  async deleteCharacter(id) {
    if (!confirm('Apagar este personagem? Essa ação não pode ser desfeita pelo jogo.')) return;
    try { await this.online.deleteCharacter(id); } catch (e) { return this.showChars(e.message); }
    this.showChars();
  }

  async importLocalSave() {
    const local = loadChar();
    if (!local) return;
    try { const r = await this.online.importCharacter(JSON.stringify(local)); this.ui.toast('Save importado', r.character.name, 'gold'); await this.showChars(); }
    catch (e) { this.showChars(e.message); }
  }

  // Grava o que falta e solta o personagem (trocar de personagem ou sair da conta).
  async leaveCharacter() {
    if (this.cloud?.charId != null) { this.cloud.markDirty(); await this.cloud.flush(); this.cloud.detach(); }
    this.disconnectNet();
    this.char = null; this.charId = null; this.mode = 'title'; this.ui.banner(null);
  }

  // O servidor é dono de rating/vitórias/derrotas: depois de cada gravação adotamos o valor oficial.
  mergeServerFields(doc) {
    if (!this.char) return;
    Object.assign(this.char.arena, { rating: doc.arena.rating, wins: doc.arena.wins, losses: doc.arena.losses, ratings: doc.arena.ratings ?? {} });
  }

  // Gravação recusada (revisão velha ou valor implausível): volta ao estado oficial do servidor.
  resync(doc, err) {
    this.ui.toast('Sincronização', err.status === 409 ? 'O personagem foi alterado em outro lugar; recarreguei.' : 'O servidor recusou o salvamento; voltei ao último estado salvo.', '');
    this.loadGame(doc);
  }

  flushCloud() { return this.cloud?.flush(); }

  // ---------------- multiplayer no jogo real (servidor autoritativo) ----------------
  async connectNet() {
    this.disconnectNet();
    const url = this.online?.config?.gameUrl;
    if (!url || !this.online.token || this.charId == null) return;
    const refresh = () => { if (this.ui.isOpen('party') || this.ui.isOpen('arena')) this.ui.render(); };
    const net = this.net = new NetClient({
      url, session: this.online.token, characterId: this.charId,
      handlers: {
        party: refresh,
        queue: () => { refresh(); },
        invite: (m) => { this.ui.toast('Convite de grupo', `${m.from} convidou você (botão 👥)`, 'gold'); refresh(); },
        notice: (m) => { this.ui.log(noticeText(m), '#cfe3ff'); refresh(); },
        reject: (m) => { this.zoneBusy = false; if (!['bad_message', 'bad_version', 'rate_limit'].includes(m.code)) this.ui.toast('Servidor de partidas', noticeText({ ...m, t: 'reject' }), ''); },
        matchFound: (m) => this.enterNetMatch(m),
        zoneJoined: (m) => this.enterNetZone(m),
        zoneReward: (m) => this.onZoneReward(m),
        zoneExit: (m) => this.leaveNetMatch(m),
        snap: (s) => this.onNetSnap(s),
        reward: (m) => this.onNetReward(m),
        matchEnd: () => { this.netEnded = true; },
        close: () => { if (this.mode === 'net') this.ui.toast('Conexão', 'Reconectando ao servidor de partidas…', ''); },
      },
    });
    try { await net.connect(); refresh(); }
    catch (e) { this.ui.log(e.message === 'already_online' ? 'Este personagem já está conectado em outro lugar.' : 'Servidor de partidas indisponível: o PvP online e o cooperativo ficam desligados.', '#ffb4a8'); this.net = null; }
  }
  disconnectNet() { this.net?.close(); this.net = null; this.netBanner = false; }

  async netQueue(mode) {
    if (!this.net?.joined) return this.ui.toast('Servidor de partidas', 'Ainda conectando…', '');
    if (this.mode !== 'explore') return;
    await this.cloud?.flush(); // grava o progresso ANTES: as recompensas da partida são gravadas pelo servidor em cima dessa versão
    this.net.queueFor(mode);
  }

  // exploração dentro de uma instância do servidor (P11)
  inNetZone() { return this.mode === 'net' && this.netInfo?.mode === 'zone'; }
  // equipamento/atributos/spirits mudam o personagem no cliente; na instância o servidor é o dono do personagem (transações de loja/equipar: P11.4)
  togglePanel(id) {
    if ((id === 'journal' || id === 'map') && this.mode !== 'explore') return; // diário e mapa só no mundo normal
    if (id === 'party' && !this.online) return;
    if (this.inNetZone() && ['inventory', 'character', 'spirits'].includes(id)) return this.ui.toast('Na exploração online', 'Volte à vila (H) para mexer no equipamento e nos atributos.', '');
    this.ui.toggle(id);
  }
  async enterZoneOnline(zone, from) {
    if (this.zoneBusy) return;
    this.zoneBusy = true; this.portalCd = 3;
    setTimeout(() => { this.zoneBusy = false; }, 6000); // sem resposta do servidor: libera para tentar de novo
    await this.cloud?.flush(); // grava o progresso ANTES: o servidor soma as recompensas em cima desta versão do personagem
    this.net.send({ t: 'zone_enter', zone, from });
  }
  enterNetZone(m) {
    this.zoneBusy = false;
    const info = { ...m, mode: 'zone', team: 1 };
    if (this.mode === 'net' && this.netInfo?.room === m.room) { this.netInfo = info; this.netDec = new SnapshotDecoder().init(m); return; } // reconexão
    this.ui.closePanels(); this.ui.hideScreen();
    (this.char.visited ??= {})[m.zone] = 1;
    this.netDec = new SnapshotDecoder().init(m);
    if (this.cloud) this.cloud.paused = true; // na instância o servidor altera o personagem
    const w = new World(m.zone, { visuals: true });
    this.world = w; this.mode = 'net'; this.netInfo = info; this.netEnded = false; this.netOver = false; this.netRewardMsg = null;
    this.netActors = new Map(); this.netMobs = new Map(); this.netSnaps = []; this.netLast = null; this.netPred = null; this.netT = 0; this.netCastPending = null; this.netVProj = [];
    for (const p of m.players) this.netAddHero(p, m.you);
    this.player = this.netActors.get(m.you);
    const st = computeStats(this.char);
    Object.assign(this.player, { stats: st, maxHp: st.maxHp, hp: st.maxHp, classId: this.char.classId, spec: activeSpec(this.char), level: this.char.level, x: m.x, y: m.y });
    this.netPred = { x: m.x, y: m.y };
    this.cam = this.renderer.camera(w, this.player);
    this.ui.banner(null);
    const z = w.zone;
    this.ui.toast(z.name, `Nível ${z.level[0]}–${z.level[1]} · instância ${this.net?.party ? 'do grupo' : 'solo'} (H volta à vila)`);
  }
  netAddHero(p, you) {
    const doc = newCharacter(p.name, p.classId, makeRng(p.id)); doc.level = p.level ?? 1;
    const mine = p.id === you;
    const a = makeHeroActor(doc, 550, 550, mine ? 'player' : 'rival', 1);
    a.name = p.name; a.netId = p.id; a.mark = mine ? null : 'ally';
    this.world.add(a); this.netActors.set(p.id, a);
    return a;
  }
  // recompensas gravadas pelo servidor: avisa e adota o personagem oficial (o servidor é quem soma XP/ouro/itens)
  async onZoneReward(r) {
    if (!this.inNetZone()) return;
    const parts = [];
    if (r.gold) parts.push(`${r.gold > 0 ? '+' : ''}${r.gold} 🪙`);
    if (r.xp) parts.push(`+${r.xp} XP`);
    if (r.items) parts.push(`${r.items} item(ns)`);
    if (r.potions) parts.push(`+${r.potions} 🧪`);
    if (parts.length) this.ui.log(parts.join(' · '), '#ffd27a');
    if (r.deaths) this.ui.log('Você caiu: −10% do ouro.', '#ffb4a8');
    if (r.levels) this.ui.toast(`Nível ${r.level}!`, 'Sua vida foi restaurada. Distribua os pontos na vila (🧙).', 'gold');
    for (const id of r.quests ?? []) this.ui.toast('Missão pronta!', QUESTS[id]?.name ?? '', 'gold');
    for (const id of r.achievements ?? []) this.announceAchievements([id]);
    try { const c = await this.online.getCharacter(this.charId); if (this.inNetZone()) { this.char = c.character; this.cloud.attach(this.charId, c.rev, () => this.char); } } catch { /* tenta no próximo lote */ }
  }

  enterNetMatch(m) {
    if (this.mode === 'net' && this.netInfo?.room === m.room) { this.netInfo = m; this.netDec = new SnapshotDecoder().init(m); return; } // reconexão na mesma sala: o servidor manda um quadro-chave em seguida
    this.ui.closePanels(); this.ui.hideScreen();
    this.netDec = new SnapshotDecoder().init(m);
    if (this.cloud) this.cloud.paused = true; // durante a partida o servidor é quem altera o personagem
    const w = new World(m.mode === 'coop' ? 'waves' : 'arena_team', { visuals: true });
    this.world = w; this.mode = 'net'; this.netInfo = m; this.netEnded = false; this.netOver = false; this.netRewardMsg = null;
    this.netActors = new Map(); this.netMobs = new Map(); this.netSnaps = []; this.netPred = null; this.netT = 0; this.netCastPending = null; this.netVProj = [];
    for (const p of m.players) {
      const doc = newCharacter(p.name, p.classId, makeRng(p.id)); doc.level = p.level ?? 10;
      const mine = p.id === m.you, ally = p.team === m.team;
      const a = makeHeroActor(doc, 550, 550, mine ? 'player' : 'rival', ally ? 1 : 2);
      a.name = p.bot ? p.name + ' (bot)' : p.name; a.netId = p.id; a.mark = mine ? null : ally ? 'ally' : 'foe';
      w.add(a); this.netActors.set(p.id, a);
    }
    this.player = this.netActors.get(m.you);
    const st = computeStats(this.char);
    Object.assign(this.player, { stats: st, maxHp: st.maxHp, hp: st.maxHp, classId: this.char.classId, spec: activeSpec(this.char), level: this.char.level });
    if (m.objective) w.objective = { ...m.objective, owner: 0, contested: false };
    this.cam = this.renderer.camera(w, this.player);
    this.ui.toast(m.mode === 'coop' ? 'Cooperativo' : `Partida ${m.mode}`, m.mode === 'coop' ? 'Cinco ondas e um chefe: sobrevivam juntos!' : 'Segure o ponto central e vença o time rival.', 'gold');
  }

  // snapshot do servidor: guarda para interpolar e dispara os efeitos dos EVENTOS confirmados (a apresentação nunca decide dano)
  onNetSnap(raw) {
    if (this.mode !== 'net' || raw.room !== this.netInfo?.room || !this.netDec) return;
    const s = this.netDec.apply(raw); // delta → quadro completo (mesmo formato de antes)
    s.at = performance.now();
    this.netSnaps.push(s); if (this.netSnaps.length > 24) this.netSnaps.shift();
    this.netLast = s;
    const w = this.world, my = this.netInfo.team;
    if (w.objective && s.match) { w.objective.owner = s.match.owner ? (s.match.owner === my ? 1 : 2) : 0; }
    for (const e of s.events) this.netEvent(e);
    if (s.state === 'over' && !this.netOver) { this.netOver = true; this.showNetResult(s); }
  }

  netEntity(id) { return this.netActors.get(id) ?? this.netMobs.get(id) ?? null; }

  netEvent(e) {
    const w = this.world, a = e.actor != null ? this.netEntity(e.actor) : null;
    switch (e.e) {
      case 'hit': {
        const t = this.netEntity(e.target); if (!t) break;
        t.hitFlash = 0.12;
        spawnEventVfx(w, { type: 'hit', target: t, crit: e.crit, absorbed: e.absorbed });
        const mine = t === this.player;
        w.addText({ x: t.x + (Math.random() - 0.5) * 16, y: t.y - t.r - 12, t: 0, life: 0.9, text: e.absorbed ? 'absorvido' : String(e.amount), size: e.crit ? 21 : 15, color: e.absorbed ? '#ffe9a0' : mine ? '#ff6b6b' : e.crit ? '#ffd166' : '#ffffff' });
        w.burst(t.x, t.y, mine ? '#ff8080' : '#ffffff', e.crit ? 10 : 5, 140);
        break;
      }
      case 'heal': if (a) spawnEventVfx(w, { type: 'heal', actor: a, amount: e.amount });
        if (a) w.addText({ x: a.x, y: a.y - a.r - 14, t: 0, life: 0.9, text: '+' + e.amount, size: 15, color: '#7dff9b' }); break;
      case 'swing': {
        if (!a) break;
        a.swing = 0.25;
        const b = a.kind === 'mob' ? null : CLASSES[a.classId]?.basic;
        if (!b) break;
        if (b.kind === 'melee') w.addFx({ type: 'slash', x: a.x, y: a.y, ang: e.ang ?? a.facing, arc: b.arc, r: b.range, t: 0, life: 0.2, color: b.color });
        else this.netShoot(a, e.ang ?? a.facing, b);
        break;
      }
      case 'cast': {
        if (!a) break;
        a.swing = 0.3;
        spawnSkillVfx(w, { actor: a, skill: e.skill, ang: e.ang ?? a.facing, tx: e.tx, ty: e.ty });
        const s = skillOf(a.classId, a.spec ?? null, e.skill);
        if (s.kind === 'aoe_self' || s.kind === 'buff') { w.addFx({ type: 'ring', x: a.x, y: a.y, r: s.radius ?? 60, color: s.color, t: 0, life: 0.45, follow: s.kind === 'buff' ? a : undefined }); w.burst(a.x, a.y, s.color, 18, 180); }
        else if (s.kind === 'projectile') this.netShoot(a, e.ang ?? a.facing, s);
        else if (s.kind === 'ground_aoe' && e.tx != null) { w.addFx({ type: 'ring', x: e.tx, y: e.ty, r: s.radius, color: s.color, t: 0, life: 0.6 }); w.burst(e.tx, e.ty, s.color, 20, 160); }
        else { w.burst(a.x, a.y, s.color ?? '#fff', 14, 150); }
        break;
      }
      case 'death': { const t = this.netEntity(e.actor); if (t) w.burst(t.x, t.y, t.kind === 'mob' ? MOBS[t.mobId]?.color ?? '#fff' : '#ffffff', 26, 220); break; }
      case 'telegraph': w.telegraphs.push({ x: e.x, y: e.y, r: e.r, t: 0, delay: e.delay, color: e.color, done: false, src: { dead: false } }); break;
      case 'wave': this.ui.toast(e.boss ? 'Onda final: o chefe!' : `Onda ${e.n}`, '', 'gold'); break;
      case 'wave_clear': this.ui.toast(`Onda ${e.n} vencida!`, 'Recuperem o fôlego…', 'gold'); break;
      case 'revive': if (a) w.burst(a.x, a.y, '#ffe9a0', 20, 160); break;
      case 'left': if (this.netInfo?.mode !== 'zone') this.ui.log('Um jogador saiu da partida.', '#ffb4a8'); break;
    }
  }

  // projétil só VISUAL (o dano vem do servidor): voa em linha reta até o alcance
  netShoot(a, ang, spec) {
    this.world.projectiles.push({ x: a.x + Math.cos(ang) * (a.r + 4), y: a.y + Math.sin(ang) * (a.r + 4), vx: Math.cos(ang) * spec.speed, vy: Math.sin(ang) * spec.speed, ang,
      team: a.team, src: a, mult: 0, radius: spec.radius ?? 6, color: spec.color ?? '#fff', range: spec.range ?? 500, traveled: 0, pierce: !!spec.pierce, explode: spec.explode ?? 0, stun: spec.stun ?? 0, hit: new Set(), dead: false, cosmetic: true });
  }

  netStep(dt) {
    const w = this.world, p = this.player, inp = this.input, net = this.net;
    // ---- entrada: só INTENÇÕES, a ~30 Hz ----
    let intent = { mx: 0, my: 0, aimX: p.x, aimY: p.y, attack: false, cast: null };
    if (this.touch.active) intent = { ...this.touch.read(p, w) };
    else {
      let cast = null;
      ['1', '2', '3'].forEach((k, i) => { if (inp.hit(k)) cast = i; });
      intent = {
        mx: (inp.held('d', 'arrowright') ? 1 : 0) - (inp.held('a', 'arrowleft') ? 1 : 0), my: (inp.held('s', 'arrowdown') ? 1 : 0) - (inp.held('w', 'arrowup') ? 1 : 0),
        aimX: inp.mouse.x / this.renderer.zoom + this.cam.x, aimY: inp.mouse.y / this.renderer.zoom + this.cam.y, attack: inp.mouse.down, cast,
      };
    }
    if (intent.cast != null) this.netCastPending = intent.cast;
    this.netIntent = intent;
    if (this.netInfo && this.netLast?.state !== 'over' && ((this.netT += dt) >= 1 / 30 || this.netCastPending != null)) {
      this.netT = 0;
      net?.sendInput({ ...intent, cast: this.netCastPending });
      this.netCastPending = null;
    }
    this.updateNet(dt);
    const focus = p.dead ? ([...this.netActors.values()].find((a) => !a.dead && a.mark !== 'foe') ?? p) : p;
    const target = this.renderer.camera(w, focus), k = Math.min(1, dt * 8);
    this.cam = { x: this.cam.x + (target.x - this.cam.x) * k, y: this.cam.y + (target.y - this.cam.y) * k };
    this.nearNpc = null;
  }

  updateNet(dt) {
    const w = this.world, snaps = this.netSnaps, last = this.netLast;
    if (!last) { w.updateVisuals(dt); return; }
    const now = performance.now() - 100; // interpolação: desenha 100 ms no passado
    let a = snaps[0], b = snaps[snaps.length - 1];
    for (let i = 0; i < snaps.length - 1; i++) { if (snaps[i].at <= now && now <= snaps[i + 1].at) { a = snaps[i]; b = snaps[i + 1]; break; } }
    const k = b === a ? 1 : Math.max(0, Math.min(1, (now - a.at) / (b.at - a.at || 1)));
    const lerp = (list, id, key) => { const x = list.find((e) => e.id === id), y = b[list === a.actors ? 'actors' : 'mobs']?.find((e) => e.id === id) ?? x; return x && y ? x[key] + (y[key] - x[key]) * k : null; };
    const apply = (ent, se, isMob) => {
      const ax = lerp(isMob ? a.mobs : a.actors, se.id, 'x'), ay = lerp(isMob ? a.mobs : a.actors, se.id, 'y');
      ent.x = ax ?? se.x; ent.y = ay ?? se.y;
      ent.hp = se.hp; ent.maxHp = se.maxHp; ent.facing = se.facing; ent.moving = se.moving;
      if (se.dead && !ent.dead) ent.deadT = 0;
      ent.dead = se.dead; ent.deadT = se.dead ? ent.deadT + dt : 0;
      ent.swing = se.swing ? Math.max(ent.swing, 0.1) : Math.max(0, ent.swing - dt);
      ent.stunT = se.stun ? 1 : 0; ent.shield = se.shield ?? 0;
      ent.hitFlash = Math.max(0, (ent.hitFlash ?? 0) - dt);
      if (se.moving) ent.walk += dt * (se.spd ?? 200) / 28;
    };
    if (this.netInfo.mode === 'zone') { // instância: jogadores entram e saem durante a sala
      const ids = new Set(last.actors.map((x) => x.id));
      for (const se of last.actors) if (!this.netActors.has(se.id)) this.netAddHero(se, this.netInfo.you);
      for (const [id, a] of this.netActors) if (!ids.has(id)) { w.actors = w.actors.filter((x) => x !== a); this.netActors.delete(id); }
    }
    for (const se of last.actors) {
      const ent = this.netActors.get(se.id); if (!ent) continue;
      apply(ent, se, false);
      if (ent === this.player) {
        // predição só do movimento do PRÓPRIO jogador, corrigida pelo servidor
        const i = this.netIntent ?? {}, len = Math.hypot(i.mx ?? 0, i.my ?? 0);
        const pr = (this.netPred ??= { x: se.x, y: se.y });
        if (se.dead || Math.hypot(pr.x - se.x, pr.y - se.y) > 120 || last.state !== 'fight') { pr.x = se.x; pr.y = se.y; }
        else { if (len > 0.01) { pr.x += (i.mx / len) * se.spd * dt; pr.y += (i.my / len) * se.spd * dt; } pr.x += (se.x - pr.x) * 0.12; pr.y += (se.y - pr.y) * 0.12; }
        ent.x = pr.x; ent.y = pr.y;
        if (this.netInfo.mode === 'zone' && !se.dead) { w.collide(ent); pr.x = ent.x; pr.y = ent.y; } // mesma colisão do servidor: não atravessa árvores
        ent.cds = { ...se.cds };
        if (se.maxHp) { ent.hp = se.hp; ent.maxHp = se.maxHp; }
      }
    }
    // monstros do cooperativo: cria/atualiza/remove conforme o snapshot
    if (last.mobs) {
      const present = new Set();
      for (const sm of last.mobs) {
        present.add(sm.id);
        let m = this.netMobs.get(sm.id);
        if (!m) { m = makeMobActor(sm.mob, sm.level, sm.x, sm.y, { elite: sm.elite }); m.netId = sm.id; w.add(m); this.netMobs.set(sm.id, m); }
        apply(m, sm, true);
      }
      for (const [id, m] of this.netMobs) if (!present.has(id)) { w.actors = w.actors.filter((x) => x !== m); this.netMobs.delete(id); }
    }
    // projéteis visuais e avisos de perigo
    for (const pr of w.projectiles) { pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.traveled += Math.hypot(pr.vx, pr.vy) * dt; if (pr.traveled >= pr.range) pr.dead = true; }
    w.projectiles = w.projectiles.filter((pr) => !pr.dead);
    for (const tg of w.telegraphs) { tg.t += dt; if (tg.t >= tg.delay) tg.done = true; }
    w.telegraphs = w.telegraphs.filter((tg) => !tg.done);
    w.time += dt;
    w.updateVisuals(dt);
    if (this.netInfo.mode === 'zone') { this.ui.banner(this.player.dead ? 'Você caiu… renasce na entrada em instantes' : null); return; }
    // faixa de informação da partida
    if (!this.netOver) {
      const my = this.netInfo.team;
      if (last.mode === 'coop') this.ui.banner(last.state === 'countdown' ? `Começa em ${Math.ceil(last.countdown)}` : last.coop.rest > 0 ? `Onda ${last.coop.wave + 1}/${last.coop.total} em ${Math.ceil(last.coop.rest)}s` : `Onda ${last.coop.wave}/${last.coop.total} · ${last.coop.mobs} monstros`);
      else if (last.state === 'countdown') this.ui.banner(`${this.netInfo.mode} — começa em ${Math.ceil(last.countdown)}`);
      else if (last.match) this.ui.banner(`${last.match.score[my]} × ${last.match.score[my === 1 ? 2 : 1]} · ${last.match.left}s`);
    }
  }

  showNetResult(s) {
    const m = this.netInfo, coop = m.mode === 'coop';
    const won = coop ? s.winner === 1 : s.winner === m.team, draw = !coop && s.winner === 3;
    this.netResult = { won, draw, coop };
    this.ui.banner(null);
    if (this.netRewardMsg) return this.renderNetReward();
    this.ui.showResult({
      title: draw ? 'Empate' : won ? (coop ? 'Vitória cooperativa!' : 'Vitória!') : (coop ? 'Derrota' : 'Derrota'),
      sub: coop ? `Ondas vencidas: ${s.coop?.wave ?? 0}/${s.coop?.total ?? 5}` : `Partida ${m.mode}`,
      lines: ['Calculando recompensas no servidor…'], button: 'Voltar à vila', action: 'net-leave', tone: won ? 'win' : 'lose',
    });
  }

  onNetReward(r) {
    if (this.mode !== 'net') return;
    this.netRewardMsg = r; // a recompensa pode chegar ANTES do snapshot 'over': guarda e mostra quando a tela de resultado existir
    if (this.netOver) this.renderNetReward();
  }

  renderNetReward() {
    const r = this.netRewardMsg;
    const lines = [];
    if (r.mode !== 'coop') lines.push(`Rating ${r.mode}: ${r.rating} (${r.ratingDelta >= 0 ? '+' : ''}${r.ratingDelta})`);
    lines.push(`+${r.gold} 🪙`, `+${r.xp} XP${r.levels ? ` · subiu ${r.levels} nível(is)!` : ''}`);
    if (r.items) lines.push(`${r.items} item(ns) de recompensa no inventário`);
    if (r.converted) lines.push(`${r.converted} item(ns) viraram ouro (inventário cheio)`);
    const nr = this.netResult ?? {};
    this.ui.showResult({ title: nr.draw ? 'Empate' : r.won ? (r.mode === 'coop' ? 'Vitória cooperativa!' : 'Vitória!') : 'Derrota', sub: r.mode === 'coop' ? `Ondas vencidas: ${r.waves}/5` : `Partida ${r.mode}`, lines, button: 'Voltar à vila', action: 'net-leave', tone: r.won ? 'win' : 'lose' });
  }

  // volta ao jogo normal: adota o personagem OFICIAL do servidor (com as recompensas) e retoma a sincronização
  async leaveNetMatch(exit = null) {
    this.ui.hideScreen(); this.ui.banner(null);
    this.netInfo = null; this.netLast = null; this.netActors = null; this.netMobs = null;
    try { const r = await this.online.getCharacter(this.charId); this.char = r.character; this.cloud.attach(this.charId, r.rev, () => this.char); } catch { /* mantém o local */ }
    if (this.cloud) this.cloud.paused = false;
    this.zoneBusy = false;
    this.enterZone('town', exit?.x ?? TOWN.x, exit?.y ?? TOWN.y);
  }

  // Avisa o jogador quando o save foi migrado, corrigido ou recuperado do backup.
  reportLoad() {
    const i = takeLoadInfo();
    if (!i) return;
    if (i.recovered) this.ui.toast('Save recuperado', 'O save principal estava corrompido; usei o backup.', 'gold');
    else if (i.error) this.ui.toast('Save ilegível', 'O arquivo original foi guardado; você pode criar outro personagem.', '');
    else if (i.migratedFrom) this.ui.toast('Save atualizado', 'Versão ' + i.migratedFrom + ' → nova (cópia guardada).', 'gold');
    else if (i.warnings?.length) this.ui.toast('Save corrigido', i.warnings.length + ' ajuste(s) de segurança aplicados.', '');
  }

  exportSave() {
    if (!this.char) return;
    const blob = new Blob([exportSave(this.char)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aetheria-' + cleanName(this.char.name).replace(/\s+/g, '-').toLowerCase() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.ui.toast('Save exportado', a.download, 'gold');
  }

  importSave() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      this.applyImport(await file.text());
    };
    input.click();
  }

  // Separado do seletor de arquivo para poder ser testado sem diálogo do sistema.
  applyImport(text) {
    const r = parseSave(text);
    if (!r.ok) return this.ui.toast('Importação falhou', r.reason, '');
    if (this.online) { // online: o arquivo vira um NOVO personagem da conta (o servidor revalida e reemite os ids)
      this.online.importCharacter(text).then((x) => { this.ui.toast('Save importado', x.character.name, 'gold'); this.leaveCharacter().then(() => this.showChars()); }).catch((e) => this.ui.toast('Importação falhou', e.message, ''));
      return;
    }
    if (loadChar() && !confirm('Importar "' + r.char.name + '" substitui o personagem atual deste aparelho. Continuar?')) return;
    saveChar(r.char);
    this.ui.toast('Save importado', r.char.name + (r.warnings.length ? ' · ' + r.warnings.length + ' ajuste(s)' : ''), 'gold');
    if (this.mode === 'title') this.ui.showTitle(r.char); else this.loadGame(r.char);
  }

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

  // ---------------- preferências do aparelho ----------------
  applyPrefs() {
    const p = this.prefs;
    document.documentElement.style.setProperty('--ui', String(p.scale / 100));
    this.renderer.setQuality(resolveQuality(p, this.touch.coarse));
    this.touch.setMode(p.controls);
  }

  setPref(arg) {
    this.prefs = changePref(this.prefs, arg);
    savePrefs(this.prefs);
    this.applyPrefs();
    if (this.ui.isOpen('options')) this.ui.render();
  }

  toggleFullscreen() {
    const d = document;
    if (d.fullscreenElement) { d.exitFullscreen?.(); return; }
    d.documentElement.requestFullscreen?.()
      .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
      .catch(() => this.ui.log('Tela cheia não disponível neste navegador.', '#ffb4a8'));
  }

  // ---------------- loop de jogo ----------------
  step(dt) {
    const p = this.player, w = this.world, inp = this.input;
    this.potionCd = Math.max(0, this.potionCd - dt);
    this.portalCd -= dt;

    if (inp.hit('escape')) this.ui.closePanels();
    if (inp.hit('i') || inp.hit('b')) this.togglePanel('inventory');
    if (inp.hit('c')) this.togglePanel('character');
    if (inp.hit('p')) this.togglePanel('spirits');
    if (inp.hit('q')) this.usePotion();
    if (inp.hit('h')) this.hearth();
    if (inp.hit('g') && this.online) this.ui.toggle('party');
    if (inp.hit('e')) { if (this.nearNpc) this.talk(this.nearNpc); else if (this.nearChest) this.useChest(this.nearChest); }
    if (inp.hit('j') && this.mode === 'explore') this.ui.toggle('journal');
    if (inp.hit('m') && this.mode === 'explore') this.ui.toggle('map');

    if (this.mode === 'net') { this.netStep(dt); return; }
    if (this.mode === 'ended') {
      w.updateVisuals(dt);
    } else {
      let intents = {};
      if (!p.dead) {
        if (this.touch.active) intents[p.id] = this.touch.read(p, w);
        else {
          let cast = null;
          ['1', '2', '3'].forEach((k, i) => { if (inp.hit(k)) cast = i; });
          intents[p.id] = {
            mx: (inp.held('d', 'arrowright') ? 1 : 0) - (inp.held('a', 'arrowleft') ? 1 : 0),
            my: (inp.held('s', 'arrowdown') ? 1 : 0) - (inp.held('w', 'arrowup') ? 1 : 0),
            aimX: inp.mouse.x / this.renderer.zoom + this.cam.x, aimY: inp.mouse.y / this.renderer.zoom + this.cam.y,
            attack: inp.mouse.down, cast,
          };
        }
      }
      this.acc = Math.min((this.acc ?? 0) + dt, FIXED_DT * MAX_TICKS);
      while (this.acc >= FIXED_DT) {
        this.acc -= FIXED_DT;
        this.tick(FIXED_DT, intents);
        if (this.world !== w) { this.acc = 0; break; } // trocou de zona no meio dos ticks
        // o toque na tecla da skill vale uma vez só, não uma por tick
        for (const k of Object.keys(intents)) intents[k] = { ...intents[k], cast: null };
      }
    }

    this.nearNpc = (w.zone.npcs ?? []).find((n) => Math.hypot(n.x - p.x, n.y - p.y) < 80) ?? null;
    this.nearChest = (w.zone.chests ?? []).find((c) => Math.hypot(c.x - p.x, c.y - p.y) < 70)?.id ?? null;
    // morto numa partida por times: a câmera segue um aliado vivo
    const focus = p.dead && this.match ? (this.match.team1.find((a) => !a.dead) ?? p) : p;
    const target = this.renderer.camera(w, focus), k = Math.min(1, dt * 8);
    this.cam = { x: this.cam.x + (target.x - this.cam.x) * k, y: this.cam.y + (target.y - this.cam.y) * k };
    if ((this.saveT -= dt) <= 0) { this.save(); this.saveT = 15; }
  }

  // Um tick da simulação (passo fixo).
  tick(dt, intents) {
    const w = this.world, p = this.player;
    w.update(dt, intents);
    this.handleEvents();
    if (this.mode === 'explore') { w.updateSpawns(dt, p); this.checkPortals(); this.regen(dt); }
    else if (this.mode === 'waves') this.updateWaves(dt);
    else if (this.mode === 'pvp') this.updateMatch(dt);
    this.collectDrops();
  }

  handleEvents() {
    const events = this.world.events.splice(0);
    for (const ev of events) {
      if (ev.type === 'cast') { spawnSkillVfx(this.world, ev); continue; } // efeito visual da habilidade (a simulação já decidiu tudo)
      if (ev.type === 'hit' || ev.type === 'heal') { spawnEventVfx(this.world, ev); continue; } // crítico, absorção e cura
      if (ev.type !== 'death') continue;
      const a = ev.actor;
      if (a.kind === 'mob') this.onMobKilled(a);
      else if (a === this.player) this.onPlayerDeath();
      // rival/aliado caindo não encerra nada: updateMatch conta os vivos de cada time
    }
  }

  // Teletransporte para um mapa já visitado (pelo painel do mapa): a Vila é de graça; os outros custam ouro e exigem estar fora de combate.
  teleport(id) {
    const c = this.char, z = ZONES[id];
    if (this.mode !== 'explore' || !z || !(id === 'town' || c.visited?.[id])) return;
    if (id === this.world.zoneId) return this.ui.toast('Você já está aqui', z.name, '');
    if (this.world.time - this.player.lastCombat < 8) return this.ui.toast('Em combate', 'Espere uns segundos para viajar.', '');
    if (this.online && this.net?.joined && z.mobs) return this.ui.toast('Teletransporte indisponível online', 'Por enquanto use os portais (o servidor confere cada passagem).', '');
    const cost = teleportCost(id);
    if (cost && !this.spend(cost)) return;
    this.ui.closePanels();
    const at = z.spawn ?? { x: 110, y: 950 };
    this.enterZone(id, at.x, at.y);
  }

  checkPortals() {
    if (this.portalCd > 0) return;
    const p = this.player;
    for (const pt of this.world.zone.portals ?? []) {
      if (Math.hypot(pt.x - p.x, pt.y - p.y) < 50) {
        if (this.online && this.net?.joined && ZONES[pt.to].mobs) { this.enterZoneOnline(pt.to, this.world.zoneId); return; } // exploração é do servidor
        this.enterZone(pt.to, pt.tx, pt.ty); return;
      }
    }
  }

  regen(dt) {
    const p = this.player;
    if (p.dead) return;
    const safe = this.world.zone.safe;
    if (safe || this.world.time - p.lastCombat > 5) this.world.heal(p, p.maxHp * (safe ? 0.25 : 0.03) * dt, true);
  }

  // NPC: com missão para oferecer/entregar/acompanhar abre o diálogo; sem missão, abre direto o serviço (como antes).
  talk(npc) {
    const c = this.char;
    const hasQuest = npc.role === 'quest' || offeredBy(c, npc.id, { server: !!this.online }).length || readyFor(c, npc.id).length || activeFor(c, npc.id).length;
    if (hasQuest) { this.dialogNpc = npc.id; this.ui.openPanel('dialog'); return; }
    if (npc.role === 'shop') this.ui.openPanel('shop');
    else if (npc.role === 'arena') this.ui.openPanel('arena');
    else if (npc.role === 'spirit') this.ui.openPanel('sage');
  }

  // marca sobre o NPC: '!' tem missão, '?' pronta para entregar, 'none' nada (só para quem existe só por missões)
  computeMarks() {
    const marks = {};
    for (const n of this.world.zone.npcs ?? []) {
      if (readyFor(this.char, n.id).length) marks[n.id] = 'ready';
      else if (offeredBy(this.char, n.id, { server: !!this.online }).length) marks[n.id] = 'offer';
      else if (n.role === 'quest') marks[n.id] = 'none';
    }
    return marks;
  }

  // eventos do jogo → diário (contadores, missões, conquistas) e avisos ao jogador
  gameEvent(ev) {
    const out = recordEvent(this.char, ev);
    for (const q of out.quests) if (q.complete) this.ui.toast('Missão pronta!', QUESTS[q.id].name + ' — volte ao NPC (marca ?)', 'gold');
    this.announceAchievements(out.achievements);
    if (out.quests.length || out.achievements.length) { this.save(); if (this.ui.isOpen('journal')) this.ui.render(); }
    return out;
  }
  announceAchievements(list) { for (const id of list) this.ui.toast('Conquista!', ACH[id].name + (ACH[id].title ? ` · título "${ACH[id].title}"` : ''), 'gold'); }

  questAccept(id) {
    const r = acceptQuest(this.char, id);
    if (!r.ok) return this.ui.toast('Missão', r.reason, '');
    this.ui.toast('Missão aceita', QUESTS[id].name, 'gold');
    this.save(); this.ui.render();
  }
  questTurnIn(id) {
    const r = turnInQuest(this.char, id, this.rng);
    if (!r.ok) return this.ui.toast('Missão', r.reason, '');
    const R = r.reward;
    this.ui.toast('Missão concluída!', [QUESTS[id].name, R.gold ? `+${R.gold} 🪙` : '', R.xp ? `+${R.xp} XP` : ''].filter(Boolean).join(' · '), 'gold');
    for (const it of R.items) this.ui.log(`Recompensa: <b style="color:${RARITY[it.rarity].color}">${it.name}</b>`);
    if (R.levels) this.onLevelUp();
    this.refreshStats();
    this.announceAchievements(r.achievements);
    this.save(); this.ui.render();
  }

  useChest(id) {
    const chest = (this.world.zone.chests ?? []).find((c) => c.id === id);
    if (!chest || this.mode !== 'explore') return;
    const r = openChest(this.char, chest, this.world.zoneId, this.rng);
    if (!r.ok) return this.ui.log(r.reason, '#ffb4a8');
    this.world.burst(chest.x, chest.y - 8, '#ffd34d', 26, 200);
    this.world.addText({ x: chest.x, y: chest.y - 30, t: 0, life: 1.1, text: `+${r.gold} 🪙`, size: 15, color: '#ffd34d' });
    this.ui.toast('Baú aberto!', r.item ? `+${r.gold} 🪙 e ${r.item.name}${r.item.converted ? ' (virou ouro: mochila cheia)' : ''}` : `+${r.gold} 🪙`, 'gold');
    for (const q of r.quests) if (q.complete) this.ui.toast('Missão pronta!', QUESTS[q.id].name, 'gold');
    this.announceAchievements(r.achievements);
    this.chestsOpen = null; this.marksT = 0;
    this.save(); if (this.ui.anyOpen()) this.ui.render();
  }

  usePotion() {
    const p = this.player, c = this.char;
    if (this.inNetZone()) return this.ui.log('Poções ainda não funcionam nas instâncias do servidor (em breve).', '#ffb4a8');
    if (this.mode === 'pvp' || this.mode === 'net') return this.ui.log('Poções são proibidas nas partidas.', '#ffb4a8');
    if (p.dead || this.potionCd > 0) return;
    if (!c.potions) return this.ui.log('Sem poções! Compre com a Mercadora Lia.', '#ffb4a8');
    if (p.hp >= p.maxHp) return;
    c.potions--;
    this.potionCd = 8;
    this.world.heal(p, p.maxHp * 0.35);
    this.world.burst(p.x, p.y, '#ff7a8a', 14, 120);
  }

  hearth() {
    if (this.inNetZone()) { if (!this.player.dead) this.net.send({ t: 'zone_leave' }); return; }
    if (this.mode !== 'explore' || this.world.zoneId === 'town' || this.player.dead) return;
    if (this.world.time - this.player.lastCombat < 4) return this.ui.log('Não é possível retornar em combate.', '#ffb4a8');
    this.enterZone('town', TOWN.x, TOWN.y);
  }

  // ---------------- progresso / loot ----------------
  onMobKilled(m) {
    const M = MOBS[m.mobId];
    this.grantXp(mobXp(m.level, this.char.level, M.xp * (m.boss ? 10 : m.elite ? 4 : 1)));
    for (const l of rollMobLoot(this.rng, m, this.char.classId)) this.dropAt(m.x, m.y, l);
    this.gameEvent({ type: 'kill', mobId: m.mobId, zoneId: this.world.zoneId, boss: !!m.boss });
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
    this.world.addFx({ type: 'ring', x: p.x, y: p.y, r: 120, color: '#ffd34d', t: 0, life: 0.8, follow: p });
    this.world.burst(p.x, p.y, '#ffd34d', 40, 260);
    this.ui.toast(`Nível ${this.char.level}!`, `+5 pontos de atributo — abra o personagem (🧙)`, 'gold');
    this.ui.log(`Você alcançou o nível <b>${this.char.level}</b>.`, '#ffd34d');
    this.gameEvent({ type: 'level', level: this.char.level });
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
        w.addText({ x: p.x, y: p.y - 34, t: 0, life: 0.8, text: `+${d.amount} 🪙`, size: 13, color: '#ffd34d' });
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
    this.gameEvent({ type: 'spirit', count: c.spirits.length });
    const S = SPIRITS[sp.type], R = RARITY[sp.rarity];
    this.ui.toast(`Novo spirit: ${S.name}`, `${R.name} · ${S.element} · ${S.role}`, 'gold');
    this.ui.log(`Essência despertou <b style="color:${S.color}">${S.name}</b> (${R.name})! Veja em 🔮.`, S.color);
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

  enhanceItem(id) {
    const r = enhance(this.char, id);
    if (!r.ok) return this.ui.log(r.reason, '#ffb4a8');
    const it = findGear(this.char, id);
    this.ui.log(`${it.name} aprimorado para +${r.plus} (-${r.cost} 🪙)`, '#ffd34d');
    this.refreshStats(); this.ui.render(); this.save();
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

  pickSpec(id) {
    if (this.mode === 'pvp') return this.ui.log('Não dá para trocar de especialização durante uma partida.', '#ffb4a8');
    const r = chooseSpec(this.char, id);
    if (!r.ok) return this.ui.log(r.reason, '#ffb4a8');
    this.player.spec = activeSpec(this.char);
    this.ui.toast('Especialização', specInfo(this.char.classId, id).name + (r.cost ? ` · -${r.cost} 🪙` : ''), 'gold');
    this.ui.render();
    this.save();
  }

  // arg: 'str', ou 'str:5' / 'str:max' (toque: botões +1, +5 e Máx; o Shift do teclado ainda dá +5)
  alloc(arg) {
    const c = this.char, [stat, q] = String(arg).split(':');
    if (c.statPoints <= 0 || !(stat in c.alloc)) return;
    const n = Math.min(c.statPoints, q === 'max' ? c.statPoints : q ? Number(q) || 1 : this.input.held('shift') ? 5 : 1);
    c.alloc[stat] += n;
    c.statPoints -= n;
    this.refreshStats();
    this.ui.render();
    this.save();
  }

  // Distribui todos os pontos livres: 70% no atributo principal da classe e o resto em Vitalidade.
  allocAuto() {
    const c = this.char, prim = CLASSES[c.classId].primary, pts = c.statPoints;
    if (pts <= 0) return;
    const main = Math.ceil(pts * 0.7);
    c.alloc[prim] += main; c.alloc.vit += pts - main; c.statPoints = 0;
    this.refreshStats(); this.ui.render(); this.save();
    this.ui.log(`Pontos distribuídos: +${main} em ${prim === 'int' ? 'Inteligência' : prim === 'str' ? 'Força' : 'Agilidade'}, +${pts - main} em Vitalidade.`, '#cfe8ff');
  }

  evolveSpirit(id) {
    const r = evolveSpirit(this.char, id);
    if (!r.ok) return this.ui.toast('Não dá para evoluir', r.reason, '');
    const sp = this.char.spirits.find((s) => s.id === id), S = SPIRITS[sp.type];
    const actor = this.world.actors.find((a) => a.kind === 'spirit' && a.owner === this.player.id && a.spiritType === sp.type);
    if (actor && this.char.activeSpirit === id) { actor.stats.power = spiritPower(sp); actor.stage = 2; }
    this.ui.toast(`${S.name} evoluiu!`, `Forma evoluída · poder ${spiritPower(sp)}`, 'gold');
    this.ui.log(`${S.name} evoluiu para a forma 2 (−${r.cost} 🪙).`, S.color);
    this.ui.render(); this.save();
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

  // ---------------- arena PvP (1×1, 2×2, 4×4) ----------------
  // Classes distintas primeiro (composição de time), repetindo só quando acabam.
  pickClasses(n, exclude = []) {
    const pool = Object.keys(CLASSES).filter((c) => !exclude.includes(c));
    const out = [];
    while (out.length < n) {
      if (!pool.length) pool.push(...Object.keys(CLASSES));
      out.push(pool.splice(this.rng.int(0, pool.length - 1), 1)[0]);
    }
    return out;
  }

  startMatch(mode) {
    if (!MODES[mode]) return;
    if (!pvpUnlocked(this.char)) { this.ui.log(`O PvP libera no nível ${PVP_MIN_LEVEL}.`, '#ffb4a8'); return; }
    this.ui.closePanels();
    const M = newMatch(mode), size = M.size, c = this.char;
    this.enterZone('arena_team', 900, 900, 'pvp');
    const w = this.world, z = w.zone, myRating = getRating(c, mode), myPower = playerPower(c); // inimigos e aliados nascem com poder ~ o seu (±5%)
    const mine = spawnSlots(1, size, z.w / 2, z.spawns.south, z.spawns.north);
    const theirs = spawnSlots(2, size, z.w / 2, z.spawns.south, z.spawns.north);
    this.player.x = mine[0].x; this.player.y = mine[0].y; this.player.facing = -Math.PI / 2;
    const team1 = [this.player], team2 = [];
    const allyClasses = this.pickClasses(size - 1, [c.classId]);
    const foeClasses = this.pickClasses(size);
    const chars = { allies: [], enemies: [] };
    allyClasses.forEach((classId, i) => {
      const rc = generateRivalForPower(this.rng, c, myPower * (0.95 + this.rng.next() * 0.1), { classId, rating: myRating });
      const a = w.add(makeHeroActor(rc, mine[i + 1].x, mine[i + 1].y, 'rival', 1));
      this.spawnSpirit(a, rc); team1.push(a); chars.allies.push(rc);
    });
    foeClasses.forEach((classId, i) => {
      const rc = generateRivalForPower(this.rng, c, myPower * (0.95 + this.rng.next() * 0.1), { classId, rating: myRating });
      const a = w.add(makeHeroActor(rc, theirs[i].x, theirs[i].y, 'rival', 2));
      a.facing = Math.PI / 2;
      this.spawnSpirit(a, rc); team2.push(a); chars.enemies.push(rc);
    });
    w.objective = { ...z.objective, owner: 0, contested: false };
    this.match = { ...M, team1, team2, chars, myRating };
    this.rival = team2[0];
    this.rivalChar = chars.enemies[0];
    w.frozen = 3.2;
    this.duelGo = 0;
    const foePwr = Math.round(chars.enemies.reduce((s, r) => s + playerPower(r), 0) / size);
    this.ui.log(`<b>${MODES[mode].label}</b> — seu poder ${playerPower(c)} · inimigos (média) ${foePwr} · rating ${myRating}`, '#ffb4a8');
    this.ui.log('Segure o ponto central para pontuar; vence quem chegar a 100 ou eliminar o outro time.', '#ffe9a0');
  }

  updateMatch(dt) {
    const w = this.world, M = this.match;
    if (!M || this.mode !== 'pvp') return;
    if (w.frozen > 0) { this.ui.banner(`${MODES[M.mode].label} — começa em ${Math.ceil(w.frozen)}`); return; }
    const ob = w.objective;
    const inside = (a) => !a.dead && Math.hypot(a.x - ob.x, a.y - ob.y) < ob.r + a.r;
    const in1 = M.team1.filter(inside).length, in2 = M.team2.filter(inside).length;
    controlTick(M, dt, in1, in2);
    ob.owner = M.owner; ob.contested = in1 > 0 && in2 > 0;
    const alive1 = M.team1.filter((a) => !a.dead), alive2 = M.team2.filter((a) => !a.dead);
    this.rival = alive2[0] ?? M.team2[0];
    const win = matchWinner(M, alive1.length, alive2.length, alive1.reduce((s, a) => s + a.hp, 0), alive2.reduce((s, a) => s + a.hp, 0));
    const left = Math.max(0, Math.ceil(M.limit - M.time));
    this.duelGo += dt;
    this.ui.banner(this.duelGo < 1 ? 'LUTE!' : `${Math.floor(M.score[1])} × ${Math.floor(M.score[2])} · ${alive1.length} vs ${alive2.length} vivos · ${left}s`);
    if (win) this.endMatch(win);
  }

  endMatch(winner) {
    if (this.mode !== 'pvp' || !this.match) return;
    this.mode = 'ended';
    const M = this.match, c = this.char, a = c.arena;
    const won = winner === 1, draw = winner === 3;
    const foes = M.chars.enemies;
    const foeRating = Math.round(foes.reduce((s, r) => s + r.arena.rating, 0) / foes.length);
    const oldTier = tierFor(M.myRating);
    const delta = draw ? 0 : eloDelta(M.myRating, foeRating, won);
    setRating(c, M.mode, Math.max(0, M.myRating + delta));
    if (won) a.wins++; else if (!draw) a.losses++;
    const mul = 1 + (M.size - 1) * 0.2; // times maiores pagam um pouco mais
    const gold = Math.round((won ? 40 + c.level * 8 : draw ? 20 + c.level * 4 : 10 + c.level * 2) * mul);
    c.gold += gold;
    const lines = [`Rating ${MODES[M.mode].label}: ${getRating(c, M.mode)} (${delta >= 0 ? '+' : ''}${delta})`, `Pontos: ${Math.floor(M.score[1])} × ${Math.floor(M.score[2])}`, `+${gold} 🪙`];
    const newTier = tierFor(getRating(c, M.mode));
    if (newTier.name !== oldTier.name) lines.push(`Nova liga: <b style="color:${newTier.color}">${newTier.name}</b>`);
    if (won && this.rng.chance(0.35)) {
      const it = generateItem(this.rng, c.level, { classId: c.classId, luck: 1.2 });
      if (c.inventory.length < INVENTORY_SIZE) {
        c.inventory.push(it);
        lines.push(`Prêmio: <b style="color:${RARITY[it.rarity].color}">${it.name}</b>`);
      } else { c.gold += it.value; lines.push(`Prêmio convertido em ${it.value} 🪙 (inventário cheio)`); }
    }
    this.grantXp(xpToNext(c.level) * (won ? 0.12 : 0.04) * mul);
    this.ui.banner(null);
    this.ui.showResult({
      title: won ? 'Vitória!' : draw ? 'Empate' : 'Derrota',
      sub: `${MODES[M.mode].label} · ${foes.map((r) => CLASSES[r.classId].name).join(', ')}`,
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
    if (this.mode === 'pvp') { this.ui.log('Você caiu — acompanhe o time!', '#ffb4a8'); return; }
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
