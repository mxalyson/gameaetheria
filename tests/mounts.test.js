import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, makeHeroActor, RUN_MUL } from '../public/src/game/sim.js';
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter } from '../public/src/core/progression.js';
import { MOUNTS, MOUNT_IDS, MOUNT_MUL, WHISTLE } from '../public/src/data/mounts.js';
import { ownedMounts, activeMount, mountProblem, mountCode, mountFromCode, useWhistle, rollBossWhistle, addWhistles, derivedMounts } from '../public/src/core/mounts.js';
import { SnapshotDecoder, F } from '../public/src/core/snapshot.js';
import { DeltaEncoder, actorTuple } from '../server/snapshot.js';
import { parseClientMessage, PROTOCOL_VERSION } from '../public/src/core/protocol.js';
import { validate, parseSave, exportSave } from '../public/src/core/savedoc.js';
import { QUESTS } from '../public/src/data/quests.js';
import { ACH } from '../public/src/data/achievements.js';
import { ensureJournal, offeredBy, acceptQuest, turnInQuest, recordEvent, openChest } from '../public/src/core/journal.js';
import { rollMobLoot } from '../public/src/core/loot.js';
import { applyZoneBatch } from '../public/src/core/rewards.js';
import { runTx, placeProblem, TxError } from '../server/tx.js';
import { checkSave, pveProblem, sanitizeImport } from '../server/plausible.js';
import { newOfficialCharacter } from '../server/api.js';

const DT = 1 / 60;
const doc = (extra = {}) => { const c = newCharacter('Mont', 'warrior', makeRng(1)); c.mounts = ['wolf']; c.mount = 'wolf'; return Object.assign(c, extra); };
// mundo com um herói; `intent(i)` devolve a intenção do quadro i; devolve { w, p, d } (d = deslocamento em x)
function run(zone, char, intent, prep, frames = 20) {
  const w = new World(zone, { seed: 1, visuals: false });
  const p = w.add(makeHeroActor(char, 1000, 1000));
  w.time = 50; // relógio adiantado: lastCombat inicial (-99) já passou dos 3 s
  prep?.(w, p);
  const x0 = p.x;
  for (let i = 0; i < frames; i++) w.update(DT, { [p.id]: { mx: 1, my: 0, aimX: p.x + 100, aimY: p.y, ...intent(i) } });
  return { w, p, d: p.x - x0 };
}

test('dados: montarias iniciais, sem preço em ouro, MOUNT_MUL 1,5 e códigos de rede estáveis', () => {
  assert.deepEqual(MOUNT_IDS, ['wolf', 'horse', 'gryphon']);
  assert.equal(MOUNTS.wolf.name, 'Lobo Cinzento'); assert.equal(MOUNTS.horse.name, 'Corcel Prateado'); assert.equal(MOUNTS.gryphon.name, 'Grifo Dourado');
  for (const m of Object.values(MOUNTS)) { assert.ok(m.desc && m.how && m.rarity); assert.equal(m.price, undefined, 'nada de comprar montaria por ouro'); }
  assert.equal(MOUNT_MUL, 1.5);
  assert.deepEqual(MOUNT_IDS.map(mountCode), [1, 2, 3]);
  assert.equal(mountFromCode(0), null); assert.equal(mountFromCode(2), 'horse'); assert.equal(mountCode('zzz'), 0);
});

test('montada: velocidade 1,5× em zona de farm e NÃO acumula com o correr', () => {
  const walk = run('town', doc(), () => ({}));
  const mounted = run('town', doc(), (i) => (i === 0 ? { mount: true } : {}));
  assert.ok(mounted.p.mounted, 'montou');
  assert.ok(Math.abs(mounted.d / walk.d - 1.5) < 0.03, `razão ${(mounted.d / walk.d).toFixed(3)}`);
  const both = run('town', doc(), (i) => ({ run: true, ...(i === 0 ? { mount: true } : {}) }));
  assert.ok(Math.abs(both.d - mounted.d) < 1e-6, 'run + montaria = só a montaria');
  assert.ok(!both.p.running, 'montado não "corre"');
  const runOnly = run('town', doc(), () => ({ run: true }));
  assert.ok(Math.abs(runOnly.d / walk.d - RUN_MUL) < 0.03 && mounted.d > runOnly.d, 'montaria vence o correr (1,5 > 1,3)');
});

