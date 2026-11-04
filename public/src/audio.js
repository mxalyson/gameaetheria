// Áudio (2026-11-04): efeitos por WebAudio e música em streaming, tudo com licença CC0 (créditos em docs/CREDITOS.md).
// A simulação não sabe que o áudio existe: este módulo só LÊ os eventos que o jogo já recebe (offline: world.events; online: snapshots) e o
// estado da tela (zona, chefe vivo, partida). Volumes de música e efeitos ficam nas Opções (prefs.js); 0 desliga.
// Navegadores só liberam som depois de um toque/tecla: o contexto é criado/retomado no primeiro gesto.
import { asset } from './assets-version.js';

const SFX_DIR = 'assets/audio/sfx/', MUSIC_DIR = 'assets/audio/music/';
// nome lógico → variações (sorteia uma) e volume base
export const SFX = {
  blade: { files: ['blade1', 'blade2', 'blade3'], vol: 0.5 },
  bow: { files: ['whoosh1', 'whoosh2', 'whoosh3'], vol: 0.45 },
  magic: { files: ['spell1'], vol: 0.3 },
  hit: { files: ['slice1', 'slice2'], vol: 0.35 },
  crit: { files: ['chop'], vol: 0.6 },
  hurt: { files: ['hurt1', 'hurt2'], vol: 0.5 },
  block: { files: ['metal1', 'metal2'], vol: 0.55 },
  die: { files: ['die1'], vol: 0.55 },
  roar: { files: ['roar1', 'roar2', 'roar3'], vol: 0.8 },
  cast: { files: ['spell2'], vol: 0.45 },
  fire: { files: ['fire1', 'fire2', 'fire3'], vol: 0.5 },
  holy: { files: ['gem2'], vol: 0.45 },
  heal: { files: ['gem1'], vol: 0.35 },
  levelup: { files: ['gem4'], vol: 0.7 },
  coins: { files: ['coins1', 'coins2'], vol: 0.5 },
  loot: { files: ['item1'], vol: 0.5 },
  chest: { files: ['lock1'], vol: 0.6 },
  open: { files: ['book_open'], vol: 0.35 },
  close: { files: ['book_close'], vol: 0.3 },
  flip: { files: ['book_flip'], vol: 0.3 },
  equip: { files: ['cloth'], vol: 0.45 },
};
export const MUSIC = { town: 'town', explore: 'explore', battle: 'battle' };

const FIRE = /fire|meteor|flame|ember|inferno|burn|pyro|grenade|comet/i;
const HOLY = /holy|light|divine|judg|sanct|interv|celest|word|ward|shield|aura|bless/i;
export const HEAR_RANGE = 900; // px do mundo: mais longe que isso não se ouve
const MIN_GAP = { hit: 0.06, hurt: 0.12, blade: 0.05, bow: 0.05, magic: 0.05, die: 0.08, coins: 0.08, block: 0.1 }; // s entre repetições do mesmo som

// Som de um evento da simulação (formato do World: { type, actor, src, target, crit, skill, ... }) do ponto de vista do jogador `me`.
// Devolve { id, at } (at = ator cuja distância atenua o volume) ou null. Pura: testada em Node.
export function soundFor(ev, me) {
  switch (ev.type) {
    case 'swing': {
      const a = ev.actor; if (!a || a.kind === 'mob' || a.kind === 'spirit') return null;
      return { id: a.classId === 'archer' ? 'bow' : a.classId === 'mage' ? 'magic' : 'blade', at: a };
    }
    case 'hit': {
      const t = ev.target; if (!t) return null;
      if (t === me) return { id: ev.blocked ? 'block' : 'hurt', at: t };
      if (ev.blocked) return { id: 'block', at: t };
      return { id: ev.crit ? 'crit' : 'hit', at: t };
    }
    case 'cast': {
      const s = String(ev.skill ?? '');
      return { id: FIRE.test(s) ? 'fire' : HOLY.test(s) ? 'holy' : 'cast', at: ev.actor };
    }
    case 'heal': return ev.actor === me && ev.amount >= 5 ? { id: 'heal', at: me } : null;
    case 'death': return ev.actor && ev.actor !== me && ev.actor.kind === 'mob' ? { id: 'die', at: ev.actor } : null;
    case 'boss_warn': return { id: 'roar', at: null };
    case 'phase': return { id: 'roar', at: ev.actor };
    default: return null;
  }
}

// Qual música toca agora: batalha com chefe vivo por perto ou em partida (arena/ondas/cooperativo/Cripta), Vila nas cidades, exploração no resto.
export function musicFor({ mode, zone, bossNear }) {
  if (mode === 'title') return 'town';
  if (mode === 'pvp' || mode === 'waves' || bossNear) return 'battle';
  if (zone?.dungeon) return 'battle';
  if (zone?.safe || zone?.hub) return 'town';
  return 'explore';
}

