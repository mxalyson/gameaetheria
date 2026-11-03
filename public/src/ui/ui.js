import { CLASSES, STAT_KEYS, STAT_NAMES } from '../data/classes.js';
import { SKILLS } from '../data/skills.js';
import { isSkillUnlocked, skillUnlockLevel } from '../core/unlocks.js';
import { skillOf, specsOf, specInfo, activeSpec, respecCost, SPEC_LEVEL } from '../core/specs.js';
import { SLOTS, SLOT_NAMES, SLOT_ICONS, RARITY, RARITIES, WEAPON_TYPES, STAT_LABELS, PERCENT_STATS, INVENTORY_SIZE } from '../data/items.js';
import { SPIRITS, MAX_SPIRITS } from '../data/spirits.js';
import { computeStats, canEquip, itemScore, itemClassId, itemClassName } from '../core/stats.js';
import { BANK_SIZE, ensureBank } from '../core/bank.js';
import { xpToNext, spiritXpToNext, spiritPower, MAX_LEVEL, EVOLVE_LEVEL, evolveCost } from '../core/progression.js';
import { tierFor } from '../core/combat.js';
import { MODES, getRating } from '../core/match.js';
import { MOBS } from '../data/mobs.js';
import { mobPortrait } from '../render/mob-sprites.js';
import { playerPower, pvpUnlocked, PVP_MIN_LEVEL } from '../core/power.js';
import { PRICES } from '../shop.js';
import { pickBossTarget } from './boss-target.js';
import { skillImg, attackImg, iconImg, POTION_ICON, preloadSkillIcons, skillCategory, CATEGORIES } from '../render/skill-icons.js';
import { MAX_PLUS, PLUS_BONUS, plusMul, enhanceCost } from '../core/enhance.js';
import { QUESTS } from '../data/quests.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { DIALOGS, TIPS } from '../data/dialogs.js';
import { ZONES, WORLD_ROUTE, teleportCost } from '../data/zones.js';
import { offeredBy, readyFor, activeFor, serviceFor, questGiverId, spiritEvoStatus, dailyBoard, dailyState, dailyProgressOf, dailyComplete, dayUTC, titleText, achievementProgress, ensureJournal, greetFor, LORE_ZONES, loreSeen, loreCount, tipSeen } from '../core/journal.js';
import { SCALE_MIN, SCALE_MAX, resolveScale } from '../prefs.js';
import { asset } from '../assets-version.js';

// posições (%) dos nós no mapa-múndi: zigue-zague seguindo WORLD_ROUTE (serve para qualquer número de zonas)
const mapPos = (id) => { const n = WORLD_ROUTE.length, i = Math.max(0, WORLD_ROUTE.indexOf(id)); return [n > 1 ? 9 + (82 * i) / (n - 1) : 50, i % 2 ? 38 : 66]; };
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

