// Controles de toque: joystick dinâmico à esquerda; ataque, 3 habilidades, poção, voltar à vila e interagir à direita.
// Mira automática no inimigo mais próximo; arrastar um botão de skill mira na mão. Usa Pointer Events (multi-toque).
import { CLASSES } from './data/classes.js';
import { SKILLS } from './data/skills.js';
import { isSkillUnlocked, skillUnlockLevel, skillIdAt, kitIds } from './core/unlocks.js';
import { skillOf, basicOf } from './core/specs.js';
import { skillImg, attackImg, iconImg, POTION_ICON, skillCategory, CATEGORIES } from './render/skill-icons.js';
import { asset } from './assets-version.js';
import { stickVector, pickAim, aimModeFor, dragAim, interactTarget, isHold, HOLD_MS, skillLayout } from './touch-logic.js';

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

  // Posição e tamanho de cada botão vêm de skillLayout (touch-logic.js): variáveis CSS por botão, nenhum par se sobrepõe
  applyLayout() {
    const L = skillLayout(innerWidth, innerHeight, this.scale), map = { atk: '.atk', s0: '.sk0', s1: '.sk1', s2: '.sk2', s3: '.sk3', pot: '.pot', act: '.act' };
    for (const [k, sel] of Object.entries(map)) {
      const el = this.root.querySelector(sel), it = L.items[k];
      if (!el || k === 'atk') continue;
      el.style.setProperty('--cx', String(it.x)); el.style.setProperty('--cy', String(it.y)); el.style.setProperty('--d', String(it.d));
    }
  }

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
    for (const st of this.btns.values()) clearTimeout(st.timer);
    this.game?.ui?.hideSkillCard?.();
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

    this.applyLayout();
    addEventListener('resize', () => this.applyLayout());
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
      const locked = b.classList.contains('locked'); // habilidade ainda não aprendida: não conjura, mas segurar explica o que ela fará
      b.setPointerCapture(e.pointerId);
      const st = { b, t: b.dataset.t, i: Number(b.dataset.i ?? 0), sx: e.clientX, sy: e.clientY, aim: null, locked, held: false, at: performance.now(), moved: 0, timer: 0 };
      if (locked && st.t !== 'skill') return;
      b.classList.add('down');
      this.btns.set(e.pointerId, st);
      if (st.t === 'skill') st.timer = setTimeout(() => { // segurar parado: abre o cartão e a soltura não conjura
        if (this.btns.get(e.pointerId) !== st || !isHold(performance.now() - st.at, st.moved)) return;
        st.held = true; arrow.classList.add('hidden');
        this.game.ui?.showSkillCard(st.i);
      }, HOLD_MS);
      if (b.dataset.t === 'attack') this.attack = true;
    });
    tb.addEventListener('pointermove', (e) => {
      const st = this.btns.get(e.pointerId);
      if (!st || st.t !== 'skill') return;
      const ui = this.scale;
      st.moved = Math.hypot((e.clientX - st.sx) / ui, (e.clientY - st.sy) / ui);
      if (st.held || st.locked) return;
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
      clearTimeout(st.timer);
      st.b.classList.remove('down');
      arrow.classList.add('hidden');
      this.game.ui?.hideSkillCard(); // sempre: no iOS o toque longo pode terminar em pointercancel/ponteiro perdido e o cartão ficava preso
      if (st.t === 'attack') { this.attack = false; return; }
      if (!fire || st.held || st.locked) return; // segurou para ler (ou está bloqueada): soltar não conjura
      const g = this.game;
      if (st.t === 'skill') this.castQueue.push({ i: st.i, aim: st.aim });
      else if (st.t === 'potion') g.usePotion();
      else if (st.t === 'interact') g.interact();
    };
    tb.addEventListener('pointerup', (e) => release(e, true));
    tb.addEventListener('pointercancel', (e) => release(e, false));
    tb.addEventListener('lostpointercapture', (e) => release(e, false));
    // Rede de segurança: qualquer fim de toque, perda de foco ou aba oculta fecha o cartão de explicação (e o balão) se não restar botão de skill pressionado.
    const noHold = () => { if (![...this.btns.values()].some((b) => b.held)) { this.game.ui?.hideSkillCard(); this.game.ui?.hideTooltip?.(); } };
    for (const ev of ['pointerup', 'pointercancel', 'touchend', 'touchcancel']) window.addEventListener(ev, noHold, true);
    window.addEventListener('blur', () => { for (const [id, st] of [...this.btns]) release({ pointerId: id }, false); noHold(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { for (const [id] of [...this.btns]) release({ pointerId: id }, false); noHold(); } });
    // Sem menu de contexto (toque longo) nem seleção sobre os controles.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Ícones dependem da classe escolhida.
  setup(char) {
    const cls = CLASSES[char.classId];
    $('t-atk-icon').innerHTML = attackImg(char.classId, cls.icon);
    this.kitSig = char.classId + ':' + (char.level >= 15 ? char.spec ?? '' : '');
    kitIds(char).forEach((s, i) => { // o 4º é a habilidade de Maestria; com especialização (nível 15+) vem do kit dela
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
      const skill = skillOf(player.classId, player.spec, skillIdAt(player.classId, q.i, player.spec));
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
    if (this.kitSig !== p.classId + ':' + (p.level >= 15 ? p.spec ?? '' : '')) this.setup({ classId: p.classId, level: p.level, spec: p.spec }); // escolheu/trocou a especialização: ícones do novo kit
    const cdOf = [p.cds.s0, p.cds.s1, p.cds.s2, p.cds.s3 ?? 0];
    const setCd = (el, cd, max, text) => {
      el.style.setProperty('--p', cd > 0 ? Math.min(1, cd / max).toFixed(3) : '0');
      const t = el.querySelector('.cdt');
      if (t) t.textContent = text && cd > 0 ? cd.toFixed(cd < 1 ? 1 : 0) : '';
    };
    const blocked = p.stunT > 0 || p.dead; // sem a investida (dash): durava ~0,3 s e parecia erro (V19)
    kitIds(p).forEach((s, i) => {
      const b = this.root.querySelector(`.sk${i}`), lk = !isSkillUnlocked(p, i), sk = skillOf(p.classId, p.spec, s);
      setCd(b, lk ? 0 : cdOf[i], sk.cd, true);
      b.classList.toggle('blocked', blocked && !lk && !sk.castStunned); // a Intervenção Divina rompe o atordoamento
      b.classList.toggle('locked', lk); // cadeado + "Nv N" (ver style.css); a Maestria mostra "Nv 25" e, passado o nível, "Maestria" (falta a missão)
      if (lk) b.style.setProperty('--lv', i === 3 && p.level >= skillUnlockLevel(3) ? '"25\\A Maestria"' : `"${skillUnlockLevel(i)}"`);
    });
    setCd(this.root.querySelector('.atk'), p.cds.basic, basicOf(p.classId, p.spec).cd / p.stats.atkSpeed, false);
    const pot = this.root.querySelector('.pot');
    setCd(pot, game.potionCd, 8, false);
    pot.querySelector('.count').textContent = String(game.char.potions);
    pot.classList.toggle('empty', !game.char.potions || game.mode === 'pvp');
    // botão contextual: balão pintado para NPC, baú para baú, cristal sobre pedra (save-point) para a Pedra de Retorno
    let tg = game.mode === 'explore' || game.inNetZone?.() ? interactTarget(p, game.world) : null;
    if (tg && game.mode !== 'explore' && tg.kind !== 'chest' && tg.kind !== 'checkpoint') tg = null; // na instância online só o baú e a Pedra de Retorno (o servidor confere)
    const act = this.root.querySelector('.act');
    act.classList.toggle('hidden', !tg);
    if (tg && act.dataset.kind !== tg.kind) {
      act.dataset.kind = tg.kind;
      act.querySelector('.icon').innerHTML = tg.kind === 'chest'
        ? `<img class="art" src="${asset('assets/icons/item/res-chest.webp')}" alt="🧰" draggable="false" onerror="this.replaceWith(this.alt)">`
        : tg.kind === 'checkpoint'
          ? `<img class="art" src="${asset('assets/icons/ui/save-point.webp')}" alt="Salvar ponto" draggable="false" onerror="this.replaceWith(this.alt)">`
        : tg.kind === 'lore'
          ? `<img class="art" src="${asset('assets/icons/item/res-scroll.webp')}" alt="📜" draggable="false" onerror="this.replaceWith(this.alt)">`
          :`<img class="art" src="${asset('assets/icons/menu/menu-journal.webp')}" alt="Conversar" draggable="false">`; // pergaminho pintado (V6): sem emoji nem disco chapado
    }
  }
}