test('montar: recusado sem posse, em arena PvP, ondas e Cripta; em combate; atacando', () => {
  const sem = run('town', doc({ mounts: [], mount: null }), (i) => (i === 0 ? { mount: true } : {}));
  assert.ok(!sem.p.mounted && sem.p.mountDenied === 'none', 'sem posse');
  for (const z of ['arena_team', 'waves', 'crypt']) {
    const r = run(z, doc(), (i) => (i === 0 ? { mount: true } : {}));
    assert.ok(!r.p.mounted && r.p.mountDenied === 'zone', `${z}: sem montaria`);
  }
  const comb = run('town', doc(), (i) => (i === 0 ? { mount: true } : {}), (w, p) => { p.lastCombat = w.time; });
  assert.ok(!comb.p.mounted && comb.p.mountDenied === 'combat', 'em combate (3 s)');
  assert.ok(run('town', doc(), (i) => (i === 0 ? { mount: true } : {}), (w, p) => { p.lastCombat = w.time - 3.1; }).p.mounted, 'passados 3 s monta');
  const atk = run('town', doc(), (i) => (i === 0 ? { mount: true, attack: true } : {}));
  assert.ok(!atk.p.mounted, 'não monta no mesmo quadro de um ataque');
});

test('desmonta ao atacar, usar habilidade, tomar dano, cair e sair da zona permitida; ataque/skill montado não age', () => {
  const mountedWorld = (zone = 'town') => { const w = new World(zone, { seed: 2, visuals: false }); const p = w.add(makeHeroActor(doc(), 1000, 1000)); w.time = 50; w.update(DT, { [p.id]: { mx: 0, my: 0, mount: true } }); assert.ok(p.mounted); return { w, p }; };
  { const { w, p } = mountedWorld(); w.update(DT, { [p.id]: { mx: 0, my: 0, aimX: 1100, aimY: 1000, attack: true } }); assert.ok(!p.mounted, 'atacar desmonta'); assert.equal(p.cds.basic, 0, 'sem ação: o ataque não saiu'); assert.ok(w.time - p.lastCombat >= 3, 'e nem entrou em combate'); }
  { const { w, p } = mountedWorld(); w.update(DT, { [p.id]: { mx: 0, my: 0, aimX: 1100, aimY: 1000, cast: 0 } }); assert.ok(!p.mounted, 'skill desmonta'); assert.equal(p.cds.s0, 0, 'sem ação: a skill não foi lançada'); }
  { const { w, p } = mountedWorld(); const foe = w.add(makeHeroActor(newCharacter('Foe', 'mage', makeRng(3)), 1030, 1000, 'rival', 2)); w.damage(foe, p, 1); w.update(DT, { [p.id]: { mx: 0, my: 0 } }); assert.ok(!p.mounted, 'tomar dano desmonta'); }
  { const { w, p } = mountedWorld(); w.update(DT, { [p.id]: { mx: 0, my: 0, mount: false } }); assert.ok(!p.mounted, 'botão desmontar'); }
  { const { w, p } = mountedWorld(); p.stunT = 1; w.update(DT, { [p.id]: { mx: 0, my: 0 } }); assert.ok(!p.mounted, 'atordoado desmonta'); }
  { const { w, p } = mountedWorld(); w.zoneId = 'crypt'; w.update(DT, { [p.id]: { mx: 0, my: 0 } }); assert.ok(!p.mounted, 'zona não permitida desmonta'); }
  { const { w, p } = mountedWorld(); p.hp = 1; const foe = w.add(makeHeroActor(newCharacter('Foe', 'mage', makeRng(3)), 1030, 1000, 'rival', 2)); w.damage(foe, p, 99999); assert.ok(p.dead && !p.mounted, 'cair desmonta'); }
  { const { w, p } = mountedWorld(); w.update(DT, { [p.id]: { mx: 0, my: 0, mount: true } }); assert.ok(p.mounted, 'pedir de novo montado não quebra'); }
});

