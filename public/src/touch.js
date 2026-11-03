// Controles de toque: joystick dinâmico à esquerda; ataque, 3 habilidades, poção, voltar à vila e interagir à direita.
// Mira automática no inimigo mais próximo; arrastar um botão de skill mira na mão. Usa Pointer Events (multi-toque).
import { CLASSES } from './data/classes.js';
import { SKILLS } from './data/skills.js';
import { isSkillUnlocked, skillUnlockLevel, skillIdAt } from './core/unlocks.js';
import { skillOf } from './core/specs.js';
import { skillImg, attackImg, iconImg, POTION_ICON, skillCategory, CATEGORIES } from './render/skill-icons.js';
import { asset } from './assets-version.js';
import { stickVector, pickAim, aimModeFor, dragAim, interactTarget } from './touch-logic.js';

const $ = (id) => document.getElementById(id);

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.mode = 'auto'; // auto | touch | keyboard
    this.active = false;
    this.move = { x: 0, y: 0, mag: 0 };
    this.attack = false;
    this.castQueue = [];
    this.stickId = null;
    this.origin = null;
    this.btns = new Map();
    this.coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.root = $('touch');
    this.build();
    this.refresh();
  }

  get scale() { return this.game.uiScale ?? 1; }

  setMode(mode) { this.mode = mode; this.refresh(); }

  refresh() {
    // Jogo pensado para CELULAR: toque é o padrão em qualquer tela (no PC os botões respondem ao mouse); teclado e mouse só se escolhido nas opções.
    // Exceção de teste: navegador automatizado SEM toque emulado (Playwright) usa teclado, para os testes de teclado seguirem valendo.
    const robot = typeof navigator !== 'undefined' && navigator.webdriver === true && !this.coarse;
    this.active = this.mode === 'touch' || (this.mode === 'auto' && !robot);
    document.body.classList.toggle('touch', this.active);
    if (!this.active) this.reset();
  }

  reset() {
    this.move = { x: 0, y: 0, mag: 0 };
    this.attack = false;
    this.castQueue.length = 0;
    this.stickId = null;
    $('stick')?.classList.add('hidden');
    $('aim-arrow')?.classList.add('hidden');
  }

  build() {
    this.root.innerHTML = `
      <div id="stick-zone"></div>
      <div id="stick" class="hidden"><i id="stick-knob"></i></div>
      <i id="aim-arrow" class="hidden"></i>
      <div id="tbtns">
        <div class="tbtn slot atk" data-t="attack"><span class="icon" id="t-atk-icon">⚔️</span><div class="cd"></div></div>
        <div class="tbtn slot sk sk0" data-t="skill" data-i="0"><span class="icon"></span><div class="cd"></div><span class="cdt"></span></div>
        <div class="tbtn slot sk sk1" data-t="skill" data-i="1"><span class="icon"></span><div class="cd"></div><span class="cdt"></span></div>
        <div class="tbtn slot sk sk2" data-t="skill" data-i="2"><span class="icon"></span><div class="cd"></div><span class="cdt"></span></div>
        <div class="tbtn slot sk sk3" data-t="skill" data-i="3"><span class="icon"></span><div class="cd"></div><span class="cdt"></span></div>
        <div class="tbtn slot pot" data-t="potion"><span class="icon">🧪</span><span class="count"></span><div class="cd"></div></div>
        <div class="tbtn slot act hidden" data-t="interact"><span class="icon"></span></div>
      </div>`;

    const zone = $('stick-zone'), knob = $('stick-knob');
    zone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      this.stickId = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      const s = $('stick');
      s.style.left = e.clientX + 'px'; s.style.top = e.clientY + 'px';
      s.classList.remove('hidden');
      knob.style.transform = 'translate(0px, 0px)';
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      const ui = this.scale;
      const v = stickVector((e.clientX - this.origin.x) / ui, (e.clientY - this.origin.y) / ui);
      this.move = { x: v.x, y: v.y, mag: v.mag };
      knob.style.transform = `translate(${v.knobX}px, ${v.knobY}px)`;
    });
    const endStick = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.move = { x: 0, y: 0, mag: 0 };
      $('stick').classList.add('hidden');
    };
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);

    const tb = $('tbtns'), arrow = $('aim-arrow');
    tb.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.tbtn');
      if (!b || b.classList.contains('hidden')) return;
      e.preventDefault();
      if (b.classList.contains('locked')) return; // habilidade ainda não aprendida: o botão não responde
      b.setPointerCapture(e.pointerId);
      b.classList.add('down');
      this.btns.set(e.pointerId, { b, t: b.dataset.t, i: Number(b.dataset.i ?? 0), sx: e.clientX, sy: e.clientY, aim: null });
      if (b.dataset.t === 'attack') this.attack = true;
    });
    tb.addEventListener('pointermove', (e) => {
      const st = this.btns.get(e.pointerId);
      if (!st || st.t !== 'skill') return;
      const ui = this.scale;
      st.aim = dragAim((e.clientX - st.sx) / ui, (e.clientY - st.sy) / ui);
      if (st.aim) {
        const r = st.b.getBoundingClientRect();
        arrow.style.left = r.left + r.width / 2 + 'px'; arrow.style.top = r.top + r.height / 2 + 'px';
        arrow.style.transform = `rotate(${Math.atan2(st.aim.y, st.aim.x)}rad) scale(${ui})`;
        arrow.classList.remove('hidden');
      } else arrow.classList.add('hidden');
    });
    const release = (e, fire) => {
      const st = this.btns.get(e.pointerId);
      if (!st) return;
      this.btns.delete(e.pointerId);
      st.b.classList.remove('down');
      arrow.classList.add('hidden');
      if (st.t === 'attack') { this.attack = false; return; }
      if (!fire) return;
      const g = this.game;
      if (st.t === 'skill') this.castQueue.push({ i: st.i, aim: st.aim });
      else if (st.t === 'potion') g.usePotion();
      else if (st.t === 'interact') g.interact();
    };
    tb.addEventListener('pointerup', (e) => release(e, true));
    tb.addEventListener('pointercancel', (e) => release(e, false));
    // Sem menu de contexto (toque longo) nem seleção sobre os controles.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Ícones dependem da classe escolhida.
  setup(char) {
    const cls = CLASSES[char.classId];
    $('t-atk-icon').innerHTML = attackImg(char.classId, cls.icon);
    [...cls.skills, cls.mastery].forEach((s, i) => { // o 4º é a habilidade de Maestria
      const b = this.root.querySelector(`.sk${i}`), c = skillCategory(skillOf(char.classId, null, s));
      b.querySelector('.icon').innerHTML = skillImg(s, SKILLS[s].icon);
      b.querySelector('.cat')?.remove(); b.insertAdjacentHTML('beforeend', `<i class="cat cat-${c}" title="${CATEGORIES[c]}"></i>`);
    });
    this.root.querySelector('.pot .icon').innerHTML = iconImg(POTION_ICON, '🧪');
  }

  // Intenção do jogador a partir do toque (mesmo formato do teclado/mouse).
  read(player, world) {
    const enemies = world.enemiesOf(player);
    const q = this.castQueue.shift();
    let cast = null, aim;
    if (q) {
      const skill = skillOf(player.classId, player.spec, skillIdAt(player.classId, q.i));
      cast = q.i;
      aim = pickAim({ player, enemies, move: this.move, override: q.aim, mode: aimModeFor(skill), reach: skill.dist ?? 260 });
    } else aim = pickAim({ player, enemies, move: this.move });
    return { mx: this.move.x, my: this.move.y, spd: this.move.mag ? 0.4 + 0.6 * this.move.mag : 1, aimX: aim.x, aimY: aim.y, attack: this.attack, cast };
  }

  // Chamado a cada quadro: visibilidade, recargas e botão de interagir.
  update(game) {
    const show = this.active && game.player && !game.ui.screen.classList.contains('visible') && !game.ui.anyOpen() && game.mode !== 'title';
    this.root.classList.toggle('hidden', !show);
    if (!show) { if (this.attack || this.stickId !== null) this.reset(); return; }
    const p = game.player, cls = CLASSES[p.classId];
    const cdOf = [p.cds.s0, p.cds.s1, p.cds.s2, p.cds.s3 ?? 0];
    const setCd = (el, cd, max, text) => {
      el.style.setProperty('--p', cd > 0 ? Math.min(1, cd / max).toFixed(3) : '0');
      const t = el.querySelector('.cdt');
      if (t) t.textContent = text && cd > 0 ? cd.toFixed(cd < 1 ? 1 : 0) : '';
    };
    const blocked = p.stunT > 0 || p.dead; // sem a investida (dash): durava ~0,3 s e parecia erro (V19)
    [...cls.skills, cls.mastery].forEach((s, i) => {
      const b = this.root.querySelector(`.sk${i}`), lk = !isSkillUnlocked(p, i), sk = skillOf(p.classId, p.spec, s);
      setCd(b, lk ? 0 : cdOf[i], sk.cd, true);
      b.classList.toggle('blocked', blocked && !lk && !sk.castStunned); // a Intervenção Divina rompe o atordoamento
      b.classList.toggle('locked', lk); // cadeado + "Nv N" (ver style.css); a Maestria mostra "Nv 25" e, passado o nível, "Maestria" (falta a missão)
      if (lk) b.style.setProperty('--lv', i === 3 && p.level >= skillUnlockLevel(3) ? '"25\\A Maestria"' : `"${skillUnlockLevel(i)}"`);
    });
    setCd(this.root.querySelector('.atk'), p.cds.basic, cls.basic.cd / p.stats.atkSpeed, false);
    const pot = this.root.querySelector('.pot');
    setCd(pot, game.potionCd, 8, false);
    pot.querySelector('.count').textContent = String(game.char.potions);
    pot.classList.toggle('empty', !game.char.potions || game.mode === 'pvp');
    // botão contextual: balão pintado para NPC, baú pintado para baú
    let tg = game.mode === 'explore' || game.inNetZone?.() ? interactTarget(p, game.world) : null;
    if (tg && game.mode !== 'explore' && tg.kind !== 'chest') tg = null; // na instância online só o baú (o servidor abre)
    const act = this.root.querySelector('.act');
    act.classList.toggle('hidden', !tg);
    if (tg && act.dataset.kind !== tg.kind) {
      act.dataset.kind = tg.kind;
      act.querySelector('.icon').innerHTML = tg.kind === 'chest'
        ? `<img class="art" src="${asset('assets/icons/item/res-chest.webp')}" alt="🧰" draggable="false" onerror="this.replaceWith(this.alt)">`
        : tg.kind === 'lore'
          ? `<img class="art" src="${asset('assets/icons/item/res-scroll.webp')}" alt="📜" draggable="false" onerror="this.replaceWith(this.alt)">`
          :`<img class="art" src="${asset('assets/icons/menu/menu-journal.webp')}" alt="Conversar" draggable="false">`; // pergaminho pintado (V6): sem emoji nem disco chapado
    }
  }
}
