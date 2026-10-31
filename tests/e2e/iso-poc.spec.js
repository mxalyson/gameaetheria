import { test, expect } from '@playwright/test';

// PoC isométrico (laboratório). Roda com a simulação REAL do jogo; aqui validamos a camada visual e a integração.
test.setTimeout(120000);

async function open(page, qs = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/labs/iso-poc/index.html' + qs);
  await page.waitForFunction(() => window.poc?.ready, null, { timeout: 90000 });
  return errors;
}
// Leva o jogador a um ponto livre (sem obstáculos num raio) e tira os monstros do caminho.
async function clearArea(page, x = 1400, y = 950) {
  await page.evaluate(([x, y]) => {
    const { world, player } = window.poc;
    world.actors.filter((a) => a.kind === 'mob').forEach((m) => { m.x = -500; m.y = -500; m.ai.target = null; });
    const free = (px, py) => world.layout.obstacles.every((o) => (o.w ? !(px > o.x - 260 && px < o.x + o.w + 260 && py > o.y - 260 && py < o.y + o.h + 260) : Math.hypot(px - o.x, py - o.y) > o.r + 260));
    let best = { x, y };
    for (let i = 0; i < 400; i++) { const px = 500 + Math.random() * 1800, py = 400 + Math.random() * 1200; if (free(px, py)) { best = { x: px, y: py }; break; } }
    player.x = best.x; player.y = best.y; player.hp = player.maxHp;
    window.poc.cam.x = best.x; window.poc.cam.y = best.y;
  }, [x, y]);
  // espera a câmera assentar (a antecipação de movimento decai): senão o ponto do chão sob o cursor ainda se desloca
  await page.waitForFunction(() => Math.hypot(window.poc.cam.x - window.poc.player.x, window.poc.cam.y - window.poc.player.y) < 1.5, null, { timeout: 15000 });
}
const worldToClient = (page, wx, wy, z = 0) => page.evaluate(([wx, wy, z]) => { const s = window.poc.iso.toScreen(wx, wy, z); const c = window.poc.iso.toScreen(window.poc.cam.x, window.poc.cam.y); return { x: innerWidth / 2 + s.x - c.x, y: innerHeight / 2 + s.y - c.y }; }, [wx, wy, z]);

test('carrega com a simulação real, sem erros de console, com arte e cenário assados', async ({ page }) => {
  const errors = await open(page);
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({ s: { ...window.poc.stats }, kinds: [...new Set(window.poc.world.actors.map((a) => a.kind))], zone: window.poc.world.zoneId, hero: window.poc.player.classId }));
  expect(r.zone).toBe('forest');
  expect(r.hero).toBe('mage');
  expect(r.kinds.sort()).toEqual(['mob', 'player']);
  expect(r.s.sprites).toBeGreaterThan(50);
  expect(r.s.atlasMiB).toBeGreaterThan(20);
  expect(errors).toEqual([]);
  console.log('PoC:', JSON.stringify(r.s));
});