test('mountProblem: ordem das recusas e atores sem montaria', () => {
  const a = { mounts: ['wolf'], mountId: 'wolf', dead: false, stunT: 0, lastCombat: -99 };
  assert.equal(mountProblem(a, { zoneOk: true, time: 10 }), null);
  assert.equal(mountProblem({ ...a, mounts: [] }, { zoneOk: true, time: 10 }), 'none');
  assert.equal(mountProblem({ ...a, dead: true }, { zoneOk: true, time: 10 }), 'dead');
  assert.equal(mountProblem(a, { zoneOk: false, time: 10 }), 'zone');
  assert.equal(mountProblem({ ...a, lastCombat: 9 }, { zoneOk: true, time: 10 }), 'combat');
});

test('posse: lista salva + missão + conquista; ativa precisa ser sua', () => {
  const c = doc({ mounts: [], mount: null });
  assert.deepEqual(ownedMounts(c), []); assert.equal(activeMount(c), null);
  ensureJournal(c); c.quests.done.matilha_da_estrada = 1;
  assert.deepEqual(ownedMounts(c), ['wolf'], 'missão concede o lobo');
  c.achievements.veterano = 1;
  assert.deepEqual(ownedMounts(c), ['wolf', 'gryphon'], 'conquista concede o grifo');
  c.mount = 'horse'; assert.equal(activeMount(c), 'wolf', 'escolhida que não é sua cai na primeira');
  c.mount = 'gryphon'; assert.equal(activeMount(c), 'gryphon');
  assert.ok(derivedMounts(c).has('gryphon'));
});

test('documento: campos aditivos, save antigo sem montarias migra para vazio e lixo é removido (SAVE_VERSION igual)', () => {
  const old = doc(); delete old.mounts; delete old.mount; delete old.whistles;
  const v = validate(old);
  assert.ok(v.ok); assert.deepEqual(v.char.mounts, []); assert.equal(v.char.mount, null); assert.equal(v.char.whistles, 0);
  assert.equal(v.char.version, 3, 'sem novo SAVE_VERSION');
  const bad = validate({ ...doc(), mounts: ['wolf', 'dragao', 5, 'wolf', 'horse'], mount: 'dragao', whistles: 999 });
  assert.deepEqual(bad.char.mounts, ['wolf', 'horse']); assert.equal(bad.char.mount, 'wolf'); assert.equal(bad.char.whistles, WHISTLE.max);
  const withQ = doc({ mounts: [], mount: null }); ensureJournal(withQ); withQ.quests.done.matilha_da_estrada = 5;
  assert.deepEqual(validate(withQ).char.mounts, ['wolf'], 'missão concluída vira posse ao validar');
  const rt = parseSave(exportSave(validate(doc({ mounts: ['wolf', 'horse'], mount: 'horse', whistles: 2 })).char));
  assert.ok(rt.ok); assert.deepEqual(rt.char.mounts, ['wolf', 'horse']); assert.equal(rt.char.mount, 'horse'); assert.equal(rt.char.whistles, 2);
  assert.deepEqual(validate(doc()).char.pity, { epic: 0, legendary: 0, opal: 0 }, 'pity de Apito só aparece quando > 0');
  assert.equal(validate(doc({ pity: { epic: 0, legendary: 0, opal: 0, whistle: 4 } })).char.pity.whistle, 4);
});

