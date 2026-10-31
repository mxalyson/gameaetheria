import { CLASSES, STAT_KEYS, STAT_NAMES } from '../data/classes.js';
import { SKILLS } from '../data/skills.js';
import { skillOf, specsOf, specInfo, activeSpec, respecCost, SPEC_LEVEL } from '../core/specs.js';
import { SLOTS, SLOT_NAMES, SLOT_ICONS, RARITY, RARITIES, WEAPON_TYPES, STAT_LABELS, PERCENT_STATS, INVENTORY_SIZE } from '../data/items.js';
import { SPIRITS, MAX_SPIRITS } from '../data/spirits.js';
import { computeStats, canEquip, itemScore } from '../core/stats.js';
import { xpToNext, spiritXpToNext, spiritPower, MAX_LEVEL } from '../core/progression.js';
import { tierFor } from '../core/combat.js';
import { MODES, getRating } from '../core/match.js';
import { playerPower, pvpUnlocked, PVP_MIN_LEVEL } from '../core/power.js';
import { PRICES } from '../shop.js';
import { SCALE_MIN, SCALE_MAX } from '../prefs.js';

const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Textos dos avisos e recusas do servidor de partidas (o servidor manda só códigos).
const REJECT_TEXT = {
  pvp_locked: 'O PvP online libera no nível 10.', no_such_player: 'Jogador não encontrado (ele precisa estar online).', already_in_party: 'Esse jogador já está em um grupo.',
  party_full: 'O grupo está cheio (4).', not_leader: 'Só o líder do grupo pode fazer isso.', party_too_big: 'O grupo é grande demais para esse modo.',
  no_invite: 'Esse convite não vale mais.', in_match: 'Você ou alguém do grupo já está em fila ou partida.', self: 'Você não pode se convidar.',
  member_offline: 'Alguém do grupo está desconectado.', already_queued: 'Você já está na fila.',
};
export const noticeText = (n) => {
  if (n.t === 'reject') return REJECT_TEXT[n.code] ?? 'Recusado: ' + n.code;
  if (n.code === 'invite_sent') return 'Convite enviado a ' + n.name + '.';
  if (n.code === 'invite_declined') return n.name + ' recusou o convite.';
  return n.code;
};

export const itemIcon = (it) => (it.slot === 'weapon' ? WEAPON_TYPES[it.weaponType].icon : SLOT_ICONS[it.slot]);
const fmtStat = (k, v) => (PERCENT_STATS.has(k) ? `+${v}% ${STAT_LABELS[k]}` : `+${v} ${STAT_LABELS[k]}`);