// Ícone do equipamento: arte pintada por tipo (espada, cajado, arco, maça, elmo, armadura, botas, anel, amuleto); se a imagem faltar, volta ao emoji.
const itemImg = (type, emoji) => `<img class="it-img" src="${asset(`assets/icons/item/item-${type}.webp`)}" alt="" draggable="false" onerror="this.replaceWith(document.createTextNode('${emoji}'))">`;
import { spiritUrl } from '../render/spirit-sprites.js';
const SCROLL = `<img class="coin" src="${asset('assets/icons/item/res-scroll.webp')}" alt="📜" draggable="false">`;
// ícones de zona pintados (recortes dos sprites 3D: tools/ui-icon-from-atlas.py); com o arquivo ausente, vale o emoji
const ZONE_EMOJI = { town: '🏠', harbor: '⚓', forest: '🌲', plains: '💎', ruins: '🏚️', glacier: '❄️', ember: '🔥' };
const ZONE_ART = new Set(['town', 'forest', 'plains', 'ruins', 'glacier', 'ember', 'harbor']); // ember/harbor = recortes tingidos (tools/ui-tint.py)
const zoneIcon = (id) => (ZONE_ART.has(id) ? `<img class="zone-ic" src="${asset(`assets/icons/ui/zone-${id}.webp`)}" alt="${ZONE_EMOJI[id]}" draggable="false" onerror="this.replaceWith(this.alt)">` : ZONE_EMOJI[id] ?? '🗺️');
const spiritImg = (type, cls = '', stage = 1) => `<img class="sp-img ${cls}" src="${asset(spiritUrl(type, stage))}" alt="" draggable="false" onerror="this.outerHTML='<i class=&quot;orb ${cls}&quot;></i>'">`;
// Retratos pintados (busto): classes no cartão do herói, no painel do personagem e na criação; NPCs no oval do diálogo. Sem a imagem, volta ao emblema/emoji.
const classPortrait = (classId, emoji, cls = 'por') => `<img class="${cls}" src="${asset(`assets/portraits/class-${classId}.webp`)}" alt="" draggable="false" onerror="this.replaceWith(document.createTextNode('${emoji}'))">`;
const npcPortrait = (id) => `<img class="por" src="${asset(`assets/portraits/npc-${id === 'merchant' ? 'merchant' : id}.webp`)}" alt="" draggable="false">`;
// Emblema no oval do diálogo (provisório até haver retrato pintado de cada NPC): moeda, espada, spirit, escudo, cruz.
const NPC_EMBLEM = { shop: `<img src="${asset('assets/icons/item/res-gold-coin.webp')}" alt="">`, arena: null, sage: null, guard: null, herbalist: null };
// NPCs do Porto e mestres de classe usam o retrato do NPC/classe de que a arte foi derivada (mesmos apelidos de render/npc-sprites.js), com a cor ajustada.
const NPC_FACE = { banker: ['sage', 70], hunter: ['guard', 80], dealer: ['merchant', 0], duelist: ['arena', 0], captain: ['guard', 150] };
const npcEmblem = (id) => {
  const m = /^master_(warrior|mage|archer|cleric)$/.exec(id), face = NPC_FACE[id];
  const html = m ? classPortrait(m[1], '⚔')
    : ['merchant', 'arena', 'sage', 'guard', 'herbalist', 'smith'].includes(id) ? npcPortrait(id)
    : face ? npcPortrait(face[0]).replace('<img ', face[1] ? `<img style="filter:hue-rotate(${face[1]}deg)" ` : '<img ')
    : id === 'shop' ? NPC_EMBLEM.shop : attackImg('warrior', '⚔');
  return `<span class="npc-emb por">${html}</span>`;
};
// moeda e poção pintadas no lugar dos emojis 🪙 🧪 dentro dos painéis
const COIN = `<img class="coin" src="${asset('assets/icons/item/res-gold-coin.webp')}" alt="🪙" draggable="false">`;
// sinais dos painéis (cadeado, aqui, arena, conquista) com arte pintada; o emoji só entra se o arquivo falhar
const sign = (src, alt, cls = 'coin') => `<img class="${cls}" src="${asset(src)}" alt="${alt}" draggable="false" onerror="this.replaceWith(this.alt)">`;
const LOCK = sign('assets/icons/item/res-key.webp', '🔒');
const HERE = sign('assets/icons/menu/menu-map.webp', '📍', 'ic-img');
const ARENA = (cls = 'coin') => sign('assets/icons/attack/atk-warrior.webp', '⚔️', cls);
const TROPHY = sign('assets/icons/menu/menu-journal.webp', '🏆', 'ic-img');
const LOCK_CELL = sign('assets/icons/item/res-key.webp', '🔒', 'ic-img');
const POT = `<img class="coin" src="${asset('assets/icons/item/res-potion-health.webp')}" alt="🧪" draggable="false">`;
// sinais da arena e do grupo (antes emojis ⚡ 🌊 🌐 🤝 👥 🔎): espada, spirit de água, grupo e mapa pintados
const POWER = (cls = 'coin') => sign('assets/icons/attack/atk-warrior.webp', '⚡', cls);
const WAVES = sign('assets/icons/spirit/spirit-undine.webp', '🌊');
const PARTY = sign('assets/icons/menu/menu-party.webp', '👥');
const SEARCH = sign('assets/icons/menu/menu-map.webp', '🔎');
const ESSENCE = sign('assets/icons/item/res-essence.webp', '🔮', 'ic-img');
// preço de compra: o estoque do Porto traz `price`; o da Vila é valor × markup
const itemPrice = (it) => it.price ?? it.value * PRICES.itemMarkup;
// Selo dourado de aprimoramento no canto da célula: +1…+5 dourado, +6/+7 laranja, +8 (máximo) "MAX" vermelho
export const plusBadge = (it) => (it?.plus ? `<span class="plus-b ${it.plus >= MAX_PLUS ? 'max' : it.plus >= 6 ? 'hi' : ''}" title="Aprimorado +${it.plus} de ${MAX_PLUS}">${it.plus >= MAX_PLUS ? 'MAX' : '+' + it.plus}</span>` : '');
export const itemIcon = (it) => (it.slot === 'weapon' ? itemImg(it.weaponType, WEAPON_TYPES[it.weaponType].icon) : itemImg(it.slot, SLOT_ICONS[it.slot]));
const ghostIcon = (s, cls) => (s === 'weapon' ? itemImg(cls.weapon, WEAPON_TYPES[cls.weapon].icon) : itemImg(s, SLOT_ICONS[s]));
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
        <div class="cc-icon art">${classPortrait(c.id, c.icon)}</div>
        <div class="cc-name">${c.name}</div>
        <div class="cc-desc">${c.desc}</div>
        <div class="cc-stat">Atributo principal: <b>${STAT_NAMES[c.primary]}</b></div>
        <div class="cc-skills">${c.skills.map((s) => `<span title="${esc(SKILLS[s].desc)}">${skillImg(s, SKILLS[s].icon, 'cc-sk')} ${SKILLS[s].name} <small>Nv ${skillUnlockLevel(c.skills.indexOf(s))}</small></span>`).join('')}</div>
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
    $('hud-portrait').innerHTML = classPortrait(char.classId, cls.icon); // busto pintado da classe
    $('hud-portrait').style.setProperty('--cc', cls.color);
    const slots = [
      { key: 'LMB', id: 'basic', icon: attackImg(char.classId, '🖱️'), art: true, tip: 'skill:basic' },
      ...cls.skills.map((s, i) => ({ key: String(i + 1), id: 's' + i, icon: skillImg(s, SKILLS[s].icon), art: true, cat: skillCategory(skillOf(char.classId, null, s)), tip: 'skill:' + s })),
      { key: '4', id: 's3', icon: skillImg(cls.mastery, SKILLS[cls.mastery].icon), art: true, cat: skillCategory(skillOf(char.classId, null, cls.mastery)), tip: 'skill:' + cls.mastery }, // Maestria
      { key: 'Q', id: 'potion', icon: iconImg(POTION_ICON, '🧪'), art: true, tip: 'potion' },
    ];
    $('skillbar').innerHTML = slots.map((s) => `
      <div class="slot${s.art ? ' art' : ''}${s.medal ? ' medal' : ''}" id="slot-${s.id}" data-tip="${s.tip}">
        <span class="icon">${s.icon}</span>${s.cat ? `<i class="cat cat-${s.cat}" title="${CATEGORIES[s.cat]}"></i>` : ''}<span class="key">${s.key}</span>
        <div class="cd"></div><span class="cdt"></span>${s.id === 'potion' ? '<span class="count" id="potion-count"></span>' : ''}
      </div>`).join('') + '<div class="slot spirit" id="slot-spirit" data-tip="spirit-active"><span class="icon" id="spirit-icon"></span><span class="key">P</span></div>';
    preloadSkillIcons([...cls.skills, cls.mastery], char.classId);
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
    // ritual do chefe final ("Ritual 23/40"): só nas zonas em que o chefe aparece por contador. B28 (limitação conhecida): na instância online o ritual é do servidor e o HUD não o mostra (mode 'net')
    const rp = game.mode === 'explore' ? world.bossProgress : null, rit = $('ritual');
    if (rit) {
      const txt = !rp || rp.alive ? '' : rp.omen ? 'O chão estremece…' : rp.cool > 0 ? `Ritual em repouso · ${Math.ceil(rp.cool / 60)} min` : `Ritual ${rp.have}/${rp.need}`;
      if (rit.dataset.t !== txt) { rit.dataset.t = txt; rit.textContent = txt; rit.classList.toggle('hidden', !txt); }
    }
    this.set('hud-name', 'text', char.name + (titleText(char) ? ' · ' + titleText(char) : ''));
    this.set('hud-level', 'text', `Nv ${char.level}`);
    this.set('hud-hp', 'width', `${(100 * player.hp) / player.maxHp}%`);
    this.set('hud-shield', 'width', `${Math.min(100, (100 * player.shield) / player.maxHp)}%`);
    // barras de poção: o líquido é mostrado até esta fração (0–1) do tubo; escudo idem
    this.set('hud-hp-bar', '--v', String(Math.max(0, Math.min(1, player.hp / player.maxHp)).toFixed(3)));
    this.set('hud-hp-bar', '--s', String(Math.max(0, Math.min(1, player.shield / player.maxHp)).toFixed(3)));
    this.set('hud-hp-text', 'text', `${Math.ceil(player.hp)} / ${player.maxHp}`);
    const need = xpToNext(char.level);
    this.set('hud-xp', 'width', char.level >= MAX_LEVEL ? '100%' : `${(100 * char.xp) / need}%`);
    this.set('hud-xp-bar', '--v', String(char.level >= MAX_LEVEL ? 1 : Math.max(0, Math.min(1, char.xp / need)).toFixed(3)));
    this.set('hud-xp-text', 'text', char.level >= MAX_LEVEL ? 'XP máximo' : `XP ${char.xp} / ${need}`);
    // o ouro agora fica no rodapé da mochila; no HUD sobra só o aviso de pontos livres
    this.set('hud-gold', 'html', char.statPoints ? `<span class="pts" data-action="toggle" data-arg="character">+${char.statPoints} pontos</span>` : '');
    this.set('zone-name', 'text', world.zone.name);

    const cdOf = { basic: player.cds.basic, s0: player.cds.s0, s1: player.cds.s1, s2: player.cds.s2, s3: player.cds.s3 ?? 0, potion: game.potionCd };
    const maxOf = { basic: CLASSES[char.classId].basic.cd / player.stats.atkSpeed, potion: 8 };
    [...CLASSES[char.classId].skills, CLASSES[char.classId].mastery].forEach((s, i) => { maxOf['s' + i] = skillOf(char.classId, activeSpec(char), s).cd; });
    for (const id of Object.keys(cdOf)) {
      const cd = cdOf[id];
      const pct = cd > 0 ? Math.min(1, cd / maxOf[id]) : 0;
      this.set(`slot-${id}`, '--p', pct.toFixed(3));
      this.set(`slot-${id}`, 'class', 'slot' + (id.startsWith('s') && id !== 'spirit' || id === 'potion' || id === 'basic' ? ' art' : '') + (id.startsWith('s') && id !== 'spirit' && !isSkillUnlocked(char, Number(id[1])) ? ' locked' : id.startsWith('s') && (player.stunT > 0 || player.dead) ? ' blocked' : '') + (cd > 0 ? ' cooling' : '') + (id === 'potion' && (!char.potions || game.mode === 'pvp' || game.mode === 'net') ? ' empty' : ''));
    }
    for (const id of ['s0', 's1', 's2', 's3']) {
      if (!isSkillUnlocked(char, Number(id[1]))) this.set(`slot-${id}`, '--lv', id === 's3' && char.level >= skillUnlockLevel(3) ? '"25\\A Maestria"' : `"${skillUnlockLevel(Number(id[1]))}"`);
      const cd = player.cds[id];
      const node = $(`slot-${id}`)?.querySelector('.cdt');
      const txt = cd > 0 ? cd.toFixed(cd < 1 ? 1 : 0) : '';
      if (node && node.textContent !== txt) node.textContent = txt;
    }
    this.set('potion-count', 'text', String(char.potions));
    const sp = char.spirits.find((s) => s.id === char.activeSpirit);
    this.set('spirit-icon', 'html', sp ? spiritImg(sp.type, 'hud') : '·');

    // Barra de chefe / rival.
    const boss = game.mode === 'pvp' ? game.rival : this.barTarget(world, player);
    if (boss && !boss.dead) {
      this.set('boss-bar', 'class', '');
      this.set('boss-name', 'text', `${boss.name} · Nv ${boss.level}`);
      this.set('boss-fill', 'width', `${(100 * boss.hp) / boss.maxHp}%`);
      // retrato: vista frontal do sprite pintado do monstro (o rival do PvP e criaturas sem arte ficam sem retrato)
      const pt = boss.mobId ? mobPortrait(boss.mobId) : null;
      this.set('boss-portrait', 'display', pt ? 'block' : 'none');
      if (pt) this.set('boss-portrait', 'background-image', `url(${pt.url})`); // recorte do rosto/torso já tingido (ver mobPortrait)
    } else this.set('boss-bar', 'class', 'hidden');
    // o aviso de zona desce abaixo da barra do chefe em vez de ficar por cima do nome (V11)
    const bossOn = !!(boss && !boss.dead);
    if (this.bossOn !== bossOn) { this.bossOn = bossOn; document.body.classList.toggle('boss-on', bossOn); }
  }

  // Alvo da barra de chefe: o chefe tem prioridade sobre elites próximos (senão o retrato mostrava um elite qualquer ao lado do chefe).
  barTarget(world, player) { return pickBossTarget(world.actors, player); }

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

  // Confirmação do próprio jogo (no lugar do confirm() do navegador, que no celular abre a janela do sistema). `onYes` roda só se o jogador aceitar.
  confirm(text, onYes, yesLabel = 'Confirmar') {
    this.confirmEl?.remove();
    const el = this.confirmEl = document.createElement('div');
    el.className = 'confirm-veil';
    el.innerHTML = `<div class="confirm-box" role="alertdialog"><p></p><div class="confirm-btns"><button class="btn" data-no>Cancelar</button><button class="btn primary" data-yes></button></div></div>`;
    el.querySelector('p').textContent = text;
    el.querySelector('[data-yes]').textContent = yesLabel;
    const close = () => { el.remove(); if (this.confirmEl === el) this.confirmEl = null; };
    el.querySelector('[data-no]').addEventListener('click', close);
    el.querySelector('[data-yes]').addEventListener('click', () => { close(); onYes(); });
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    document.body.appendChild(el);
  }

  toast(title, sub = '', tone = '', ms = 2200) { // ms: tempo visível (textos de lore pedem mais)
    const el = document.createElement('div');
    el.className = 'toast ' + tone;
    el.innerHTML = `<div class="t1">${title}</div>${sub ? `<div class="t2">${sub}</div>` : ''}`;
    $('toast-layer').appendChild(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 600);
  }

  // Cartão de recompensa (baú): fica ~3,5 s por cima de tudo (até dos painéis); vários na fila aparecem um depois do outro, sem se sobrepor.
  reward({ title, rows = [], ms = 3500 }) {
    (this.rewardQ ??= []).push({ title, rows, ms });
    if (!this.rewardBusy) this.rewardNext();
  }
  rewardNext() {
    const it = this.rewardQ?.shift(), layer = $('reward-layer');
    if (!it || !layer) { this.rewardBusy = false; return; }
    this.rewardBusy = true;
    const el = document.createElement('div');
    el.className = 'reward-card';
    el.innerHTML = `<div class="rw-t">${it.title}</div>${it.rows.map((r) => `<div class="rw-row">${r.icon}<div class="rw-tx"><div class="rw-nm" ${r.color ? `style="color:${r.color}"` : ''}>${r.text}</div>${r.sub ? `<div class="rw-sub">${r.sub}</div>` : ''}</div></div>`).join('')}`;
    layer.appendChild(el);
    setTimeout(() => el.classList.add('out'), it.ms);
    setTimeout(() => { el.remove(); this.rewardNext(); }, it.ms + 350);
  }
  // Recompensa de baú: ícone pintado do item (moldura da raridade) + nome na cor da raridade + ouro; o item já está na mochila.
  chestReward(r) {
    const rows = [];
    if (r.item) {
      const R = RARITY[r.item.rarity];
      rows.push({ icon: `<span class="cell r-${r.item.rarity}${r.item.opal ? ' opal' : ''}"><span class="ic">${itemIcon(r.item)}</span>${plusBadge(r.item)}</span>`, text: esc(r.item.name), color: R.color, sub: `${R.name} · Nv ${r.item.level}${r.item.converted ? ' · mochila cheia: virou ouro' : ' · está na mochila'}` });
    }
    rows.push({ icon: `<span class="rw-coin">${COIN}</span>`, text: `+${r.gold} ouro`, color: '#ffd34d' });
    this.reward({ title: 'Baú aberto!', rows });
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
  // 'painel:âncora' (ex.: 'shop:smith') abre o painel e rola até o elemento #<âncora>-section
  openPanel(spec) {
    const [id, anchor] = String(spec).split(':');
    if (['shop', 'bank', 'board', 'arena', 'sage', 'party', 'dialog', 'journal', 'map'].includes(id)) for (const p of ['shop', 'bank', 'board', 'arena', 'sage', 'party', 'dialog', 'journal', 'map', 'spirits', 'character', 'options']) this.open.delete(p);
    if (id === 'options') this.open.clear();
    if (id === 'map') this.mapSel = null; // o mapa sempre abre selecionando onde você está
    this.open.add(id);
    if (id === 'shop') { this.open.add('inventory'); this.shopAnchor = anchor ?? null; } // título: Ferreiro Brok (anchor 'smith') ou Mercador do Porto ('harbor')
    if (id === 'bank') this.open.add('inventory'); // mochila ao lado: tocar nela deposita
    this.render();
    if (anchor) { const go = () => this.layer.querySelector(`#${anchor}-section`)?.scrollIntoView({ block: 'start' }); go(); requestAnimationFrame(go); }
  }
  close(id) {
    this.open.delete(id);
    if (id === 'inventory') { this.open.delete('shop'); this.open.delete('bank'); }
    this.render();
  }
  closePanels() { this.open.clear(); this.render(); }

  render() {
    this.hideTooltip();
    document.body.classList.toggle('panel-open', this.open.size > 0); // avisos ficam por baixo dos painéis (V10)
    const order = ['character', 'arena', 'party', 'dialog', 'journal', 'map', 'sage', 'shop', 'bank', 'board', 'spirits', 'inventory', 'options'];
    // Refazer o HTML a cada +1 ponto/ação fazia a janela "piscar" (a animação de abrir tocava de novo) e voltar ao topo: guardamos a rolagem e só animamos o que acabou de abrir.
    const pid = (el) => [...el.classList].find((c) => c.startsWith('p-'));
    const prev = new Map([...this.layer.querySelectorAll('.panel')].map((el) => [pid(el), el.querySelector('.body')?.scrollTop ?? 0]));
    this.layer.innerHTML = order.filter((p) => this.open.has(p)).map((p) => this['panel_' + p]()).join('');
    for (const el of this.layer.querySelectorAll('.panel')) {
      const id = pid(el), b = el.querySelector('.body');
      if (!prev.has(id)) el.classList.add('fresh'); else if (b) b.scrollTop = prev.get(id);
    }
  }

  frame(id, title, body, extra = '') {
    return `<section class="panel p-${id}" ${extra}>
      <header><h2>${title}</h2><button class="x" data-action="close" data-arg="${id}">✕</button></header>
      <div class="body">${body}</div></section>`;
  }

  itemCell(it, action, arg) {
    if (!it) return '<div class="cell empty"></div>';
    // item de outra classe: célula avermelhada com o nome da classe ("Apenas para Mago" completo no tooltip)
    const cid = itemClassId(it), wrong = cid && cid !== this.game.char?.classId;
    return `<div class="cell r-${it.rarity}${it.opal ? ' opal' : ''}${wrong ? ' wrong-class' : ''}" data-action="${action}" data-arg="${arg}" data-tip="item:${it.id}"${wrong ? ` title="Apenas para ${esc(itemClassName(it))}"` : ''}>
      <span class="ic">${itemIcon(it)}</span><span class="lv">${it.level}</span>${plusBadge(it)}${wrong ? `<span class="cls-x">${esc(itemClassName(it))}</span>` : ''}</div>`;
  }

  panel_inventory() {
    const { char } = this.game;
    const cells = [];
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const it = char.inventory[i];
      cells.push(it ? this.itemCell(it, 'item', it.id) : '<div class="cell empty"></div>');
    }
    const hint = this.isOpen('shop') ? 'Toque em um item para <b>vender</b>.' : this.isOpen('bank') ? 'Toque em um item para <b>guardar no banco</b>.' : 'Toque para equipar · atributos em Personagem.';
    return this.frame('inventory', `Inventário <small>${char.inventory.length}/${INVENTORY_SIZE}</small>`, `
      <div class="inv-grid">${cells.join('')}</div>
      <div class="inv-foot"><span class="inv-gold" title="Ouro (vai direto para a mochila)">${COIN}<b>${char.gold}</b></span><span class="inv-res">${POT} ${char.potions}</span><span class="inv-res">${SCROLL} ${char.scrolls ?? 0}</span><span class="hint">${hint}</span></div>
      <div class="row-btns"><button class="btn small" data-action="sort-inv">Ordenar</button></div>`);
  }

  panel_character() {
    const { char } = this.game;
    const cls = CLASSES[char.classId];
    const st = computeStats(char);
    const tier = tierFor(char.arena.rating);
    const equip = SLOTS.map((s) => `
      <div class="eq-slot"><label>${SLOT_NAMES[s]}</label>
        ${char.equipment[s] ? this.itemCell(char.equipment[s], 'unequip', s) : `<div class="cell empty ghost">${ghostIcon(s, cls)}</div>`}
      </div>`).join('');
    const stats = STAT_KEYS.map((k) => `
      <div class="stat-row ${k === cls.primary ? 'prim' : ''}"><span class="sn">${STAT_NAMES[k]}</span><b>${st[k]}</b>
        ${char.statPoints ? `<span class="plus-grp"><button class="plus" data-action="alloc" data-arg="${k}:1">+1</button><button class="plus" data-action="alloc" data-arg="${k}:5">+5</button><button class="plus" data-action="alloc" data-arg="${k}:max">Máx</button></span>` : '<i></i>'}</div>`).join('');
    const d = [
      ['Vida', st.maxHp], ['Poder', st.power], ['Defesa', st.def], ['Crítico', st.crit.toFixed(1) + '%'],
      ['Vel. de Ataque', Math.round(st.atkSpeed * 100) + '%'], ['Vel. de Movimento', Math.round(st.moveSpeed)], ['Roubo de Vida', Math.round(st.lifesteal * 100) + '%'],
    ].map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
    return this.frame('character', 'Personagem', `<div class="cols"><div class="col">
      <div class="char-head" style="--cc:${cls.color}">
        <div class="avatar art">${classPortrait(char.classId, cls.icon)}</div>
        <div><div class="nm">${esc(char.name)}</div><div class="sub">${cls.name} · Nível ${char.level}</div>
        <div class="sub" style="color:${tier.color}">Arena: ${tier.name} (${char.arena.rating})</div></div>
      </div>
      <div class="equip-grid">${equip}</div>
      <h3>Combate</h3><div class="kv-grid">${d}</div>
      </div><div class="col">
      <h3>Atributos ${char.statPoints ? `<span class="pts">${char.statPoints} pontos livres</span>` : ''}</h3>
      ${char.statPoints ? '<div class="row-btns"><button class="btn small" data-action="alloc-auto">Distribuir automático</button></div>' : ''}
      ${stats}
      ${this.specBlock(char)}
      </div></div>`);
  }

  // Especialização (nível 15): duas por classe; a primeira escolha é grátis, trocar custa ouro.
  specBlock(char) {
    const list = specsOf(char.classId);
    if (char.level < SPEC_LEVEL) return `<h3>Especialização</h3><p class="hint">${LOCK} Libera no nível ${SPEC_LEVEL} (você está no ${char.level}): duas escolhas que ajustam suas habilidades.</p>`;
    const cost = respecCost(char);
    const cards = Object.entries(list).map(([id, sp]) => `
      <div class="shop-item ${char.spec === id ? 'sel' : ''}"><div class="cell r-epic"><span class="ic">${sp.icon}</span></div>
        <div><div class="nm">${sp.name}${char.spec === id ? ' ✔' : ''}</div><div class="sub">${sp.desc}</div></div>
        ${char.spec === id ? '' : `<button class="btn small" data-action="spec" data-arg="${id}">${cost ? COIN + ' ' + cost : 'Escolher'}</button>`}</div>`).join('');
    return `<h3>Especialização ${char.spec ? `<span class="pts">${specInfo(char.classId, char.spec).name}</span>` : '<span class="pts">escolha uma</span>'}</h3>${cards}`;
  }

  panel_spirits() {
    const { char } = this.game;
    const list = char.spirits.length ? char.spirits.map((sp) => {
      const S = SPIRITS[sp.type], R = RARITY[sp.rarity];
      const active = char.activeSpirit === sp.id;
      const need = spiritXpToNext(sp.level);
      const evo = sp.stage === 2 ? null : spiritEvoStatus(char, sp); // missão do elemento (Sábia Yun) + nível + ouro
      return `<div class="sp-card ${active ? 'active' : ''}" style="--sc:${S.color};--rc:${R.color}">
        ${spiritImg(sp.type, 'big', sp.stage ?? 1)}
        <div class="sp-info">
          <div class="nm">${S.name} ${sp.stage === 2 ? '<span class="evo">Evoluído</span>' : ''}<span class="rar">${R.name}</span></div>
          <div class="sub">${S.element} · ${S.role} · Nv ${sp.level} · Poder ${spiritPower(sp)}</div>
          <div class="mini-bar"><div style="width:${sp.level >= char.level ? 100 : (100 * sp.xp) / need}%"></div></div>
          <div class="desc">${S.desc}</div>
          ${evo ? `<div class="evo-note ${evo.state}">${esc(evo.text)}${evo.ok && char.gold < evolveCost(sp) ? ` Faltam ${evolveCost(sp) - char.gold} de ouro.` : ''}</div>` : ''}
        </div>
        <div class="sp-btns">
          ${active ? '<span class="tag">Ativo</span>' : `<button class="btn small" data-action="spirit-on" data-arg="${sp.id}">Ativar</button>`}
          ${!evo ? '' : evo.ok ? `<button class="btn small" data-action="spirit-evolve" data-arg="${sp.id}" ${char.gold < evolveCost(sp) ? 'disabled' : ''}>Evoluir · ${COIN} ${evolveCost(sp)}</button>` : `<span class="tag dim">${evo.state === 'locked' ? `Evolui no Nv ${EVOLVE_LEVEL}` : evo.state === 'active' ? 'Missão em curso' : 'Fale com a Yun'}</span>`}
          <button class="btn small ghost" data-action="spirit-free" data-arg="${sp.id}">Libertar</button>
        </div></div>`;
    }).join('') : '<p class="empty-msg">Você ainda não tem spirits. Derrote monstros para achar <b>Essências</b> ou visite a Sábia Yun na vila.</p>';
    return this.frame('spirits', `Spirits <small>${char.spirits.length}/${MAX_SPIRITS}</small>`, `
      <p class="hint">O spirit ativo luta ao seu lado e ganha XP junto com você (até o seu nível).</p>
      <div class="sp-list">${list}</div>`);
  }

  panel_shop() {
    const { char } = this.game, harbor = this.shopAnchor === 'harbor';
    const shopStock = harbor ? this.game.harborStock : this.game.shopStock; // Porto: estoque do dia (shop.js buildHarborStock), preços próprios, venda a 60%
    const stock = shopStock.map((it, i) => `
      <div class="shop-item">${this.itemCell(it, 'buy-item', i)}
        <div><div class="nm" style="color:${RARITY[it.rarity].color}">${esc(it.name)}</div><div class="sub">${SLOT_NAMES[it.slot]} · Nv ${it.level}</div></div>
        <button class="btn small" data-action="buy-item" data-arg="${i}">${COIN} ${itemPrice(it)}</button></div>`).join('') || `<p class="empty-msg">${harbor ? 'Estoque do dia esgotado. O cais traz mercadoria nova amanhã.' : 'Estoque esgotado. Volte após subir de nível.'}</p>`;
    const potion = PRICES.potion(char.level);
    return this.frame('shop', harbor ? 'Mercador do Porto' : this.shopAnchor === 'smith' ? 'Ferreiro Brok' : 'Mercadora Lia', `
      <p class="npc-line">${npcEmblem(harbor ? 'dealer' : 'merchant')}${harbor ? '"Do cais para a sua mochila! O estoque muda todo dia, e compro seus itens por 60% do valor."' : '"Poções fresquinhas e equipamentos de viajantes! Vendo e compro."'}</p>
      <div class="shop-item"><div class="cell r-common"><span class="ic"><img class="it-img" src="${asset('assets/icons/item/res-potion-health.webp')}" alt="🧪" draggable="false"></span></div>
        <div><div class="nm">Poção de Vida</div><div class="sub">Cura 35% da vida · botão ${POT}</div></div>
        <div class="btn-col"><button class="btn small" data-action="buy-potion" data-arg="1">1 · ${COIN} ${potion}</button>
        <button class="btn small" data-action="buy-potion" data-arg="5">5 · ${COIN} ${potion * 5}</button></div></div>
      <div class="shop-item"><div class="cell r-uncommon"><span class="ic"><img class="it-img" src="${asset('assets/icons/item/res-scroll.webp')}" alt="📜" draggable="false"></span></div>
        <div><div class="nm">Pergaminho de Viagem</div><div class="sub">Teletransporte a mapa visitado · tem ${char.scrolls ?? 0}</div></div>
        <div class="btn-col"><button class="btn small" data-action="buy-scroll" data-arg="1">1 · ${COIN} ${PRICES.scroll(char.level)}</button>
        <button class="btn small" data-action="buy-scroll" data-arg="3">3 · ${COIN} ${PRICES.scroll(char.level) * 3}</button></div></div>
      <h3>${harbor ? 'Estoque do dia' : 'Equipamentos'}</h3>${stock}
      ${harbor ? '' : this.smithSection()}
      <h3>Vender em lote${harbor ? ' <span class="pts">60%</span>' : ''}</h3>
      <div class="row-btns"><button class="btn small" data-action="sell-bulk" data-arg="0">Todos Comuns</button>
      <button class="btn small" data-action="sell-bulk" data-arg="1">Comuns + Incomuns</button></div>`);
  }

  // Ferreiro: aprimora os equipamentos vestidos (+1 a +${MAX_PLUS}); é o grande ralo de ouro de fim de jogo
  smithSection() {
    const { char } = this.game;
    const rows = SLOTS.map((sl) => char.equipment[sl]).filter(Boolean).map((it) => {
      const max = (it.plus ?? 0) >= MAX_PLUS, cost = enhanceCost(it);
      return `<div class="shop-item">${this.itemCell(it, 'unequip', it.slot)}
        <div><div class="nm" style="color:${RARITY[it.rarity].color}">${esc(it.name)}${it.plus ? ` +${it.plus}` : ''}</div><div class="sub">${SLOT_NAMES[it.slot]} · +${it.plus ?? 0} de ${MAX_PLUS} · +${PLUS_BONUS * 100}% dos atributos por nível</div></div>
        ${max ? `<span class="tag">Máx +${MAX_PLUS}</span>` : `<button class="btn small" data-action="enhance" data-arg="${it.id}" ${char.gold < cost ? 'disabled' : ''}>+${(it.plus ?? 0) + 1} · ${COIN} ${cost}</button>`}</div>`;
    }).join('') || '<p class="empty-msg">Equipe um item para aprimorá-lo.</p>';
    return `<h3 id="smith-section">${this.shopAnchor === 'smith' ? 'Aprimorar equipado' : 'Ferreiro Brok · aprimorar equipado'} <span class="pts">máx +${MAX_PLUS}</span></h3>${rows}`;
  }

  panel_arena() {
    const { char } = this.game;
    const tier = tierFor(char.arena.rating);
    return this.frame('arena', 'Mestre Doran', `
      <p class="npc-line">${npcEmblem('arena')}"A arena guarda os ecos de todos que lutaram aqui. Prove seu valor!"</p>
      <div class="arena-badge" style="--tc:${tier.color}"><div class="tier">${tier.name}</div><div class="rt">${char.arena.rating}</div>
        <div class="wl">${char.arena.wins}V · ${char.arena.losses}D · Melhor onda: ${char.arena.bestWave}</div></div>
      <div class="arena-badge"><div class="wl">${POWER()} Seu poder: <b>${playerPower(char)}</b></div></div>
      ${pvpUnlocked(char) ? Object.entries(MODES).map(([id, md]) => `<button class="btn primary wide" data-action="match" data-arg="${id}">${ARENA()} Grande Arena ${md.label} · rating ${getRating(char, id)}</button>`).join('') : `<p class="hint">${LOCK} O PvP libera no <b>nível ${PVP_MIN_LEVEL}</b> (você está no ${char.level}).</p>`}
      <p class="hint">Times de ecos (aliados e inimigos com classe, itens e spirit próprios) na Grande Arena. Segure o ponto central: 100 pontos vencem; eliminar o outro time também. Cada modo tem seu rating. Poções desativadas.</p>
      ${this.game.online ? this.onlineArenaBlock(char) : ''}
      <button class="btn wide" data-action="waves">${WAVES} Desafio de Ondas (PvE)</button>
      <p class="hint">Sobreviva a ondas crescentes de monstros. Ouro a cada onda vencida, chefes a cada 10.</p>
      <p class="soon">${LOCK} Em breve: duelos contra jogadores reais.</p>`);
  }

  // Arena online: partidas com jogadores reais (servidor autoritativo) e cooperativo. Só aparece com conta.
  onlineArenaBlock(char) {
    const net = this.game.net, q = net?.queue;
    if (!net?.joined) return `<p class="hint">${PARTY} Conectando ao servidor de partidas…</p>`;
    if (q) return `<p class="hint">${SEARCH} Procurando <b>${q.mode === 'coop' ? 'cooperativo' : q.mode}</b>… ${q.waited}s</p><button class="btn wide" data-action="net-cancel">Cancelar busca</button>`;
    const pvp = pvpUnlocked(char);
    const modes = Object.entries(MODES).map(([id, md]) => `<button class="btn ${pvp ? 'primary' : ''} wide" data-action="net-queue" data-arg="${id}" ${pvp ? '' : 'disabled'}>${PARTY} ${md.label} com jogadores reais · rating ${getRating(char, id)}</button>`).join('');
    return `<h3>Jogadores reais</h3>${pvp ? '' : `<p class="hint">${LOCK} PvP online libera no nível ${PVP_MIN_LEVEL}.</p>`}${modes}
      <button class="btn wide" data-action="net-queue" data-arg="coop">${PARTY} Cooperativo: ondas e chefe (1–4 jogadores)</button>
      <p class="hint">Aliados e adversários são pareados por rating e poder; vagas vazias são preenchidas por bots. Grupo: botão Grupo do menu.</p>
      <button class="btn small" data-action="toggle" data-arg="party">${PARTY} Grupo</button>`;
  }

  panel_party() {
    const net = this.game.net;
    if (!net?.joined) return this.frame('party', 'Grupo', '<p class="hint">Entre com sua conta e espere a conexão com o servidor de partidas.</p>');
    const p = net.party, me = net.name;
    const members = p ? p.members.map((m) => `<div class="shop-item"><div class="cell"><span class="ic">${CLASSES[m.classId]?.icon ?? '?'}</span></div>
      <div><div class="nm">${esc(m.name)} ${p.leader === m.name ? '<small class="tag">líder</small>' : ''}</div><div class="sub">Nv ${m.level} · ${m.online ? 'online' : 'desconectado'}</div></div>
      ${p.leader === me && m.name !== me ? `<button class="btn small" data-action="party-kick" data-arg="${esc(m.name)}">Expulsar</button>` : ''}</div>`).join('') : '<p class="hint">Você não está em um grupo. Convide alguém pelo nome.</p>';
    const invites = net.invites.map((i) => `<div class="shop-item"><div><div class="nm">${esc(i.from)} convidou você</div></div>
      <button class="btn small primary" data-action="party-accept" data-arg="${i.partyId}">Aceitar</button><button class="btn small" data-action="party-decline" data-arg="${i.partyId}">Recusar</button></div>`).join('');
    const notes = net.notes.slice(-3).map((n) => `<p class="hint">${esc(noticeText(n))}</p>`).join('');
    return this.frame('party', 'Grupo', `
      ${invites}${members}
      <div class="row-btns"><input id="party-name" maxlength="14" placeholder="Nome do jogador" autocomplete="off" /><button class="btn small primary" data-action="party-invite">Convidar</button></div>
      ${p ? '<button class="btn small" data-action="party-leave">Sair do grupo</button>' : ''}
      ${notes}
      <p class="hint">O líder do grupo escolhe a fila; o grupo joga junto no mesmo time.</p>`);
  }

  // ---- diálogo com NPC (missões) ----
  panel_dialog() {
    const g = this.game, char = g.char, npc = (g.world.zone.npcs ?? []).find((n) => n.id === g.dialogNpc);
    if (!npc) return '';
    const D = DIALOGS[npc.id] ?? { greet: '…', service: null };
    ensureJournal(char);
    const ready = readyFor(char, npc.id)[0], offer = offeredBy(char, npc.id, { server: !!g.online })[0], active = activeFor(char, npc.id)[0];
    let text = greetFor(char, D.greet, { online: !!g.online }), body = '', foot = '';
    const rewardLine = (q) => { const r = q.reward; return `<p class="hint">Recompensa: ${[r.gold ? `${COIN} ${r.gold}` : '', r.xp ? `${r.xp} XP` : '', r.potions ? `${POT} ${r.potions}` : '', ...(r.items ?? []).map((i) => `item ${RARITY[i.rarity]?.name ?? ''}`)].filter(Boolean).join(' · ')}</p>`; };
    if (ready) { const q = QUESTS[ready]; text = q.text.done; body = `<h3>✔ ${q.name}</h3>`; foot = `${rewardLine(q)}<button class="btn primary wide" data-action="quest-turnin" data-arg="${q.id}">Entregar missão</button>`; }
    else if (offer) { const q = offer; text = q.text.offer; body = `<h3>${q.name} <span class="pts">Nv ${q.level}+</span></h3><ul>${q.objectives.map((o) => `<li>${esc(o.label)}</li>`).join('')}</ul>`; foot = `${rewardLine(q)}<button class="btn primary wide" data-action="quest-accept" data-arg="${q.id}">Aceitar missão</button>`; }
    else if (active) { const q = QUESTS[active]; text = q.text.progress; body = `<h3>${q.name}</h3>${this.questLines(char, active)}`; }
    const more = (offeredBy(char, npc.id, { server: !!g.online }).length > (offer ? 1 : 0)) ? '<p class="hint">Tenho mais trabalho para você depois desta.</p>' : '';
    const S = serviceFor(char, D); // serviço do Mestre de Classe só aparece para a própria classe
    const svc = S ? `<button class="btn wide" data-action="dialog-service" data-arg="${S.panel}">${S.label}</button>` : '';
    const say = (Array.isArray(text) ? text : [text]).map(esc).join('<br>'); // `done` pode ser uma lista de falas (epílogo)
    // texto e lista rolam; recompensa e botões ficam num rodapé fixo, sempre visível (epílogos longos)
    return this.frame('dialog', npc.name, `<div class="dlg-scroll"><p class="npc-line">${npcEmblem(npc.id)}"${say}"</p>${body}${more}</div><div class="dlg-foot">${foot}${svc}</div>`);
  }

  questLines(char, id) {
    const q = QUESTS[id], a = char.quests.active[id];
    return '<ul class="qlist">' + q.objectives.map((o, i) => { const max = o.count ?? 1, v = a?.p[i] ?? 0; return `<li class="${v >= max ? 'done' : ''}">${esc(o.label)} <b>${v}/${max}</b>${o.type === 'pvp' || o.type === 'coop' ? ' <small>(contado pelo servidor)</small>' : ''}</li>`; }).join('') + '</ul>';
  }

  // nomes dos NPCs que dão missões (gerados de QUESTS + NPCs da Vila): "A, B e C"
  questGiverNames(char = this.game.char) {
    const npcs = [...(ZONES.town.npcs ?? []), ...(ZONES.harbor.npcs ?? [])];
    const names = [...new Set(Object.values(QUESTS).map((q) => questGiverId(char, q)))] // 'master' vira o mestre da classe do jogador.map((id) => npcs.find((n) => n.id === id)?.name).filter(Boolean).map(esc);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0] ?? 'os moradores da Vila';
  }

  // ---- diário: missões e conquistas ----
  panel_journal() {
    const g = this.game, char = g.char;
    ensureJournal(char);
    const act = Object.keys(char.quests.active);
    const missions = act.length ? act.map((id) => `<div class="shop-item quest-card"><div class="qtxt"><div class="nm">${esc(QUESTS[id].name)}</div>${this.questLines(char, id)}<div class="sub">${esc(QUESTS[id].text.progress)}</div></div>
      <button class="btn small" data-action="quest-abandon" data-arg="${id}">Abandonar</button></div>`).join('') : `<p class="hint">Nenhuma missão ativa. Converse com ${this.questGiverNames()}.</p>`;
    const done = Object.keys(char.quests.done).length;
    const ach = ACHIEVEMENTS.map((a) => { const p = achievementProgress(char, a); return `<div class="shop-item ${p.earned ? '' : 'locked'}"><div class="cell ${p.earned ? 'r-epic' : ''}"><span class="ic">${p.earned ? TROPHY : LOCK_CELL}</span></div>
      <div><div class="nm">${esc(a.name)}</div><div class="sub">${esc(a.desc)} ${p.earned ? '' : `(${p.value}/${p.min})`}</div></div>
      ${p.earned && a.title ? `<button class="btn small ${char.title === a.id ? 'primary' : ''}" data-action="set-title" data-arg="${a.id}">${char.title === a.id ? 'Título ✔' : 'Usar título'}</button>` : ''}</div>`; }).join('');
    // Inscrições lidas (placas e estátuas das zonas) e dicas já vistas: só texto
    const lore = LORE_ZONES.map((id) => { const l = (ZONES[id].lore ?? [])[0]; return l && loreSeen(char, id) ? `<p class="hint"><b>${esc(ZONES[id].name)}:</b> “${esc(l.text)}”</p>` : ''; }).join('');
    const tips = Object.keys(TIPS).filter((k) => tipSeen(char, k)).map((k) => `<p class="hint"><b>${esc(TIPS[k][0])}:</b> ${esc(TIPS[k][1])}</p>`).join('');
    const notes = `<h3>Inscrições <span class="pts">${loreCount(char)}/${LORE_ZONES.length}</span></h3>${lore || '<p class="hint">Placas e estátuas nas zonas guardam frases dos ecos. Chegue perto e toque no pergaminho.</p>'}${tips ? `<h3>Dicas vistas</h3>${tips}` : ''}`;
    return this.frame('journal', 'Diário', `<h3>Missões ativas <span class="pts">${act.length}/5</span></h3>${missions}<p class="hint">Concluídas: ${done} · Baús abertos: ${char.stats.chests} · Criaturas derrotadas: ${char.stats.kills}</p>
      ${notes}
      <h3>Conquistas <span class="pts">${Object.keys(char.achievements).length}/${ACHIEVEMENTS.length}</span></h3>${ach}
      ${char.title ? '<button class="btn small" data-action="set-title" data-arg="">Remover título</button>' : ''}`);
  }

  // ---- mapa-múndi: mini-mundo com os 6 mapas como nós ligados por caminhos; tocar num nó abre o cartão de viagem ----
  mapCard(id, here) {
    const g = this.game, c = g.char, z = ZONES[id], vis = c.visited ?? {}, i = WORLD_ROUTE.indexOf(id);
    const seen = id === 'town' || !!vis[id], cost = teleportCost(id), scrolls = c.scrolls ?? 0, net = g.inNetZone?.();
    const lv = z.level ? `Nv ${z.level[0]}–${z.level[1]}${z.scale ? '+' : ''}` : 'zona segura';
    const boss = z.boss ? `Chefe: ${esc(MOBS[z.boss.id].name)}` : z.miniboss ? `Mini-chefe: ${esc(z.miniboss.name)}` : '';
    const info = [lv, boss, z.chests ? `${z.chests.length} baús` : ''].filter(Boolean).join(' · ');
    let act;
    if (id === here) act = `<span class="tag">${HERE} Você está aqui</span>`;
    else if (!seen) act = `<span class="tag dim">${LOCK} Ainda não visitado: chegue lá a pé, pelo portal de ${esc(ZONES[WORLD_ROUTE[Math.max(0, i - 1)]].name)}.</span>`;
    else if (net && id !== 'town') act = `<span class="tag dim">${LOCK} Na exploração online, volte à Vila antes de viajar.</span>`;
    else if (g.mode !== 'explore' && !(net && id === 'town')) act = `<span class="tag dim">${LOCK} Indisponível agora.</span>`;
    else if (cost > scrolls) act = `<button class="btn" disabled>Viajar para ${esc(z.name)}</button><span class="tag dim">Sem Pergaminho (você tem ${scrolls}): a Mercadora Lia vende.</span>`;
    else act = `<button class="btn primary" data-action="teleport" data-arg="${id}">Viajar para ${esc(z.name)}${cost ? ` — gasta ${cost} Pergaminho` : ' — grátis'}</button>${cost ? `<span class="mp-have">${SCROLL} você tem ${scrolls}</span>` : ''}`;
    return `<div class="mp-card"><span class="mp-card-ic">${zoneIcon(id)}</span><div class="mp-card-tx"><div class="nm">${esc(z.name)}</div><div class="sub">${info}</div></div><div class="mp-card-act">${act}</div></div>`;
  }

  panel_map() {
    const g = this.game, here = g.world.zoneId, vis = g.char.visited ?? {};
    const route = WORLD_ROUTE, sel = ZONES[this.mapSel] ? this.mapSel : here;
    const pos = mapPos;
    const seen = (id) => id === 'town' || !!vis[id];
    const lines = route.slice(1).map((id, i) => { const a = pos(route[i]), b = pos(id), lit = seen(route[i]) && seen(id); return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="${lit ? 'lit' : ''}"/>`; }).join('');
    const nodes = route.map((id) => {
      const z = ZONES[id], [x, y] = pos(id), lv = z.level ? `Nv ${z.level[0]}–${z.level[1]}${z.scale ? '+' : ''}` : 'segura', ok = seen(id);
      return `<button class="mp-node${id === here ? ' here' : ''}${id === sel ? ' sel' : ''}${ok ? '' : ' locked'}" style="left:${x}%;top:${y}%" data-action="map-sel" data-arg="${id}" aria-label="${esc(z.name)}">
        ${id === here ? `<span class="mp-pin">${HERE}</span>` : ''}<span class="mp-ic">${zoneIcon(id)}${ok ? '' : `<span class="mp-lock">${LOCK}</span>`}</span>
        <span class="mp-nm">${esc(z.name)}</span><span class="mp-lv">${lv}</span></button>`;
    }).join('');
    return this.frame('map', 'Mapa de Aetheria', `<div class="mp-world"><svg class="mp-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${nodes}</div>
      ${this.mapCard(sel, here)}
      <p class="hint mp-hint">Toque num mapa visitado para viajar. Ir para a Vila é grátis; os outros gastam 1 Pergaminho (Mercadora Lia).</p>`);
  }

  // ---- Porto de Marfim: banco (40 vagas) e quadro de contratos diários ----
  panel_bank() {
    const { char } = this.game, bank = ensureBank(char);
    const cells = [];
    for (let i = 0; i < BANK_SIZE; i++) cells.push(bank[i] ? this.itemCell(bank[i], 'bank-take', bank[i].id) : '<div class="cell empty"></div>');
    return this.frame('bank', `Banco de Marfim <small>${bank.length}/${BANK_SIZE}</small>`, `
      <p class="npc-line">${npcEmblem('banker')}"Guardo o que a mochila não aguenta. Quarenta vagas, sem juros e sem perguntas."</p>
      <div class="inv-grid bank-grid">${cells.join('')}</div>
      <p class="hint">Toque num item da <b>mochila</b> para guardar; toque num item <b>do banco</b> para retirar. Equipamentos vestidos não entram: tire-os antes.</p>`);
  }

  panel_board() {
    const { char } = this.game, day = dayUTC(), st = dailyState(char, day);
    const left = Math.max(0, (day + 1) * 86400000 - Date.now()), h = Math.floor(left / 3600000), m = Math.floor((left % 3600000) / 60000);
    const rows = dailyBoard(char, day).map((c) => {
      const p = dailyProgressOf(char, c), done = !!st.done[c.id], ready = !done && dailyComplete(char, c), r = c.reward;
      const act = done ? '<span class="tag">Entregue</span>' : ready ? `<button class="btn small primary" data-action="daily-claim" data-arg="${c.id}">Entregar</button>` : '<span class="tag dim">Em andamento</span>';
      return `<div class="shop-item daily${done ? ' locked' : ''}"><div class="cell ${ready ? 'r-epic' : 'r-uncommon'}"><span class="ic">${c.kind === 'chest' ? LOCK_CELL : TROPHY}</span></div>
        <div><div class="nm">${esc(c.label)}</div>
          <div class="mini-bar"><div style="width:${done ? 100 : (100 * p) / c.count}%"></div></div>
          <div class="sub">${done ? c.count : p}/${c.count} · Recompensa: ${COIN} ${r.gold} · ${r.xp} XP · ${POT} ${r.potions}</div></div>
        ${act}</div>`;
    }).join('');
    return this.frame('board', 'Quadro de Contratos', `
      <p class="npc-line">${npcEmblem('hunter')}"Três contratos por dia, pagamento na entrega. O quadro renova à meia-noite (horário universal)."</p>
      ${rows}
      <p class="hint">Novo quadro em ${h}h ${String(m).padStart(2, '0')}min. Progresso e entregas são do dia.</p>`);
  }

  panel_sage() {
    const { char } = this.game;
    const types = Object.values(SPIRITS).map((S) => `<div class="sage-type" style="--sc:${S.color}">${spiritImg(Object.keys(SPIRITS).find((k) => SPIRITS[k] === S))}<b>${S.name}</b><span>${S.element} · ${S.role}</span></div>`).join('');
    return this.frame('sage', 'Sábia Yun', `
      <p class="npc-line">${npcEmblem('sage')}"Spirits são ecos da natureza. Escolha bem quem caminha ao seu lado."</p>
      <div class="sage-types">${types}</div>
      <div class="shop-item"><div class="cell r-uncommon"><span class="ic">${ESSENCE}</span></div>
        <div><div class="nm">Essência Selvagem</div><div class="sub">Spirit aleatório</div></div>
        <button class="btn small" data-action="buy-essence" data-arg="wild">${COIN} ${PRICES.essence(char.level)}</button></div>
      <div class="shop-item"><div class="cell r-epic"><span class="ic">${ESSENCE}</span></div>
        <div><div class="nm">Essência Prismática</div><div class="sub">Spirit Raro ou melhor</div></div>
        <button class="btn small" data-action="buy-essence" data-arg="prism">${COIN} ${PRICES.prism(char.level)}</button></div>
      <div class="row-btns"><button class="btn small" data-action="toggle" data-arg="spirits">Ver meus spirits</button></div>`);
  }

  panel_options() {
    const pr = this.game.prefs, eff = resolveScale(pr, innerWidth, innerHeight);
    const seg = (key, items) => `<div class="seg">${items.map(([v, label]) => `<button class="btn small ${pr[key] === v ? 'sel' : ''}" data-action="pref" data-arg="${key}:${v}">${label}</button>`).join('')}</div>`;
    return this.frame('options', 'Opções', `<div class="cols"><div class="col">
      <div class="opt-row"><b>Tamanho da interface</b>
        <div class="seg"><button class="btn small" data-action="pref" data-arg="scale:-10" ${eff <= SCALE_MIN ? 'disabled' : ''}>−</button>
        <span class="opt-val">${eff}%${pr.scale === 'auto' ? ' · auto' : ''}</span>
        <button class="btn small" data-action="pref" data-arg="scale:+10" ${eff >= SCALE_MAX ? 'disabled' : ''}>+</button>
        <button class="btn small ${pr.scale === 'auto' ? 'sel' : ''}" data-action="pref" data-arg="scale:auto">Auto</button></div></div>
      <div class="opt-row"><b>Qualidade gráfica</b>${seg('quality', [['auto', 'Auto'], ['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa']])}</div>
      <p class="hint">Baixa e média reduzem névoa, partículas e resolução: ajudam em celulares fracos e economizam bateria.</p>
      <div class="opt-row"><b>Controles</b>${seg('controls', [['auto', 'Toque (padrão)'], ['keyboard', 'Teclado e mouse']])}</div>
      <p class="hint">À noite o ar escurece e as criaturas enxergam mais longe, mas dão um pouco mais de XP, ouro e itens. "Sempre dia" muda só a aparência.</p>
      <div class="opt-row"><b>Tela cheia</b><button class="btn small" data-action="fullscreen">Alternar</button></div>
      <p class="hint">As opções valem para este aparelho e ficam salvas nele. O personagem é salvo à parte.</p>
      </div><div class="col">
      ${this.game.online ? '<div class="opt-row"><b>Conta</b><div class="seg"><button class="btn small" data-action="switch-char">Trocar personagem</button><button class="btn small" data-action="logout">Sair</button></div></div>' : ''}
      <div class="opt-row"><b>Save do personagem</b><div class="seg"><button class="btn small" data-action="save-export">Exportar</button><button class="btn small" data-action="save-import">Importar</button></div></div>
      <p class="hint">Exportar baixa um arquivo com seu personagem (guarde como backup ou leve para outro aparelho). Importar substitui o personagem atual.</p>
      </div></div>`);
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
      return `<div class="tt-name">${skillImg(arg, s.icon, 'tt-ic')} ${s.name}</div><div class="tt-sub">Recarga ${s.cd}s · <span class="tt-cat cat-${skillCategory(s)}">${CATEGORIES[skillCategory(s)]}</span></div><div>${s.desc}</div>
        ${s.mult ? `<div class="tt-stat">${Math.round(s.mult * 100)}% do poder${s.ticks ? ` × ${s.ticks}` : ''}</div>` : ''}`;
    }
    if (kind === 'potion') return `<div class="tt-name">${iconImg(POTION_ICON, '🧪', 'tt-ic')} Poção de Vida</div><div>Cura 35% da vida. Recarga 8s.</div><div class="tt-sub">Você tem ${char.potions}. Desativada no duelo PvP.</div>`;
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
    const mul = plusMul(it);
    const lines = Object.entries(it.stats).map(([k, v]) => `<div class="tt-stat">${fmtStat(k, mul === 1 ? v : Math.round(v * mul * 10) / 10)}</div>`).join('');
    const plusLine = it.plus ? `<div class="tt-sub tt-plus">Aprimorado +${it.plus} de ${MAX_PLUS}${it.plus >= MAX_PLUS ? ' (MÁXIMO)' : ''} · +${Math.round(PLUS_BONUS * it.plus * 100)}% nos atributos</div>` : (it.slot ? `<div class="tt-sub">Aprimoramento +0 de ${MAX_PLUS} (Ferreiro Brok)</div>` : '');
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
    const inShop = this.game.shopStock.some((s) => s.id === it.id) || this.game.harborStock.some((s) => s.id === it.id);
    const cid = itemClassId(it), wrongClass = cid && cid !== char.classId;
    let action = '';
    const again = this.game.touch?.active ? 'Toque de novo' : 'Clique';
    if (inShop) action = `Preço: ${COIN} ${itemPrice(it)}`;
    else if (this.isOpen('bank')) action = this.game.char.bank?.some((b) => b.id === it.id) ? `${again} para retirar` : `${again} para guardar no banco`;
    else if (equipped) action = `${again} para desequipar`;
    else if (this.isOpen('shop')) action = `${again} para vender por ${COIN} ${this.game.sellPrice(it)}`;
    else if (ok.ok) action = `${again} para equipar`;
    return `<div class="tt-name" style="color:${R.color}">${esc(it.name)}${it.plus ? ` +${it.plus}` : ''}</div><div class="tt-sub">${sub}</div>${plusLine}${lines}
      ${cid ? `<div class="${wrongClass ? 'tt-req' : 'tt-sub'}">Apenas para ${esc(itemClassName(it))}</div>` : ''}${ok.ok || wrongClass && ok.reason.startsWith('Apenas') ? '' : `<div class="tt-req">${ok.reason}</div>`}${cmp}
      <div class="tt-foot">${action}${!inShop && !this.isOpen('shop') ? `${action ? ' · ' : ''}vale ${COIN} ${this.game.sellPrice(it)}` : ''}</div>`;
  }
}

export { RARITIES };
