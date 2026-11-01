// Mede o jogo num Chrome Android (emulador ou celular) via adb + DevTools. Pré-requisitos: `npm start`, aparelho visível em `adb devices`.
// `node tools/android-measure.mjs [url]` — grava test-results/android-measure.json. Os números valem SÓ para o aparelho medido (o emulador usa a GPU do PC).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ADB = join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8' }).trim();
const URL = process.argv[2] || 'http://localhost:5174/?api=';
const sh = (c) => adb('shell', c);

const isEmu = /emulator-/.test(adb('devices'));
adb('reverse', 'tcp:5174', 'tcp:5174');
// NUNCA apaga dados do Chrome nem muda configurações de um celular de verdade: só fecha o Chrome (num celular real, gire o aparelho para paisagem à mão)
sh('am force-stop com.android.chrome');
sh('am start -a android.intent.action.VIEW -d about:blank com.android.chrome >/dev/null 2>&1; echo');
await new Promise((r) => setTimeout(r, 4000));
adb('forward', 'tcp:9222', 'localabstract:chrome_devtools_remote');
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl'); const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return { ua: navigator.userAgent, dpr: devicePixelRatio, screen: [screen.width, screen.height], inner: [innerWidth, innerHeight], deviceMemory: navigator.deviceMemory ?? null, cores: navigator.hardwareConcurrency, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, coarse: matchMedia('(pointer: coarse)').matches };
});

// o emulador abre em retrato: gira para paisagem (como o jogador faria)
if (isEmu) sh('settings put system accelerometer_rotation 0; settings put system user_rotation 1'); // só no emulador
await page.waitForTimeout(1500);
await page.evaluate(() => { document.querySelector('[data-action="new-char"]')?.click(); });
await page.waitForTimeout(400);
await page.evaluate(() => { document.querySelector('[data-action="create"]')?.click(); });
await page.waitForFunction(() => window.game?.mode === 'explore', null, { timeout: 60000 });
await page.waitForFunction(() => window.heroSprites?.loaded >= 1 || !window.heroSprites, null, { timeout: 90000 });
await page.waitForTimeout(1500);

// amostrador de quadros: intervalos de requestAnimationFrame por cenário
const sample = (label, ms, setup) => page.evaluate(async ([label, ms, setupSrc]) => {
  if (setupSrc) await (0, eval)(setupSrc)();
  const ts = []; let last = performance.now(); const t0 = last;
  await new Promise((res) => { const f = (t) => { ts.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  ts.shift(); const s = [...ts].sort((a, b) => a - b); const avg = ts.reduce((a, b) => a + b, 0) / ts.length;
  const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  return { label, frames: ts.length, fps: +(1000 / avg).toFixed(1), p95ms: +s[Math.floor(s.length * 0.95)].toFixed(1), p99ms: +s[Math.floor(s.length * 0.99)].toFixed(1), maxMs: +s[s.length - 1].toFixed(1), over33: ts.filter((x) => x > 33.4).length, jsHeapMB: mem, hero: window.heroSprites ? { ...window.heroSprites } : null };
}, [label, ms, setup ?? null]);

const results = [];
results.push(await sample('vila parado', 8000));
results.push(await sample('vila andando', 8000, '() => async () => { const g = window.game; g.touch.move = { x: 1, y: 0, mag: 1 }; setTimeout(() => { g.touch.move = { x: -1, y: 0.3, mag: 1 }; }, 2500); setTimeout(() => { g.touch.move = { x: 0, y: -1, mag: 1 }; }, 5000); setTimeout(() => { g.touch.move = { x: 0, y: 0, mag: 0 }; }, 7500); }'));
results.push(await sample('bosque andando e lutando', 12000, '() => async () => { const g = window.game; g.enterZone("forest", 700, 900); await new Promise((r) => setTimeout(r, 1500)); g.touch.attack = true; g.touch.move = { x: 0.7, y: 0.5, mag: 1 }; setTimeout(() => { g.touch.move = { x: -0.7, y: -0.2, mag: 1 }; }, 5000); setTimeout(() => { g.touch.move = { x: 0.2, y: 0.9, mag: 1 }; }, 9000); }'));
await page.evaluate(() => { window.game.touch.attack = false; window.game.touch.move = { x: 0, y: 0, mag: 0 }; });
results.push(await sample('arena PvP 4x4 offline (8 atores)', 10000, '() => async () => { const g = window.game; g.char.level = Math.max(g.char.level, 10); g.startMatch ? g.startMatch("4v4") : g.act("match", "4v4"); await new Promise((r) => setTimeout(r, 4000)); }'));

const out = { when: new Date().toISOString(), url: URL, device: info, quality: await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('aetheria_prefs_v1') ?? '{}'); } catch { return {}; } }), results };
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/android-measure.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ device: info, results: results.map(({ hero, ...r }) => ({ ...r, tex: hero && { loadedHeroes: hero.loaded, texMiB: +(hero.texBytes / 1048576).toFixed(1), scale: hero.texScale } })) }, null, 2));
await browser.close();
