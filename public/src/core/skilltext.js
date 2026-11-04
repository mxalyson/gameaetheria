// Explicação das habilidades gerada a partir dos DADOS (sem DOM, sem teclas): serve ao cartão de segurar, ao painel Habilidades,
// às escolhas de especialização e às dicas do mouse. Lê os campos de forma genérica (nada depende de ids): skill nova com os mesmos
// campos já ganha texto; campo desconhecido é ignorado e, sem `kind` conhecido, o resumo cai no `desc` manual.
import { CLASSES } from '../data/classes.js';
import { SKILLS, SKILL_UNLOCK } from '../data/skills.js';
import { SPECS } from '../data/specs.js';
import { skillOf, basicOf } from './specs.js';
import { skillIdAt, kitOf } from './unlocks.js';

const MASTERY_IDX = 3;

// ---- formatação (pt-BR, valores arredondados) ----
const num = (n) => { const r = Math.round(n * 10) / 10; return String(r).replace('.', ','); };
const pct = (x) => `${Math.round(x * 100)}%`;
const secs = (s) => `${num(s)} s`;
const ok = (v) => typeof v === 'number' && Number.isFinite(v);
const reach = (d) => (d < 300 ? 'curto' : d < 600 ? 'médio' : 'longo'); // distância em unidades do jogo: o jogador entende melhor "curto/médio/longo"

const BUFF_TEXT = {
  dmg: (v) => `+${pct(v)} de dano`,
  dr: (v) => `-${pct(v)} de dano recebido`,
  shieldPct: null, // tratado como escudo
  crit: (v) => `+${num(v)}% de crítico`,
  atkSpeed: (v) => `+${pct(v)} de velocidade de ataque`,
  moveSpeed: (v) => `+${pct(v)} de velocidade de movimento`,
  move: (v) => `+${pct(v)} de velocidade de movimento`,
  as: (v) => `+${pct(v)} de velocidade de ataque`,
  ls: (v) => `${pct(v)} de roubo de vida`,
  reflect: (v) => `devolve ${pct(v)} do dano sofrido ao agressor`,
  imm: () => 'imune a dano',
};

const KIND_TYPE = {
  aoe_self: 'Ataque em área', projectile: 'Projétil', dash: 'Movimento', buff: 'Reforço', blink: 'Movimento',
  ground_aoe: 'Área no chão', meteor: 'Ataque em área', divine: 'Cura e proteção',
  cone: 'Golpe em cone', zone: 'Zona no chão', channel: 'Canalização', trap: 'Armadilha', summon: 'Invocação',
};

// Tipo legível; ajusta pelo conteúdo (cura pura, escudo, investida com dano...).
function typeOf(s) {
  if (s.kind === 'aoe_self') return s.heal && !(s.mult > 0) ? 'Cura' : s.heal ? 'Cura e dano em área' : 'Ataque em área';
  if (s.kind === 'buff') return s.buff?.shieldPct ? 'Proteção' : 'Reforço';
  if (s.kind === 'divine') return s.mult > 0 ? 'Cura, proteção e dano' : 'Cura e proteção';
  if (s.kind === 'dash') return s.invuln ? 'Movimento' : s.mult > 0 ? 'Investida' : 'Movimento';
  if (s.kind === 'projectile') return s.volley > 1 ? 'Projéteis em leque' : s.pierce ? 'Projétil perfurante' : s.explode > 0 ? 'Projétil explosivo' : 'Projétil';
  return KIND_TYPE[s.kind] ?? 'Habilidade';
}

