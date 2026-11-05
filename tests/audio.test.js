import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { soundFor, musicFor, SFX, MUSIC } from '../public/src/audio.js';
import { changePref, loadPrefs } from '../public/src/prefs.js';
import { createStatic } from '../server/static.js';
import { ZONES } from '../public/src/data/zones.js';

// Áudio (2026-11-04): mapeamento evento → som, música por lugar, volumes nas Opções e o servidor entregando a música por partes.
const me = { kind: 'player', classId: 'warrior', x: 0, y: 0 };
const mob = { kind: 'mob', x: 100, y: 0 };

test('soundFor: golpe por classe, dano no jogador × no inimigo, crítico, bloqueio, magia de fogo/sagrada, morte e chefe', () => {
  assert.equal(soundFor({ type: 'swing', actor: me }, me).id, 'blade');
  assert.equal(soundFor({ type: 'swing', actor: { ...me, classId: 'archer' } }, me).id, 'bow');
  assert.equal(soundFor({ type: 'swing', actor: { ...me, classId: 'mage' } }, me).id, 'magic');
  assert.equal(soundFor({ type: 'swing', actor: mob }, me), null, 'golpe de monstro não faz barulho próprio (o dano já faz)');
  assert.equal(soundFor({ type: 'hit', target: me }, me).id, 'hurt');
  assert.equal(soundFor({ type: 'hit', target: me, blocked: true }, me).id, 'block');
  assert.equal(soundFor({ type: 'hit', target: mob, crit: true }, me).id, 'crit');
  assert.equal(soundFor({ type: 'hit', target: mob }, me).at, mob, 'a distância é a do alvo');
  assert.equal(soundFor({ type: 'cast', actor: me, skill: 'fireball' }, me).id, 'fire');
  assert.equal(soundFor({ type: 'cast', actor: me, skill: 'meteor' }, me).id, 'fire');
  assert.equal(soundFor({ type: 'cast', actor: me, skill: 'holylight' }, me).id, 'holy');
  assert.equal(soundFor({ type: 'cast', actor: me, skill: 'charge' }, me).id, 'cast');
  assert.equal(soundFor({ type: 'death', actor: mob }, me).id, 'die');
  assert.equal(soundFor({ type: 'death', actor: me }, me), null);
  assert.equal(soundFor({ type: 'heal', actor: me, amount: 2 }, me), null, 'cura pequena (roubo de vida) não toca');
  assert.equal(soundFor({ type: 'boss_warn', stage: 'arrive' }, me).id, 'roar');
  assert.equal(soundFor({ type: 'telegraph' }, me), null);
});

test('musicFor: Vila nas cidades, exploração nos mapas, batalha com chefe por perto, arena, ondas e Cripta', () => {
  assert.equal(musicFor({ mode: 'explore', zone: ZONES.town }), 'town');
  assert.equal(musicFor({ mode: 'explore', zone: ZONES.forest }), 'explore');
  assert.equal(musicFor({ mode: 'explore', zone: ZONES.forest, bossNear: true }), 'battle');
  assert.equal(musicFor({ mode: 'pvp', zone: ZONES.arena }), 'battle');
  assert.equal(musicFor({ mode: 'waves' }), 'battle');
  assert.equal(musicFor({ mode: 'net', zone: ZONES.crypt }), 'battle');
  assert.equal(musicFor({ mode: 'title' }), 'town');
  if (ZONES.harbor) assert.equal(musicFor({ mode: 'explore', zone: ZONES.harbor }), 'town');
});

test('todos os arquivos de som e música existem e são pequenos', () => {
  for (const def of Object.values(SFX)) for (const f of def.files) {
    const p = `public/assets/audio/sfx/${f}.mp3`; assert.ok(existsSync(p), p); assert.ok(statSync(p).size < 60_000, `${p} grande demais`);
  }
  for (const f of Object.values(MUSIC)) { const p = `public/assets/audio/music/${f}.mp3`; assert.ok(existsSync(p), p); assert.ok(statSync(p).size < 2_500_000); }
});

test('prefs: volumes de música e efeitos de 0 a 100 em passos de 10; "Mudo" = 0', () => {
  const p = { ...loadPrefs() };
  assert.equal(p.music, 50); assert.equal(p.sfx, 80);
  assert.equal(changePref(p, 'music:+10').music, 60);
  assert.equal(changePref({ ...p, music: 100 }, 'music:+10').music, 100);
  assert.equal(changePref({ ...p, sfx: 0 }, 'sfx:-10').sfx, 0);
  assert.equal(changePref(p, 'sfx:0').sfx, 0);
  assert.equal(changePref({ ...p, music: 'x' }, 'scale:auto').music, 50, 'valor inválido volta ao padrão');
});

test('servidor estático: música inteira (200) e por partes (206/416), como o <audio> do Safari pede', async () => {
  const srv = http.createServer(createStatic(fileURLToPath(new URL('../public', import.meta.url)))).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}/assets/audio/music/town.mp3`;
  const full = await fetch(base); const total = (await full.arrayBuffer()).byteLength;
  assert.equal(full.status, 200); assert.equal(full.headers.get('content-type'), 'audio/mpeg'); assert.equal(full.headers.get('accept-ranges'), 'bytes');
  const part = await fetch(base, { headers: { range: 'bytes=10-19' } });
  assert.equal(part.status, 206); assert.equal((await part.arrayBuffer()).byteLength, 10); assert.equal(part.headers.get('content-range'), `bytes 10-19/${total}`);
  const tail = await fetch(base, { headers: { range: 'bytes=-5' } });
  assert.equal(tail.status, 206); assert.equal((await tail.arrayBuffer()).byteLength, 5);
  assert.equal((await fetch(base, { headers: { range: `bytes=${total + 10}-` } })).status, 416);
  srv.close();
});
