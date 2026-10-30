import { chromium, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Sempre dentro do projeto, não importa de onde o comando é executado.
const OUT_DIR = fileURLToPath(new URL('../../test-results/', import.meta.url));

// Mede FPS REAIS do PoC isométrico com aceleração por GPU (ANGLE/Direct3D11). O Chromium do Playwright, por padrão, renderiza
// por SOFTWARE, o que dá números muito piores e enganosos. FPS sem limite de vsync: é capacidade, não o que o monitor mostra.
// Uso: npm run perf:poc    (resultado em test-results/perf-poc.json)
const GPU_ARGS = ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-frame-rate-limit', '--disable-gpu-vsync'];
const CASOS = [
  ['720p 2:1', 1280, 720, 'dpr=1'], ['1080p 2:1', 1920, 1080, 'dpr=1'], ['1080p 40 monstros', 1920, 1080, 'dpr=1&mobs=40'],
  ['1080p 120 monstros', 1920, 1080, 'dpr=1&mobs=120'], ['canvas 4K (1080p CSS, DPR 2)', 1920, 1080, 'dpr=2'], ['720p 30 graus', 1280, 720, 'dpr=1&tilt=30'], ['720p zoom 1,5', 1280, 720, 'dpr=1&zoom=1.5'],
];

test('FPS do PoC isométrico na GPU', async () => {
  const browser = await chromium.launch({ args: GPU_ARGS });
  const out = { quando: new Date().toISOString(), gpu: null, casos: [] };
  for (const [nome, w, h, qs] of CASOS) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const erros = []; page.on('pageerror', (e) => erros.push(e.message));
    await page.goto('http://localhost:5174/labs/iso-poc/index.html?' + qs);
    await page.waitForFunction(() => window.poc?.ready, null, { timeout: 120000 });
    out.gpu ??= await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl'); return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); });
    await page.waitForTimeout(2500);
    const parado = await page.evaluate(() => new Promise((res) => { const f0 = window.poc.stats.frames, t0 = performance.now(); setTimeout(() => res({ fps: (window.poc.stats.frames - f0) / ((performance.now() - t0) / 1000), drawMs: window.poc.stats.renderMs, simMs: window.poc.stats.simMs, sprites: window.poc.stats.sprites, atores: window.poc.stats.actors }), 3000); }));
    await page.evaluate(() => { window.__f0 = window.poc.stats.frames; window.__t0 = performance.now(); });
    await page.keyboard.down('d');
    const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < 4000) { await page.keyboard.press(['1', '2'][n++ % 2]); await page.mouse.move(w / 2 + 120, h / 2 + 40); await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up(); await page.waitForTimeout(300); }
    const emUso = await page.evaluate(() => ({ fps: (window.poc.stats.frames - window.__f0) / ((performance.now() - window.__t0) / 1000), drawMs: window.poc.stats.renderMs, simMs: window.poc.stats.simMs, particulas: window.poc.stats.particles }));
    await page.keyboard.up('d');
    const r = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v]));
    out.casos.push({ nome, parado: r(parado), emUso: r(emUso), errosDeConsole: erros.length });
    await page.close();
  }
  await browser.close();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_DIR + 'perf-poc.json', JSON.stringify(out, null, 2));
  console.log('PERF ' + JSON.stringify(out));
});
