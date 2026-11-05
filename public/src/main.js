import { TESTE, buildTesteChar, installTesteUi } from './teste.js'; // modo ?teste= (sandbox); primeiro, para window.TESTE existir antes dos demais módulos
import { enhance, findGear } from './core/enhance.js';
import './no-zoom.js';
import { heroSpritesEnabled, preloadHero, showHeroLoading } from './render/hero-sprites.js';
import { whenNatureReady } from './render/nature-sprites.js';
import { Renderer } from './render/renderer.js';
import { Input } from './input.js';
import { UI, esc } from './ui/ui.js';
import { World, makeHeroActor, makeMobActor, makeSpiritActor, SPIRIT_PICK_ALL, RUN_ZONES, PICK_R, PICK_DELAY } from './game/sim.js';
import { waterWaypoint } from './game/ai.js';
import { questTarget, guideGoal, pickTracked, trackerText, buildNavGrid, findPath, followPath, lineFree, autoPauseReason } from './core/autopath.js';
import { makeRng } from './core/rng.js';
import { computeStats, canEquip, itemScore, hasMastery } from './core/stats.js';
import { addXp, mobXp, newCharacter, createSpirit, addSpiritXp, spiritPower, xpToNext, evolveSpirit, MAX_LEVEL } from './core/progression.js';
import { generateItem, rollMobLoot } from './core/loot.js';
import { generateRivalForPower } from './core/rival.js';
import { eloDelta, tierFor } from './core/combat.js';
import { MODES, newMatch, controlTick, matchWinner, getRating, setRating, spawnSlots } from './core/match.js';
import { playerPower, pvpUnlocked, PVP_MIN_LEVEL } from './core/power.js';
import { chooseSpec, buySeal, specInfo, activeSpec, needsSeal, sealsOf, SEAL_PRICE } from './core/specs.js';
import { loadChar, saveChar, takeLoadInfo, parseSave, exportSave } from './save.js';
import { cleanName } from './core/savedoc.js';
import { apiUrl, wsUrl, Online, CloudSave } from './online.js';
import { ChatBox } from './ui/chat.js';
import { AudioEngine, musicFor, isIOS } from './audio.js';
import { installCanvasGuard, onCanvasPressure, canvasFails } from './render/memguard.js';
import { releaseMobs, mobIdsOf } from './render/mob-sprites.js';
installCanvasGuard(); // antes de qualquer canvas: detecta o teto de memória do Safari (getContext devolve null em silêncio)
import { NetClient } from './net/client.js';
import { SnapshotDecoder } from './core/snapshot.js';
import { decodeLook } from './core/aura.js';
import { noticeText } from './ui/ui.js';
import { skillOf, basicOf } from './core/specs.js';
import { cryptUnlocked, cryptLegacy } from './core/echo.js';
import { SPEC_LEVEL } from './data/specs.js';
import { SKILLS } from './data/skills.js';
import { newlyUnlocked, masteryUnlock } from './core/unlocks.js';
import { spawnSkillVfx, spawnEventVfx } from './render/skill-vfx.js';
import { depositItem, withdrawItem } from './core/bank.js';
import { claimDaily, ensureJournal, recordEvent, offeredBy, readyFor, activeFor, acceptQuest, abandonQuest, turnInQuest, setTitle, openChest, chestReady, takeTip, tipSeen, evolvedSpirits, readLore, mentorSeen } from './core/journal.js';
import { TIPS } from './data/dialogs.js';
import { QUESTS } from './data/quests.js';
import { ACH } from './data/achievements.js';
import { PRICES, SCROLL_MAX, buildShopStock, sellValue, harborSellValue, harborPrice, needsSellConfirm } from './shop.js';
import { TouchControls } from './touch.js';
import { interactTarget, carryCast, stepAutoMount } from './touch-logic.js';
import { MOUNTS, MOUNT_REASONS, MOUNT_AUTO_DELAY, WHISTLE } from './data/mounts.js';
import { ownedMounts, activeMount, mountProblem, useWhistle, addWhistles } from './core/mounts.js';
import { PHOENIX, applyDeath, hasDeathPenalty, setCheckpoint, respawnPoint } from './core/phoenix.js';
import { QualityGovernor } from './quality-governor.js';
import { loadPrefs, savePrefs, changePref, resolveQuality, resolveScale } from './prefs.js';
import { CLASSES } from './data/classes.js';
import { MOBS, XP_MULT } from './data/mobs.js';
import { soloWaveSpec, WAVES } from './core/economy.js';
import { ZONES, teleportCost, FARM_ENTRY, FARM_MID } from './data/zones.js';
import { RARITY, INVENTORY_SIZE, SLOTS } from './data/items.js';
import { SPIRITS, SPIRIT_RARITY_MUL, MAX_SPIRITS } from './data/spirits.js';

const TOWN = ZONES.town.spawn;
// Passo fixo da simulação (60 Hz): mesmo resultado em qualquer taxa de quadros — pré-requisito do servidor autoritativo.
// 60 Hz (e não 30) evita precisar interpolar o desenho no cliente; o servidor pode enviar snapshots a 20 Hz.
export const FIXED_DT = 1 / 60;
const MAX_TICKS = 8;
const SERVER_COUNTED = new Set(['teleport', 'visit', 'spiritStage']); // eventos de diário que o servidor de partidas conta (server/hub.js, server/tx.js); o cliente não os soma online

// Cripta dos Ecos: recusas de crypt_enter (o texto exato vem do servidor em m.reason; estes são o reserva)
const CRYPT_REJECT = { crypt_level: 'Nível 22 para entrar na Cripta dos Ecos.', crypt_locked: 'Derrote o Guardião das Ruínas, depois de chegar a elas a pé, para abrir a Cripta.', crypt_wait: 'A Cripta ainda recupera o fôlego: espere ou use uma Chave de Eco.', crypt_over: 'Essa expedição já terminou: aguarde o grupo sair.', not_here: 'Volte à Vila antes de entrar na Cripta.' };
const TELEPORT_REJECT = { not_visited: 'Você ainda não visitou esse mapa.', no_scroll: 'Sem pergaminho de teletransporte.', in_combat: 'Em combate: espere uns segundos para viajar.', teleport_wait: 'Calma: espere alguns segundos entre viagens.' };