test('movimento em 8 direções: o sprite olha para onde a tela diz e o personagem anda nessa direção', async ({ page }) => {
  await open(page);
  const casos = [['w', 'N', 4, 0, -1], ['w+d', 'NE', 3, 1, -1], ['d', 'E', 2, 1, 0], ['d+s', 'SE', 1, 1, 1], ['s', 'S', 0, 0, 1], ['s+a', 'SW', 7, -1, 1], ['a', 'W', 6, -1, 0], ['a+w', 'NW', 5, -1, -1]];
  for (const [combo, nome, setor, ex, ey] of casos) {
    await clearArea(page);
    const a = await page.evaluate(() => { const s = window.poc.iso.toScreen(window.poc.player.x, window.poc.player.y); return { x: s.x, y: s.y }; });
    const ks = combo.split('+');
    await page.bringToFront();
    for (const k of ks) await page.keyboard.down(k);
    // espera o movimento COMEÇAR (em FPS baixo o primeiro passo demora), depois deixa andar um pouco
    try { await page.waitForFunction(() => window.poc.player.moving, null, { timeout: 4000 }); } catch {
      throw new Error(`${nome}: não começou a andar. teclas=${JSON.stringify(await page.evaluate(() => [...window.poc.keys]))} fps=${await page.evaluate(() => window.poc.stats.fps)}`);
    }
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => { const p = window.poc.player, st = window.poc.anims.get(p.id), s = window.poc.iso.toScreen(p.x, p.y); return { view: st.view, clip: st.anim.name, moving: p.moving, x: s.x, y: s.y }; });
    for (const k of ks) await page.keyboard.up(k);
    expect(r.moving, nome).toBe(true);
    expect(r.clip, nome).toBe('walk');
    expect(r.view, `${nome} setor`).toBe(setor);
    const dx = r.x - a.x, dy = r.y - a.y, len = Math.hypot(dx, dy);
    expect(len, nome).toBeGreaterThan(40);
    const cos = (dx * ex + dy * ey) / (len * Math.hypot(ex, ey));
    expect(cos, `${nome}: direção na tela`).toBeGreaterThan(0.95);
  }
});

test('ataque básico e Bola de Fogo: animação, disparo no quadro certo e dano real da simulação', async ({ page }) => {
  await open(page);
  await clearArea(page);
  const alvo = await page.evaluate(() => {
    const { world, player } = window.poc;
    const mobs = world.actors.filter((a) => a.kind === 'mob' && !a.dead);
    const mob = mobs[0];
    mobs.slice(1).forEach((m) => { m.x = -500; m.y = -500; });
    mob.x = player.x + 150; mob.y = player.y + 40; mob.home = { x: mob.x, y: mob.y }; mob.ai.target = null; mob.hp = mob.maxHp = 4000; mob.stats.moveSpeed = 0; mob.cds.basic = 99;
    window.__mob = mob; return { id: mob.id, hp: mob.hp };
  });
  const pos = await worldToClient(page, await page.evaluate(() => window.__mob.x), await page.evaluate(() => window.__mob.y), 18);
  // ataque básico: a animação começa AGORA, o projétil só sai no quadro de disparo.
  // Clique e leitura do estado no MESMO instante, dentro da página (sem depender de tempo de espera).
  const t1 = await page.evaluate(([x, y]) => {
    const c = document.getElementById('view'), ev = (type, extra = {}) => new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...extra });
    c.dispatchEvent(ev('mousemove')); c.dispatchEvent(ev('mousedown', { button: 0 }));
    const r = { clip: window.poc.anims.get(window.poc.player.id).anim.name, proj: window.poc.world.projectiles.length, cd: window.poc.player.cds.basic };
    window.dispatchEvent(ev('mouseup', { button: 0 }));
    return r;
  }, [pos.x, pos.y]);
  expect(t1.clip).toBe('attack');
  expect(t1.proj, 'ainda sem projétil antes do quadro de disparo').toBe(0);
  expect(t1.cd, 'recarga só começa no disparo').toBe(0);
  // espera o EFEITO (em FPS baixo a simulação anda mais devagar que o relógio: passo máximo de 5 por quadro)
  await page.waitForFunction((hp0) => window.__mob.hp < hp0, alvo.hp, { timeout: 8000 });
  const hp1 = await page.evaluate(() => ({ hp: window.__mob.hp, cd: window.poc.player.cds.basic, text: window.poc.world.texts.length }));
  expect(hp1.hp, 'dano real do mago').toBeLessThan(alvo.hp);
  // Bola de Fogo (tecla 1)
  await page.waitForTimeout(500);
  const antes = await page.evaluate(() => window.__mob.hp);
  await page.keyboard.press('1');
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => window.poc.anims.get(window.poc.player.id).anim.name)).toBe('skill');
  await page.waitForFunction((hp0) => window.__mob.hp < hp0 - 20, antes, { timeout: 8000 });
  await page.screenshot({ path: 'test-results/poc-skill.png' });
  const depois = await page.evaluate(() => ({ hp: window.__mob.hp, cd: window.poc.player.cds.s0, clip: window.poc.anims.get(window.poc.player.id).anim.name }));
  expect(depois.hp, 'Bola de Fogo causou dano').toBeLessThan(antes - 20);
  expect(depois.cd, 'recarga real de 3,5 s da habilidade').toBeGreaterThan(1);
  expect(['idle', 'skill']).toContain(depois.clip);
});

