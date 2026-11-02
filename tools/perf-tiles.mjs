// Mede os picos de quadro ao entrar em cada mapa (V30: blocos de terreno e carga de atlas). Uso: com `npm start` rodando, `node tools/perf-tiles.mjs [url]`.
// Teleporta pelo window.game, mede o draw de cada quadro por ~2 s e imprime máximo, p95 e quantos quadros passaram de 16 ms. Antes da mudança: 100–270 ms de pico (docs/roadmap/auditoria-visual.md).
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5174/?api=';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu-rasterization'] }); // GPU: o Chromium por CPU é pessimista
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true })).newPage();
await page.goto(url);
await page.waitForFunction(() => window.game);
const out = await page.evaluate(async () => {
  const g = window.game, res = {};
  const frames = (ms) => new Promise((ok) => { const a = []; const t0 = performance.now(); let last = t0; const f = (t) => { a.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else ok(a); }; requestAnimationFrame(f); });
  for (const id of ['forest', 'plains', 'ruins', 'glacier', 'ember']) {
    g.enterZone(id); // main.js › enterZone(zoneId, x, y)
    const a = await frames(2000), s = [...a].sort((x, y) => x - y);
    res[id] = { max: +Math.max(...a).toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), over16: a.filter((x) => x > 16.7).length, tiles: g.renderer?.groundCache?.stats };
  }
  return res;
});
console.table(out);
await browser.close();