test('protocolo: input aceita mount true/false (e só isso); tx tem as operações de montaria', () => {
  const inp = (extra) => parseClientMessage({ v: PROTOCOL_VERSION, t: 'input', seq: 1, mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, cast: null, ...extra });
  assert.equal(inp({ mount: true }).msg.mount, true); assert.equal(inp({ mount: false }).msg.mount, false);
  assert.equal('mount' in inp({}).msg, false); assert.equal('mount' in inp({ mount: 'sim' }).msg, false); assert.equal('mount' in inp({ mount: 1 }).msg, false);
  const tx = (o) => parseClientMessage({ v: PROTOCOL_VERSION, t: 'tx', ...o });
  assert.deepEqual(tx({ op: 'mount_use_whistle', req: 2 }).msg, { t: 'tx', op: 'mount_use_whistle', req: 2 });
  assert.equal(tx({ op: 'mount_set', id: 'horse' }).msg.id, 'horse'); assert.equal(tx({ op: 'mount_set' }).ok, false);
});

test('snapshot: montado vai num bit + código; round-trip no decodificador; sem montaria o formato antigo não muda', () => {
  const A = { id: 1, x: 10, y: 10, hp: 100, facing: 0, dead: false, moving: true, swing: 0, stunT: 0, shield: 0 };
  assert.equal(actorTuple(A, true).length, 7, 'sem aura nem montaria: tupla de 7');
  const M = { ...A, id: 2, mounted: true, mountId: 'gryphon' };
  const t = actorTuple(M, true);
  assert.ok(t[5] & F.MOUNTED); assert.equal(t[7], 0, 'aura 0'); assert.equal(t[8], 3);
  const enc = new DeltaEncoder(), dec = new SnapshotDecoder().init({ you: 1, players: [{ id: 1, team: 1, name: 'A', classId: 'warrior', level: 1, maxHp: 100 }, { id: 2, team: 1, name: 'B', classId: 'mage', level: 1, maxHp: 100 }] });
  let out = dec.apply({ k: 1, a: enc.frame([actorTuple(A, true), actorTuple(M, true)]).a });
  assert.equal(out.actors.find((x) => x.id === 2).mounted, true); assert.equal(out.actors.find((x) => x.id === 2).mountId, 'gryphon');
  assert.equal(out.actors.find((x) => x.id === 1).mounted, false);
  M.mounted = false;
  const f = enc.frame([actorTuple(A, true), actorTuple(M, true)]);
  assert.deepEqual(f.a.map((x) => x[0]), [2], 'desmontar é uma mudança e vai no delta');
  out = dec.apply({ k: 0, a: f.a });
  assert.equal(out.actors.find((x) => x.id === 2).mounted, false); assert.equal(out.actors.find((x) => x.id === 2).mountId, null);
  const wolf = actorTuple({ ...A, id: 3, spec: 'berserker', mastery: false, mounted: true, mountId: 'wolf' }, true);
  assert.equal(wolf[8], 1);
});

test('missão do Lobo Cinzento: Guarda Ren, nível 12, depois do Coração de Cristal; entrega concede o lobo', () => {
  const q = QUESTS.matilha_da_estrada;
  assert.equal(q.giver, 'guard'); assert.equal(q.level, 12); assert.equal(q.after, 'coracao_de_cristal'); assert.equal(q.reward.mount, 'wolf');
  assert.ok(QUESTS[q.after], 'pré-requisito existe');
  const c = doc({ mounts: [], mount: null, level: 12 }); ensureJournal(c);
  assert.ok(!offeredBy(c, 'guard').some((x) => x.id === q.id), 'sem o pré-requisito não é oferecida');
  c.quests.done.coracao_de_cristal = 1;
  assert.ok(offeredBy(c, 'guard').some((x) => x.id === q.id), 'com o pré-requisito, a Ren oferece');
  assert.ok(acceptQuest(c, q.id).ok);
  for (let i = 0; i < 12; i++) recordEvent(c, { type: 'kill', mobId: 'wolf', zoneId: 'forest' });
  const r = turnInQuest(c, q.id, makeRng(5));
  assert.ok(r.ok); assert.equal(r.reward.mount, 'wolf'); assert.deepEqual(c.mounts, ['wolf']);
  assert.equal(validate(c).char.mounts[0], 'wolf');
  const low = doc({ mounts: [], level: 11 }); ensureJournal(low); low.quests.done.coracao_de_cristal = 1;
  assert.ok(!offeredBy(low, 'guard').some((x) => x.id === q.id), 'nível 11 não');
});