// Efeitos de controle/dano contínuo em uma lista de frases curtas.
function effectsOf(s) {
  const e = [];
  if (s.stun > 0) e.push(`atordoa ${secs(s.stun)}`);
  if (s.slow > 0) e.push(`desacelera ${pct(s.slow)}${s.slowDur > 0 ? ` por ${secs(s.slowDur)}` : ''}`);
  if (s.burn && s.burn.dur > 0) e.push(`queima por ${secs(s.burn.dur)} (${pct(s.burn.mult ?? 0)} do poder a cada ${secs(s.burn.every ?? 1)})`);
  if (s.rootStun > 0) e.push(`prende ${secs(s.rootStun)}`);
  if (s.mark && s.mark.dur > 0) e.push(`marca o alvo: +${pct(s.mark.taken ?? 0)} de dano recebido por ${secs(s.mark.dur)}`);
  if (s.burn && s.burn.spread > 0) e.push(`se o alvo morrer, passa a inimigos num raio de ${num(s.burn.spread)}`);
  if (s.leech > 0) e.push(`devolve ${pct(s.leech)} do dano como vida`);
  if (s.knock > 0) e.push('empurra quem atingir');
  if (s.twice) e.push(`pode ser usada 2 vezes em ${secs(s.twice.window ?? 0)}`);
  if (s.leave) e.push(`deixa uma mina (raio ${num(s.leave.radius ?? 0)}, ${pct(s.leave.mult ?? 0)} do poder${s.leave.stun > 0 ? `, atordoa ${secs(s.leave.stun)}` : ''}) após ${secs(s.leave.delay ?? 0)}`);
  if (s.windup > 0) e.push(`mira por ${secs(s.windup)} antes de disparar`);
  if (s.waves > 1) e.push(`${s.waves} rajadas seguidas${s.waveEvery > 0 ? `, uma a cada ${secs(s.waveEvery)}` : ''}`);
  if (s.pierce) e.push('atravessa todos os inimigos');
  if (s.invuln) e.push('invulnerável durante o movimento');
  if (s.kind === 'divine') e.push('remove atordoamento e lentidão');
  if (s.castStunned) e.push('pode ser usada atordoado');
  if (s.aegis) e.push(`dá escudo de ${pct(s.aegis.shield ?? 0)} da vida a aliados num raio de ${num(s.aegis.range ?? 0)}`);
  return e;
}