test('morte do monstro: a animação termina mesmo depois de a simulação remover o ator', async ({ page }) => {
  await open(page);
  await clearArea(page);
  await page.evaluate(() => {
    const { world, player } = window.poc;
    const mobs = world.actors.filter((a) => a.kind === 'mob' && !a.dead);
    const mob = mobs[0]; mobs.slice(1).forEach((m) => { m.x = -500; m.y = -500; });
    mob.x = player.x + 90; mob.y = player.y + 30; mob.home = { x: mob.x, y: mob.y }; /* sem isso a IA o cura ao voltar para casa */ mob.ai.target = null; mob.stats.moveSpeed = 0; mob.cds.basic = 99; mob.hp = 1;
    window.__mob = mob; window.__id = mob.id; window.poc.debugOrder = true;
  });
  const pos = await worldToClient(page, await page.evaluate(() => window.__mob.x), await page.evaluate(() => window.__mob.y), 18);
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
  try { await page.waitForFunction(() => window.__mob.dead, null, { timeout: 5000 }); } catch (e) {
    const d = await page.evaluate(() => { const m = window.__mob, p = window.poc.player; return { hp: m.hp, mob: [Math.round(m.x), Math.round(m.y)], player: [Math.round(p.x), Math.round(p.y)], cam: [Math.round(window.poc.cam.x), Math.round(window.poc.cam.y)], cd: p.cds.basic, clip: window.poc.anims.get(p.id).anim.name, mouse: { ...window.poc.mouse }, aim: window.poc.aimPoint(), proj: window.poc.world.projectiles.length, fps: window.poc.stats.fps }; });
    throw new Error('DIAG ' + JSON.stringify(d) + ' pos ' + JSON.stringify(pos));
  }
  await page.waitForTimeout(750); // a simulação remove o ator 0,6 s depois da morte
  const r = await page.evaluate(() => ({ naLista: window.poc.world.actors.some((a) => a.id === window.__id), anim: window.poc.anims.get(window.__id)?.anim.name, ghost: window.poc.lastOrder.some((i) => i.kind === 'ghost' && i.id === window.__id) }));
  expect(r.naLista, 'a simulação já removeu o monstro').toBe(false);
  expect(r.anim).toBe('death');
  expect(r.ghost, 'o renderer ainda o desenha para terminar a animação').toBe(true);
  await page.waitForTimeout(1600);
  expect(await page.evaluate(() => window.poc.anims.has(window.__id)), 'depois some de vez').toBe(false);
});

test('profundidade: o jogador passa atrás e à frente de uma árvore', async ({ page }) => {
  await open(page);
  await clearArea(page);
  const t = await page.evaluate(() => { const d = window.poc.decor.find((d) => d.kind === 'tree'); window.poc.debugOrder = true; return { x: d.x, y: d.y }; });
  const ordem = async (px, py) => {
    await page.evaluate(([px, py, tx, ty]) => { const p = window.poc.player; p.x = px; p.y = py; window.poc.cam.x = tx; window.poc.cam.y = ty; }, [px, py, t.x, t.y]);
    await page.waitForTimeout(250);
    return page.evaluate((tx) => { const o = window.poc.lastOrder; const ip = o.findIndex((i) => i.kind === 'player'); const it = o.findIndex((i) => i.kind === 'tree' && Math.abs(i.x - tx) < 0.01); return { ip, it }; }, t.x);
  };
  const atras = await ordem(t.x - 8, t.y - 8);
  const frente = await ordem(t.x + 8, t.y + 8);
  expect(atras.it).toBeGreaterThanOrEqual(0); expect(frente.it).toBeGreaterThanOrEqual(0);
  expect(atras.ip, 'jogador atrás da árvore é desenhado antes').toBeLessThan(atras.it);
  expect(frente.ip, 'jogador à frente da árvore é desenhado depois').toBeGreaterThan(frente.it);
});

