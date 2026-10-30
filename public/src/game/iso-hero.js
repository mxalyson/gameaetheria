// Herói do Vale isométrico (sem DOM): movimento com colisão, ataque básico e habilidade.
// Reaproveita as regras reais do jogo: dados da classe, stats, dano (core/combat) e skills.
// Escala: 1 tile do Vale = 64 px do jogo atual (herói r=15px, moveSpeed 200px/s).
import { CLASSES } from '../data/classes.js';
import { SKILLS } from '../data/skills.js';
import { computeStats } from '../core/stats.js';
import { computeHit } from '../core/combat.js';
import { makeRng } from '../core/rng.js';

export const PX_PER_TILE = 64;
export const HERO_R = 0.22;
const ACTIONS = { attack: { dur: 0.36, hitAt: 0.14, slow: 0.35 }, skill: { dur: 0.7, hitAt: 0.3, slow: 0.5 } };
const TAU = Math.PI * 2;

const norm = (x, y) => { const len = Math.hypot(x, y); return len > 1e-6 ? { x: x / len, y: y / len, len } : { x: 0, y: 0, len: 0 }; };
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

export class IsoHero {
  constructor(char, x, y, { seed = 1 } = {}) {
    this.char = char;
    this.cls = CLASSES[char.classId];
    this.skillId = this.cls.skills[0];
    this.stats = computeStats(char);
    this.x = x; this.y = y; this.z = 0; this.gz = 0;
    this.fx = 1; this.fy = 1; this.flip = 1;
    this.state = 'idle'; this.stateT = 0; this.walkT = 0;
    this.cds = { basic: 0, skill: 0 };
    this.hitDone = false;
    this.rng = makeRng(seed);
  }

  get progress() { const a = ACTIONS[this.state]; return a ? Math.min(1, this.stateT / a.dur) : 0; }
  get cooldownMax() { return { basic: this.cls.basic.cd / this.stats.atkSpeed, skill: SKILLS[this.skillId].cd }; }

  // intent: { mx, my (direção no mundo), aimX, aimY, attack (segurado), skill (pressionado) }
  // terrain: { heightAt(x, y) -> z | null, blocked(x, y, r) -> bool }
  update(dt, intent, terrain, targets = []) {
    const events = [];
    for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);

    if (this.state === 'idle' || this.state === 'walk') {
      if (intent.skill && this.cds.skill <= 0) this.begin('skill', intent, events);
      else if (intent.attack && this.cds.basic <= 0) this.begin('attack', intent, events);
    }

    const act = ACTIONS[this.state];
    const dir = norm(intent.mx ?? 0, intent.my ?? 0);
    if (dir.len > 0) {
      const step = (this.stats.moveSpeed / PX_PER_TILE) * (act?.slow ?? 1) * dt;
      this.tryMove(this.x + dir.x * step, this.y, terrain);
      this.tryMove(this.x, this.y + dir.y * step, terrain);
      if (!act) { this.fx = dir.x; this.fy = dir.y; this.walkT += dt; }
    }
    this.z += (this.gz - this.z) * Math.min(1, dt * 10);

    if (act) {
      this.stateT += dt;
      if (!this.hitDone && this.stateT >= act.hitAt) { this.hitDone = true; this.resolveHit(this.state, targets, events); }
      if (this.stateT >= act.dur) { this.state = 'idle'; this.stateT = 0; }
    }
    if (!ACTIONS[this.state]) this.state = dir.len > 0 ? 'walk' : 'idle';
    const sdx = this.fx - this.fy;
    if (Math.abs(sdx) > 0.1) this.flip = sdx < 0 ? -1 : 1;
    return events;
  }

  begin(kind, intent, events) {
    const aim = norm(intent.aimX - this.x, intent.aimY - this.y);
    if (aim.len > 0) { this.fx = aim.x; this.fy = aim.y; }
    this.state = kind; this.stateT = 0; this.hitDone = false;
    this.cds[kind === 'skill' ? 'skill' : 'basic'] = this.cooldownMax[kind === 'skill' ? 'skill' : 'basic'];
    events.push({ type: 'swing', kind });
  }

  tryMove(nx, ny, terrain) {
    const h = terrain.heightAt(nx, ny);
    if (h == null || Math.abs(h - this.gz) > 1) return false;
    if (terrain.blocked(nx, ny, HERO_R)) return false;
    this.x = nx; this.y = ny; this.gz = h;
    return true;
  }

  resolveHit(kind, targets, events) {
    const s = kind === 'skill' ? SKILLS[this.skillId] : this.cls.basic;
    const range = (kind === 'skill' ? s.radius : s.range) / PX_PER_TILE;
    const facing = Math.atan2(this.fy, this.fx);
    for (const t of targets) {
      if (t.dead) continue;
      const dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy), tr = t.r ?? 0;
      if (d > range + tr) continue;
      if (kind === 'attack' && d > tr && Math.abs(angDiff(Math.atan2(dy, dx), facing)) > s.arc / 2) continue;
      const res = computeHit(this.rng, this.stats, t, s.mult);
      events.push({ type: 'hit', kind, target: t, amount: res.amount, crit: res.crit });
    }
  }
}