export class AudioEngine {
  constructor({ musicVol = 0.5, sfxVol = 0.8 } = {}) {
    this.musicVol = musicVol; this.sfxVol = sfxVol;
    this.ctx = null; this.buf = new Map(); this.loading = new Map(); this.last = new Map(); this.voices = 0;
    this.track = null; this.el = {}; this.want = null;
    const unlock = () => this.unlock();
    for (const t of ['pointerdown', 'keydown', 'touchend']) addEventListener(t, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (!this.ctx) return; if (document.hidden) this.ctx.suspend?.(); else this.ctx.resume?.(); });
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC();
      this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.ctx.destination);
      this.applyVolumes();
      for (const id of ['blade', 'bow', 'magic', 'hit', 'hurt', 'cast', 'open', 'close']) this.load(id); // os mais comuns já ficam prontos
    }
    if (this.ctx.state === 'suspended') this.ctx.resume?.();
    if (this.want) this.setMusic(this.want, true);
  }
  setVolumes(musicVol, sfxVol) { this.musicVol = musicVol; this.sfxVol = sfxVol; this.applyVolumes(); }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxGain.gain.setTargetAtTime(this.sfxVol, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.musicVol * 0.55, t, 0.2); // música sempre abaixo dos efeitos
    if (this.musicVol <= 0) this.stopMusic(); else if (this.want && !this.track) this.setMusic(this.want, true);
  }
  load(id) {
    const def = SFX[id]; if (!def || !this.ctx) return;
    for (const f of def.files) {
      if (this.buf.has(f) || this.loading.has(f)) continue;
      this.loading.set(f, fetch(asset(SFX_DIR + f + '.mp3')).then((r) => r.arrayBuffer()).then((a) => new Promise((res, rej) => this.ctx.decodeAudioData(a, res, rej)))
        .then((b) => { this.buf.set(f, b); }).catch(() => { /* sem o arquivo: fica em silêncio */ }).finally(() => this.loading.delete(f)));
    }
  }
  // Toca um efeito. `dist` (px até o jogador) atenua; longe demais não toca. Sem repetição dentro de MIN_GAP e no máximo 12 vozes.
  play(id, { dist = 0, rate = 1 } = {}) {
    const def = SFX[id]; if (!def || !this.ctx || this.sfxVol <= 0 || dist > HEAR_RANGE || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime, gap = MIN_GAP[id] ?? 0.03;
    if (now - (this.last.get(id) ?? -1) < gap || this.voices >= 12) return false;
    const f = def.files[Math.floor(Math.random() * def.files.length)], b = this.buf.get(f);
    if (!b) { this.load(id); return false; }
    this.last.set(id, now);
    const src = this.ctx.createBufferSource(); src.buffer = b;
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12); // variação leve: golpes repetidos não soam idênticos
    const g = this.ctx.createGain(); g.gain.value = def.vol * Math.max(0, 1 - dist / HEAR_RANGE) ** 1.5;
    src.connect(g); g.connect(this.sfxGain);
    this.voices++; src.onended = () => { this.voices--; };
    src.start();
    return true;
  }
  // Evento da simulação → som (com distância até o jogador).
  event(ev, me) {
    const s = soundFor(ev, me); if (!s) return;
    const at = s.at, dist = at && me ? Math.hypot(at.x - me.x, at.y - me.y) : 0;
    this.play(s.id, { dist });
  }
  // Música: um elemento <audio> por faixa (streaming, pouca memória), ligado ao ganho do WebAudio (no iPhone o volume do elemento não muda).
  setMusic(name, force = false) {
    this.want = name;
    if (!this.ctx || this.musicVol <= 0 || (!force && this.track === name)) return;
    if (this.track === name && this.el[name] && !this.el[name].paused) return;
    const old = this.track && this.el[this.track];
    this.track = name;
    let el = this.el[name];
    if (!el) {
      el = this.el[name] = new Audio(asset(MUSIC_DIR + MUSIC[name] + '.mp3'));
      el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
      el.fade = this.ctx.createGain(); el.fade.gain.value = 0;
      this.ctx.createMediaElementSource(el).connect(el.fade); el.fade.connect(this.musicGain);
    }
    const t = this.ctx.currentTime;
    if (old && old !== el) { old.fade.gain.setTargetAtTime(0, t, 0.6); setTimeout(() => { if (this.el[this.track] !== old) old.pause(); }, 2500); } // troca suave (~2 s)
    el.fade.gain.setTargetAtTime(1, t, 0.8);
    el.play?.().catch(() => { /* bloqueado até o próximo toque: unlock() tenta de novo */ this.track = null; });
  }
  stopMusic() { for (const el of Object.values(this.el)) { el.fade.gain.value = 0; el.pause(); } this.track = null; }
}