test('formato de atlas: PNG + JSON recarregado desenha igual ao atlas assado (arte de artista entra sem mexer no jogo)', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const { loadAtlas, drawFrame } = await import('/labs/iso-poc/src/atlas.js');
    const mage = window.poc.atlases.mage, urls = {};
    for (const [name, sheet] of Object.entries(mage.sheets)) urls[name] = URL.createObjectURL(await new Promise((res) => sheet.toBlob(res, 'image/png')));
    const meta = JSON.parse(JSON.stringify(mage.meta));
    const loaded = await loadAtlas(meta, urls);
    const draw = (atlas) => { const c = document.createElement('canvas'); c.width = 200; c.height = 200; const g = c.getContext('2d'); drawFrame(g, atlas, 'walk', 2, 3, 100, 170, 1); return g.getImageData(0, 0, 200, 200).data; };
    const a = draw(mage), b = draw(loaded);
    let diff = 0, nonEmpty = 0;
    for (let i = 0; i < a.length; i += 4) { if (a[i + 3] > 0) nonEmpty++; diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]); }
    return { diffPorPixel: diff / (a.length / 4), nonEmpty, metaClips: Object.keys(meta.clips), bytes: loaded.bytes };
  });
  expect(r.nonEmpty).toBeGreaterThan(2000);
  expect(r.diffPorPixel).toBeLessThan(1);
  expect(r.metaClips).toEqual(['idle', 'walk', 'attack', 'skill', 'hit']);
});

test('câmera: segue o jogador com suavização, respeita o zoom mínimo/máximo e alterna 2:1 e 30°', async ({ page }) => {
  await open(page);
  await clearArea(page);
  // Posições dentro dos limites de enquadramento da câmera (margem de 360 do mundo), senão ela ficaria presa na borda.
  await page.evaluate(() => { window.poc.player.x = 1000; window.poc.player.y = 800; window.poc.cam.x = 1000; window.poc.cam.y = 800; });
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.poc.player.x = 1400; window.poc.player.y = 1000; });
  await page.waitForTimeout(80);
  const cedo = await page.evaluate(() => Math.hypot(window.poc.cam.x - window.poc.player.x, window.poc.cam.y - window.poc.player.y));
  await page.waitForTimeout(2200);
  const tarde = await page.evaluate(() => Math.hypot(window.poc.cam.x - window.poc.player.x, window.poc.cam.y - window.poc.player.y));
  expect(cedo, 'a câmera atrasa um pouco (suavização)').toBeGreaterThan(40);
  expect(tarde, 'e depois alcança').toBeLessThan(5);
  for (let i = 0; i < 12; i++) await page.keyboard.press('+');
  expect(await page.evaluate(() => window.poc.cfg.zoom)).toBeLessThanOrEqual(2);
  for (let i = 0; i < 30; i++) await page.keyboard.press('-');
  expect(await page.evaluate(() => window.poc.cfg.zoom)).toBeGreaterThanOrEqual(0.6);
  const t1 = await page.evaluate(() => window.poc.cfg.tilt);
  await page.keyboard.press('t'); await page.waitForTimeout(150);
  const t2 = await page.evaluate(() => window.poc.cfg.tilt);
  expect(t2).not.toBe(t1);
  await page.screenshot({ path: 'test-results/poc-tilt30.png' });
});