// papel do NPC → painel do serviço (Porto de Marfim; ver docs/gameplay/porto.md)
const SERVICE_OF_ROLE = { bank: 'bank', board: 'board', harborshop: 'shop:harbor', duel: 'arena:friendly' };

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    onCanvasPressure((n) => this.relieveMemory(n));
    this.input = new Input(this.canvas);
    this.ui = new UI(this);
    this.prefs = loadPrefs();
    this.audio = new AudioEngine({ musicVol: this.prefs.music / 100, sfxVol: this.prefs.sfx / 100 }); // só toca depois do 1º toque (regra dos navegadores)
    this.qgov = new QualityGovernor();
    this.autoMountSt = { t: 0, hold: false }; // estado do "montar automático" (touch-logic.js stepAutoMount); antes do TouchControls, que lê mountUiOk
    this.touch = new TouchControls(this);
    this.portrait = matchMedia('(orientation: portrait) and (pointer: coarse)');
    this.applyPrefs();
    addEventListener('resize', () => { if (this.prefs.scale === 'auto') this.applyPrefs(); }); // escala automática segue girar/redimensionar
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
    this.harborStock = []; // estoque do dia do Mercador do Porto (refeito ao abrir a loja)
    this.shopLevel = 0;
    this.titleWorld = new World('town');
    // Com API configurada o jogo exige conta (login → personagens na nuvem). Sem API, segue offline como antes.
    const base = TESTE ? '' : apiUrl(); // ?teste=: sempre offline e sem login (apiUrl também gravaria no aparelho)
    this.online = null; this.cloud = null; this.charId = null;
    document.body.classList.remove('online');
    if (TESTE) {
      installTesteUi(this);
      this.testeSwitch(TESTE, 'town');
    } else if (base) {
      this.online = new Online(base);
      document.body.classList.add('online'); // libera os botões que só fazem sentido com conta (grupo)
      this.cloud = new CloudSave(this.online, { onSync: (doc) => this.mergeServerFields(doc), onReject: (doc, e) => this.resync(doc, e) });
      this.bootOnline();
    } else {
      this.ui.showTitle(loadChar());
      this.reportLoad();
    }
    addEventListener('beforeunload', () => { if (this.online) { this.cloud?.flush({ keepalive: true }); } else this.save(); });
    // celular não dispara beforeunload: grava ao esconder/fechar a página (recompensa pendente não se perde)
    const flushHide = () => { if (this.online) this.cloud?.flush({ keepalive: true }); else if (this.char) this.save(); };
    addEventListener('pagehide', flushHide);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushHide(); });
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // Executa um trecho do quadro sem deixar uma exceção matar o loop; loga uma vez por tipo e avisa após 20 falhas seguidas.
  guard(tag, fn) {
    try { fn(); return true; } catch (err) {
      const k = `${tag}:${err?.message ?? err}`;
      this.frameErrs ??= new Set();
      if (!this.frameErrs.has(k)) { this.frameErrs.add(k); console.error(`[frame/${tag}]`, err); }
      return false;
    }
  }

  frame(now) {
    try {
      const raw = (now - this.last) / 1000, dt = Math.min(0.05, raw);
      this.last = now;
      // qualidade automática: só em jogo (não no título) e com prefs.quality 'auto'; a escolha manual nunca é alterada
      if (this.renderer.held) this.qgov.grace(); // atlases ainda carregando: a abertura pesada não conta como FPS do jogo
      const lowered = this.qgov.update(raw, this.prefs.quality === 'auto' && this.mode !== 'title' && !this.portrait.matches, resolveQuality(this.prefs, this.touch.coarse));
      if (lowered) { this.applyPrefs(); if (this.qgov.shouldNotify()) this.ui.toast('Qualidade ajustada', 'Efeitos reduzidos para manter a fluidez', ''); } // só efeitos: resolução e arte HD ficam
      const ok = this.guard('quadro', () => this.frameBody(dt));
      this.frameFails = ok ? 0 : (this.frameFails ?? 0) + 1;
      if (this.frameFails === 20 && canvasFails() === this.canvasFailsAtWarn) this.ui.toast('Erro', 'Algo deu errado, recarregue a página.', ''); // falta de memória de canvas tem aviso próprio (relieveMemory)
      if (this.frameFails === 0) this.canvasFailsAtWarn = canvasFails();
    } finally {
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  frameBody(dt) {
    let bad = false;
    if (this.mode === 'title') {
      const w = this.titleWorld;
      bad = !this.guard('update', () => { w.update(dt); w.events.length = 0; }) || bad;
      bad = !this.guard('draw', () => {
        const cam = this.renderer.camera(w, { x: 850 + Math.cos(w.time * 0.1) * 320, y: 640 + Math.sin(w.time * 0.13) * 200 });
        this.renderer.draw(w, cam, {});
      }) || bad;
    } else {
      // Celular em retrato: a tela pede para girar o aparelho; o mundo fica parado até voltar à horizontal.
      if (!this.portrait.matches) bad = !this.guard('update', () => this.step(dt)) || bad;
      bad = !this.guard('draw', () => {
        const p = this.player;
        if ((this.mode === 'explore' || this.inNetZone()) && this.char && ((this.marksT = (this.marksT ?? 0) - dt) <= 0)) { this.marksT = 0.4; this.refreshGuide(); if (this.mode === 'explore') this.questMarks = this.computeMarks(); this.chestsOpen = new Set((this.world.zone.chests ?? []).filter((c) => !chestReady(this.char, c.id)).map((c) => c.id)); }
        const exploring = this.mode === 'explore', chestView = exploring || this.inNetZone();
        this.renderer.draw(this.world, this.cam, { player: p, nearNpc: this.nearNpc?.id, nearChest: chestView ? this.nearChest : null, questMarks: exploring ? this.questMarks : null, guideNpc: exploring && this.char && !Object.keys(this.char.quests?.active ?? {}).length && !Object.keys(this.char.quests?.done ?? {}).length ? 'guard' : null, chestsOpen: chestView ? this.chestsOpen : null, cpSaved: this.char?.checkpoint?.zone === this.world.zoneId ? this.char.checkpoint : null, guide: this.guide?.goal ?? null, route: this.auto && this.auto.path?.length ? [{ x: p.x, y: p.y }, ...this.auto.path] : null, autoOn: !!this.auto && !this.auto.paused, crypt: this.netCrypt, barMob: this.ui.barMob ?? null, lowHp: !p.dead && p.hp < p.maxHp * 0.25, keys: this.keyHints });
        if ((this.mmT -= dt) <= 0) { this.renderer.drawMinimap(this.minimap, this.world, p); this.mmT = 0.15; }
        this.ui.updateHud(this);
        this.touch.update(this);
      }) || bad;
    }
    if ((this.musicT = (this.musicT ?? 0) - dt) <= 0) { this.musicT = 0.5; this.guard('audio', () => this.updateMusic()); } // música por lugar (2 vezes por segundo basta)
    this.guard('rede', () => {
      this.cloud?.tick();
      if (this.net?.connected && (this.netPingT = (this.netPingT ?? 0) - dt) <= 0) { this.net.ping(); this.netPingT = 2; }
      if (this.net?.queue && this.mode === 'explore') { this.ui.banner(`🔎 Procurando ${this.net.queue.mode === 'coop' ? 'cooperativo' : this.net.queue.mode}… ${this.net.queue.waited}s`); this.netBanner = true; }
      else if (this.netBanner && this.mode === 'explore') { this.ui.banner(null); this.netBanner = false; }
    });
    this.input.endFrame();
    // Falha em update/draw conta como quadro ruim (frame() soma os seguidos).
    if (bad) throw new Error('quadro com falha');
  }

  // ---------------- ações da UI ----------------
  act(action, arg) {
    switch (action) {
      case 'continue': this.loadGame(loadChar()); break;
      case 'quest-accept': this.questAccept(arg); break;
      case 'quest-turnin': this.questTurnIn(arg); break;
      case 'quest-abandon': abandonQuest(this.char, arg); if (this.trackId === arg) this.setTrack(null); this.save(); this.ui.render(); break;
      case 'quest-track': this.setTrack(arg); this.ui.render(); break;
      case 'quest-go': this.setTrack(arg); this.autoGo(); break;
      case 'auto-go': this.autoGo(); break;
      case 'auto-stop': this.autoStop(); break;
      case 'auto-resume': this.autoResume(); break;
      case 'set-title': setTitle(this.char, arg || null); this.save(); this.ui.render(); break;
      case 'dialog-service': this.openService(arg); break;
      case 'bank-take': this.bankTake(arg); break;
      case 'daily-claim': this.dailyClaim(arg); break;
      case 'return-harbor': this.ui.hideScreen(); this.enterZone('harbor', ZONES.harbor.spawn.x, ZONES.harbor.spawn.y); break;
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
      case 'item': this.ui.selecting() ? this.ui.toggleSel(arg) : this.ui.sellMode() ? this.sell(arg) : this.ui.isOpen('bank') ? this.bankPut(arg) : this.equip(arg); break;
      case 'unequip': this.unequip(arg); break;
      case 'enhance': this.enhanceItem(arg); break;
      case 'crypt-enter': this.enterCrypt(); break;
      case 'craft-echo': this.craftEcho(arg); break;
      case 'alloc': this.alloc(arg); break;
      case 'spec': this.pickSpec(arg); break;
      case 'buy-seal': this.buySealAsk(); break;
      case 'sort-inv': this.sortInventory(); break;
      case 'pref': this.setPref(arg); break;
      case 'mount-toggle': this.toggleMount(); break;
      case 'mount-set': this.setMount(arg); break;
      case 'mount-whistle': this.useWhistleItem(); break;
      case 'sound-test': { const st = this.audio.test(); this.ui.toast('Som', st === 'running' ? 'Tocou um sino. Se não ouviu, aumente o volume do aparelho.' : 'O navegador ainda não liberou o som: toque em Testar som de novo.', ''); break; }
      case 'chat': this.chatBox?.toggle(); document.getElementById('menu-btns')?.classList.remove('open'); break;
      case 'fullscreen': this.toggleFullscreen(); document.getElementById('menu-btns')?.classList.remove('open'); break;
      case 'buy-potion': this.buyPotion(Number(arg)); break;
      case 'buy-scroll': this.buyScroll(Number(arg)); break;
      case 'buy-phoenix': this.buyPhoenix(Number(arg)); break;
      case 'respawn-point': this.respawnAtPoint(); break;
      case 'respawn-online': this.ui.hideScreen(); this.deathCard = false; this.net?.send({ t: 'zone_respawn' }); break;
      case 'buy-item': this.buyItem(Number(arg)); break;
      case 'sel-toggle': this.ui.selMode = !this.ui.selMode; this.ui.sel = new Set(); this.ui.render(); break;
      case 'sel-mark': this.ui.markSel(Number(arg) === 1 ? 1 : 0); break;
      case 'sel-clear': this.ui.sel = new Set(); this.ui.render(); break;
      case 'sell-selected': this.sellSelected(); break;
      case 'sell': this.sell(arg); break;
      case 'buy-essence': this.buyEssence(arg); break;
      case 'spirit-on': this.setSpirit(arg); break;
      case 'spirit-free': this.freeSpirit(arg); break;
      case 'spirit-evolve': this.evolveSpirit(arg); break;
      case 'teleport': this.teleport(arg); break;
      case 'map-sel': this.ui.mapSel = arg; this.ui.render(); break; // toque num nó do mapa-múndi: mostra o cartão de viagem
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
    if (heroSpritesEnabled()) showHeroLoading(Promise.all([preloadHero(char), whenNatureReady()])); // visual novo: espera o herói e o cenário pintado (casas HD) carregarem
    this.enterZone('town', TOWN.x, TOWN.y);
    if (fresh) {
      setTimeout(() => this.ui.announce(`Bem-vindo, ${esc(char.name)}!`, 'Fale com a Guarda Ren (marca ❗) para a primeira missão', 'gold', 3200), 2600); // depois da tela "Preparando seu herói" (antes o toast expirava escondido)
      // o tutorial segue o modo de controle (toque é o padrão; teclado e mouse só se escolhido nas opções)
      if (this.touch?.active) this.ui.log('Arraste à esquerda para andar · botão grande ataca · círculos menores são as habilidades', '#cfe8ff');
      else this.ui.log('Mover: arraste o botão esquerdo do mouse ou use as setas · clique ataca · habilidades nos botões', '#cfe8ff');
      this.ui.log('Menu no alto: Mochila, Personagem, Spirits, Diário e Mapa (o Mapa leva de volta à Vila, de graça).', '#cfe8ff');
      this.ui.log('Missões dão ouro, XP e itens: fale com a Guarda Ren e, depois, siga o portal a leste.', '#ffd34d');
      const sp = SPIRITS[char.spirits[0].type];
      this.ui.log(`Um spirit te acompanha: <b style="color:${sp.color}">${sp.name}</b> (${sp.element}).`, sp.color);
    }
  }

  // Modo ?teste=: troca o herói descartável (look/classe) e/ou a zona sem recarregar. Nada é gravado (save.js é no-op).
  testeSwitch(kind, zoneId = null) {
    const char = buildTesteChar(kind);
    const zone = zoneId ?? this.world?.zoneId ?? 'town';
    const at = zone === 'town' ? TOWN : { x: FARM_ENTRY + 120, y: FARM_MID }; // entrada do mapa de caça
    window.TESTE.kind = kind;
    this.char = char; this.skillLv = char.level;
    this.ui.hideScreen();
    this.ui.setupHud(char);
    this.touch.setup(char);
    char.visited = { town: 1, forest: 1, plains: 1 };
    showHeroLoading(preloadHero(char));
    this.enterZone(zone, at.x, at.y);
    this.refreshStats?.();
    this.player.hp = this.player.maxHp;
    this.ui.render();
    document.dispatchEvent(new CustomEvent('teste-changed', { detail: { kind, zone } }));
  }

  // Ao sair de uma zona, guarda a recarga de quem está morto; quem estava vivo reaparece inteiro na volta.
  stashRespawns(w) {
    if (!w?.zone || !this.bossStates?.[w.zoneId]) return;
    const bs = this.bossStates[w.zoneId];
    bs.bossT = w.zone.boss && !w.actors.some((a) => a.boss && !a.dead) ? w.bossT : null;
    bs.miniT = w.zone.miniboss && !w.actors.some((a) => a.miniboss && !a.dead) ? w.miniT : null;
  }

  enterZone(zoneId, x, y, mode = 'explore') {
    this.qgov.grace(); // trocar de zona (terreno e atlas novos) é pesado: o governador espera
    const prev = this.player;
    const ratio = prev && !prev.dead ? prev.hp / prev.maxHp : 1;
    this.skillLv = this.char.level;
    this.stashRespawns(this.world);
    const bs = ((this.bossStates ??= {})[zoneId] ??= {}); // contador do ritual do chefe sobrevive à troca de mapa (só nesta sessão)
    if (zoneId === 'ember' && this.char.quests?.active?.cavaleiro_rubro && !bs.questShown) { bs.go = true; bs.questShown = true; } // a missão libera a primeira aparição
    this.world = new World(zoneId, { bossState: bs, night: true });
    // chefe/mini-chefe abatidos continuam em recarga ao reentrar (sem isso o World novo os recriava na hora)
    if (bs.bossT != null) this.world.bossT = bs.bossT;
    if (bs.miniT != null) this.world.miniT = bs.miniT;
    this.mode = mode;
    if (ZONES[zoneId].mobs || ZONES[zoneId].hub) (this.char.visited ??= {})[zoneId] = 1; // desbloqueia o teletransporte para este mapa
    this.player = this.world.add(makeHeroActor(this.char, x, y));
    if (zoneId === 'harbor' && mode === 'explore') this.gameEvent({ type: 'visit', zoneId }); // conquista Marinheiro (conta chegadas ao Porto)
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
    this.ui.announce(z.name, z.level ? `Nível ${z.level[0]}–${z.level[1]}${z.scale ? '+' : ''}` : z.safe ? 'Zona segura' : '', '');
    if (zoneId === 'town') this.refreshShop();
    if (zoneId === 'ember') this.tip('ritual'); // explica o "Ritual N/40" na primeira visita
    else if (zoneId === 'forest') this.tip('forest');
    this.save();
  }

  // Dica de onboarding: aparece 1× por personagem (bit em char.stats.tips) e vira um toast curto.
  tip(key, ms = 2200) {
    if (this.char && takeTip(this.char, key) && TIPS[key]) this.ui.toast(TIPS[key][0], TIPS[key][1], '', ms);
  }

  // Avisos automáticos (Cripta aberta, Nv15 sem especialização, queda sem Amuleto): 1× por personagem, em fila, só em exploração,
  // sem painel aberto e fora de combate; um por vez (intervalo de 6 s) para não virar spam.
  autoTip(key) {
    if (this.char && !tipSeen(this.char, key) && !(this.tipQ ??= []).includes(key)) this.tipQ.push(key);
  }
  pumpTips(dt) {
    const c = this.char;
    if (!c) return;
    this.tipClock = (this.tipClock ?? 0) + dt;
    if (this.tipClock < 1) return;
    this.tipClock = 0;
    if (cryptUnlocked(c) && !cryptLegacy(c)) this.autoTip('crypt');
    if (c.level >= SPEC_LEVEL && !activeSpec(c)) this.autoTip('spec');
    if (!this.tipQ?.length) return;
    const t = this.world.time;
    if (this.ui.anyOpen() || t - (this.player.lastCombat ?? -99) < 8 || t - (this.tipAt ?? -99) < 6) return;
    this.tipAt = t;
    this.tip(this.tipQ.shift(), 5000);
  }

  save() {
    if (this.online) { this.cloud?.markDirty(); return; } // online: o servidor é a fonte oficial; o localStorage não guarda o personagem
    if (!this.char) return;
    const ok = saveChar(this.char);
    if (!ok && !this.saveWarned) { this.saveWarned = true; this.ui.toast('Não foi possível salvar', 'O armazenamento do aparelho está cheio ou bloqueado. Libere espaço ou exporte o personagem nas Opções.', ''); }
    if (ok) this.saveWarned = false;
  }

  // ---------------- modo online ----------------
  async bootOnline() {
    try {
      const cfg = await this.online.loadConfig();
      this.googleClientId = cfg.googleClientId ?? null;
      this.maxCharacters = cfg.maxCharacters ?? 3;
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
      this.ui.showCharacters(me.characters, { email: me.account.email ?? 'conta Google', maxCharacters: this.maxCharacters ?? 3, hasLocalSave: !!loadChar(), msg });
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
    this.ui.confirm('Apagar este personagem? Essa ação não pode ser desfeita pelo jogo.', async () => {
      try { await this.online.deleteCharacter(id); } catch (e) { return this.showChars(e.message); }
      this.showChars();
    }, 'Apagar');
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
    if (this.mode === 'net') return; // na instância o servidor manda no personagem; recarregar aqui deixaria um herói parado na sala
    this.ui.toast('Sincronização', err.status === 409 ? 'O personagem foi alterado em outro lugar; recarreguei.' : 'O servidor recusou o salvamento; voltei ao último estado salvo.', '');
    this.loadGame(doc);
  }

  flushCloud() { return this.cloud?.flush(); }

  // ---------------- multiplayer no jogo real (servidor autoritativo) ----------------
  async connectNet() {
    this.disconnectNet();
    // chat online: uma caixa só (fora dos painéis), criada na 1ª conexão; o canal Grupo acompanha o grupo do servidor
    this.chatBox ??= new ChatBox({ send: (ch, text) => { if (!this.net?.joined) return false; this.net.send({ t: 'chat', ch, text }); return true; }, me: () => this.net?.name ?? null });
    const url = wsUrl(this.online?.config?.gameUrl, this.online?.base || location.href); // '/ws' (porta única) vira ws(s)://<site>/ws
    if (!url || !this.online.token || this.charId == null) return;
    const refresh = () => { if (this.ui.isOpen('party') || this.ui.isOpen('arena')) this.ui.render(); };
    const net = this.net = new NetClient({
      url, session: this.online.token, characterId: this.charId,
      handlers: {
        party: (p) => { this.chatBox?.setParty(!!p); refresh(); },
        queue: () => { refresh(); },
        invite: (m) => { this.ui.toast('Convite de grupo', `${m.from} convidou você (botão 👥)`, 'gold'); refresh(); },
        notice: (m) => { this.ui.log(noticeText(m), '#cfe3ff'); refresh(); },
        chat: (m) => this.chatBox?.add(m),
        chatHistory: (list) => this.chatBox?.history(list),
        reject: (m) => { if (this.chatBox?.rejected(m.code)) return; // recusa do chat (ritmo, sem grupo): aviso na própria caixa
 this.zoneBusy = false; this.teleportPending = false; this.portalCd = 4; /* recusa (ex.: sala cheia): espera antes de tentar o portal de novo, sem laço de pedidos */ if (!['bad_message', 'bad_version', 'rate_limit'].includes(m.code)) this.ui.toast(CRYPT_REJECT[m.code] ? 'Cripta dos Ecos' : TELEPORT_REJECT[m.code] ? 'Teletransporte' : 'Servidor de partidas', m.reason ?? CRYPT_REJECT[m.code] ?? TELEPORT_REJECT[m.code] ?? noticeText({ ...m, t: 'reject' }), ''); },
        matchFound: (m) => this.enterNetMatch(m),
        zoneJoined: (m) => this.enterNetZone(m),
        zoneReward: (m) => this.onZoneReward(m),
        zoneLoot: (m) => this.onZoneLoot(m),
        zoneDrop: (m) => this.onZoneDrop(m),
        zonePickup: (m) => this.onZonePickup(m),
        zoneFull: () => { if (this.inNetZone()) this.ui.log('Inventário cheio! Venda itens na vila.', '#ffb4a8'); },
        friendlyReward: (m) => { for (const id of m.quests ?? []) this.ui.toast('Missão pronta!', QUESTS[id]?.name ?? '', 'gold'); this.announceAchievements(m.achievements ?? []); },
        txResult: (m) => this.onTxResult(m),
        zoneExit: (m) => this.leaveNetMatch(m),
        snap: (s) => this.onNetSnap(s),
        reward: (m) => this.onNetReward(m),
        matchEnd: () => { this.netEnded = true; },
        close: () => { if (this.mode === 'net') this.ui.toast('Conexão', 'Reconectando ao servidor de partidas…', ''); },
        // token/sessão vencidos: reconectar não adianta; volta ao login (o personagem já foi gravado)
        authLost: async () => {
          this.ui.toast('Sessão expirada', 'Entre de novo para continuar.', '');
          await this.leaveCharacter().catch(() => {});
          this.online.setToken?.(null);
          this.showAuth('login', 'Sua sessão expirou. Entre de novo.');
        },
      },
    });
    try { await net.connect(); refresh(); }
    catch (e) { this.ui.log(e.message === 'already_online' ? 'Este personagem já está conectado em outro lugar.' : 'Servidor de partidas indisponível: o PvP online e o cooperativo ficam desligados.', '#ffb4a8'); this.net = null; }
  }
  disconnectNet() { this.net?.close(); this.net = null; this.netBanner = false; this.chatBox?.clear(); this.chatBox?.setParty(false); }

  async netQueue(mode) {
    if (!this.net?.joined) return this.ui.toast('Servidor de partidas', 'Ainda conectando…', '');
    if (this.mode !== 'explore') return;
    await this.cloud?.flush(); // grava o progresso ANTES: as recompensas da partida são gravadas pelo servidor em cima dessa versão
    this.net.queueFor(mode);
  }

  // exploração dentro de uma instância do servidor (P11)
  inNetZone() { return this.mode === 'net' && this.netInfo?.mode === 'zone'; }
  // equipamento/atributos/spirits mudam o personagem no cliente; na instância o servidor é o dono do personagem (transações de loja/equipar: P11.4)
  // Vila nas cidades, exploração nos mapas, batalha com chefe vivo por perto ou em partida (arena, ondas, cooperativo, Cripta). audio.js › musicFor
  updateMusic() {
    if (this.mode === 'ended') return;
    const w = this.mode === 'title' ? this.titleWorld : this.world, p = this.player;
    const netMatch = this.mode === 'net' && this.netInfo?.mode && this.netInfo.mode !== 'zone';
    const bossNear = !!(w && p && w.actors.some((a) => a.boss && !a.dead && Math.hypot(a.x - p.x, a.y - p.y) < 1100));
    this.audio.setMusic(musicFor({ mode: netMatch ? 'pvp' : this.mode, zone: w?.zone, bossNear }));
  }

  togglePanel(id) {
    if ((id === 'journal' || id === 'map') && this.mode !== 'explore' && !(id === 'map' && this.inNetZone())) return; // diário e mapa só no mundo normal (o mapa também abre na instância online: lá o nó da Vila é o retorno)
    if (id === 'party' && !this.online) return;
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
    if (typeof m.scrolls === 'number') this.char.scrolls = m.scrolls; // teletransporte: contagem oficial (o servidor já debitou)
    this.fireTeleportEvent(); // depois da contagem oficial de pergaminhos (o save não pode devolver o pergaminho); conta uma vez, o offline conta em teleport()
    const info = { ...m, mode: 'zone', team: 1 };
    if (this.mode === 'net' && this.netInfo?.room === m.room) { this.netInfo = info; this.netDec = new SnapshotDecoder().init(m); return; } // reconexão
    this.ui.closePanels(); this.ui.hideScreen();
    (this.char.visited ??= {})[m.zone] = 1;
    this.netDec = new SnapshotDecoder().init(m);
    if (this.cloud) this.cloud.paused = true; // na instância o servidor altera o personagem
    const w = new World(m.zone, { visuals: true });
    this.world = w; this.mode = 'net'; this.netInfo = info; this.netRitual = null; this.netCrypt = null; this.cryptLast = null; this.netEnded = false; this.netOver = false; this.netRewardMsg = null;
    this.netActors = new Map(); this.netMobs = new Map(); this.netSnaps = []; this.netLast = null; this.netPred = null; this.netT = 0; this.netCastPending = null; this.netVProj = []; this.netPickSent = null;
    for (const p of m.players) this.netAddHero(p, m.you);
    this.player = this.netActors.get(m.you);
    const st = computeStats(this.char);
    Object.assign(this.player, { stats: st, maxHp: st.maxHp, hp: st.maxHp, classId: this.char.classId, spec: activeSpec(this.char), level: this.char.level, x: m.x, y: m.y });
    this.netPred = { x: m.x, y: m.y };
    this.spawnSpiritVisual();
    this.cam = this.renderer.camera(w, this.player);
    this.ui.banner(null);
    const z = w.zone;
    this.ui.announce(z.name, `Nível ${z.level[0]}–${z.level[1]}${this.net?.party ? ' · com o grupo' : ''}`, '');
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
  // ---- online igual ao offline: ouro/XP na hora e itens no chão (o servidor decide; aqui só o que o jogador vê e ouve) ----
  onZoneLoot(m) {
    if (!this.inNetZone() || !this.player) return;
    const c = this.char, p = this.player;
    if (m.gold) { c.gold += m.gold; this.world.addText({ x: p.x, y: p.y - 34, t: 0, life: 0.8, text: `+${m.gold}`, size: 13, color: '#ffd34d' }); this.audio.play('coins'); }
    if (m.xp && c.level < MAX_LEVEL) c.xp = Math.min((c.xp ?? 0) + m.xp, xpToNext(c.level) - 1); // barra anda já; o nível novo vem do servidor (grava na hora quando completa)
  }
  onZoneDrop(m) {
    if (!this.inNetZone()) return;
    const it = m.item ? { ...m.item, kind: 'gear', stats: {} } : undefined;
    this.world.drops.push({ kind: m.kind, item: it, amount: m.amount, x: m.x, y: m.y, vx: 0, vy: 0, t: 0, netId: m.id });
    if (it && (it.opal || it.rarity === 'epic' || it.rarity === 'legendary')) { // aviso e brilho para drop raro (igual ao offline)
      this.world.burst(m.x, m.y, it.opal ? '#bfe9ff' : it.rarity === 'legendary' ? '#ffa53d' : '#b77cff', 30, 260);
      this.ui.toast(it.opal ? 'Item de Ópalo!' : it.rarity === 'legendary' ? 'Item lendário!' : 'Item épico!', esc(it.name), 'gold');
    }
  }
  onZonePickup(m) {
    if (!this.inNetZone()) return;
    const w = this.world;
    w.drops = w.drops.filter((d) => d.netId !== m.id);
    if (m.kind === 'item' && m.item) {
      const R = RARITY[m.item.rarity] ?? RARITY.common;
      if (m.gold) { this.char.gold += m.gold; w.addText({ x: this.player.x, y: this.player.y - 34, t: 0, life: 0.8, text: `+${m.gold}`, size: 13, color: '#ffd34d' }); this.audio.play('coins'); }
      else { this.ui.log(`Obtido: <b style="color:${R.color}">${esc(m.item.name)}</b> (${R.name})`, '#e8e6f0'); this.audio.play(R.index >= 3 ? 'levelup' : 'loot'); }
    } else if (m.kind === 'potion') { this.ui.log(`+${m.amount ?? 1} 🧪 Poção de Vida`, '#ff9aa8'); this.audio.play('loot'); }
    else if (m.kind === 'essence') { this.ui.log('Essência de spirit obtida! (Spirits)', '#9fe0ff'); this.audio.play('levelup'); }
  }

  async onZoneReward(r) {
    if (!this.inNetZone()) return;
    const parts = [];
    // ouro, XP, itens e poções já apareceram na hora (zone_loot/zone_pickup); aqui só o que não tem aviso próprio
    if (r.frags) parts.push(`+${r.frags} Fragmento(s) de Eco`);
    if (r.potions) parts.push(`+${r.potions} 🧪`);
    if (r.whistles) { parts.push(`+${r.whistles} ${WHISTLE.name}`); this.ui.toast(WHISTLE.name + '!', 'Use em Personagem > Montarias para chamar uma montaria.', 'gold'); }
    if (parts.length) this.ui.log(parts.join(' · '), '#ffd27a');
    if (r.deaths) { // queda na instância: o servidor já cobrou (ou gastou o Amuleto da Fênix)
      const dr = { saved: (r.deathsSaved ?? 0) >= r.deaths, gold: r.lostGold ?? 0, xp: r.lostXp ?? 0 };
      if (hasDeathPenalty(r.zone)) {
        this.ui.log(dr.saved ? `${PHOENIX.name} usado.` : `Você perdeu ${dr.gold} ouro e ${dr.xp} XP.`, dr.saved ? '#ffd27a' : '#ffb4a8');
        { this.deathCard = performance.now() + 900; this.ui.showResult({ title: 'Você caiu…', sub: ZONES[r.zone]?.name ?? '', lines: [this.deathLine(dr, r.phoenix ?? 0), 'Você renasce no último ponto salvo deste mapa.'], button: 'Renascer no ponto salvo', action: 'respawn-online', tone: 'lose' }); }
      } else this.ui.log('Você caiu.', '#ffb4a8');
    }
    if (r.levels) this.ui.announce(`Nível ${r.level}!`, '+5 pontos de atributo', 'gold');
    for (const id of r.quests ?? []) this.ui.toast('Missão pronta!', QUESTS[id]?.name ?? '', 'gold');
    for (const id of r.achievements ?? []) this.announceAchievements([id]);
    try { const c = await this.online.getCharacter(this.charId); if (this.inNetZone()) { this.char = c.character; this.cloud.attach(this.charId, c.rev, () => this.char, { paused: true }); } } catch { /* tenta no próximo lote */ }
  }

  // ---------------- transações do servidor (P11.3/P11.4; server/tx.js) ----------------
  // Online com o servidor de partidas conectado, loja, ferreiro, banco, contratos, missões, baú, poção e spirit são DECIDIDOS pelo servidor:
  // o cliente só pede (nada local muda antes) e adota o documento oficial quando a resposta chega. Sem servidor conectado, segue o caminho local.
  get txOnline() { return !!(this.online && this.net?.joined && this.charId != null && this.cloud?.charId != null); }
  shopKind() { return this.ui.shopAnchor === 'harbor' ? 'harbor' : 'town'; }
  // Devolve true se o pedido foi (ou será) enviado; `done(m)` roda com o resultado bem-sucedido, depois de adotar o documento.
  serverTx(msg, done = null) {
    if (!this.txOnline) return false;
    (async () => {
      const zone = this.inNetZone();
      if (!zone) { await this.cloud.flush(); this.cloud.paused = true; } // grava o progresso ANTES; durante o pedido a nuvem não grava por cima da transação
      const req = (this.txReq = (this.txReq ?? 0) + 1);
      (this.txPending ??= new Map()).set(req, { op: msg.op, done, zone });
      setTimeout(() => { if (this.txPending?.delete(req) && !this.inNetZone()) this.cloud.paused = false; }, 8000); // sem resposta: libera a nuvem
      this.net.send({ t: 'tx', req, ...msg });
    })();
    return true;
  }
  async onTxResult(m) {
    const pend = this.txPending?.get(m.req);
    if (!pend) return;
    this.txPending.delete(m.req);
    const free = () => { if (!this.inNetZone() && !this.txPending.size) this.cloud.paused = false; };
    if (!m.ok) { free(); if (m.code === 'cooldown' || m.code === 'full' || m.code === 'dead') return this.ui.log(m.reason, '#ffb4a8'); return this.ui.toast('Servidor', m.reason ?? 'Pedido recusado.', ''); }
    if (m.sync) { // o servidor mudou o documento: relê o oficial e religa a nuvem na revisão nova
      try { const r = await this.online.getCharacter(this.charId); this.char = r.character; this.cloud.attach(this.charId, r.rev, () => this.char, { paused: this.inNetZone() }); } catch { /* o próximo lote relê */ }
    } else if (m.op === 'potion') this.char.potions = m.potions;
    else if (m.op === 'spirit_set') this.char.activeSpirit = m.spirit;
    this.syncMountActor(); // montarias novas (missão do lobo, Apito) ou escolha trocada: o ator local acompanha o documento oficial
    free();
    this.refreshShopStocks();
    if (this.player && !this.inNetZone() && this.mode === 'explore') this.refreshStats();
    else if (this.inNetZone() && this.player && ['equip', 'unequip', 'alloc', 'alloc_auto'].includes(m.op)) this.refreshStats(); // instância: atributos novos também valem na previsão local
    if (m.levels && this.mode === 'explore') this.onLevelUp();
    for (const id of m.quests ?? []) this.ui.toast('Missão pronta!', QUESTS[id]?.name ?? '', 'gold');
    this.announceAchievements(m.achievements ?? []);
    pend.done?.(m);
    if (this.ui.anyOpen()) this.ui.render();
  }
  // Spirit na instância: o servidor simula o de verdade (ataca, busca); aqui só um ator que segue o herói, para aparecer na tela.
  spawnSpiritVisual() { if (this.inNetZone() && this.player) this.spawnSpirit(this.player, this.char); }
  refreshShopStocks() {
    this.shopLevel = null; this.refreshShop();
    if (this.harborStock) this.harborStock = buildShopStock(this.char, { harbor: true });
  }

  enterNetMatch(m) {
    if (this.mode === 'net' && this.netInfo?.room === m.room) { this.netInfo = m; this.netDec = new SnapshotDecoder().init(m); return; } // reconexão na mesma sala: o servidor manda um quadro-chave em seguida
    this.ui.closePanels(); this.ui.hideScreen();
    this.netDec = new SnapshotDecoder().init(m);
    if (this.cloud) this.cloud.paused = true; // durante a partida o servidor é quem altera o personagem
    const w = new World(m.mode === 'coop' ? 'waves' : 'arena_team', { visuals: true });
    this.world = w; this.mode = 'net'; this.netInfo = m; this.netEnded = false; this.netOver = false; this.netRewardMsg = null;
    this.netActors = new Map(); this.netMobs = new Map(); this.netSnaps = []; this.netPred = null; this.netT = 0; this.netCastPending = null; this.netVProj = []; this.netPickSent = null;
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
    if (s.cr) this.onCryptHud(s.cr);
    if (s.rt) this.netRitual = { have: s.rt[0], need: s.rt[1], cool: s.rt[2] * 60, omen: !!s.rt[3], alive: !!s.rt[4] }; // ritual do chefe (instância); delta sem `rt` = não mudou
    const w = this.world, my = this.netInfo.team;
    if (w.objective && s.match) { w.objective.owner = s.match.owner ? (s.match.owner === my ? 1 : 2) : 0; }
    for (const e of s.events) this.netEvent(e);
    if (s.state === 'over' && !this.netOver) { this.netOver = true; this.showNetResult(s); }
  }

  netEntity(id) { return this.netActors.get(id) ?? this.netMobs.get(id) ?? null; }

  netEvent(e) {
    const w = this.world, a = e.actor != null ? this.netEntity(e.actor) : null;
    this.audio.event({ ...e, type: e.e, actor: a, target: e.target != null ? this.netEntity(e.target) : null }, this.player); // mesmo som do jogo offline
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
        if (a.kind === 'mob') { // mesmo ataque básico da simulação (sim.js basicSpec): projétil do atirador/mago ou corte branco do corpo a corpo; antes o monstro online "atacava" sem desenho
          const M = MOBS[a.mobId], ang = e.ang ?? a.facing;
          if (!M) break;
          if (M.kind === 'ranged') this.netShoot(a, ang, { speed: M.projSpeed, range: M.range + 60, color: M.projColor, radius: a.boss ? 10 : 6 });
          else w.addFx({ type: 'slash', x: a.x, y: a.y, ang, arc: 1.7, r: M.range + a.r * 0.5, t: 0, life: 0.2, color: '#ffffff' });
          break;
        }
        const b = !CLASSES[a.classId] ? null : basicOf(a.classId, a.spec);
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
        if (s.kind === 'cone') w.addFx({ type: 'slash', x: a.x, y: a.y, ang: e.ang ?? a.facing, arc: s.arc, r: s.range, t: 0, life: 0.28, color: s.color });
        if (s.kind === 'aoe_self' || s.kind === 'buff') { w.addFx({ type: 'ring', x: a.x, y: a.y, r: s.radius ?? 60, color: s.color, t: 0, life: 0.45, follow: s.kind === 'buff' ? a : undefined }); w.burst(a.x, a.y, s.color, 18, 180); }
        else if (s.kind === 'projectile') this.netShoot(a, e.ang ?? a.facing, s);
        else if ((s.kind === 'ground_aoe' || s.kind === 'trap' || s.kind === 'zone') && e.tx != null) { w.addFx({ type: 'ring', x: e.tx, y: e.ty, r: s.radius, color: s.color, t: 0, life: 0.6 }); w.burst(e.tx, e.ty, s.color, 20, 160); }
        else { w.burst(a.x, a.y, s.color ?? '#fff', 14, 150); }
        break;
      }
      case 'death': { const t = this.netEntity(e.actor); if (t) w.burst(t.x, t.y, t.kind === 'mob' ? MOBS[t.mobId]?.color ?? '#fff' : '#ffffff', 26, 220); break; }
      case 'telegraph': w.telegraphs.push({ x: e.x, y: e.y, r: e.r, t: 0, delay: e.delay, color: e.color, done: false, src: { dead: false } }); break;
      case 'boss_warn': if (e.stage === 'omen') this.ui.announce('O chão estremece…', `${e.name} desperta`, 'gold'); else this.ui.log(`<b>${e.name}</b> surgiu!`, '#ffb4a8'); break;
      case 'phase': { const m = this.netEntity(e.actor); if (e.phase === 3) this.ui.announce('Enfurecido!', `${m?.name ?? 'O chefe'} entrou em fúria`, 'gold'); else this.ui.log(`${m?.name ?? 'O chefe'} acelera!`, '#ffb4a8'); break; }
      case 'wave': this.ui.toast(e.boss ? 'Onda final: o chefe!' : `Onda ${e.n}`, '', 'gold'); break;
      case 'crypt': this.onCryptEvent(e); break;
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
      ['1', '2', '3', '4'].forEach((k, i) => { if (inp.hit(k)) cast = i; });
      intent = {
        mx: (inp.held('d', 'arrowright') ? 1 : 0) - (inp.held('a', 'arrowleft') ? 1 : 0), my: (inp.held('s', 'arrowdown') ? 1 : 0) - (inp.held('w', 'arrowup') ? 1 : 0),
        aimX: inp.mouse.x / this.renderer.zoom + this.cam.x, aimY: inp.mouse.y / this.renderer.zoom + this.cam.y, attack: inp.mouse.down, cast,
      };
    }
    if (this.inNetZone() && !p.dead && this.auto) this.autoDrive(intent, dt); // instância online: o mesmo movimento normal, sem teleporte
    if (intent.cast != null) this.netCastPending = intent.cast;
    if (this.inNetZone()) { // montaria (decisão 0018): o pedido vai uma vez só; o servidor decide e o resultado volta no snapshot (`mounted`)
      const m = { mx: intent.mx, my: intent.my, attack: intent.attack, cast: intent.cast };
      this.mountStep(m, dt);
      if (m.mount === true || m.mount === false) { this.netMountPending = m.mount; this.mountReq = undefined; }
    }
    this.netIntent = intent;
    if (this.netInfo && this.netLast?.state !== 'over' && ((this.netT += dt) >= 1 / 30 || this.netCastPending != null || this.netMountPending != null)) {
      this.netT = 0;
      const pickNow = this.prefs.spiritPick ?? SPIRIT_PICK_ALL, pickMsg = this.netPickSent === pickNow ? {} : { pick: pickNow }; this.netPickSent = pickNow; // só quando muda (e na 1ª vez)
      net?.sendInput({ ...intent, ...pickMsg, cast: this.netCastPending, ...(this.netMountPending != null ? { mount: this.netMountPending } : {}) });
      this.netCastPending = null; this.netMountPending = null;
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
      if (!isMob) { ent.mounted = !!se.mounted; ent.mountId = se.mounted ? (se.mountId ?? ent.mountId ?? null) : ent.mountId ?? null; } // montaria: o servidor decide; a arte lê `mounted`/`mountId` (dos outros jogadores vem do snapshot)
      if (!isMob && ent !== this.player && ent.lookCode !== se.look) { ent.lookCode = se.look; const lk = decodeLook(se.look); ent.spec = lk.spec; ent.mastery = lk.tier === 2; } // aura dos outros jogadores
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
        if (!m && !MOBS[sm.mob]) { // mob desconhecido (servidor mais novo que o cliente): ignora com um único aviso
          if (!(this.netBadMobs ??= new Set()).has(sm.mob)) { this.netBadMobs.add(sm.mob); console.warn('mob desconhecido vindo do servidor:', sm.mob); }
          continue;
        }
        if (!m) { m = makeMobActor(sm.mob, sm.level, sm.x, sm.y, { elite: sm.elite }); m.netId = sm.id;
          // mini-chefe/esbirro/acampamento: marcas e tamanho vindos do servidor
          if (sm.miniboss) { m.miniboss = true; if (sm.name) m.name = sm.name; if (sm.r) m.r = sm.r; }
          if (sm.summoned) m.summoned = true;
          if (sm.camp) m.camp = sm.camp;
          if (sm.maxHp) { m.maxHp = sm.maxHp; if (m.stats) m.stats.maxHp = sm.maxHp; m.hp = sm.maxHp; }
          w.add(m); this.netMobs.set(sm.id, m); }
        apply(m, sm, true);
      }
      for (const [id, m] of this.netMobs) if (!present.has(id)) { w.actors = w.actors.filter((x) => x !== m); this.netMobs.delete(id); }
    }
    // projéteis visuais e avisos de perigo
    for (const pr of w.projectiles) {
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.traveled += Math.hypot(pr.vx, pr.vy) * dt;
      if (pr.traveled >= pr.range) { pr.dead = true; continue; }
      // a flecha/bola visual some no 1º inimigo que tocar (antes atravessava todos até o alcance máximo); o dano continua sendo só do servidor
      if (pr.cosmetic && !pr.pierce) for (const e of w.actors) {
        if (e.dead || e.team === pr.team || e.kind === 'spirit' || e === pr.src) continue;
        if (Math.hypot(e.x - pr.x, e.y - pr.y) < (e.r ?? 16) + pr.radius) { pr.dead = true; w.burst(pr.x, pr.y, pr.color, 5, 90); break; }
      }
    }
    w.projectiles = w.projectiles.filter((pr) => !pr.dead);
    for (const tg of w.telegraphs) { tg.t += dt; if (tg.t >= tg.delay) tg.done = true; }
    w.telegraphs = w.telegraphs.filter((tg) => !tg.done);
    w.time += dt;
    w.updateVisuals(dt);
    if (this.netInfo.mode === 'zone') {
      const me = this.player, k = Math.min(1, dt * 6);
      for (const sa of w.actors) if (sa.kind === 'spirit' && sa.owner === me.id) { sa.x += (me.x - 20 - sa.x) * k; sa.y += (me.y - 10 - sa.y) * k; }
      this.nearChest = (w.zone.chests ?? []).find((c) => Math.hypot(c.x - me.x, c.y - me.y) < 70)?.id ?? null; // botão de interagir / dica do baú
    }
    if (this.netInfo.mode === 'zone') { if (this.deathCard && !this.player.dead && performance.now() > this.deathCard) { this.deathCard = false; this.ui.hideScreen(); } this.ui.banner(this.player.dead ? 'Você caiu… renasce no ponto salvo em instantes' : null); return; }
    // faixa de informação da partida
    if (!this.netOver) {
      const my = this.netInfo.team;
      if (last.mode === 'coop') this.ui.banner(last.state === 'countdown' ? `Começa em ${Math.ceil(last.countdown)}` : last.coop.rest > 0 ? `Onda ${last.coop.wave + 1}/${last.coop.total} em ${Math.ceil(last.coop.rest)}s` : `Onda ${last.coop.wave}/${last.coop.total} · ${last.coop.mobs} monstros`);
      else if (last.state === 'countdown') this.ui.banner(`${this.netInfo.mode} — começa em ${Math.ceil(last.countdown)}`);
      else if (last.match) this.ui.banner(`${last.match.score[my]}×${last.match.score[my === 1 ? 2 : 1]} · ${Math.floor(last.match.left / 60)}:${String(Math.floor(last.match.left % 60)).padStart(2, '0')}`);
    }
  }

  showNetResult(s) {
    const m = this.netInfo, coop = m.mode === 'coop';
    const won = coop ? s.winner === 1 : s.winner === m.team, draw = !coop && s.winner === 3;
    this.netResult = { won, draw, coop };
    this.ui.banner(null);
    if (m.friendly) { // amistoso: o servidor não paga Elo/ouro/XP (só conta a vitória para a missão `porto_duelo`: mensagem friendly_reward)
      return this.ui.showResult({ title: draw ? 'Empate' : won ? 'Vitória!' : 'Derrota', sub: 'Duelo amistoso', lines: ['Amistoso: sem Elo, ouro nem XP.'], button: 'Voltar ao Porto', action: 'net-leave', tone: won ? 'win' : 'lose' });
    }
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
    lines.push(`+${r.gold} ouro`);
    if (r.xp) lines.push(`+${r.xp} XP${r.levels ? ` · subiu ${r.levels} nível(is)!` : ''}`);
    if (r.items) lines.push(`${r.items} item(ns) de recompensa no inventário`);
    if (r.converted) lines.push(`${r.converted} item(ns) viraram ouro (inventário cheio)`);
    const nr = this.netResult ?? {};
    this.ui.showResult({ title: nr.draw ? 'Empate' : r.won ? (r.mode === 'coop' ? 'Vitória cooperativa!' : 'Vitória!') : 'Derrota', sub: r.mode === 'coop' ? `Ondas vencidas: ${r.waves}/5` : `Partida ${r.mode}`, lines, button: 'Voltar à vila', action: 'net-leave', tone: r.won ? 'win' : 'lose' });
  }

  // volta ao jogo normal: adota o personagem OFICIAL do servidor (com as recompensas) e retoma a sincronização
  async leaveNetMatch(exit = null) {
    this.ui.hideScreen(); this.ui.banner(null);
    if (!exit && this.netInfo?.friendly) exit = { to: 'harbor', x: ZONES.harbor.spawn.x, y: ZONES.harbor.spawn.y }; // amistoso volta ao Porto
    this.netInfo = null; this.netLast = null; this.netActors = null; this.netMobs = null;
    try { const r = await this.online.getCharacter(this.charId); this.char = r.character; this.cloud.attach(this.charId, r.rev, () => this.char); } catch { /* mantém o local */ }
    if (this.cloud) this.cloud.paused = false;
    this.zoneBusy = false;
    const to = exit?.to && ZONES[exit.to]?.hub ? exit.to : 'town'; // o servidor também manda para o Porto (cidade neutra, sem sala)
    this.enterZone(to, exit?.x ?? TOWN.x, exit?.y ?? TOWN.y);
    this.fireTeleportEvent();
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
    const apply = () => {
      saveChar(r.char);
      this.ui.toast('Save importado', r.char.name + (r.warnings.length ? ' · ' + r.warnings.length + ' ajuste(s)' : ''), 'gold');
      if (this.mode === 'title') this.ui.showTitle(r.char); else this.loadGame(r.char);
    };
    if (loadChar()) this.ui.confirm('Importar "' + r.char.name + '" substitui o personagem atual deste aparelho. Continuar?', apply, 'Importar');
    else apply();
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
    p.spec = activeSpec(this.char); // a especialização também mexe nos atributos (data/specs.js › mods)
    p.mastery = hasMastery(this.char); // a Maestria libera a 4ª habilidade (s3)
    this.syncMountActor(); // missão/Apito/escolha podem ter mudado a lista de montarias
  }

  // ---------------- preferências do aparelho ----------------
  applyPrefs() {
    const p = this.prefs;
    this.uiScale = resolveScale(p) / 100; // 'auto' acompanha a viewport (prefs.js autoScale)
    document.documentElement.style.setProperty('--ui', String(this.uiScale));
    const q = resolveQuality(p, this.touch.coarse);
    // iPhone no automático: resolução 2× (efeitos continuam altos). Em 3× a tela e os blocos do chão gastavam ~2,25× mais memória de canvas e o Safari,
    // ao passar do teto, devolvia canvas vazios (chão liso/preto e monstros invisíveis no celular do dono, 2026-11-05). "Alta" nas Opções volta a 3×.
    const res = p.quality === 'auto' && q === 'high' && isIOS() ? 'medium' : q;
    this.renderer.setQuality(res, p.quality === 'auto' ? this.qgov.apply(q) : q); // resolução = res; o governador só limita os EFEITOS, e só no modo auto
    this.touch.setMode(p.controls);
    this.audio?.setVolumes(p.music / 100, p.sfx / 100);
  }

  // O Safari recusou um canvas (memguard.js): libera o que dá para refazer (blocos do chão, monstros de fora da zona) e baixa a resolução
  // um degrau (3× → 2× → 1×). O jogo segue; o que faltou é refeito nos próximos quadros com menos memória.
  relieveMemory(n) {
    const r = this.renderer;
    r.groundCache.clear();
    releaseMobs(this.world ? mobIdsOf(this.world.zone) : new Set());
    const cur = Math.min(r.dprCap, r.memCap, devicePixelRatio || 1);
    if (cur > 1) { r.memCap = Math.max(1, Math.floor(cur) - 1); r.resize(); }
    console.warn(`[memória] canvas recusado pelo navegador (${n}); resolução agora ${r.dpr}×`);
    if (!this.memWarned) { this.memWarned = true; this.ui.toast('Memória do aparelho', 'Resolução reduzida para o jogo seguir estável.', ''); }
  }

  setPref(arg) {
    this.prefs = changePref(this.prefs, arg, innerWidth, innerHeight);
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
    if (inp.hit('e')) this.interact();
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
          ['1', '2', '3', '4'].forEach((k, i) => { if (inp.hit(k)) cast = i; });
          intents[p.id] = {
            mx: (inp.held('d', 'arrowright') ? 1 : 0) - (inp.held('a', 'arrowleft') ? 1 : 0),
            my: (inp.held('s', 'arrowdown') ? 1 : 0) - (inp.held('w', 'arrowup') ? 1 : 0),
            aimX: inp.mouse.x / this.renderer.zoom + this.cam.x, aimY: inp.mouse.y / this.renderer.zoom + this.cam.y,
            attack: inp.mouse.down, cast,
          };
        }
      }
      if (!p.dead && this.auto) this.autoDrive(intents[p.id], dt); // auto-viagem: troca o movimento pelo caminho (o joystick/ataque pausam)
      if (intents[p.id]) this.mountStep(intents[p.id], dt); // montar automático + pedido de montar/desmontar do botão
      this.castHold = p.dead ? null : carryCast(this.castHold, intents[p.id]); // pedido de habilidade espera o próximo tick (telas de 90/120 Hz)
      this.acc = Math.min((this.acc ?? 0) + dt, FIXED_DT * MAX_TICKS);
      while (this.acc >= FIXED_DT) {
        this.acc -= FIXED_DT;
        this.tick(FIXED_DT, intents);
        this.mountReq = undefined; // o pedido de montar/desmontar foi entregue (vale uma vez só)
        this.castHold = null; // um tick rodou: o pedido foi entregue à simulação
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
    w.spiritPick = this.prefs.spiritPick ?? SPIRIT_PICK_ALL;
    w.update(dt, intents);
    this.handleEvents();
    if (this.mode === 'explore') { w.updateSpawns(dt, p); this.checkPortals(); this.regen(dt); this.pumpTips(dt); }
    else if (this.mode === 'waves') this.updateWaves(dt);
    else if (this.mode === 'pvp') this.updateMatch(dt);
    this.collectDrops();
  }

  handleEvents() {
    const events = this.world.events.splice(0);
    for (const ev of events) {
      this.audio.event(ev, this.player); // som do evento (golpe, dano, magia, morte, chefe); só leitura
      if (ev.type === 'cast') { if (ev.actor === this.player) this.gameEvent({ type: 'skill', skillId: ev.skill }); spawnSkillVfx(this.world, ev); continue; } // efeito visual da habilidade (a simulação já decidiu tudo)
      if (ev.type === 'hit' || ev.type === 'heal') { spawnEventVfx(this.world, ev); continue; } // crítico, absorção e cura
      if (ev.type === 'phase' && ev.phase === 3) { this.ui.announce('Enfurecido!', `${ev.actor.name} entrou em fúria`, 'gold'); continue; }
      if (ev.type === 'phase') { this.ui.log(`${ev.actor.name} acelera!`, '#ffb4a8'); continue; }
      if (ev.type === 'boss_warn') { if (ev.stage === 'omen') this.ui.announce('O chão estremece…', `${ev.name} desperta`, 'gold'); else this.ui.log(`<b>${ev.name}</b> surgiu nas Cinzas Ardentes!`, '#ffb4a8'); continue; }
      if (ev.type !== 'death') continue;
      const a = ev.actor;
      if (a.kind === 'mob') this.onMobKilled(a);
      else if (a === this.player) this.onPlayerDeath();
      // rival/aliado caindo não encerra nada: updateMatch conta os vivos de cada time
    }
  }

  // Teletransporte para um mapa já visitado (pelo painel do mapa): a Vila é de graça; os outros custam ouro e exigem estar fora de combate.
  teleport(id) {
    if (id === 'town' && this.inNetZone()) { this.ui.closePanels(); return this.hearth(); } // instância online: o nó da Vila do mapa sai da instância (zone_leave)
    const c = this.char, z = ZONES[id];
    if (this.mode !== 'explore' || !z || !(id === 'town' || c.visited?.[id])) return; // só a Vila vale sem ter visitado
    if (id === this.world.zoneId) return this.ui.toast('Você já está aqui', z.name, '');
    if (this.world.time - this.player.lastCombat < 8) return this.ui.toast('Em combate', 'Espere uns segundos para viajar.', '');
    if (this.online && this.net?.joined) return this.teleportOnline(id); // o servidor confere visitado, pergaminho e combate, e debita o pergaminho
    const cost = teleportCost(id);
    if (cost > (c.scrolls ?? 0)) return this.ui.toast('Sem pergaminho', 'Compre um Pergaminho de Teletransporte com a Mercadora Lia.', '');
    c.scrolls = (c.scrolls ?? 0) - cost;
    this.ui.closePanels();
    const at = z.spawn ?? { x: FARM_ENTRY, y: FARM_MID };
    this.enterZone(id, at.x, at.y);
    this.gameEvent({ type: 'teleport' });
  }

  // Emite o evento 'teleport' uma única vez por pedido online (zone_joined ou zone_exit para a vila).
  fireTeleportEvent() {
    if (!this.teleportPending) return;
    this.teleportPending = false;
    this.gameEvent({ type: 'teleport' });
  }

  // Teletransporte online: só pede; o servidor decide e cobra (a contagem nova volta em zone_joined.scrolls). Recusas voltam em 'reject' (toast).
  async teleportOnline(id) {
    if (this.zoneBusy) return;
    if (id !== 'town' && (this.char.scrolls ?? 0) < 1) return this.ui.toast('Sem pergaminho', 'Compre um Pergaminho de Teletransporte com a Mercadora Lia.', '');
    this.zoneBusy = true; this.teleportPending = true;
    setTimeout(() => { this.zoneBusy = false; this.teleportPending = false; }, 6000);
    await this.cloud?.flush(); // grava o progresso (mapas visitados, pergaminhos) ANTES: o servidor confere pelo documento salvo
    this.net.send({ t: 'zone_teleport', zone: id });
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
    this.unmountForAction(); // conversar desmonta
    const c = this.char;
    const hasQuest = npc.role === 'quest' || offeredBy(c, npc.id, { server: !!this.online }).length || readyFor(c, npc.id).length || activeFor(c, npc.id).length;
    if (npc.role === 'mentor') return this.talkMentor(npc);
    // Doran offline: sem missões do servidor, a primeira conversa da sessão mostra a fala dele (depois abre a arena direto)
    const offlineDoran = npc.id === 'arena' && !this.online && !this.metDoran && (this.metDoran = true);
    if (hasQuest || offlineDoran) { this.dialogNpc = npc.id; this.ui.openPanel('dialog'); return; }
    if (npc.role === 'shop') this.ui.openPanel('shop');
    else if (npc.role === 'arena') this.ui.openPanel('arena');
    else if (npc.role === 'spirit') this.ui.openPanel('sage');
    else if (npc.role === 'smith') this.ui.openPanel('shop:smith'); // abre a loja já rolada até o Ferreiro (aprimoramento)
    else if (SERVICE_OF_ROLE[npc.role]) this.openService(SERVICE_OF_ROLE[npc.role]); // Porto: bank, board, harborshop, duel
  }

  // Mentor de especialização (Porto): a conversa conta para a Prova do Mestre (bit em stats.mentors; online é o servidor que conta) e abre a fala com a explicação da especialização.
  talkMentor(npc) {
    if (!mentorSeen(this.char, npc.id) && !this.serverTx({ op: 'mentor_talk', id: npc.id })) {
      const out = recordEvent(this.char, { type: 'talk', npc: npc.id });
      for (const q of out.quests) if (q.complete) this.ui.toast('Missão pronta!', QUESTS[q.id].name + ' — volte ao Mestre da sua classe na Vila (marca ?)', 'gold');
      this.announceAchievements(out.achievements);
      this.save();
    }
    this.dialogNpc = npc.id; this.ui.openPanel('dialog');
  }

  // Abre o painel de um serviço de NPC (`service.panel` de data/dialogs.js). Loja do Porto refaz o estoque do dia; duelo amistoso inicia a luta.
  openService(panel) {
    if (panel === 'shop:harbor') this.harborStock = buildShopStock(this.char, { harbor: true });
    if (panel === 'arena:friendly') return this.startFriendly();
    this.ui.openPanel(panel);
  }

  // ---------------- Porto: banco e contratos ----------------
  bankPut(id) {
    if (this.serverTx({ op: 'bank_deposit', id })) return;
    const r = depositItem(this.char, id);
    if (!r.ok) return this.ui.toast('Banco', r.reason, '');
    this.gameEvent({ type: 'bank' }); // missão do Porto (objetivo `bank`) e contador de depósitos
    this.ui.render(); this.save();
  }
  bankTake(id) {
    if (this.serverTx({ op: 'bank_withdraw', id })) return;
    const r = withdrawItem(this.char, id);
    if (!r.ok) return this.ui.toast('Banco', r.reason, '');
    this.ui.render(); this.save();
  }
  dailyClaim(id) {
    if (this.serverTx({ op: 'claim_daily', id }, (m) => this.ui.toast('Contrato entregue!', `+${m.reward.gold} ouro · +${m.reward.xp} XP · +${m.reward.potions} poção(ões)`, 'gold'))) return;
    const r = claimDaily(this.char, id);
    if (!r.ok) return this.ui.toast('Contrato', r.reason, '');
    const R = r.reward;
    this.ui.toast('Contrato entregue!', `+${R.gold} ouro · +${R.xp} XP · +${R.potions} poção(ões)`, 'gold');
    if (r.levels) this.onLevelUp();
    for (const q of r.quests ?? []) if (q.complete) this.ui.toast('Missão pronta!', QUESTS[q.id].name + ' — volte ao NPC (marca ?)', 'gold');
    this.announceAchievements(r.achievements ?? []);
    this.refreshStats(); this.save(); this.ui.render();
  }

  // marca sobre o NPC: '!' tem missão, '?' pronta para entregar, 'none' nada (só para quem existe só por missões)
  // ---------------- guia de missão e auto-viagem (core/autopath.js) ----------------
  // O rastreador mostra o objetivo da missão escolhida (ou da primeira pronta/ativa); "Ir até lá" liga a auto-viagem, que só troca o
  // movimento do herói por um caminho calculado sobre a mesma colisão (nada de teleporte; online vai como entrada normal).
  guideReady() { return !!this.char && !!this.player && !this.player.dead && (this.mode === 'explore' || this.inNetZone()); }
  setTrack(id) {
    this.trackId = id || null;
    try { if (id) localStorage.setItem('aetheria_track', id); else localStorage.removeItem('aetheria_track'); } catch { /* sem armazenamento */ }
    if (this.auto && this.auto.qid !== this.trackId) this.autoStop(true);
    this.refreshGuide();
  }
  refreshGuide() {
    if (!this.guideReady()) { this.guide = null; if (this.auto && this.mode !== 'explore' && !this.inNetZone()) this.auto = null; return; }
    if (this.trackId === undefined) { try { this.trackId = localStorage.getItem('aetheria_track') || null; } catch { this.trackId = null; } }
    const id = pickTracked(this.char, this.trackId);
    if (!id) { this.guide = null; if (this.auto) this.autoStop(true); return; }
    const p = this.player, zid = this.world.zoneId;
    const target = questTarget(this.char, id, { zoneId: zid, x: p.x, y: p.y });
    const goal = target ? guideGoal(target, zid) : null;
    this.guide = { id, target, goal, tk: trackerText(this.char, id), dist: goal ? Math.hypot(goal.x - p.x, goal.y - p.y) : 0 };
    if (this.auto) {
      if (this.auto.qid !== id) this.autoStop(true);
      else if (target && target.kind !== 'none') this.auto.target = target; // acompanha o alvo (baú já aberto, missão pronta...)
    }
  }
  autoGo() {
    if (!this.guideReady()) return;
    this.refreshGuide();
    const g = this.guide;
    if (!g) return this.ui.toast('Sem missão', 'Aceite uma missão com um morador da Vila.', '');
    if (!g.goal) return this.ui.toast('Sem destino no mapa', g.target?.why ?? 'Este objetivo não tem um lugar fixo.', '');
    this.ui.closePanels();
    this.auto = { qid: g.id, target: g.target, path: null, key: '', paused: null, hp: this.player.hp, probe: { x: this.player.x, y: this.player.y, t: 0 }, fails: 0 };
    this.ui.toast('Auto-viagem', `Rumo a: ${g.target.label ?? g.tk.name}. Mexa o joystick para parar.`, '');
  }
  autoStop(silent = false) { if (this.auto && !silent) this.ui.toast('Auto-viagem cancelada', '', ''); this.autoUnmount(); this.auto = null; }
  autoUnmount() { if (this.auto?.byMount) { this.auto.byMount = false; this.unmountForAction(); } } // a auto-viagem montou o herói: desmonta ao terminar/pausar (montou por conta própria = fica como está)
  autoPause(reason) {
    if (!this.auto || this.auto.paused) return;
    this.autoUnmount();
    this.auto.paused = reason; this.auto.path = null;
    this.ui.toast('Auto-viagem pausada', reason === 'lowhp' ? 'Vida baixa. Toque em Continuar quando estiver pronto.' : reason === 'blocked' ? 'Caminho bloqueado. Ande um pouco e tente de novo.' : 'Toque em Continuar para seguir.', '');
  }
  autoResume() {
    const a = this.auto;
    if (!a) return;
    a.paused = null; a.path = null; a.fails = 0; a.ignoreLow = true; a.hp = this.player.hp; a.probe = { x: this.player.x, y: this.player.y, t: 0 };
  }
  // Chamada uma vez por quadro com a intenção do jogador (mutada): pausa se o jogador tocou/atacou ou a vida está baixa; senão anda pelo caminho.
  autoDrive(intent, dt) {
    const a = this.auto, p = this.player, w = this.world;
    if (!a || !intent || !this.guideReady()) return;
    const manual = Math.hypot(intent.mx, intent.my) > 0.05 || intent.attack || intent.cast != null;
    const hpFrac = p.hp / (p.maxHp || 1);
    if (hpFrac >= 0.3) a.ignoreLow = false; // recuperou: a regra de vida baixa volta a valer
    if (a.paused) return;
    // ser atacado/em combate não pausa (o herói atravessa os mobs); só toque/ataque manual, vida baixa e travamento
    const why = autoPauseReason({ manual, hpFrac, ignoreLow: a.ignoreLow, stunned: p.stunT > 0 });
    if (why === 'manual' || why === 'lowhp') return this.autoPause(why);
    if (why === 'stun') { intent.mx = 0; intent.my = 0; intent.attack = false; intent.cast = null; return; } // atordoado: espera e retoma sozinha
    const goal = a.target && guideGoal(a.target, w.zoneId);
    if (!goal) return this.autoStop(true);
    const d = Math.hypot(goal.x - p.x, goal.y - p.y);
    if (!goal.portal && d <= goal.reach) {
      this.autoUnmount(); // chegou: desmonta (se foi a auto-viagem que montou)
      this.auto = null;
      this.ui.toast('Você chegou', a.target.label ?? '', 'gold');
      return;
    }
    // Montaria: com uma montaria e em zona permitida, a auto-viagem monta sozinha (o servidor/simulação confere combate e zona) e viaja a +50% (substitui o correr)
    if (!p.mounted && this.mountUiOk()) { this.syncMountActor(); intent.mount = true; if (!a.byMount) a.byMount = true; }
    const key = `${w.zoneId}:${goal.x}:${goal.y}`;
    if (a.key !== key || !a.path) { // (re)calcula: zona nova, alvo novo ou travou
      a.key = key;
      const grid = buildNavGrid(w.zoneId, w.zone, w.layout);
      const to = goal.portal ? { x: Math.max(goal.x, 52), y: goal.y } : goal;
      a.path = findPath(grid, p, to);
      if (!a.path) a.path = lineFree(grid, p.x, p.y, to.x, to.y) ? [{ x: to.x, y: to.y }] : [{ ...(waterWaypoint(w, p, to.x, to.y) ?? to) }]; // sem caminho na grade: rio pela ponte, senão reta
      a.probe = { x: p.x, y: p.y, t: 0 };
    }
    const mv = followPath(a.path, p, 20);
    if (!mv) { a.path = null; if (goal.portal) { intent.mx = Math.sign(goal.x - p.x) * 0.5; intent.my = 0; intent.spd = 1; intent.run = true; } return; } // chegou ao fim do caminho: encosta no portal / recalcula
    intent.mx = mv.mx; intent.my = mv.my; intent.spd = 1; intent.attack = false; intent.cast = null;
    intent.run = true; // só a auto-viagem da missão corre (+30%; decisão do dono, 2026-11-05: o joystick não corre mais). A simulação e o servidor só concedem fora de combate e nas zonas permitidas
    intent.aimX = p.x + mv.mx * 200; intent.aimY = p.y + mv.my * 200;
    // travado? (sem andar 6 px em 1,3 s): recalcula; 3 vezes seguidas pausa
    a.probe.t += dt;
    if (a.probe.t >= 1.3) {
      if (Math.hypot(p.x - a.probe.x, p.y - a.probe.y) < 6) { a.path = null; if (++a.fails >= 3) this.autoPause(autoPauseReason({ blocked: true })); } else a.fails = 0;
      a.probe = { x: p.x, y: p.y, t: 0 };
    }
  }

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
    if (this.txOnline && SERVER_COUNTED.has(ev.type)) return { quests: [], achievements: [] }; // com servidor de partidas, teletransporte/visita/spiritStage são contados lá (modo estrito de PvE)
    const out = recordEvent(this.char, ev);
    for (const q of out.quests) if (q.complete) this.ui.toast('Missão pronta!', QUESTS[q.id].name + ' — volte ao NPC (marca ?)', 'gold');
    this.announceAchievements(out.achievements);
    if (ev.type === 'kill' && ev.boss) this.tip('boss');
    if (out.quests.length || out.achievements.length) { this.save(); if (this.ui.isOpen('journal')) this.ui.render(); }
    return out;
  }
  announceAchievements(list) { for (const id of list) this.ui.toast('Conquista!', ACH[id].name + (ACH[id].title ? ` · título "${ACH[id].title}"` : ''), 'gold'); }

  questAccept(id) {
    if (this.serverTx({ op: 'quest_accept', id }, () => this.ui.toast('Missão aceita', QUESTS[id].name, 'gold'))) return;
    const r = acceptQuest(this.char, id);
    if (!r.ok) return this.ui.toast('Missão', r.reason, '');
    this.ui.toast('Missão aceita', QUESTS[id].name, 'gold');
    this.save(); this.ui.render();
  }
  questTurnIn(id) {
    if (this.serverTx({ op: 'quest_turnin', id }, (m) => {
      this.ui.toast('Missão concluída!', [QUESTS[id].name, m.reward.gold ? `+${m.reward.gold} ouro` : '', m.reward.xp ? `+${m.reward.xp} XP` : ''].filter(Boolean).join(' · '), 'gold');
      for (const it of m.reward.items ?? []) this.ui.log(`Recompensa: <b style="color:${RARITY[it.rarity].color}">${it.name}</b>`);
      if (m.reward.mount) { this.syncMountActor(); this.ui.toast('Nova montaria: ' + MOUNTS[m.reward.mount].name, 'Toque em Montar (fora de combate) ou escolha em Personagem.', 'gold'); }
      if (id === 'maestria') { const mu = masteryUnlock(this.char.classId, activeSpec(this.char)); this.ui.toast('Nova habilidade: ' + SKILLS[mu.id].name, SKILLS[mu.id].desc, 'gold'); }
    })) return;
    const r = turnInQuest(this.char, id, this.rng);
    if (!r.ok) return this.ui.toast('Missão', r.reason, '');
    const R = r.reward;
    this.ui.toast('Missão concluída!', [QUESTS[id].name, R.gold ? `+${R.gold} ouro` : '', R.xp ? `+${R.xp} XP` : ''].filter(Boolean).join(' · '), 'gold');
    for (const it of R.items) this.ui.log(`Recompensa: <b style="color:${RARITY[it.rarity].color}">${it.name}</b>`);
    if (R.mount) this.ui.toast('Nova montaria: ' + MOUNTS[R.mount].name, 'Toque em Montar (fora de combate) ou escolha em Personagem.', 'gold');
    if (R.levels) this.onLevelUp();
    this.refreshStats();
    if (id === 'maestria') { // a Maestria também ensina a habilidade do 4º slot
      const m = masteryUnlock(this.char.classId, activeSpec(this.char));
      this.ui.toast('Nova habilidade: ' + SKILLS[m.id].name, SKILLS[m.id].desc, 'gold');
      this.ui.log(`Nova habilidade: <b>${SKILLS[m.id].name}</b>.`, '#ffd34d');
    }
    this.announceAchievements(r.achievements);
    this.save(); this.ui.render();
  }

  // ---------------- montarias (decisão 0018; regras em core/mounts.js e game/sim.js stepMount) ----------------
  // A interface só PEDE montar/desmontar (`mountReq`, entregue uma vez à simulação como a skill); quem decide é a simulação (local offline, servidor online).
  mountZoneOk() { return RUN_ZONES.has(this.world?.zoneId); }
  // Botão Montar/Desmontar e toque duplo: só com montaria possuída, vivo e em zona permitida (explorando offline ou numa instância online).
  mountUiOk() {
    const p = this.player;
    if (!p || p.dead || !this.char || !ownedMounts(this.char).length || !this.mountZoneOk()) return false;
    return this.mode === 'explore' || this.inNetZone();
  }
  syncMountActor() { const p = this.player; if (p && this.char) { p.mounts = ownedMounts(this.char); p.mountId = activeMount(this.char); } }
  toggleMount() {
    const p = this.player;
    if (!p || !this.mountUiOk()) return;
    if (p.mounted) { this.mountReq = false; this.autoMountSt.hold = true; p.mounted = false; return; } // desmontar à mão: vale na hora e segura o "automático" até parar de andar
    this.syncMountActor();
    const why = mountProblem(p, { zoneOk: this.mountZoneOk(), time: this.world.time });
    if (why) return this.ui.toast('Montaria', MOUNT_REASONS[why], '');
    this.mountReq = true; // monta no próximo tick (a simulação confere de novo)
    this.ui.toast(MOUNTS[p.mountId]?.name ?? 'Montaria', 'Montado: +50% de velocidade. Atacar, usar habilidade ou apanhar desmonta.', '');
  }
  // Ações que desmontam (conversar, abrir baú, ler placa): o pedido vale na hora no jogo offline; online o servidor desmonta ao receber `mount: false`.
  unmountForAction() { const p = this.player; if (p?.mounted) { this.mountReq = false; p.mounted = false; } }
  setMount(id) {
    if (!ownedMounts(this.char).includes(id)) return;
    if (this.serverTx({ op: 'mount_set', id }, (m) => { this.char.mount = m.mount; this.syncMountActor(); })) return;
    this.char.mount = id; this.syncMountActor(); this.save(); this.ui.render();
  }
  useWhistleItem() {
    const got = (mount) => { this.syncMountActor(); this.ui.toast(MOUNTS[mount].name + '!', 'Nova montaria. Escolha a ativa em Personagem e toque em Montar (fora de combate).', 'gold'); };
    if (this.serverTx({ op: 'mount_use_whistle' }, (m) => got(m.mount))) return;
    const r = useWhistle(this.char, this.rng);
    if (!r.ok) return this.ui.toast(WHISTLE.name, r.reason, '');
    got(r.mount); this.save(); this.ui.render();
  }
  // Quadro a quadro, com a intenção do jogador: "montar automático" (opção) e entrega única do pedido pendente.
  mountStep(intent, dt) {
    const p = this.player;
    if (!p || p.dead) return;
    const moving = Math.hypot(intent.mx ?? 0, intent.my ?? 0) > 0.05 && !intent.attack && intent.cast == null;
    const ok = this.mountUiOk() && !(this.world.time - (p.lastCombat ?? -99) < 3);
    if (stepAutoMount(this.autoMountSt, { enabled: !!this.prefs?.autoMount, moving, ok, mounted: !!p.mounted }, dt, MOUNT_AUTO_DELAY)) { this.syncMountActor(); this.mountReq = true; }
    if (this.mountReq != null) intent.mount = this.mountReq;
  }

  // Botão de interagir (toque) e tecla E: NPC por perto conversa; senão abre o baú.
  interact() {
    const t = interactTarget(this.player, this.world);
    if (t) this.unmountForAction(); // falar/abrir baú/ler placa: desmonta
    if (this.inNetZone()) { if (this.player.dead) return; if (t?.kind === 'chest') this.useChest(t.ref.id); else if (t?.kind === 'checkpoint') this.useCheckpoint(t.ref); else if (t?.kind === 'lore') this.readLore(t.ref); return; } // instância online: baú e placa de lore (NPCs ficam nas cidades)
    if (t?.kind === 'npc') this.talk(t.ref);
    else if (t?.kind === 'chest') this.useChest(t.ref.id);
    else if (t?.kind === 'checkpoint') this.useCheckpoint(t.ref);
    else if (t?.kind === 'lore') this.readLore(t.ref);
  }

  // Placa/estátua de lore: mostra o texto; a 1ª leitura de cada zona fica no diário (bit em char.stats.lore) e pode dar conquista.
  readLore(l) {
    if (!l || (this.mode !== 'explore' && !this.inNetZone())) return;
    if (this.serverTx({ op: 'lore', id: l.id }, (m) => this.ui.toast(l.name, l.text, m.first ? 'gold' : '', 4200))) return; // online: o servidor confere a proximidade e marca a 1ª leitura
    const r = readLore(this.char, l.id);
    this.ui.toast(l.name, l.text, r.first ? 'gold' : '', 4200);
    if (r.first) { this.announceAchievements(r.achievements); this.save(); if (this.ui.anyOpen()) this.ui.render(); }
  }

  // Dicas mostram a tecla só no modo teclado; no toque, dizem "Toque".
  get keyHints() { return this.prefs?.controls === 'keyboard' || (!this.touch?.active); }

  useChest(id) {
    const chest = (this.world.zone.chests ?? []).find((c) => c.id === id);
    if (!chest || (this.mode !== 'explore' && !this.inNetZone())) return;
    this.unmountForAction(); // abrir baú desmonta
    if (this.inNetZone()) { // o servidor confere a distância, a recarga e sorteia o prêmio
      if (this.chestsOpen?.has(id)) return this.ui.log('O baú está vazio por enquanto.', '#ffb4a8');
      this.serverTx({ op: 'chest', id }, (m) => {
        this.world.burst(chest.x, chest.y - 8, '#ffd34d', 26, 200);
        this.world.addText({ x: chest.x, y: chest.y - 30, t: 0, life: 1.1, text: `+${m.gold}`, size: 15, color: '#ffd34d' });
        this.ui.chestReward({ gold: m.gold, item: m.item, whistle: m.whistle }); this.audio.play('chest');
        this.chestsOpen = new Set(Object.keys(this.char.chests ?? {}).filter((k) => !chestReady(this.char, k)));
      });
      return;
    }
    const r = openChest(this.char, chest, this.world.zoneId, this.rng);
    if (!r.ok) return this.ui.log(r.reason, '#ffb4a8');
    this.audio.play('chest');
    this.world.burst(chest.x, chest.y - 8, '#ffd34d', 26, 200);
    this.world.addText({ x: chest.x, y: chest.y - 30, t: 0, life: 1.1, text: `+${r.gold}`, size: 15, color: '#ffd34d' });
    this.ui.chestReward(r); // cartão por cima de tudo (fila); abrir o baú nunca abre a mochila
    for (const q of r.quests) if (q.complete) this.ui.toast('Missão pronta!', QUESTS[q.id].name, 'gold');
    this.announceAchievements(r.achievements);
    this.tip('chest');
    this.chestsOpen = null; this.marksT = 0;
    this.save(); if (this.ui.anyOpen()) this.ui.render();
  }

  usePotion() {
    const p = this.player, c = this.char;
    if (this.inNetZone()) { // instância online: o servidor cura, debita a poção e controla a recarga de 8 s
      if (p.dead || this.potionCd > 0) return;
      if (!c.potions) return this.ui.log('Sem poções! Compre com a Mercadora Lia.', '#ffb4a8');
      if (p.hp >= p.maxHp) return this.ui.log('Sua vida já está cheia.', '#ffe9a0');
      this.serverTx({ op: 'potion' }, () => { this.potionCd = 8; this.world.burst(p.x, p.y, '#ff7a8a', 14, 120); });
      return;
    }
    if (this.mode === 'pvp' || this.mode === 'net') return this.ui.log('Poções são proibidas nas partidas.', '#ffb4a8');
    if (p.dead || this.potionCd > 0) return;
    if (!c.potions) return this.ui.log('Sem poções! Compre com a Mercadora Lia.', '#ffb4a8');
    if (p.hp >= p.maxHp) return this.ui.log('Sua vida já está cheia.', '#ffe9a0');
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
    if (m.summoned) return; // esbirros de chefe não dão XP nem loot
    const M = MOBS[m.mobId];
    const rm = this.world.nightMods?.rewardMul ?? 1; // bônus noturno: +15% de XP, ouro e chance de item (só ao ar livre)
    if (this.mode === 'explore') this.grantXp(mobXp(m.level, this.char.level, M.xp * (m.boss ? XP_MULT.boss : m.elite ? XP_MULT.elite : 1) * rm));
    for (const l of rollMobLoot(this.rng, m, this.char.classId, (this.char.pity ??= { epic: 0, legendary: 0, opal: 0 }), rm)) {
      if (l.kind === 'gold') { // ouro vai direto para a mochila (sem drop no chão), com texto flutuante
        this.char.gold += l.amount;
        this.world.addText({ x: this.player.x, y: this.player.y - 34, t: 0, life: 0.8, text: `+${l.amount}`, size: 13, color: '#ffd34d' });
        this.audio.play('coins');
        continue;
      }
      if (l.kind === 'whistle') { // Apito de Montaria: vai direto ao personagem (sem drop no chão), com aviso
        if (addWhistles(this.char, l.amount ?? 1) > 0) { this.ui.toast(WHISTLE.name + '!', 'Use em Personagem > Montarias para chamar uma montaria.', 'gold'); this.world.burst(m.x, m.y, '#ffd34d', 30, 260); }
        continue;
      }
      this.dropAt(m.x, m.y, l);
      if (l.kind === 'item' && (l.item.opal || l.item.rarity === 'epic' || l.item.rarity === 'legendary')) { // aviso e brilho para drop raro
        this.world.burst(m.x, m.y, l.item.opal ? '#bfe9ff' : l.item.rarity === 'legendary' ? '#ffa53d' : '#b77cff', 30, 260);
        this.ui.toast(l.item.opal ? 'Item de Ópalo!' : l.item.rarity === 'legendary' ? 'Item lendário!' : 'Item épico!', l.item.name, 'gold');
      }
    }
    // spiritType: tipo do spirit ativo que acompanhava o herói (missão de evolução do spirit); mini: mini-chefe (Prova do Mestre)
    const sp = this.char.spirits.find((s) => s.id === this.char.activeSpirit);
    const spiritType = sp && this.world.actors.some((a) => a.kind === 'spirit' && a.owner === this.player.id && !a.hidden) ? sp.type : undefined;
    this.gameEvent({ type: 'kill', mobId: m.mobId, zoneId: this.world.zoneId, boss: !!m.boss, mini: !!m.miniboss, spiritType });
    if (m.boss) {
      this.ui.toast(`${M.name} derrotado!`, 'Tesouros caíram no chão', 'gold');
      this.ui.log(`Você derrotou <b>${M.name}</b>! Ele só reaparece depois de um tempo.`, '#ffd27a');
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
    this.audio.play('levelup');
    this.refreshStats();
    p.hp = p.maxHp;
    this.world.addFx({ type: 'ring', x: p.x, y: p.y, r: 120, color: '#ffd34d', t: 0, life: 0.8, follow: p });
    this.world.burst(p.x, p.y, '#ffd34d', 40, 260);
    this.ui.announce(`Nível ${this.char.level}!`, '+5 pontos de atributo', 'gold');
    this.ui.log(`Você alcançou o nível <b>${this.char.level}</b>.`, '#ffd34d');
    this.tip('level');
    for (const u of newlyUnlocked(this.char.classId, this.skillLv ?? this.char.level - 1, this.char.level)) { // habilidades aprendidas neste nível
      this.ui.toast('Nova habilidade: ' + SKILLS[u.id].name, SKILLS[u.id].desc, 'gold');
      this.ui.log(`Nova habilidade: <b>${SKILLS[u.id].name}</b>.`, '#ffd34d');
      this.tip('skill');
    }
    this.skillLv = this.char.level;
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
      // d.fetched: o spirit trouxe até o herói (sim.js updateSpiritFetch), vale de qualquer distância
      if (!d.fetched && (d.t < PICK_DELAY || Math.hypot(d.x - p.x, d.y - p.y) > PICK_R)) continue;
      if (d.kind === 'potion') {
        c.potions += d.amount;
        this.ui.log(`+${d.amount} 🧪 Poção de Vida`, '#ff9aa8');
      } else if (d.kind === 'item') {
        if (c.inventory.length >= INVENTORY_SIZE && d.fetched) { // o spirit trouxe com a mochila cheia: vira ouro
          c.gold += d.item.value;
          w.addText({ x: p.x, y: p.y - 34, t: 0, life: 0.8, text: `+${d.item.value}`, size: 13, color: '#ffd34d' });
        } else if (c.inventory.length >= INVENTORY_SIZE) {
          if (!d.warned) { this.ui.log('Inventário cheio! Venda itens na vila.', '#ffb4a8'); d.warned = true; }
          continue;
        } else {
          c.inventory.push(d.item);
          const R = RARITY[d.item.rarity];
          this.audio.play(R.index >= 3 ? 'levelup' : 'loot');
          this.ui.log(`Obtido: <b style="color:${R.color}">${d.item.name}</b> (${R.name})`, '#e8e6f0');
          if (R.index >= 3) this.ui.toast(d.item.name, `Item ${R.name}!`, 'gold');
        }
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
      this.ui.log('Limite de spirits atingido — a essência virou 100 ouro.', '#ffb4a8');
      return false;
    }
    c.spirits.push(sp);
    this.gameEvent({ type: 'spirit', count: c.spirits.length });
    const S = SPIRITS[sp.type], R = RARITY[sp.rarity];
    this.ui.toast(`Novo spirit: ${S.name}`, `${R.name} · ${S.element} · ${S.role}`, 'gold');
    this.ui.log(`Essência despertou <b style="color:${S.color}">${S.name}</b> (${R.name})! Veja em Spirits.`, S.color);
    this.tip('spirit');
    if (!c.activeSpirit) this.setSpirit(sp.id);
    this.save();
    return true;
  }

  // ---------------- inventário / atributos ----------------
  findItem(id) {
    const c = this.char;
    return c.inventory.find((i) => i.id === id) ?? Object.values(c.equipment).find((i) => i?.id === id) ?? this.shopStock.find((i) => i.id === id) ?? this.harborStock.find((i) => i.id === id) ?? (c.bank ?? []).find((i) => i.id === id);
  }

  equip(id) {
    if (this.inNetZone() && this.serverTx({ op: 'equip', id })) return; // instância online: o servidor troca o equipamento e recalcula o ator
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
    if (this.inNetZone() && this.serverTx({ op: 'unequip', slot })) return;
    const c = this.char;
    if (!c.equipment[slot]) return;
    if (c.inventory.length >= INVENTORY_SIZE) return this.ui.log('Inventário cheio.', '#ffb4a8');
    c.inventory.push(c.equipment[slot]);
    delete c.equipment[slot];
    this.refreshStats();
    this.ui.render();
    this.save();
  }

  // ---- Cripta dos Ecos (masmorra por instância, decisão 0017; server/crypt.js) ----
  // Entrada pelo nó do mapa: só online, e de uma cidade (na instância de um mapa de farm, volte à Vila). O servidor confere tudo e responde zone_joined (ou reject).
  async enterCrypt() {
    if (this.zoneBusy) return;
    if (!(this.online && this.net?.joined)) return this.ui.toast('Cripta dos Ecos', 'A masmorra só abre com o servidor de partidas conectado.', '');
    if (this.inNetZone()) return this.ui.toast('Cripta dos Ecos', CRYPT_REJECT.not_here, '');
    if (this.mode !== 'explore') return;
    this.zoneBusy = true; this.portalCd = 3;
    setTimeout(() => { this.zoneBusy = false; }, 6000);
    this.ui.closePanels();
    await this.cloud?.flush(); // grava o progresso antes: o servidor confere nível e mapas visitados pelo documento salvo
    this.net.send({ t: 'crypt_enter' });
  }
  // HUD da masmorra: tupla do servidor [sala, onda, ondas, fase, vivos, saída] (ui.js mostra no lugar do ritual)
  onCryptHud(cr) { this.netCrypt = { room: cr[0], wave: cr[1], waves: cr[2], phase: cr[3], left: cr[4], exit: cr[5] }; }
  onCryptEvent(e) {
    const u = this.ui;
    if (e.stage === 'wave') u.toast(`Sala ${e.room} · onda ${e.wave}/${e.waves}`, 'Eles vêm do fundo do eco…', 'gold');
    else if (e.stage === 'clear') u.toast(`Sala ${e.room} limpa!`, 'A porta se abriu: siga em frente.', 'gold');
    else if (e.stage === 'room') u.log(`Sala ${e.room} de ${e.rooms}`, '#9fe0ea');
    else if (e.stage === 'boss') u.toast('O Soberano dos Ecos desperta!', 'Atenção aos avisos no chão.', 'gold');
    else if (e.stage === 'victory') u.toast('Cripta vencida!', `O portal de saída abre em ${e.exit} s (ou volte pelo menu).`, 'gold');
  }
  // Forja do Eco (Ferreiro Brok): só online (fragmentos e ouro são do servidor).
  craftEcho(id) {
    if (this.serverTx({ op: 'craft', id }, (m) => { this.ui.toast('Forjado!', m.name, 'gold'); this.refreshStats(); })) return;
    this.ui.toast('Ferreiro Brok', 'A forja do Eco só funciona com o servidor de partidas conectado.', '');
  }

  enhanceItem(id) {
    if (this.serverTx({ op: 'enhance', id }, (m) => { this.ui.log(`${m.name} aprimorado para +${m.plus} (-${m.cost} ouro)`, '#ffd34d'); this.refreshStats(); })) return;
    const r = enhance(this.char, id);
    if (!r.ok) return this.ui.log(r.reason, '#ffb4a8');
    const it = findGear(this.char, id);
    this.ui.log(`${it.name} aprimorado para +${r.plus} (-${r.cost} ouro)`, '#ffd34d');
    this.gameEvent({ type: 'upgrade' });
    this.refreshStats(); this.ui.render(); this.save();
  }

  // preço de venda: 50% na Vila (G13), 60% no Mercador do Porto
  sellPrice(it) { return this.ui.shopAnchor === 'harbor' && this.ui.isOpen('shop') ? harborSellValue(it) : sellValue(it); }

  // Vender: épico ou melhor (opala, Eco/forjado) pede confirmação do próprio jogo (ui.confirm); abaixo disso vende direto.
  sell(id) {
    const it = this.char.inventory.find((i) => i.id === id);
    if (!it) return;
    if (needsSellConfirm(it)) return this.ui.confirm(`Vender ${it.name}${it.plus ? ` +${it.plus}` : ''} (${RARITY[it.rarity].name}) por ${this.sellPrice(it)} de ouro?`, () => this.sellNow(id), 'Vender');
    this.sellNow(id);
  }

  sellNow(id) {
    if (this.serverTx({ op: 'sell', id, shop: this.shopKind() }, (m) => this.ui.log(`Vendido (+${m.pay} ouro)`, '#ffd34d'))) return;
    const c = this.char, idx = c.inventory.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const it = c.inventory[idx], pay = this.sellPrice(it);
    c.inventory.splice(idx, 1);
    c.gold += pay;
    this.ui.log(`Vendido: ${it.name} (+${pay} ouro)`, '#ffd34d');
    this.ui.render();
    this.save();
  }

  // Venda em lote dos itens marcados na mochila (equipados nunca estão lá). Confirma (ui.confirm) com item épico+ ou total acima de 1000 de ouro.
  sellSelected() {
    const list = this.ui.selItems();
    if (!list.length) return;
    const total = list.reduce((t, i) => t + this.sellPrice(i), 0), risky = list.filter(needsSellConfirm), ids = list.map((i) => i.id);
    if (risky.length || total > 1000) return this.ui.confirm(`Vender ${list.length} ite${list.length === 1 ? 'm' : 'ns'} por ${total} de ouro?${risky.length ? ` Inclui: ${risky.map((i) => i.name).join(', ')}.` : ''}`, () => this.sellManyNow(ids), 'Vender');
    this.sellManyNow(ids);
  }

  sellManyNow(ids) {
    const done = () => { this.ui.sel = new Set(); };
    if (this.serverTx({ op: 'sell_bulk', ids, shop: this.shopKind() }, (m) => { done(); this.ui.log(`${m.count} itens vendidos (+${m.pay} ouro)`, '#ffd34d'); })) return;
    const c = this.char, set = new Set(ids), sold = c.inventory.filter((i) => set.has(i.id));
    if (!sold.length) return;
    const gold = sold.reduce((s, i) => s + this.sellPrice(i), 0);
    c.inventory = c.inventory.filter((i) => !set.has(i.id));
    c.gold += gold;
    done();
    this.ui.log(`${sold.length} itens vendidos (+${gold} ouro)`, '#ffd34d');
    this.ui.render();
    this.save();
  }

  sortInventory() {
    this.char.inventory.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || itemScore(b) - itemScore(a));
    this.ui.render();
  }

  pickSpec(id) {
    if (this.inNetZone()) return this.ui.toast('Na exploração online', 'Escolher especialização só na Vila.', '');
    if (this.mode === 'pvp') return this.ui.log('Não dá para trocar de especialização durante uma partida.', '#ffb4a8');
    const info = specInfo(this.char.classId, id);
    if (!info) return;
    if (!needsSeal(this.char)) return this.applySpec(id); // primeira escolha: grátis, sem confirmação
    if (sealsOf(this.char) < 1) return this.ui.toast('Selo necessário', 'Trocar de especialização exige um Selo de Reespecialização. O Mestre de Classe, na Vila, vende.', '');
    this.ui.confirm(`Trocar para ${info.name}? Isso consome 1 Selo de Reespecialização (você tem ${sealsOf(this.char)}).`, () => this.applySpec(id), 'Trocar');
  }

  // Aplica a escolha: online é o servidor quem confere o Selo e grava (tx 'respec'); sem servidor vale a mesma regra localmente (core/specs.js).
  applySpec(id) {
    if (this.serverTx({ op: 'respec', id }, () => { this.player.spec = activeSpec(this.char); this.ui.toast('Especialização', specInfo(this.char.classId, id).name, 'gold'); })) return;
    const r = chooseSpec(this.char, id);
    if (!r.ok) return this.ui.log(r.reason, '#ffb4a8');
    this.player.spec = activeSpec(this.char);
    this.refreshStats();
    this.ui.toast('Especialização', specInfo(this.char.classId, id).name + (r.paid ? ' · -1 Selo' : '') + (r.shieldStored ? ' · escudo guardado na mochila' : ''), 'gold');
    this.ui.render();
    this.save();
  }

  // Compra do Selo de Reespecialização no Mestre de Classe (preço fixo em ouro; confirmação do próprio jogo).
  buySealAsk() {
    const c = this.char;
    if (c.gold < SEAL_PRICE) return this.ui.toast('Ouro insuficiente', `O Selo custa ${SEAL_PRICE.toLocaleString('pt-BR')} de ouro.`, '');
    this.ui.confirm(`Comprar 1 Selo de Reespecialização por ${SEAL_PRICE.toLocaleString('pt-BR')} de ouro?`, () => {
      if (this.serverTx({ op: 'respec_buy' }, () => this.ui.toast('Selo comprado', 'Use-o para trocar de especialização.', 'gold'))) return;
      const r = buySeal(this.char);
      if (!r.ok) return this.ui.log(r.reason, '#ffb4a8');
      this.ui.toast('Selo comprado', `-${r.price.toLocaleString('pt-BR')} ouro`, 'gold');
      this.ui.render();
      this.save();
    }, 'Comprar');
  }

  // arg: 'str', ou 'str:5' / 'str:max' (toque: botões +1, +5 e Máx; o Shift do teclado ainda dá +5)
  alloc(arg) {
    const c = this.char, [stat, q] = String(arg).split(':');
    if (c.statPoints <= 0 || !(stat in c.alloc)) return;
    const n = Math.min(c.statPoints, q === 'max' ? c.statPoints : q ? Number(q) || 1 : this.input.held('shift') ? 5 : 1);
    if (this.inNetZone() && this.serverTx({ op: 'alloc', stat, n: Math.max(1, Math.min(999, n)) })) return; // instância online: o servidor distribui os pontos
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
    if (this.inNetZone() && this.serverTx({ op: 'alloc_auto' })) return;
    const main = Math.ceil(pts * 0.7);
    c.alloc[prim] += main; c.alloc.vit += pts - main; c.statPoints = 0;
    this.refreshStats(); this.ui.render(); this.save();
    this.ui.log(`Pontos distribuídos: +${main} em ${prim === 'int' ? 'Inteligência' : prim === 'str' ? 'Força' : 'Agilidade'}, +${pts - main} em Vitalidade.`, '#cfe8ff');
  }

  evolveSpirit(id) {
    if (this.inNetZone()) return this.ui.toast('Na exploração online', 'Evoluir, comprar e libertar spirits só na Vila.', '');
    if (this.serverTx({ op: 'spirit_evolve', id }, (m) => { const S = SPIRITS[m.type]; this.ui.toast(`${S.name} evoluiu!`, 'Forma evoluída', 'gold'); this.ui.log(`${S.name} evoluiu para a forma 2 (−${m.cost} ouro).`, S.color); })) return; // online: o servidor cobra, evolui e conta o objetivo spiritStage
    const r = evolveSpirit(this.char, id);
    if (!r.ok) return this.ui.toast('Não dá para evoluir', r.reason, '');
    const sp = this.char.spirits.find((s) => s.id === id), S = SPIRITS[sp.type];
    const actor = this.world.actors.find((a) => a.kind === 'spirit' && a.owner === this.player.id && a.spiritType === sp.type);
    if (actor && this.char.activeSpirit === id) { actor.stats.power = spiritPower(sp); actor.stage = 2; }
    this.ui.toast(`${S.name} evoluiu!`, `Forma evoluída · poder ${spiritPower(sp)}`, 'gold');
    this.ui.log(`${S.name} evoluiu para a forma 2 (−${r.cost} ouro).`, S.color);
    this.gameEvent({ type: 'spiritStage', count: evolvedSpirits(this.char) });
    this.ui.render(); this.save();
  }

  // ---------------- lojas ----------------
  refreshShop() {
    const c = this.char;
    if (this.shopLevel === c.level && this.shopStock.length) return;
    this.shopLevel = c.level;
    // G2: estoque derivado de (personagem, nível, criação): recarregar a página não o refaz (core/../shop.js)
    this.shopStock = buildShopStock(c);
  }

  spend(cost) {
    if (this.char.gold < cost) { this.ui.log('Ouro insuficiente.', '#ffb4a8'); return false; }
    this.char.gold -= cost;
    return true;
  }

  buyScroll(n) {
    if ((this.char.scrolls ?? 0) + n > SCROLL_MAX) return this.ui.toast('Pergaminhos', `Você já carrega o máximo (${SCROLL_MAX}).`, ''); // B25: recusa antes de gastar
    if (this.serverTx({ op: 'buy_scroll', n, shop: this.shopKind() })) return;
    if (!this.spend((this.shopKind() === 'harbor' ? harborPrice('scroll', this.char.level) : PRICES.scroll(this.char.level)) * n)) return;
    this.char.scrolls = (this.char.scrolls ?? 0) + n;
    this.ui.render(); this.save();
  }

  // Amuleto da Fênix: preço fixo (core/phoenix.js), pilha até PHOENIX.max. Online o servidor cobra (tx buy_phoenix).
  buyPhoenix(n) {
    if ((this.char.phoenix ?? 0) + n > PHOENIX.max) return this.ui.toast(PHOENIX.name, `Você já carrega o máximo (${PHOENIX.max}).`, '');
    if (this.serverTx({ op: 'buy_phoenix', n, shop: this.shopKind() }, (m) => this.ui.toast(PHOENIX.name, `Você tem ${m.phoenix}. Evita a perda de ouro e XP ao cair.`, 'gold'))) return;
    if (!this.spend(PHOENIX.price * n)) return;
    this.char.phoenix = (this.char.phoenix ?? 0) + n;
    this.ui.toast(PHOENIX.name, `Você tem ${this.char.phoenix}. Ele guarda o seu eco: ao cair, nada de ouro nem XP se perde.`, 'gold');
    this.ui.render(); this.save();
  }

  // Pedra de Retorno: grava o ponto de renascimento da zona (online o servidor confere a zona e a proximidade).
  useCheckpoint(stone) {
    if (!stone || (this.mode !== 'explore' && !this.inNetZone()) || this.player?.dead) return;
    const done = () => this.ui.toast('Ponto de retorno salvo', 'A pedra guardou o seu eco. Se você cair neste mapa, renasce aqui.', 'gold');
    if (this.serverTx({ op: 'checkpoint_set', id: stone.id }, done)) return;
    if (this.inNetZone()) return;
    if (setCheckpoint(this.char, this.world.zoneId, stone.id)) { done(); this.save(); }
  }

  // Botão da tela de morte (offline): volta ao mapa na última Pedra de Retorno, ou na entrada se não houver.
  respawnAtPoint() {
    const d = this.deathPoint;
    this.ui.hideScreen();
    if (!d) return this.enterZone('town', TOWN.x, TOWN.y);
    this.deathPoint = null;
    this.enterZone(d.zone, d.x, d.y);
  }

  buyPotion(n) {
    if (this.serverTx({ op: 'buy_potion', n, shop: this.shopKind() })) return;
    if (!this.spend((this.shopKind() === 'harbor' ? harborPrice('potion', this.char.level) : PRICES.potion(this.char.level)) * n)) return;
    this.char.potions += n;
    this.ui.render();
    this.save();
  }

  buyItem(i) {
    const harbor = this.ui.shopAnchor === 'harbor', stock = harbor ? this.harborStock : this.shopStock, it = stock[i];
    if (!it) return;
    if (this.char.inventory.length >= INVENTORY_SIZE) return this.ui.log('Inventário cheio.', '#ffb4a8');
    if (this.serverTx({ op: 'buy_item', id: it.id, shop: harbor ? 'harbor' : 'town' }, (m) => this.ui.log(`Comprado: <b>${m.name}</b>`))) return;
    if (!this.spend(it.price ?? it.value * PRICES.itemMarkup)) return;
    stock.splice(i, 1);
    delete it.price; // só serve para exibir; o item guardado não leva o campo
    if (it.baseValue != null) { it.value = it.baseValue; delete it.baseValue; } // destaque: volta ao valor real (venda/ceiling)
    this.char.inventory.push(it);
    this.ui.log(`Comprado: <b style="color:${RARITY[it.rarity].color}">${it.name}</b>`);
    this.ui.render();
    this.save();
  }

  buyEssence(kind) {
    if (this.inNetZone()) return this.ui.toast('Na exploração online', 'Evoluir, comprar e libertar spirits só na Vila.', '');
    const c = this.char;
    if (c.spirits.length >= MAX_SPIRITS) return this.ui.log('Limite de spirits atingido. Liberte algum primeiro.', '#ffb4a8');
    if (this.serverTx({ op: 'buy_essence', kind: kind === 'prism' ? 'prism' : 'essence' }, (m) => { const S = SPIRITS[m.spirit], R = RARITY[m.rarity]; this.ui.toast(`Novo spirit: ${S.name}`, `${R.name} · ${S.element} · ${S.role}`, 'gold'); this.tip('spirit'); })) return; // online: o servidor sorteia
    const cost = kind === 'prism' ? PRICES.prism(c.level) : PRICES.essence(c.level);
    if (!this.spend(cost)) return;
    const rarity = kind === 'prism' ? this.rng.weighted([['rare', 70], ['epic', 25], ['legendary', 5]]) : undefined;
    this.gainSpirit(createSpirit(this.rng, { rarity, luck: 0.4, level: Math.max(1, c.level - 2) }));
    this.ui.render();
  }

  setSpirit(id) {
    if (this.serverTx({ op: 'spirit_set', id }, () => { this.spawnSpiritVisual(); })) return; // online: o servidor troca o spirit da instância e grava
    this.char.activeSpirit = id;
    this.spawnSpirit(this.player, this.char);
    this.ui.render();
    this.save();
  }

  freeSpirit(id) {
    if (this.inNetZone()) return this.ui.toast('Na exploração online', 'Evoluir, comprar e libertar spirits só na Vila.', '');
    const c = this.char, sp = c.spirits.find((s) => s.id === id);
    if (!sp) return;
    const gold = Math.round(30 * sp.level * SPIRIT_RARITY_MUL[sp.rarity]);
    this.ui.confirm(`Libertar ${SPIRITS[sp.type].name} (Nv ${sp.level})? Você recebe ${gold} de ouro.`, () => {
      if (!c.spirits.some((s) => s.id === id)) return;
      if (this.serverTx({ op: 'spirit_free', id }, (m) => { this.ui.log(`Spirit libertado (+${m.gold} ouro).`, '#ffd34d'); if (this.player) this.spawnSpirit(this.player, this.char); })) return; // online: o servidor paga
      c.spirits = c.spirits.filter((s) => s.id !== id);
      c.gold += gold;
      if (c.activeSpirit === id) { c.activeSpirit = c.spirits[0]?.id ?? null; this.spawnSpirit(this.player, c); }
      this.ui.render();
      this.save();
    }, 'Libertar');
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

  // Duelo amistoso do Porto (Duelista Kael): 1×1 contra rival de IA, sem Elo, sem ouro e sem XP de PvP. Online: fila `friendly` do servidor (a sala não grava nada).
  startFriendly() {
    if (this.online) {
      if (!this.net?.joined) return this.ui.toast('Servidor de partidas', 'Ainda conectando…', '');
      if (this.mode !== 'explore') return;
      this.net.queueFor('1v1', true);
      return this.ui.toast('Duelo amistoso', 'Procurando o duelista… sem Elo, ouro nem XP.', '');
    }
    this.startMatch('1v1', { friendly: true });
  }

  startMatch(mode, { friendly = false } = {}) {
    if (!MODES[mode]) return;
    if (!friendly && !pvpUnlocked(this.char)) { this.ui.log(`O PvP libera no nível ${PVP_MIN_LEVEL}.`, '#ffb4a8'); return; }
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
    this.match = { ...M, team1, team2, chars, myRating, friendly };
    this.rival = team2[0];
    this.rivalChar = chars.enemies[0];
    w.frozen = 3.2;
    this.duelGo = 0;
    const foePwr = Math.round(chars.enemies.reduce((s, r) => s + playerPower(r), 0) / size);
    this.ui.log(friendly ? `<b>Duelo amistoso</b> — seu poder ${playerPower(c)} · rival ${foePwr} · sem Elo, ouro nem XP` : `<b>${MODES[mode].label}</b> — seu poder ${playerPower(c)} · inimigos (média) ${foePwr} · rating ${myRating}`, '#ffb4a8');
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
    this.ui.banner(this.duelGo < 1 ? 'LUTE!' : `${Math.floor(M.score[1])}×${Math.floor(M.score[2])} · ${alive1.length}v${alive2.length} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    if (win) this.endMatch(win);
  }

  endMatch(winner) {
    if (this.mode !== 'pvp' || !this.match) return;
    this.mode = 'ended';
    const M = this.match, c = this.char, a = c.arena;
    const won = winner === 1, draw = winner === 3;
    const foes = M.chars.enemies;
    if (M.friendly) { // amistoso: nada de Elo, vitórias/derrotas, ouro, prêmio ou XP
      this.ui.banner(null);
      if (won) this.gameEvent({ type: 'friendlyDuel', won: true }); // só a missão `porto_duelo` e o contador; sem Elo
      this.ui.showResult({ title: won ? 'Vitória!' : draw ? 'Empate' : 'Derrota', sub: `Duelo amistoso · ${foes.map((r) => CLASSES[r.classId].name).join(', ')}`, lines: [`Pontos: ${Math.floor(M.score[1])} × ${Math.floor(M.score[2])}`, 'Amistoso: sem Elo, ouro nem XP.'], button: 'Voltar ao Porto', action: 'return-harbor', tone: won ? 'win' : 'lose' });
      return;
    }
    const foeRating = Math.round(foes.reduce((s, r) => s + r.arena.rating, 0) / foes.length);
    const oldTier = tierFor(M.myRating);
    const delta = draw ? 0 : eloDelta(M.myRating, foeRating, won);
    setRating(c, M.mode, Math.max(0, M.myRating + delta));
    if (won) a.wins++; else if (!draw) a.losses++;
    const mul = 1 + (M.size - 1) * 0.2; // times maiores pagam um pouco mais
    const gold = Math.round((won ? 40 + c.level * 8 : draw ? 20 + c.level * 4 : 10 + c.level * 2) * mul);
    c.gold += gold;
    const lines = [`Rating ${MODES[M.mode].label}: ${getRating(c, M.mode)} (${delta >= 0 ? '+' : ''}${delta})`, `Pontos: ${Math.floor(M.score[1])} × ${Math.floor(M.score[2])}`, `+${gold} ouro`];
    const newTier = tierFor(getRating(c, M.mode));
    if (newTier.name !== oldTier.name) lines.push(`Nova liga: <b style="color:${newTier.color}">${newTier.name}</b>`);
    if (won && this.rng.chance(0.35)) {
      const it = generateItem(this.rng, c.level, { classId: c.classId, luck: 1.2 });
      if (c.inventory.length < INVENTORY_SIZE) {
        c.inventory.push(it);
        lines.push(`Prêmio: <b style="color:${RARITY[it.rarity].color}">${it.name}</b>`);
      } else { c.gold += it.value; lines.push(`Prêmio convertido em ${it.value} ouro (inventário cheio)`); }
    }
    // arena não dá XP (decisão do dono, 2026-11-04): só rating, ouro e prêmio
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
      this.world.heal(this.player, this.player.maxHp * WAVES.solo.restHeal);
      this.ui.toast(`Onda ${W.n} vencida!`, `+${reward} ouro · +${Math.round(WAVES.solo.restHeal * 100)}% de vida`, 'gold');
    } else {
      W.t -= dt;
      this.ui.banner(`Próxima onda em ${Math.max(1, Math.ceil(W.t))}…`);
      if (W.t <= 0) this.spawnWave(++W.n);
    }
  }

  spawnWave(n) {
    const w = this.world, c = this.char, p = this.player;
    this.waves.state = 'fight';
    // composição das ondas vem de core/economy.js (medida com tools/waves-check.mjs)
    const spec = soloWaveSpec(n, { level: c.level }, this.rng);
    for (const f of spec.mobs) {
      const ang = this.rng.next() * Math.PI * 2;
      const m = w.add(makeMobActor(f.id, f.level, 550 + Math.cos(ang) * 430, 550 + Math.sin(ang) * 430, { elite: f.elite }));
      m.ai.target = p.id;
      m.ai.state = 'chase';
      w.burst(m.x, m.y, '#b48cff', 16, 160);
    }
  }

  // Texto da perda de morte (tela de morte e HUD): r = { saved, gold, xp }
  deathLine(r, left) {
    if (r.saved) return `<b>${PHOENIX.name} usado</b>: nada foi perdido (restam ${left}).`;
    return r.gold || r.xp ? `Você perdeu <b>${r.gold}</b> ouro e <b>${r.xp}</b> XP.` : 'Nada foi perdido.';
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
      this.ui.showResult({ title: 'Fim do desafio', lines: [`Ondas vencidas: <b>${cleared}</b>`, `Recorde: ${c.arena.bestWave}`, `Ouro ganho: ${W.gold} ouro`], tone: 'lose' });
      this.save();
      return;
    }
    const zid = this.world.zoneId, z = this.world.zone;
    if (hasDeathPenalty(zid) && !(c.phoenix > 0)) this.autoTip('phoenix'); // 1ª queda em zona de farm sem Amuleto: o aviso sai depois, já em exploração
    const r = hasDeathPenalty(zid) ? applyDeath(c) : { saved: false, gold: 0, xp: 0 }; // Amuleto da Fênix evita a perda; sem ele, −10% do ouro e do XP do nível
    this.mode = 'ended';
    const at = respawnPoint(c, zid, z.spawn ?? { x: FARM_ENTRY, y: FARM_MID });
    this.deathPoint = hasDeathPenalty(zid) ? { zone: zid, x: at.x, y: at.y } : null;
    const lines = [this.deathLine(r, c.phoenix ?? 0), at.saved ? 'Você renasce na Pedra de Retorno.' : 'Você renasce na entrada do mapa.'];
    this.ui.showResult({ title: 'Você caiu…', sub: z.name, lines, button: at.saved ? 'Renascer no ponto salvo' : 'Renascer na entrada', action: this.deathPoint ? 'respawn-point' : 'return-town', tone: 'lose' });
    this.ui.log(r.saved ? `${PHOENIX.name} usado.` : r.gold || r.xp ? `Você perdeu ${r.gold} ouro e ${r.xp} XP.` : 'Você caiu.', r.saved ? '#ffd27a' : '#ffb4a8');
    this.save();
  }
}

window.game = new Game();
