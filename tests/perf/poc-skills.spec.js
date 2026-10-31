import { chromium, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Estresse do PoC com os heróis em miniatura: golpe básico + as 3 skills sem parar (recargas zeradas a cada disparo, só para este teste),
// andando, com 40 monstros. Mede FPS, custo de desenho, partículas, efeitos vivos e memória.
// Condições: desktop 1080p e CELULAR EMULADO (844×390, DPR 2, toque, CPU 1× e 4× mais lenta). A GPU é a MESMA (Intel UHD) nas duas:
// a emulação NÃO é um celular real; ela só mostra o quanto de folga de CPU/JS o PoC tem.
// Uso: npx playwright test --config=tests/perf/playwright.config.js poc-skills   (servidor em :5174)
const OUT_DIR = fileURLToPath(new URL('../../test-results/', import.meta.url));
const GPU_ARGS = ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-frame-rate-limit', '--disable-gpu-vsync'];
const CONDS = [
  { nome: 'desktop 1080p', w: 1920, h: 1080, dpr: 1, cpu: 1, mobile: false },
  { nome: 'celular emulado 844x390 DPR2 CPU 1x', w: 844, h: 390, dpr: 2, cpu: 1, mobile: true },
  { nome: 'celular emulado 844x390 DPR2 CPU 4x', w: 844, h: 390, dpr: 2, cpu: 4, mobile: true },
];
const HEROIS = ['paladino', 'aprendiz', 'franco', 'sacerdote'];

test('estresse do PoC com skills (desktop e celular emulado)', async () => {
  test.setTimeout(900000);
  const browser = await chromium.launch({ args: GPU_ARGS });
  const out = { quando: new Date().toISOString(), casos: [] };
  for (const c of CONDS) {
    for (const hero of HEROIS) {
      const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: c.dpr, isMobile: c.mobile, hasTouch: c.mobile });
      const page = await ctx.newPage();
      const erros = []; page.on('pageerror', (e) => erros.push(e.message));
      if (c.cpu > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: c.cpu });
      await page.goto(`http://localhost:5174/labs/iso-poc/index.html?hero=${hero}&mobs=40&dpr=${c.dpr}`);
      await page.waitForFunction(() => window.poc?.ready, null, { timeout: 180000 });
      await page.waitForTimeout(2500);
      const r = await page.evaluate(() => new Promise((res) => {
        const p = window.poc; let picoVfx = 0, n = 0; const f0 = p.stats.frames, t0 = performance.now();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
        const iv = setInterval(() => {
          p.player.cds.basic = 0; p.player.cds.s0 = 0; p.player.cds.s1 = 0; p.player.cds.s2 = 0; // estresse: sem recarga
          p.mouse.x = innerWidth * 0.7; p.mouse.y = innerHeight * 0.5;
          p.startAction(n % 4 === 0 ? 'attack' : 'skill', n % 4 === 0 ? 0 : (n % 4) - 1); n++;
          picoVfx = Math.max(picoVfx, p.vfx.length);
        }, 120);
        setTimeout(() => { clearInterval(iv); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' })); const s = p.stats;
          res({ fps: (s.frames - f0) / ((performance.now() - t0) / 1000), drawMs: s.renderMs, simMs: s.simMs, particulas: s.particles, picoEfeitos: picoVfx, acoes: n,
            texturasMiB: s.atlasMiB + s.propsMiB, heapMiB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null }); }, 6000);
      }));
      const rr = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v]));
      out.casos.push({ condicao: c.nome, heroi: hero, ...rr, errosDeConsole: erros.length });
      await ctx.close();
    }
  }
  await browser.close();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_DIR + 'perf-poc-skills.json', JSON.stringify(out, null, 2));
  console.log('PERF ' + JSON.stringify(out));
});