test('conquista Veterano concede o Grifo Dourado (recalculada pelo mesmo caminho do servidor)', () => {
  assert.equal(ACH.veterano.mount, 'gryphon');
  const c = doc({ mounts: [], level: 20 }); ensureJournal(c);
  recordEvent(c, { type: 'level', level: 20 });
  assert.ok(c.achievements.veterano != null);
  assert.ok(validate(c).char.mounts.includes('gryphon'));
});

test('Apito de Montaria: concede Corcel ou Grifo (uma por tipo), gasta 1, recusa sem Apito ou com tudo', () => {
  const c = doc({ mounts: ['wolf'], whistles: 2 });
  const rng = makeRng(9);
  const a = useWhistle(c, rng);
  assert.ok(a.ok && ['horse', 'gryphon'].includes(a.mount)); assert.equal(c.whistles, 1); assert.ok(c.mounts.includes(a.mount));
  const b = useWhistle(c, rng);
  assert.ok(b.ok && b.mount !== a.mount, 'a segunda dá o outro tipo'); assert.deepEqual(ownedMounts(c), ['wolf', 'horse', 'gryphon']);
  c.whistles = 1;
  assert.equal(useWhistle(c, rng).ok, false, 'já tem todas'); assert.equal(c.whistles, 1, 'não gasta o Apito');
  assert.equal(useWhistle(doc({ whistles: 0 }), rng).ok, false);
  assert.equal(addWhistles(c, 99), WHISTLE.max - 1, 'teto'); assert.equal(c.whistles, WHISTLE.max);
});

test('queda do Apito: só chefe, com pity crescente e garantida no teto; sem pity (cooperativo) não rola; baú rola raro', () => {
  const rng = makeRng(4);
  const boss = { level: 20, boss: true, mobId: 'treant' }, pity = { epic: 0, legendary: 0, opal: 0 };
  let n = 0, worst = 0, miss = 0;
  for (let i = 0; i < 3000; i++) { const has = rollMobLoot(rng, boss, 'mage', pity).some((l) => l.kind === 'whistle'); if (has) { n++; worst = Math.max(worst, miss); miss = 0; } else miss++; }
  assert.ok(n > 3000 * 0.05 && n < 3000 * 0.2, `taxa ${n}/3000`);
  assert.ok(worst <= WHISTLE.boss.cap, `pity limita a espera (${worst})`);
  assert.equal(rollBossWhistle(makeRng(1), { whistle: WHISTLE.boss.cap }), true, 'no teto é garantido');
  assert.equal(rollBossWhistle(makeRng(1), null), false, 'sem pity não rola');
  for (let i = 0; i < 500; i++) { for (const l of rollMobLoot(rng, { level: 5, mobId: 'wolf' }, 'mage', pity)) assert.notEqual(l.kind, 'whistle', 'mob comum nunca solta'); }
  const ch = doc({ whistles: 0 }); ensureJournal(ch); let got = 0;
  for (let i = 0; i < 4000; i++) { const c2 = structuredClone(ch); c2.whistles = 0; if (openChest(c2, { id: 'c' + i, tier: 1 }, 'forest', rng, 1e12).whistle) got++; }
  assert.ok(got > 4000 * 0.004 && got < 4000 * 0.03, `baús ${got}/4000`);
});

test('lote do servidor: Apito vira contador do documento e respeita o teto', () => {
  const d = doc({ whistles: WHISTLE.max - 1 });
  const out = applyZoneBatch(d, { zoneId: 'forest', whistles: 3, items: [], essences: [], kills: [], xp: 0, gold: 0 });
  assert.equal(out.doc.whistles, WHISTLE.max); assert.equal(out.summary.whistles, 3);
  assert.equal('whistles' in applyZoneBatch(doc(), { zoneId: 'forest', kills: [] }).summary, false);
});