export class UI {
  constructor(game) {
    this.game = game;
    this.open = new Set();
    this.cache = new Map();
    this.layer = $('panel-layer');
    this.tooltip = $('tooltip');
    this.screen = $('screen');

    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      e.preventDefault();
      // No toque não existe "passar o mouse": o 1º toque num item mostra os detalhes, o 2º executa a ação.
      const tip = el.dataset.tip;
      if (game.touch?.active && tip?.startsWith('item:') && this.armedTip !== tip) {
        this.armedTip = tip;
        this.showTooltip(tip, e);
        return;
      }
      this.hideTooltip();
      game.act(el.dataset.action, el.dataset.arg);
    });
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-tip]');
      if (el) this.showTooltip(el.dataset.tip, e);
    });
    document.addEventListener('mousemove', (e) => { if (!this.tooltip.classList.contains('hidden')) this.placeTooltip(e); });
    document.addEventListener('mouseout', (e) => {
      const el = e.target.closest('[data-tip]');
      if (el && !el.contains(e.relatedTarget)) this.hideTooltip();
    });
  }

  // ---------------- telas ----------------
  showTitle(save) {
    $('hud').classList.add('hidden');
    this.closePanels();
    const cont = save
      ? `<button class="btn primary big" data-action="continue">Continuar — ${esc(save.name)} · ${CLASSES[save.classId].name} Nv ${save.level}</button>
         <button class="btn ghost" data-action="new-char">Novo personagem</button>`
      : `<button class="btn primary big" data-action="new-char">Criar personagem</button>`;
    const importBtn = '<button class="btn ghost" data-action="save-import">Importar save</button>';
    this.screen.innerHTML = `
      <div class="title-wrap">
        <div class="logo"><span>AETHERIA</span><small>Arena dos Ecos</small></div>
        <p class="tagline">Suba de nível, colete itens, desperte spirits e conquiste a arena.</p>
        <div class="title-actions">${cont}${importBtn}</div>
        <p class="foot">Protótipo v0.1 · PvE + Arena PvP contra ecos (multiplayer em breve)</p>
      </div>`;
    this.screen.className = 'visible';
  }

  // ---- modo online: login, cadastro, recuperação, códigos e lista de personagens ----
  showLogin(mode = 'login', msg = '', googleOn = false) {
    $('hud').classList.add('hidden');
    this.closePanels();
    const titles = { login: 'Entrar', register: 'Criar conta', recover: 'Recuperar acesso' };
    const pass = mode === 'recover'
      ? '<input id="acc-code" placeholder="Código de recuperação (xxxxx-xxxxx)" autocomplete="off" /><input id="acc-pass" type="password" placeholder="Nova senha (mín. 8 caracteres)" autocomplete="new-password" />'
      : `<input id="acc-pass" type="password" placeholder="Senha${mode === 'register' ? ' (mín. 8 caracteres)' : ''}" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" />`;
    const go = { login: 'auth-login', register: 'auth-register', recover: 'auth-recover' }[mode];
    const links = mode === 'login'
      ? '<button class="btn ghost" data-action="auth-mode" data-arg="register">Criar conta</button><button class="btn ghost" data-action="auth-mode" data-arg="recover">Esqueci a senha</button>'
      : '<button class="btn ghost" data-action="auth-mode" data-arg="login">Voltar ao login</button>';
    this.screen.innerHTML = `
      <div class="title-wrap">
        <div class="logo"><span>AETHERIA</span><small>Arena dos Ecos</small></div>
        <p class="tagline">${titles[mode]} para jogar: seu herói fica salvo na sua conta.</p>
        <form class="auth-form" onsubmit="return false">
          <input id="acc-email" type="email" placeholder="E-mail" autocomplete="email" />
          ${pass}
          <button class="btn primary big" type="button" data-action="${go}">${titles[mode]}</button>
          <div id="google-btn" class="google-btn ${googleOn && mode !== 'recover' ? '' : 'hidden'}"></div>
          ${msg ? `<p class="auth-err" role="alert">${esc(msg)}</p>` : ''}
        </form>
        <div class="title-actions">${links}</div>
        <p class="foot">Conta obrigatória · seus dados ficam no servidor do jogo</p>
      </div>`;
    this.screen.className = 'visible';
    const email = $('acc-email'), pw = $('acc-pass');
    const enter = (e) => { if (e.key === 'Enter') this.game.act(go); };
    email.addEventListener('keydown', enter); pw.addEventListener('keydown', enter);
    email.focus();
  }

  showRecoveryCodes(codes, next = 'chars-refresh') {
    this.screen.innerHTML = `
      <div class="title-wrap">
        <div class="logo"><span>AETHERIA</span><small>Arena dos Ecos</small></div>
        <p class="tagline">Guarde estes <b>códigos de recuperação</b>: cada um redefine sua senha uma única vez. Eles <b>não aparecem de novo</b>.</p>
        <div class="recovery-codes" id="recovery-codes">${codes.map((c) => `<code>${esc(c)}</code>`).join('')}</div>
        <div class="title-actions"><button class="btn primary big" data-action="${next}">Anotei, continuar</button></div>
      </div>`;
    this.screen.className = 'visible';
  }

  showCharacters(list, { email = '', maxCharacters = 4, hasLocalSave = false, msg = '' } = {}) {
    $('hud').classList.add('hidden');
    this.closePanels();
    const cards = list.map((c) => `
      <div class="char-card" style="--cc:${CLASSES[c.classId]?.color ?? '#999'}">
        <button class="char-pick" data-action="char-select" data-arg="${c.id}">
          <span class="cc-icon">${CLASSES[c.classId]?.icon ?? '?'}</span>
          <span class="cc-name">${esc(c.name)}</span>
          <span class="cc-desc">${CLASSES[c.classId]?.name ?? ''} · Nv ${c.level} · ${tierFor(c.rating).name} (${c.rating})</span>
        </button>
        <button class="btn small ghost" data-action="char-delete" data-arg="${c.id}" aria-label="Apagar ${esc(c.name)}">Apagar</button>
      </div>`).join('');
    this.screen.innerHTML = `
      <div class="create-wrap">
        <h1>Seus personagens</h1>
        <p class="tagline" style="font-size:13px">Conta: ${esc(email)}</p>
        <div class="char-list">${cards || '<p class="hint">Você ainda não tem personagens.</p>'}</div>
        <div class="title-actions">
          ${list.length < maxCharacters ? '<button class="btn primary big" data-action="new-char">Novo personagem</button>' : `<p class="hint">Limite de ${maxCharacters} personagens.</p>`}
          ${hasLocalSave && list.length < maxCharacters ? '<button class="btn" data-action="char-import-local">Importar o save deste aparelho</button>' : ''}
          <button class="btn ghost" data-action="logout">Sair da conta</button>
        </div>
        ${msg ? `<p class="auth-err" role="alert">${esc(msg)}</p>` : ''}
      </div>`;
    this.screen.className = 'visible';
  }

  showCreate(hasSave) {
    this.createClass = this.createClass ?? 'warrior';
    const cards = Object.values(CLASSES).map((c) => `
      <button class="class-card ${c.id === this.createClass ? 'sel' : ''}" data-action="pick-class" data-arg="${c.id}" style="--cc:${c.color}">
        <div class="cc-icon">${c.icon}</div>
        <div class="cc-name">${c.name}</div>
        <div class="cc-desc">${c.desc}</div>
        <div class="cc-stat">Atributo principal: <b>${STAT_NAMES[c.primary]}</b></div>
        <div class="cc-skills">${c.skills.map((s) => `<span title="${esc(SKILLS[s].desc)}">${SKILLS[s].icon} ${SKILLS[s].name}</span>`).join('')}</div>
      </button>`).join('');
    this.screen.innerHTML = `
      <div class="create-wrap">
        <h1>Escolha sua classe</h1>
        <div class="class-grid">${cards}</div>
        <div class="create-row">
          <input id="char-name" maxlength="14" placeholder="Nome do herói" value="${esc(this.lastName ?? '')}" autocomplete="off" />
          <button class="btn primary big" data-action="create">Começar aventura</button>
        </div>
        ${hasSave && !this.game.online ? '<p class="warn">Criar um novo personagem substitui o salvo atual.</p>' : ''}
        <button class="btn ghost" data-action="back-title">Voltar</button>
      </div>`;
    this.screen.className = 'visible';
    const input = $('char-name');
    input.addEventListener('input', () => { this.lastName = input.value; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.game.act('create'); });
    input.focus();
  }

  showResult({ title, sub, lines = [], button = 'Voltar à vila', action = 'return-town', tone = '' }) {
    this.screen.innerHTML = `
      <div class="result ${tone}">
        <h1>${title}</h1>
        ${sub ? `<p class="sub">${sub}</p>` : ''}
        <ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>
        <button class="btn primary big" data-action="${action}">${button}</button>
      </div>`;
    this.screen.className = 'visible dim';
  }

  hideScreen() { this.screen.className = ''; this.screen.innerHTML = ''; }

  // ---------------- HUD ----------------
  setupHud(char) {
    $('hud').classList.remove('hidden');
    const cls = CLASSES[char.classId];
    $('hud-portrait').textContent = cls.icon;
    $('hud-portrait').style.setProperty('--cc', cls.color);
    const slots = [
      { key: 'LMB', id: 'basic', icon: '🖱️', tip: 'skill:basic' },
      ...cls.skills.map((s, i) => ({ key: String(i + 1), id: 's' + i, icon: SKILLS[s].icon, tip: 'skill:' + s })),
      { key: 'Q', id: 'potion', icon: '🧪', tip: 'potion' },
      { key: 'H', id: 'hearth', icon: '🏠', tip: 'hearth' },
    ];
    $('skillbar').innerHTML = slots.map((s) => `
      <div class="slot" id="slot-${s.id}" data-tip="${s.tip}">
        <span class="icon">${s.icon}</span><span class="key">${s.key}</span>
        <div class="cd"></div><span class="cdt"></span>${s.id === 'potion' ? '<span class="count" id="potion-count"></span>' : ''}
      </div>`).join('') + '<div class="slot spirit" id="slot-spirit" data-tip="spirit-active"><span class="icon" id="spirit-icon"></span><span class="key">P</span></div>';
    this.cache.clear();
  }

  set(el, prop, value) {
    const k = el + '|' + prop;
    if (this.cache.get(k) === value) return;
    this.cache.set(k, value);
    const node = $(el);
    if (!node) return;
    if (prop === 'text') node.textContent = value;
    else if (prop === 'html') node.innerHTML = value;
    else if (prop === 'class') node.className = value;
    else node.style.setProperty(prop, value);
  }

  updateHud(game) {
    const { char, player, world } = game;
    if (!player) return;
    this.set('hud-name', 'text', char.name);
    this.set('hud-level', 'text', `Nv ${char.level}`);
    this.set('hud-hp', 'width', `${(100 * player.hp) / player.maxHp}%`);
    this.set('hud-shield', 'width', `${Math.min(100, (100 * player.shield) / player.maxHp)}%`);
    this.set('hud-hp-text', 'text', `${Math.ceil(player.hp)} / ${player.maxHp}`);
    const need = xpToNext(char.level);
    this.set('hud-xp', 'width', char.level >= MAX_LEVEL ? '100%' : `${(100 * char.xp) / need}%`);
    this.set('hud-xp-text', 'text', char.level >= MAX_LEVEL ? 'Nível máximo' : `${char.xp} / ${need} XP`);
    this.set('hud-gold', 'html', `<span>🪙 ${char.gold}</span>${char.statPoints ? `<span class="pts" data-action="toggle" data-arg="character">+${char.statPoints} pontos</span>` : ''}`);
    this.set('zone-name', 'text', world.zone.name);

    const cdOf = { basic: player.cds.basic, s0: player.cds.s0, s1: player.cds.s1, s2: player.cds.s2, potion: game.potionCd, hearth: 0 };
    const maxOf = { basic: CLASSES[char.classId].basic.cd / player.stats.atkSpeed, potion: 8, hearth: 1 };
    CLASSES[char.classId].skills.forEach((s, i) => { maxOf['s' + i] = skillOf(char.classId, activeSpec(char), s).cd; });
    for (const id of Object.keys(cdOf)) {
      const cd = cdOf[id];
      const pct = cd > 0 ? Math.min(1, cd / maxOf[id]) : 0;
      this.set(`slot-${id}`, '--p', pct.toFixed(3));
      this.set(`slot-${id}`, 'class', 'slot' + (cd > 0 ? ' cooling' : '') + (id === 'potion' && (!char.potions || game.mode === 'pvp' || game.mode === 'net') ? ' empty' : ''));
    }
    for (const id of ['s0', 's1', 's2']) {
      const cd = player.cds[id];
      const node = $(`slot-${id}`)?.querySelector('.cdt');
      const txt = cd > 0 ? cd.toFixed(cd < 1 ? 1 : 0) : '';
      if (node && node.textContent !== txt) node.textContent = txt;
    }
    this.set('potion-count', 'text', String(char.potions));
    const sp = char.spirits.find((s) => s.id === char.activeSpirit);
    this.set('spirit-icon', 'html', sp ? `<i class="orb" style="--sc:${SPIRITS[sp.type].color}"></i>` : '·');

    // Barra de chefe / rival.
    const boss = game.mode === 'pvp' ? game.rival : world.actors.find((a) => (a.boss || a.elite) && !a.dead && Math.hypot(a.x - player.x, a.y - player.y) < 650);
    if (boss && !boss.dead) {
      this.set('boss-bar', 'class', '');
      this.set('boss-name', 'text', `${boss.name} · Nv ${boss.level}`);
      this.set('boss-fill', 'width', `${(100 * boss.hp) / boss.maxHp}%`);
    } else this.set('boss-bar', 'class', 'hidden');
  }

  log(msg, color = '#e8e6f0') {
    const el = document.createElement('div');
    el.className = 'log-line';
    el.style.color = color;
    el.innerHTML = msg;
    const log = $('log');
    log.appendChild(el);
    while (log.children.length > 7) log.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), 7000);
    setTimeout(() => el.remove(), 8200);
  }

  toast(title, sub = '', tone = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + tone;
    el.innerHTML = `<div class="t1">${title}</div>${sub ? `<div class="t2">${sub}</div>` : ''}`;
    $('toast-layer').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2800);
  }

  banner(text) {
    const b = $('arena-banner');
    if (!text) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    if (b.textContent !== text) b.textContent = text;
  }

  // ---------------- painéis ----------------
  isOpen(id) { return this.open.has(id); }
  anyOpen() { return this.open.size > 0; }
  toggle(id) { this.isOpen(id) ? this.close(id) : this.openPanel(id); }
  openPanel(id) {
    if (['shop', 'arena', 'sage', 'party'].includes(id)) for (const p of ['shop', 'arena', 'sage', 'party', 'spirits', 'character', 'options']) this.open.delete(p);
    if (id === 'options') this.open.clear();
    this.open.add(id);
    if (id === 'shop') this.open.add('inventory');
    this.render();
  }
  close(id) {
    this.open.delete(id);
    if (id === 'inventory') this.open.delete('shop');
    this.render();
  }
  closePanels() { this.open.clear(); this.render(); }

  render() {
    this.hideTooltip();
    const order = ['character', 'arena', 'party', 'sage', 'shop', 'spirits', 'inventory', 'options'];
    this.layer.innerHTML = order.filter((p) => this.open.has(p)).map((p) => this['panel_' + p]()).join('');
  }

  frame(id, title, body, extra = '') {
    return `<section class="panel p-${id}" ${extra}>
      <header><h2>${title}</h2><button class="x" data-action="close" data-arg="${id}">✕</button></header>
      <div class="body">${body}</div></section>`;
  }

  itemCell(it, action, arg) {
    if (!it) return '<div class="cell empty"></div>';
    return `<div class="cell r-${it.rarity}" data-action="${action}" data-arg="${arg}" data-tip="item:${it.id}">
      <span class="ic">${itemIcon(it)}</span><span class="lv">${it.level}</span></div>`;
  }

  panel_inventory() {
    const { char } = this.game;
    const cells = [];
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const it = char.inventory[i];
      cells.push(it ? this.itemCell(it, 'item', it.id) : '<div class="cell empty"></div>');
    }
    const hint = this.isOpen('shop') ? 'Clique em um item para <b>vender</b>.' : 'Clique para equipar · Equipamento em <b>C</b>.';
    return this.frame('inventory', `Inventário <small>${char.inventory.length}/${INVENTORY_SIZE}</small>`, `
      <div class="inv-grid">${cells.join('')}</div>
      <div class="inv-foot"><span>🪙 ${char.gold}</span><span>🧪 ${char.potions}</span><span class="hint">${hint}</span></div>
      <div class="row-btns"><button class="btn small" data-action="sort-inv">Ordenar</button></div>`);
  }

  panel_character() {
    const { char } = this.game;
    const cls = CLASSES[char.classId];
    const st = computeStats(char);
    const tier = tierFor(char.arena.rating);
    const equip = SLOTS.map((s) => `
      <div class="eq-slot"><label>${SLOT_NAMES[s]}</label>
        ${char.equipment[s] ? this.itemCell(char.equipment[s], 'unequip', s) : `<div class="cell empty ghost">${s === 'weapon' ? WEAPON_TYPES[cls.weapon].icon : SLOT_ICONS[s]}</div>`}
      </div>`).join('');
    const stats = STAT_KEYS.map((k) => `
      <div class="stat-row ${k === cls.primary ? 'prim' : ''}"><span>${STAT_NAMES[k]}</span><b>${st[k]}</b>
        ${char.statPoints ? `<button class="plus" data-action="alloc" data-arg="${k}">+</button>` : '<i></i>'}</div>`).join('');
    const d = [
      ['Vida', st.maxHp], ['Poder', st.power], ['Defesa', st.def], ['Crítico', st.crit.toFixed(1) + '%'],
      ['Vel. de Ataque', Math.round(st.atkSpeed * 100) + '%'], ['Vel. de Movimento', Math.round(st.moveSpeed)], ['Roubo de Vida', Math.round(st.lifesteal * 100) + '%'],
    ].map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
    return this.frame('character', 'Personagem', `
      <div class="char-head" style="--cc:${cls.color}">
        <div class="avatar">${cls.icon}</div>
        <div><div class="nm">${esc(char.name)}</div><div class="sub">${cls.name} · Nível ${char.level}</div>
        <div class="sub" style="color:${tier.color}">Arena: ${tier.name} (${char.arena.rating})</div></div>
      </div>
      <div class="equip-grid">${equip}</div>
      <h3>Atributos ${char.statPoints ? `<span class="pts">${char.statPoints} pontos livres</span>` : ''}</h3>
      ${stats}
      ${this.specBlock(char)}
      <h3>Combate</h3><div class="kv-grid">${d}</div>`);
  }

  // Especialização (nível 15): duas por classe; a primeira escolha é grátis, trocar custa ouro.
  specBlock(char) {
    const list = specsOf(char.classId);
    if (char.level < SPEC_LEVEL) return `<h3>Especialização</h3><p class="hint">🔒 Libera no nível ${SPEC_LEVEL} (você está no ${char.level}): duas escolhas que ajustam suas habilidades.</p>`;
    const cost = respecCost(char);
    const cards = Object.entries(list).map(([id, sp]) => `
      <div class="shop-item ${char.spec === id ? 'sel' : ''}"><div class="cell r-epic"><span class="ic">${sp.icon}</span></div>
        <div><div class="nm">${sp.name}${char.spec === id ? ' ✔' : ''}</div><div class="sub">${sp.desc}</div></div>
        ${char.spec === id ? '' : `<button class="btn small" data-action="spec" data-arg="${id}">${cost ? '🪙 ' + cost : 'Escolher'}</button>`}</div>`).join('');
    return `<h3>Especialização ${char.spec ? `<span class="pts">${specInfo(char.classId, char.spec).name}</span>` : '<span class="pts">escolha uma</span>'}</h3>${cards}`;
  }

  panel_spirits() {
    const { char } = this.game;
    const list = char.spirits.length ? char.spirits.map((sp) => {
      const S = SPIRITS[sp.type], R = RARITY[sp.rarity];
      const active = char.activeSpirit === sp.id;
      const need = spiritXpToNext(sp.level);
      return `<div class="sp-card ${active ? 'active' : ''}" style="--sc:${S.color};--rc:${R.color}">
        <i class="orb big"></i>
        <div class="sp-info">
          <div class="nm">${S.name} <span class="rar">${R.name}</span></div>
          <div class="sub">${S.element} · ${S.role} · Nv ${sp.level} · Poder ${spiritPower(sp)}</div>
          <div class="mini-bar"><div style="width:${sp.level >= char.level ? 100 : (100 * sp.xp) / need}%"></div></div>
          <div class="desc">${S.desc}</div>
        </div>
        <div class="sp-btns">
          ${active ? '<span class="tag">Ativo</span>' : `<button class="btn small" data-action="spirit-on" data-arg="${sp.id}">Ativar</button>`}
          <button class="btn small ghost" data-action="spirit-free" data-arg="${sp.id}">Libertar</button>
        </div></div>`;
    }).join('') : '<p class="empty-msg">Você ainda não tem spirits. Derrote monstros para achar <b>Essências</b> ou visite a Sábia Yun na vila.</p>';
    return this.frame('spirits', `Spirits <small>${char.spirits.length}/${MAX_SPIRITS}</small>`, `
      <p class="hint">O spirit ativo luta ao seu lado e ganha XP junto com você (até o seu nível).</p>
      <div class="sp-list">${list}</div>`);
  }

  panel_shop() {
    const { char, shopStock } = this.game;
    const stock = shopStock.map((it, i) => `
      <div class="shop-item">${this.itemCell(it, 'buy-item', i)}
        <div><div class="nm" style="color:${RARITY[it.rarity].color}">${esc(it.name)}</div><div class="sub">${SLOT_NAMES[it.slot]} · Nv ${it.level}</div></div>
        <button class="btn small" data-action="buy-item" data-arg="${i}">🪙 ${it.value * PRICES.itemMarkup}</button></div>`).join('') || '<p class="empty-msg">Estoque esgotado. Volte após subir de nível.</p>';
    const potion = PRICES.potion(char.level);
    return this.frame('shop', 'Mercadora Lia', `
      <p class="npc-line">"Poções fresquinhas e equipamentos de viajantes! Vendo e compro."</p>
      <div class="shop-item"><div class="cell r-common"><span class="ic">🧪</span></div>
        <div><div class="nm">Poção de Vida</div><div class="sub">Cura 35% da vida · tecla Q</div></div>
        <div class="btn-col"><button class="btn small" data-action="buy-potion" data-arg="1">1 · 🪙 ${potion}</button>
        <button class="btn small" data-action="buy-potion" data-arg="5">5 · 🪙 ${potion * 5}</button></div></div>
      <h3>Equipamentos</h3>${stock}
      <h3>Vender em lote</h3>
      <div class="row-btns"><button class="btn small" data-action="sell-bulk" data-arg="0">Todos Comuns</button>
      <button class="btn small" data-action="sell-bulk" data-arg="1">Comuns + Incomuns</button></div>`);
  }

  panel_arena() {
    const { char } = this.game;
    const tier = tierFor(char.arena.rating);
    return this.frame('arena', 'Mestre Doran', `
      <p class="npc-line">"A arena guarda os ecos de todos que lutaram aqui. Prove seu valor!"</p>
      <div class="arena-badge" style="--tc:${tier.color}"><div class="tier">${tier.name}</div><div class="rt">${char.arena.rating}</div>
        <div class="wl">${char.arena.wins}V · ${char.arena.losses}D · Melhor onda: ${char.arena.bestWave}</div></div>
      <div class="arena-badge"><div class="wl">⚡ Seu poder: <b>${playerPower(char)}</b></div></div>
      ${pvpUnlocked(char) ? Object.entries(MODES).map(([id, md]) => `<button class="btn primary wide" data-action="match" data-arg="${id}">⚔️ Grande Arena ${md.label} · rating ${getRating(char, id)}</button>`).join('') : `<p class="hint">🔒 O PvP libera no <b>nível ${PVP_MIN_LEVEL}</b> (você está no ${char.level}).</p>`}
      <p class="hint">Times de ecos (aliados e inimigos com classe, itens e spirit próprios) na Grande Arena. Segure o ponto central: 100 pontos vencem; eliminar o outro time também. Cada modo tem seu rating. Poções desativadas.</p>
      ${this.game.online ? this.onlineArenaBlock(char) : ''}
      <button class="btn wide" data-action="waves">🌊 Desafio de Ondas (PvE)</button>
      <p class="hint">Sobreviva a ondas crescentes de monstros. Ouro a cada onda vencida, chefes a cada 10.</p>
      <p class="soon">🌐 Em breve: duelos contra jogadores reais.</p>`);
  }

  // Arena online: partidas com jogadores reais (servidor autoritativo) e cooperativo. Só aparece com conta.
  onlineArenaBlock(char) {
    const net = this.game.net, q = net?.queue;
    if (!net?.joined) return '<p class="hint">🌐 Conectando ao servidor de partidas…</p>';
    if (q) return `<p class="hint">🔎 Procurando <b>${q.mode === 'coop' ? 'cooperativo' : q.mode}</b>… ${q.waited}s</p><button class="btn wide" data-action="net-cancel">Cancelar busca</button>`;
    const pvp = pvpUnlocked(char);
    const modes = Object.entries(MODES).map(([id, md]) => `<button class="btn ${pvp ? 'primary' : ''} wide" data-action="net-queue" data-arg="${id}" ${pvp ? '' : 'disabled'}>🌐 ${md.label} com jogadores reais · rating ${getRating(char, id)}</button>`).join('');
    return `<h3>Jogadores reais</h3>${pvp ? '' : `<p class="hint">🔒 PvP online libera no nível ${PVP_MIN_LEVEL}.</p>`}${modes}
      <button class="btn wide" data-action="net-queue" data-arg="coop">🤝 Cooperativo: ondas e chefe (1–4 jogadores)</button>
      <p class="hint">Aliados e adversários são pareados por rating e poder; vagas vazias são preenchidas por bots. Grupo: tecla <b>G</b>.</p>
      <button class="btn small" data-action="toggle" data-arg="party">👥 Grupo</button>`;
  }

  panel_party() {
    const net = this.game.net;
    if (!net?.joined) return this.frame('party', 'Grupo', '<p class="hint">Entre com sua conta e espere a conexão com o servidor de partidas.</p>');
    const p = net.party, me = net.name;
    const members = p ? p.members.map((m) => `<div class="shop-item"><div class="cell"><span class="ic">${CLASSES[m.classId]?.icon ?? '?'}</span></div>
      <div><div class="nm">${esc(m.name)} ${p.leader === m.name ? '👑' : ''}</div><div class="sub">Nv ${m.level} · ${m.online ? 'online' : 'desconectado'}</div></div>
      ${p.leader === me && m.name !== me ? `<button class="btn small" data-action="party-kick" data-arg="${esc(m.name)}">Expulsar</button>` : ''}</div>`).join('') : '<p class="hint">Você não está em um grupo. Convide alguém pelo nome.</p>';
    const invites = net.invites.map((i) => `<div class="shop-item"><div><div class="nm">${esc(i.from)} convidou você</div></div>
      <button class="btn small primary" data-action="party-accept" data-arg="${i.partyId}">Aceitar</button><button class="btn small" data-action="party-decline" data-arg="${i.partyId}">Recusar</button></div>`).join('');
    const notes = net.notes.slice(-3).map((n) => `<p class="hint">${esc(noticeText(n))}</p>`).join('');
    return this.frame('party', 'Grupo', `
      ${invites}${members}
      <div class="row-btns"><input id="party-name" maxlength="14" placeholder="Nome do jogador" autocomplete="off" /><button class="btn small primary" data-action="party-invite">Convidar</button></div>
      ${p ? '<button class="btn small" data-action="party-leave">Sair do grupo</button>' : ''}
      ${notes}
      <p class="hint">O líder do grupo (👑) escolhe a fila; o grupo joga junto no mesmo time.</p>`);
  }

  panel_sage() {
    const { char } = this.game;
    const types = Object.values(SPIRITS).map((S) => `<div class="sage-type" style="--sc:${S.color}"><i class="orb"></i><b>${S.name}</b><span>${S.element} · ${S.role}</span></div>`).join('');
    return this.frame('sage', 'Sábia Yun', `
      <p class="npc-line">"Spirits são ecos da natureza. Escolha bem quem caminha ao seu lado."</p>
      <div class="sage-types">${types}</div>
      <div class="shop-item"><div class="cell r-uncommon"><span class="ic">🔮</span></div>
        <div><div class="nm">Essência Selvagem</div><div class="sub">Spirit aleatório</div></div>
        <button class="btn small" data-action="buy-essence" data-arg="wild">🪙 ${PRICES.essence(char.level)}</button></div>
      <div class="shop-item"><div class="cell r-epic"><span class="ic">💠</span></div>
        <div><div class="nm">Essência Prismática</div><div class="sub">Spirit Raro ou melhor</div></div>
        <button class="btn small" data-action="buy-essence" data-arg="prism">🪙 ${PRICES.prism(char.level)}</button></div>
      <div class="row-btns"><button class="btn small" data-action="toggle" data-arg="spirits">Ver meus spirits (P)</button></div>`);
  }

  panel_options() {
    const pr = this.game.prefs;
    const seg = (key, items) => `<div class="seg">${items.map(([v, label]) => `<button class="btn small ${pr[key] === v ? 'sel' : ''}" data-action="pref" data-arg="${key}:${v}">${label}</button>`).join('')}</div>`;
    return this.frame('options', 'Opções', `
      <div class="opt-row"><b>Tamanho da interface</b>
        <div class="seg"><button class="btn small" data-action="pref" data-arg="scale:-10" ${pr.scale <= SCALE_MIN ? 'disabled' : ''}>−</button>
        <span class="opt-val">${pr.scale}%</span>
        <button class="btn small" data-action="pref" data-arg="scale:+10" ${pr.scale >= SCALE_MAX ? 'disabled' : ''}>+</button></div></div>
      <div class="opt-row"><b>Qualidade gráfica</b>${seg('quality', [['auto', 'Auto'], ['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa']])}</div>
      <p class="hint">Baixa e média reduzem névoa, partículas e resolução: ajudam em celulares fracos e economizam bateria.</p>
      <div class="opt-row"><b>Controles</b>${seg('controls', [['auto', 'Auto'], ['touch', 'Toque'], ['keyboard', 'Teclado e mouse']])}</div>
      <div class="opt-row"><b>Tela cheia</b><button class="btn small" data-action="fullscreen">Alternar</button></div>
      <p class="hint">As opções valem para este aparelho e ficam salvas nele. O personagem é salvo à parte.</p>
      ${this.game.online ? '<div class="opt-row"><b>Conta</b><div class="seg"><button class="btn small" data-action="switch-char">Trocar personagem</button><button class="btn small" data-action="logout">Sair</button></div></div>' : ''}
      <div class="opt-row"><b>Save do personagem</b><div class="seg"><button class="btn small" data-action="save-export">Exportar</button><button class="btn small" data-action="save-import">Importar</button></div></div>
      <p class="hint">Exportar baixa um arquivo com seu personagem (guarde como backup ou leve para outro aparelho). Importar substitui o personagem atual.</p>`);
  }

  // ---------------- tooltips ----------------
  showTooltip(tip, e) {
    const html = this.tooltipHtml(tip);
    if (!html) return;
    this.tooltip.innerHTML = html;
    this.tooltip.classList.remove('hidden');
    this.placeTooltip(e);
  }
  hideTooltip() { this.armedTip = null; this.tooltip.classList.add('hidden'); }
  placeTooltip(e) {
    const r = this.tooltip.getBoundingClientRect();
    let x = e.clientX + 16, y = e.clientY + 16;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 16;
    if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
    this.tooltip.style.left = Math.max(8, x) + 'px';
    this.tooltip.style.top = Math.max(8, y) + 'px';
  }

  tooltipHtml(tip) {
    const game = this.game, char = game.char;
    const [kind, arg] = tip.split(':');
    if (kind === 'item') {
      const it = game.findItem(arg);
      return it ? this.itemTooltip(it) : null;
    }
    if (kind === 'skill') {
      if (arg === 'basic') {
        const b = CLASSES[char.classId].basic;
        return `<div class="tt-name">Ataque básico</div><div class="tt-sub">Botão esquerdo · segure para atacar</div>
          <div>${b.kind === 'melee' ? 'Golpe corpo a corpo em arco' : 'Projétil à distância'} · ${Math.round(b.mult * 100)}% do poder</div>`;
      }
      const s = skillOf(char.classId, activeSpec(char), arg);
      return `<div class="tt-name">${s.icon} ${s.name}</div><div class="tt-sub">Recarga ${s.cd}s</div><div>${s.desc}</div>
        ${s.mult ? `<div class="tt-stat">${Math.round(s.mult * 100)}% do poder${s.ticks ? ` × ${s.ticks}` : ''}</div>` : ''}`;
    }
    if (kind === 'potion') return `<div class="tt-name">🧪 Poção de Vida</div><div>Cura 35% da vida. Recarga 8s.</div><div class="tt-sub">Você tem ${char.potions}. Desativada no duelo PvP.</div>`;
    if (kind === 'hearth') return `<div class="tt-name">🏠 Retornar à vila</div><div>Teleporta para Vila de Lúmen quando fora de combate.</div>`;
    if (kind === 'spirit-active') {
      const sp = char.spirits.find((s) => s.id === char.activeSpirit);
      if (!sp) return '<div class="tt-name">Sem spirit ativo</div><div>Abra o painel de spirits (P).</div>';
      const S = SPIRITS[sp.type];
      return `<div class="tt-name" style="color:${S.color}">${S.name}</div><div class="tt-sub">${RARITY[sp.rarity].name} · Nv ${sp.level} · Poder ${spiritPower(sp)}</div><div>${S.desc}</div>`;
    }
    return null;
  }

  itemTooltip(it) {
    const { char } = this.game;
    const R = RARITY[it.rarity];
    const sub = `${R.name} · ${SLOT_NAMES[it.slot]}${it.weaponType ? ` (${WEAPON_TYPES[it.weaponType].name})` : ''} · Nv ${it.level}`;
    const lines = Object.entries(it.stats).map(([k, v]) => `<div class="tt-stat">${fmtStat(k, v)}</div>`).join('');
    const eq = char.equipment[it.slot];
    let cmp = '';
    if (eq && eq.id !== it.id) {
      const keys = new Set([...Object.keys(it.stats), ...Object.keys(eq.stats)]);
      const diffs = [...keys].map((k) => [k, (it.stats[k] ?? 0) - (eq.stats[k] ?? 0)]).filter(([, d]) => d !== 0);
      cmp = `<div class="tt-cmp"><div class="tt-sub">Comparado ao equipado (${esc(eq.name)})</div>${diffs.map(([k, d]) =>
        `<div class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${PERCENT_STATS.has(k) ? `${Math.abs(d)}%` : Math.abs(d)} ${STAT_LABELS[k]}</div>`).join('') || '<div>Sem diferença</div>'}
        <div class="tt-sub">Pontuação ${itemScore(it)} vs ${itemScore(eq)}</div></div>`;
    }
    const ok = canEquip(char, it);
    const equipped = Object.values(char.equipment).some((e) => e?.id === it.id);
    const inShop = this.game.shopStock.some((s) => s.id === it.id);
    let action = '';
    const again = this.game.touch?.active ? 'Toque de novo' : 'Clique';
    if (inShop) action = `Preço: 🪙 ${it.value * PRICES.itemMarkup}`;
    else if (equipped) action = `${again} para desequipar`;
    else if (this.isOpen('shop')) action = `${again} para vender por 🪙 ${it.value}`;
    else if (ok.ok) action = `${again} para equipar`;
    return `<div class="tt-name" style="color:${R.color}">${esc(it.name)}</div><div class="tt-sub">${sub}</div>${lines}
      ${ok.ok ? '' : `<div class="tt-req">${ok.reason}</div>`}${cmp}
      <div class="tt-foot">${action}${!inShop && !this.isOpen('shop') ? ` · vale 🪙 ${it.value}` : ''}</div>`;
  }
}

export { RARITIES };