// Heróis em miniatura (atlas de art-local/, fora do Git): só roda onde a arte foi gerada.
import fs from 'node:fs';
for (const id of ['paladino', 'aprendiz', 'franco', 'sacerdote']) {
  const meta = new URL(`../../public/labs/iso-poc/art-local/atlas-rig/${id}/${id}.json`, import.meta.url);
  test(`herói em miniatura ${id}: atlas carregado, anda e o golpe sai no quadro de disparo do clipe`, async ({ page }) => {
    test.skip(!fs.existsSync(meta), 'atlas não gerado (art-local/ fora do Git)');
    const errors = await open(page, `?hero=${id}`);
    await clearArea(page);
    const info = await page.evaluate(() => { const a = window.poc.atlases.hero; return { has: !!a, clips: Object.keys(a?.meta.clips ?? {}), cfgHero: window.poc.cfg.hero, rel: a?.meta.clips.attack.release }; });
    expect(info.has).toBe(true);
    expect(info.cfgHero).toBe(id);
    expect(info.clips.sort()).toEqual(['attack', 'dash', 'hit', 'idle', 'skill', 'walk']);
    await page.keyboard.down('d');
    await page.waitForFunction(() => window.poc.anims.get(window.poc.player.id).anim.name === 'walk', null, { timeout: 8000 });
    await page.keyboard.up('d');
    // golpe: a animação 'attack' começa na hora e o comando só chega à simulação no quadro `release` (recarga começa nesse momento)
    await page.evaluate(() => window.poc.startAction('attack'));
    const antes = await page.evaluate(() => ({ clip: window.poc.anims.get(window.poc.player.id).anim.name, cd: window.poc.player.cds.basic }));
    expect(antes.clip).toBe('attack');
    expect(antes.cd).toBeLessThanOrEqual(0.0001);
    // efeito visual do herói (só desenho) nasce junto com o golpe: o estilo vem da tabela HERO_FX
    await page.waitForFunction(() => window.poc.vfx.length > 0, null, { timeout: 8000, polling: 'raf' });
    const kind = await page.evaluate(() => window.poc.vfx[0].kind);
    expect(kind).toBe({ paladino: 'swing', aprendiz: 'cast', franco: 'muzzle', sacerdote: 'swing' }[id]); // Clérigo = golpe corpo a corpo (maça); a prece é a skill 1
    await page.waitForFunction(() => window.poc.player.cds.basic > 0, null, { timeout: 8000 });
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

// Cada herói usa a classe REAL do jogo (data/classes.js): HUD, skills e efeito da skill 1.
const CLASSE = { paladino: ['Guerreiro', 'nova'], aprendiz: ['Mago', 'cast'], franco: ['Arqueiro', 'rain'], sacerdote: ['Clérigo', 'pray'] };
for (const id of Object.keys(CLASSE)) {
  const meta = new URL(`../../public/labs/iso-poc/art-local/atlas-rig/${id}/${id}.json`, import.meta.url);
  test(`herói ${id}: classe ${CLASSE[id][0]} e a skill 1 real gera o efeito ${CLASSE[id][1]}`, async ({ page }) => {
    test.skip(!fs.existsSync(meta), 'atlas não gerado (art-local/ fora do Git)');
    const errors = await open(page, `?hero=${id}`);
    await clearArea(page);
    expect(await page.textContent('#hp-name')).toContain(CLASSE[id][0]);
    const n = await page.$$eval('#hud-skills .slot', (e) => e.length);
    expect(n).toBe(4); // ataque + 3 skills
    await page.evaluate(() => window.poc.startAction('skill', 0));
    await page.waitForFunction(() => window.poc.vfx.length > 0, null, { timeout: 8000, polling: 'raf' });
    expect(await page.evaluate(() => window.poc.vfx[0].kind)).toBe(CLASSE[id][1]);
    await page.waitForFunction(() => window.poc.player.cds.s0 > 0, null, { timeout: 8000 });
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

// Morte e dano do herói em miniatura (sem texturas novas: o sprite tomba, amassa e esmaece; ver src/death.js).
test('herói em miniatura: dano recebido gera clarão e a morte tomba o sprite e renasce', async ({ page }) => {
  const meta = new URL('../../public/labs/iso-poc/art-local/atlas-rig/paladino/paladino.json', import.meta.url);
  test.skip(!fs.existsSync(meta), 'atlas não gerado (art-local/ fora do Git)');
  const errors = await open(page, '?hero=paladino&mobs=0');
  await clearArea(page);
  // dano: o pulso começa no golpe e o clarão de impacto nasce no herói
  await page.evaluate(() => { window.poc.player.hitFlash = 0.3; });
  await page.waitForFunction(() => window.poc.anims.get(window.poc.player.id).hurtT !== undefined, null, { timeout: 8000, polling: 'raf' });
  expect(await page.evaluate(() => window.poc.vfx.some((v) => v.kind === 'impact'))).toBe(true);
  // morte: toca 'hit', conta o tempo de queda e, depois do tempo total, renasce inteiro
  await page.evaluate(() => { window.poc.player.dead = true; window.poc.player.hp = 0; });
  await page.waitForFunction(() => window.poc.anims.get(window.poc.player.id).deadT > 0.6, null, { timeout: 10000, polling: 'raf' });
  const morto = await page.evaluate(() => { const st = window.poc.anims.get(window.poc.player.id); return { clip: st.anim.name, deadT: st.deadT }; });
  expect(morto.clip).toBe('hit');
  await page.waitForFunction(() => !window.poc.player.dead && window.poc.anims.get(window.poc.player.id).deadT === 0, null, { timeout: 15000 });
  expect(await page.evaluate(() => window.poc.player.hp)).toBeGreaterThan(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

// Seletor de herói no topo da página: trocar o herói sem digitar a URL.
test('seletor de herói troca o herói (e a classe) recarregando a página', async ({ page }) => {
  const meta = new URL('../../public/labs/iso-poc/art-local/atlas-rig/sacerdote/sacerdote.json', import.meta.url);
  test.skip(!fs.existsSync(meta), 'atlas não gerado (art-local/ fora do Git)');
  const errors = await open(page, '?mobs=0');
  expect(await page.$$eval('#hero-pick option', (o) => o.length)).toBe(5);
  await Promise.all([page.waitForURL(/hero=sacerdote/), page.selectOption('#hero-pick', 'sacerdote')]);
  await page.waitForFunction(() => window.poc?.ready, null, { timeout: 90000 });
  expect(await page.evaluate(() => window.poc.cfg.hero)).toBe('sacerdote');
  expect(await page.textContent('#hp-name')).toContain('Clérigo');
  expect(await page.inputValue('#hero-pick')).toBe('sacerdote');
  expect(errors, errors.join('\n')).toEqual([]);
});

// Skills de movimento (kind 'dash': Investida do Guerreiro, Rolamento do Arqueiro) usam o clipe próprio 'dash'; as outras, 'skill'.
for (const [id, idx, esperado] of [['paladino', 1, 'dash'], ['paladino', 0, 'skill'], ['franco', 2, 'dash'], ['franco', 1, 'skill']]) {
  const meta = new URL(`../../public/labs/iso-poc/art-local/atlas-rig/${id}/${id}.json`, import.meta.url);
  test(`${id}: skill ${idx + 1} toca o clipe ${esperado}`, async ({ page }) => {
    test.skip(!fs.existsSync(meta), 'atlas não gerado (art-local/ fora do Git)');
    const errors = await open(page, `?hero=${id}&mobs=0`);
    await clearArea(page);
    await page.evaluate((i) => window.poc.startAction('skill', i), idx);
    expect(await page.evaluate(() => window.poc.anims.get(window.poc.player.id).anim.name)).toBe(esperado);
    await page.waitForFunction((i) => window.poc.player.cds['s' + i] > 0, idx, { timeout: 8000 });
    await page.waitForFunction(() => ['idle', 'walk'].includes(window.poc.anims.get(window.poc.player.id).anim.name), null, { timeout: 8000 }); // o clipe termina e volta ao normal
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

// O Paladino é Guerreiro: o ataque básico é CORPO A CORPO (alcance curto, sem projétil) e fere de verdade quem está à frente.
test('paladino: ataque básico é corpo a corpo e causa dano real a um monstro à frente', async ({ page }) => {
  const meta = new URL('../../public/labs/iso-poc/art-local/atlas-rig/paladino/paladino.json', import.meta.url);
  test.skip(!fs.existsSync(meta), 'atlas não gerado (art-local/ fora do Git)');
  const errors = await open(page, '?hero=paladino&mobs=4');
  await clearArea(page);
  await page.evaluate(() => { // põe UM monstro colado ao herói (alcance 74; `home` junto, senão a IA o leva de volta à origem) e os outros longe
    const { world, player } = window.poc; const mobs = world.actors.filter((a) => a.kind === 'mob');
    mobs.forEach((m, i) => { if (i) { m.x = -800; m.y = -800; } });
    const m = mobs[0]; m.x = player.x + 48; m.y = player.y; m.home = { x: m.x, y: m.y }; m.ai.target = null; m.hp = m.maxHp; window.__mob = m; window.__hp0 = m.hp; window.__proj0 = world.projectiles.length;
  });
  const pos = await worldToClient(page, await page.evaluate(() => window.__mob.x), await page.evaluate(() => window.__mob.y), 20);
  await page.mouse.move(pos.x, pos.y);
  await page.evaluate(() => window.poc.startAction('attack'));
  try { await page.waitForFunction(() => window.__mob.hp < window.__hp0, null, { timeout: 8000 }); } catch (e) {
    throw new Error('sem dano: ' + JSON.stringify(await page.evaluate(() => { const p = window.poc, m = window.__mob; return { mob: [m.x, m.y, m.hp, m.dead], pl: [p.player.x, p.player.y, p.player.facing, p.player.cds.basic], aim: p.aimPoint(), mouse: [p.mouse.x, p.mouse.y], pend: !!window.poc.anims.get(p.player.id), clip: p.anims.get(p.player.id).anim.name }; })));
  }
  const r = await page.evaluate(() => ({ hp: window.__mob.hp, hp0: window.__hp0, proj: window.poc.world.projectiles.filter((p) => p.owner === window.poc.player.id || p.ownerId === window.poc.player.id).length }));
  expect(r.hp).toBeLessThan(r.hp0);
  expect(r.proj).toBe(0); // corpo a corpo: nada de projétil do jogador
  expect(errors, errors.join('\n')).toEqual([]);
});

// Skill 3 do Paladino (Grito de Guerra, buff real: +35% dano e -25% dano recebido por 6 s): efeito claro, nome no ar, tooltip e indicador de buff.
test('paladino: Grito de Guerra mostra efeito próprio, tooltip com a descrição real e o buff ativo no HUD', async ({ page }) => {
  const meta = new URL('../../public/labs/iso-poc/art-local/atlas-rig/paladino/paladino.json', import.meta.url);
  test.skip(!fs.existsSync(meta), 'atlas não gerado (art-local/ fora do Git)');
  const errors = await open(page, '?hero=paladino&mobs=0');
  await clearArea(page);
  const tip = await page.getAttribute('#sl-s2', 'title');
  expect(tip).toContain('Grito de Guerra');
  expect(tip).toContain('+35% de dano');
  await page.evaluate(() => window.poc.startAction('skill', 2));
  await page.waitForFunction(() => window.poc.vfx.some((v) => v.kind === 'shout' && v.label === 'Grito de Guerra'), null, { timeout: 8000, polling: 'raf' });
  await page.waitForFunction(() => window.poc.player.buffs.some((b) => b.id === 'warcry'), null, { timeout: 8000 });
  await page.waitForFunction(() => document.getElementById('hud-buffs').textContent.includes('Grito de Guerra'), null, { timeout: 8000 });
  await page.waitForFunction(() => window.poc.vfx.some((v) => v.kind === 'aura' && v.persist), null, { timeout: 8000 }); // aura contínua enquanto o buff dura
  expect(errors, errors.join('\n')).toEqual([]);
});