test('transações: mount_use_whistle e mount_set decididas no servidor; recusa sem posse; valem na instância e nas cidades', () => {
  const ctx = { rng: makeRng(7), now: Date.now(), hubAt: null };
  const d = validate(doc({ mounts: ['wolf'], whistles: 1 })).char;
  const w = runTx(d, { op: 'mount_use_whistle' }, ctx);
  assert.ok(['horse', 'gryphon'].includes(w.summary.mount)); assert.equal(w.doc.whistles, 0); assert.ok(w.doc.mounts.includes(w.summary.mount));
  assert.throws(() => runTx(w.doc, { op: 'mount_use_whistle' }, ctx), TxError, 'sem Apito');
  assert.equal(d.whistles, 1, 'o original não muda');
  const set = runTx(w.doc, { op: 'mount_set', id: w.summary.mount }, ctx);
  assert.equal(set.doc.mount, w.summary.mount);
  assert.throws(() => runTx(d, { op: 'mount_set', id: 'horse' }, ctx), /não tem/);
  assert.throws(() => runTx(d, { op: 'mount_set', id: 'dragao' }, ctx), TxError);
  for (const op of ['mount_use_whistle', 'mount_set']) { assert.equal(placeProblem(op, { inZone: true, hubAt: null }), null); assert.equal(placeProblem(op, { inZone: false, hubAt: null }), null); assert.equal(placeProblem(op, { inZone: false, hubAt: 'harbor' }), null); }
});

test('plausibilidade: cliente não se dá montarias nem Apitos; escolher a ativa entre as suas vale', () => {
  const base = () => { const d = newOfficialCharacter('Mont', 'warrior'); return d; };
  const old = base();
  const forged = (fn) => { const n = structuredClone(old); fn(n); return n; };
  // modo estrito (padrão do servidor): recusa
  assert.equal(pveProblem(old, forged((n) => { n.mounts = ['horse']; })), 'pve_mounts');
  assert.equal(pveProblem(old, forged((n) => { n.whistles = 3; })), 'pve_whistles');
  assert.equal(pveProblem(old, forged((n) => { n.mounts = ['gryphon']; })), 'pve_mounts', 'sem conquista não vale');
  // modo não estrito: desfaz em vez de recusar
  const r = checkSave(old, forged((n) => { n.mounts = ['horse', 'gryphon']; n.mount = 'horse'; n.whistles = 5; n.pity = { ...n.pity, whistle: 0 }; }), Date.now());
  assert.ok(r.ok, r.reason); assert.deepEqual(r.doc.mounts, []); assert.equal(r.doc.mount, null); assert.equal(r.doc.whistles, 0);
  // com o Lobo oficial, escolher a ativa passa; um grifo forjado não
  const own = base(); own.mounts = ['wolf']; own.mount = null; own.whistles = 2;
  const sel = checkSave(own, { ...structuredClone(own), mount: 'wolf', whistles: 1 }, Date.now());
  assert.ok(sel.ok); assert.equal(sel.doc.mount, 'wolf'); assert.equal(sel.doc.whistles, 1, 'gastar Apito (transação) só diminui');
  const up = checkSave(own, { ...structuredClone(own), whistles: 9 }, Date.now());
  assert.ok(up.ok); assert.equal(up.doc.whistles, 2, 'aumentar é desfeito');
  // conquista recalculada: o servidor concede o Grifo quando o nível 20 é plausível (nível salta só o permitido: 19 -> 20, XP dentro do orçamento)
  const lv = base(); lv.level = 19; lv.statPoints = 0;
  const lv2 = structuredClone(lv); lv2.level = 20;
  const lvRes = checkSave(lv, lv2, Date.now());
  assert.ok(lvRes.ok, lvRes.reason); assert.ok(lvRes.doc.achievements.veterano != null && lvRes.doc.mounts.includes('gryphon'), 'conquista Veterano recalculada no servidor concede o Grifo');
  // importação: tudo zerado, só as derivadas ficam
  const imp = sanitizeImport(forged((n) => { n.mounts = ['horse']; n.whistles = 9; n.mount = 'horse'; }), base());
  assert.deepEqual(imp.mounts, []); assert.equal(imp.whistles, 0); assert.equal(imp.mount, null);
});