// Linhas "Rótulo: valor" com os números da habilidade (já resolvida pela especialização). `power` é opcional: com ele sai o "≈ N".
function detailLines(s, power) {
  const L = [];
  const add = (k, v) => { if (v) L.push({ k, v }); };
  if (ok(s.mult) && s.mult > 0) {
    let v = `${pct(s.mult)} do seu poder`;
    const zoneHits = (s.kind === 'zone' || s.kind === 'summon' || s.kind === 'trap') && s.interval > 0 && s.dur > 0 ? Math.floor(s.dur / s.interval) : 0;
    const hits = (s.volley > 1 ? s.volley : s.ticks > 1 ? s.ticks : zoneHits > 1 ? zoneHits : 1) * (s.waves > 1 ? s.waves : 1) * (s.count > 1 && s.kind === 'summon' ? s.count : 1);
    if (ok(power) && power > 0) v += ` (≈ ${Math.round(power * s.mult)} com seus atributos)`;
    if (s.waves > 1) v += ` × ${s.volley > 1 ? s.volley : 1} × ${s.waves} rajadas`;
    else if (s.volley > 1) v += ` × ${s.volley} projéteis`;
    else if (s.ticks > 1) v += ` × ${s.ticks} golpes`;
    else if (zoneHits > 1) v += ` a cada ${secs(s.interval)} por ${secs(s.dur)}`;
    if (hits > 1) v += ` — total ${pct(s.mult * hits)}`;
    add(s.kind === 'dash' ? 'Dano da investida' : 'Dano', v);
  }
  if (s.slam) add('Impacto ao chegar', `${pct(s.slam.mult ?? 0)} do poder, raio ${num(s.slam.radius ?? 0)}${s.slam.stun > 0 ? `, atordoa ${secs(s.slam.stun)}` : ''}`);
  if (s.burn && s.burn.dur > 0 && ok(power) && power > 0) add('Dano contínuo', `≈ ${Math.round(power * (s.burn.mult ?? 0))} a cada ${secs(s.burn.every ?? 1)}`);
  if (s.heal > 0) {
    let v = `${pct(s.heal)} da vida máxima`;
    if (s.allyHeal > 0) v += `; aliados próximos recebem ${pct(s.allyHeal)} disso`;
    add('Cura', v);
  }
  const sh = s.buff?.shieldPct ?? s.shieldPct;
  if (sh > 0) {
    let v = `${pct(sh)} da vida máxima${s.dur > 0 ? ` por ${secs(s.dur)}` : ''}`;
    if (s.allyShield > 0) v += `; o aliado mais próximo${s.allyRange ? ` (até ${num(s.allyRange)})` : ''} recebe ${pct(s.allyShield)} dele`;
    else if (s.kind === 'divine' && s.allyHeal > 0) v += `; aliados próximos recebem ${pct(s.allyHeal)} disso`;
    add('Escudo', v);
  }
  if (s.buff) {
    const parts = [];
    for (const [k, v] of Object.entries(s.buff)) {
      if (!ok(v) || k === 'shieldPct' || (s.buff.once && k === 'crit')) continue;
      parts.push(BUFF_TEXT[k] ? BUFF_TEXT[k](v) : `${k} ${num(v)}`);
    }
    if (parts.length) add('Reforço', `${parts.join(', ')}${s.dur > 0 ? ` por ${secs(s.dur)}` : ''}${s.allyBuff > 0 ? `; também aliados num raio de ${num(s.allyBuff)}` : ''}`);
  }
  if (s.groupShield) add('Escudo em grupo', `${pct(s.groupShield.pct ?? 0)} do seu escudo para todos os aliados num raio de ${num(s.groupShield.range ?? 0)}`);
  if (s.zone) {
    const z = [];
    if (s.zone.heal > 0) z.push(`cura ${pct(s.zone.heal)} da vida a cada ${secs(s.interval ?? 1)}`);
    if (s.zone.dr > 0) z.push(`-${pct(s.zone.dr)} de dano recebido`);
    if (z.length) add('Quem está dentro (você e aliados)', z.join(', '));
  }
  if (s.cost && s.cost.hp > 0) add('Custo', `${pct(s.cost.hp)} da vida máxima`);
  if (s.buff && s.buff.once) add('Próximo golpe', `${ok(s.buff.crit) ? `+${num(s.buff.crit)}% de crítico` : 'reforçado'} (só o primeiro, em até ${secs(s.dur ?? 0)})`);
  if (s.count > 1) add('Quantidade', `${s.count} ${s.kind === 'summon' ? 'espectros' : 'unidades'}`);
  const fx = effectsOf(s);
  if (fx.length) add('Efeitos', fx.join(', '));
  if (s.kind === 'channel' && s.ticks > 1 && s.interval > 0) add('Duração', `${secs(s.ticks * s.interval)} (quebra se for atordoado)`);
  if (s.kind === 'ground_aoe' && s.ticks > 1 && s.interval > 0) add('Duração', `${secs(s.ticks * s.interval)} (${s.ticks} golpes)`);
  if (s.kind === 'meteor' && s.delay > 0) add('Atraso', `cai ${secs(s.delay)} depois de marcar`);
  if (s.kind === 'projectile' && s.explode > 0) add('Explosão', `em área (raio ${num(s.explode)})`);
  if (s.arc > 0 && s.kind === 'cone') add('Abertura', `${Math.round((s.arc * 180) / Math.PI)}°`);
  if (ok(s.range) && s.range > 0) add('Alcance', `${reach(s.range)} (${num(s.range)})`);
  if (ok(s.dist) && s.dist > 0) add('Distância', `${reach(s.dist)} (${num(s.dist)})`);
  if (ok(s.radius) && s.radius > 0 && s.kind !== 'projectile') add('Raio da área', num(s.radius));
  if (ok(s.cd)) add('Recarga', secs(s.cd));
  return L;
}

// ---- mudanças da especialização (comparação campo a campo entre a habilidade base e a efetiva) ----
const FIELDS = {
  cd: ['Recarga', (v) => secs(v)],
  mult: ['Dano', (v) => `${pct(v)} do poder`],
  range: ['Alcance', (v) => num(v)],
  dist: ['Distância', (v) => num(v)],
  radius: ['Raio', (v) => num(v)],
  explode: ['Explosão', (v) => (v > 0 ? `raio ${num(v)}` : 'sem explosão')],
  dur: ['Duração', (v) => secs(v)],
  stun: ['Atordoamento', (v) => (v > 0 ? secs(v) : 'nenhum')],
  slow: ['Lentidão', (v) => (v > 0 ? pct(v) : 'nenhuma')],
  slowDur: ['Duração da lentidão', (v) => secs(v)],
  ticks: ['Golpes', (v) => String(v)],
  heal: ['Cura', (v) => `${pct(v)} da vida`],
  allyHeal: ['Parte dos aliados', (v) => pct(v)],
  allyShield: ['Escudo dos aliados', (v) => pct(v)],
  allyRange: ['Alcance dos aliados', (v) => num(v)],
  allyBuff: ['Reforço em aliados', (v) => (v > 0 ? `raio ${num(v)}` : 'não')],
  shieldPct: ['Escudo', (v) => `${pct(v)} da vida`],
  delay: ['Atraso', (v) => secs(v)],
  volley: ['Projéteis', (v) => String(v)],
  pierce: ['Perfuração', (v) => (v ? 'atravessa inimigos' : 'não atravessa')],
  invuln: ['Invulnerável', (v) => (v ? 'sim' : 'não')],
  burn: ['Queimadura', (v) => (v && v.dur > 0 ? `${secs(v.dur)} (${pct(v.mult ?? 0)} a cada ${secs(v.every ?? 1)})` : 'nenhuma')],
  aegis: ['Escudo em aliados', (v) => (v ? `${pct(v.shield ?? 0)} da vida, raio ${num(v.range ?? 0)}` : 'não')],
};
const SKIP = new Set(['desc', 'name', 'icon', 'color', 'speed', 'spread', 'vfxLife', 'kind']);