test('toque: botão Montar cabe na tela e não sobrepõe nenhum outro; toque duplo no herói; montar automático (1,5 s, desligado por padrão)', async () => {
  const { skillLayout, TB_GAP, stepAutoMount, isHeroDoubleTap } = await import('../public/src/touch-logic.js');
  for (const [w, h] of [[844, 390], [874, 402], [667, 375], [932, 430], [1280, 720]]) for (const ui of [0.6, 0.8, 1]) {
    const L = skillLayout(w, h, ui), m = L.items.mnt;
    assert.ok(m, 'botão de montaria no layout');
    assert.ok(m.sx - m.sr >= 0 && m.sx + m.sr <= w && m.sy - m.sr >= 0 && m.sy + m.sr <= h, `fora da tela ${w}x${h} ui ${ui}`);
    for (const [k, o] of Object.entries(L.items)) if (k !== 'mnt') assert.ok(Math.hypot(m.sx - o.sx, m.sy - o.sy) >= TB_GAP * (m.sr + o.sr) - 1e-6, `mnt x ${k} sobrepõem`);
  }
  const hero = { x: 400, y: 200 }, t0 = { t: 1000, x: 402, y: 205 };
  assert.ok(isHeroDoubleTap(t0, { t: 1200, x: 404, y: 203 }, hero), 'dois toques rápidos sobre o herói');
  assert.ok(!isHeroDoubleTap(t0, { t: 1500, x: 404, y: 203 }, hero), 'devagar demais');
  assert.ok(!isHeroDoubleTap(t0, { t: 1200, x: 700, y: 203 }, hero), 'longe do herói');
  assert.ok(!isHeroDoubleTap(null, t0, hero));
  const st = { t: 0, hold: false }, on = { enabled: true, moving: true, ok: true, mounted: false };
  let fired = -1; for (let i = 0; i < 200 && fired < 0; i++) if (stepAutoMount(st, on, 0.05)) fired = i;
  assert.ok(fired >= 28 && fired <= 31, `monta depois de ~1,5 s andando (${fired})`);
  assert.ok(![...Array(100)].some(() => stepAutoMount({ t: 0, hold: false }, { ...on, enabled: false }, 0.05)), 'desligado: nunca');
  const s2 = { t: 0, hold: false }; stepAutoMount(s2, on, 1); assert.ok(!stepAutoMount(s2, { ...on, moving: false }, 1) && s2.t === 0, 'parar zera a contagem');
  const s3 = { t: 0, hold: true }; assert.ok(![...Array(100)].some(() => stepAutoMount(s3, on, 0.05)), 'desmontou à mão: não monta de novo andando');
  stepAutoMount(s3, { ...on, moving: false }, 0.05); assert.equal(s3.hold, false, 'parou: libera');
  assert.ok(![...Array(100)].some(() => stepAutoMount({ t: 0, hold: false }, { ...on, ok: false }, 0.05)), 'em combate/zona proibida: não');
  const { loadPrefs, changePref } = await import('../public/src/prefs.js');
  assert.equal(loadPrefs().autoMount, false, 'padrão desligado');
  assert.equal(changePref(loadPrefs(), 'autoMount:on').autoMount, true); assert.equal(changePref({ ...loadPrefs(), autoMount: true }, 'autoMount:off').autoMount, false);
  assert.equal(changePref(loadPrefs(), 'autoMount:xyz').autoMount, false);
});