function fieldText(key, v) {
  const f = FIELDS[key];
  if (!f || v == null) return null;
  if (typeof v === 'number' && !ok(v)) return null;
  return f[1](v);
}

// Lista de mudanças [{k, v}] entre a base e a efetiva (para "Nesta especialização").
function diffLines(base, eff) {
  const L = [];
  if (base.name !== eff.name) L.push({ k: 'Nome', v: `${base.name} → ${eff.name}` });
  for (const key of Object.keys(eff)) {
    if (SKIP.has(key)) continue;
    if (key === 'buff') {
      const b0 = base.buff ?? {};
      for (const [bk, bv] of Object.entries(eff.buff ?? {})) {
        if (b0[bk] === bv || !ok(bv)) continue;
        const fn = bk === 'shieldPct' ? FIELDS.shieldPct[1] : BUFF_TEXT[bk];
        const lab = bk === 'shieldPct' ? 'Escudo' : 'Reforço';
        if (!fn) continue;
        const a = ok(b0[bk]) ? fn(b0[bk]) : null, b = fn(bv);
        L.push({ k: lab, v: a ? `${a} → ${b}` : `novo: ${b}` });
      }
      continue;
    }
    if (JSON.stringify(base[key]) === JSON.stringify(eff[key])) continue;
    const a = fieldText(key, base[key]), b = fieldText(key, eff[key]);
    if (!b) continue;
    L.push({ k: FIELDS[key][0], v: a && a !== b ? `${a} → ${b}` : `novo: ${b}` });
  }
  return L;
}

// Ids dos 4 slots (kit da especialização, se houver; senão o da classe).
const slotsOf = (classId, spec) => [0, 1, 2, 3].map((i) => skillIdAt(classId, i, spec || null));

// Onde a habilidade mora no kit (0..2 básicas, 3 Maestria) e quando libera; fora do kit, null. O kit da especialização vale primeiro.
function slotOf(classId, spec, skillId) {
  let i = slotsOf(classId, spec).indexOf(skillId);
  if (i < 0 && spec) i = slotsOf(classId, null).indexOf(skillId);
  return i;
}

function unlockInfo(classId, spec, skillId, level) {
  const idx = slotOf(classId, spec, skillId);
  if (idx < 0) return null;
  const lv = SKILL_UNLOCK[idx] ?? 1;
  const mastery = idx === MASTERY_IDX;
  const locked = level != null && level < lv;
  return {
    idx, level: lv, mastery, locked,
    text: mastery ? `Libera no Nv ${lv}, com a missão de Maestria do mestre da sua classe` : lv > 1 ? `Libera no Nv ${lv}` : 'Desde o início',
  };
}

// Nome da habilidade da classe que esta (do kit da especialização) substitui no mesmo slot, ou null.
function replacedBy(classId, spec, skillId) {
  if (!kitOf(classId, spec)) return null;
  const i = slotsOf(classId, spec).indexOf(skillId);
  const old = i >= 0 ? skillIdAt(classId, i, null) : null;
  return old && old !== skillId ? SKILLS[old]?.name ?? null : null;
}

// opts: { power (poder do personagem), level (nível do personagem) }.
// Devolve { id, name, icon, color, type, summary, desc, lines:[{k,v}], spec:[{k,v}], specName, unlock }.
export function describeSkill(classId, spec, skillId, opts = {}) {
  const eff = skillOf(classId, spec || null, skillId);
  const base = SKILLS[skillId] ?? eff;
  if (!eff) return null;
  const lines = detailLines(eff, opts.power);
  const known = KIND_TYPE[eff.kind] != null;
  const sp = spec ? SPECS[classId]?.[spec] : null;
  const changed = sp?.skills?.[skillId] ? diffLines(base, eff) : [];
  const repl = replacedBy(classId, spec, skillId);
  if (repl) changed.unshift({ k: 'Substitui', v: repl });
  return {
    id: skillId, name: eff.name ?? skillId, icon: eff.icon ?? '✨', color: eff.color ?? '#ffffff',
    type: typeOf(eff), summary: known ? summaryOf(eff) : eff.desc || 'Habilidade especial.', desc: eff.desc ?? '',
    lines, spec: changed, specName: changed.length ? sp.name : '',
    unlock: unlockInfo(classId, spec, skillId, opts.level),
    art: eff.art ?? skillId,
  };
}

// Resumo de uma frase gerado do conteúdo.
function summaryOf(s) {
  const dmg = s.mult > 0;
  switch (s.kind) {
    case 'aoe_self':
      if (s.heal && dmg) return `Cura você e fere os inimigos ao redor${s.allyHeal ? '; aliados próximos também se curam' : ''}.`;
      if (s.heal) return 'Cura você e os aliados ao redor.';
      return `Ataca todos os inimigos ao redor de você${s.stun > 0 ? ' e os atordoa' : s.slow > 0 ? ' e os desacelera' : ''}.`;
    case 'projectile':
      if (s.volley > 1) return `Dispara ${s.volley} projéteis em leque na direção do alvo.`;
      return `Lança um projétil na direção do alvo${s.pierce ? ' que atravessa os inimigos' : s.explode > 0 ? ' e explode em área' : ''}${s.stun > 0 ? ', atordoando quem atingir' : ''}.`;
    case 'dash':
      if (s.slam) return `${s.jump ? 'Salta' : 'Avança'} na direção escolhida e causa um impacto em área ao chegar${s.invuln ? ' (não pode ser atingido no caminho)' : ''}.`;
      if (s.invuln) return s.twice ? 'Esquiva rápida que pode ser repetida logo em seguida: você não pode ser atingido enquanto se move.' : 'Esquiva rápida: você não pode ser atingido enquanto se move.';
      if (s.buff?.imm) return 'Avança com o escudo à frente, empurrando e atordoando, e bloqueia todo o dano por instantes.';
      return `Avança na direção escolhida${dmg ? ', ferindo quem estiver no caminho' : ''}${s.stun > 0 ? ' e atordoando' : ''}${s.slam ? '; ao chegar, causa um impacto em área' : ''}.`;
    case 'buff':
      if (s.buff?.shieldPct) return 'Cria um escudo que absorve dano' + (s.allyShield ? ', repartido com um aliado próximo.' : '.');
      if (s.buff?.reflect) return `Devolve parte do dano sofrido ao agressor${s.allyBuff ? ', também para os aliados por perto' : ''}.`;
      if (s.buff?.as || s.buff?.ls) return 'Acelera seus ataques e recupera vida ao ferir' + (s.cost ? ', em troca de parte da sua vida.' : '.');
      return `Fortalece você por um tempo${s.allyBuff ? ' e os aliados por perto' : ''}.`;
    case 'blink': return 'Teleporta você instantaneamente na direção escolhida.';
    case 'ground_aoe': return `Faz cair vários golpes numa área do chão${s.slow > 0 ? ' e desacelera quem estiver nela' : ''}.`;
    case 'meteor': return 'Marca uma área no chão; um instante depois o impacto fere, atordoa e queima.';
    case 'divine': return 'Remove controles e cura e protege você e os aliados ao redor.';
    case 'cone': return `Golpeia todos os inimigos num leque à sua frente${s.burn ? ' e os faz sangrar ou queimar' : ''}.`;
    case 'zone': return 'Cria uma zona no chão: quem está dentro recebe os efeitos enquanto ela durar.';
    case 'channel': return 'Canaliza em um inimigo próximo, ferindo-o aos poucos' + (s.leech > 0 ? ' e recuperando vida.' : '.');
    case 'trap': return 'Instala uma armadilha no chão que prende e desacelera quem pisar nela.';
    case 'summon': return 'Invoca espectros que atacam o inimigo mais próximo por um tempo.';
    default: return s.desc || 'Habilidade especial.';
  }
}

// Ataque básico (botão de ataque). `kind` melee/projectile.
export function describeBasic(classId, spec, opts = {}) {
  const b = basicOf(classId, spec || null), base = CLASSES[classId]?.basic;
  if (!b) return null;
  const lines = [];
  if (ok(b.mult)) lines.push({ k: 'Dano', v: `${pct(b.mult)} do seu poder${ok(opts.power) && opts.power > 0 ? ` (≈ ${Math.round(opts.power * b.mult)} por golpe)` : ''}` });
  if (ok(b.cd)) lines.push({ k: 'Cadência', v: `um golpe a cada ${secs(b.cd)}` });
  if (ok(b.range)) lines.push({ k: 'Alcance', v: `${reach(b.range * (b.kind === 'melee' ? 3 : 1))} (${num(b.range)})` });
  const diff = [];
  if (spec && base && b !== base) {
    if (b.mult !== base.mult) diff.push({ k: 'Dano', v: `${pct(base.mult)} → ${pct(b.mult)}` });
    if (b.cd !== base.cd) diff.push({ k: 'Cadência', v: `${secs(base.cd)} → ${secs(b.cd)}` });
    if (b.range !== base.range) diff.push({ k: 'Alcance', v: `${num(base.range)} → ${num(b.range)}` });
  }
  return {
    id: 'basic', name: 'Ataque básico', icon: CLASSES[classId].icon, color: b.color ?? '#ffffff',
    type: 'Ataque básico', summary: b.kind === 'melee' ? 'Golpe corpo a corpo em arco, sem custo e sem recarga longa. Segure o botão para atacar sem parar.' : 'Disparo à distância sem custo. Segure o botão para atacar sem parar.',
    desc: '', lines, spec: diff, specName: diff.length ? SPECS[classId]?.[spec]?.name ?? '' : '',
    unlock: { idx: -1, level: 1, mastery: false, locked: false, text: 'Desde o início' },
  };
}

const STAT_TEXT = {
  hpMul: (v) => `${v >= 1 ? '+' : '-'}${pct(Math.abs(v - 1))} de vida`,
  powerMul: (v) => `${v >= 1 ? '+' : '-'}${pct(Math.abs(v - 1))} de poder`,
  defMul: (v) => `${v >= 1 ? '+' : '-'}${pct(Math.abs(v - 1))} de defesa`,
  moveMul: (v) => `${v >= 1 ? '+' : '-'}${pct(Math.abs(v - 1))} de velocidade`,
  critAdd: (v) => `+${num(v)}% de crítico`,
  critMultAdd: (v) => `+${pct(v)} de dano crítico`,
  lifesteal: (v) => `+${pct(v)} de roubo de vida`,
  block: (v) => `+${num(v)}% de bloqueio`,
};

// Resumo da especialização: texto geral, ajustes de atributos/ataque e as habilidades que ela muda.
export function describeSpec(classId, specId, opts = {}) {
  const sp = SPECS[classId]?.[specId];
  if (!sp) return null;
  const mods = [];
  for (const [k, v] of Object.entries(sp.mods?.stats ?? {})) if (ok(v) && STAT_TEXT[k]) mods.push(STAT_TEXT[k](v));
  const lh = sp.mods?.lowHp;
  if (lh) mods.push(`até +${pct(lh.max)} de dano quando a vida cai abaixo de ${pct(lh.below)}`);
  if (sp.noOffhand) mods.push('não usa escudo');
  const basic = sp.mods?.basic ? describeBasic(classId, specId, opts) : null;
  const kit = kitOf(classId, specId);
  const skills = (kit ? [...kit.skills, kit.mastery] : Object.keys(sp.skills ?? {})).map((id) => describeSkill(classId, specId, id, opts)).filter(Boolean);
  return { id: specId, name: sp.name, icon: sp.icon, desc: sp.desc ?? '', mods, basic: basic?.spec?.length ? basic : null, skills };
}

// Todas as habilidades do kit (3 + Maestria) e o básico, já descritas, na ordem dos slots.
export function describeKit(classId, spec, opts = {}) {
  const c = CLASSES[classId];
  if (!c) return [];
  return [describeBasic(classId, spec, opts), ...slotsOf(classId, spec).map((id) => describeSkill(classId, spec, id, opts))].filter(Boolean);
}
