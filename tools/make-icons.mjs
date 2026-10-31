// Gera os ícones PNG do PWA/Android a partir de public/icon.svg (usa o Chromium do Playwright, já instalado).
// O ícone "maskable" ocupa só a área segura central (80%) sobre fundo cheio, para o Android poder recortá-lo.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const PUB = join(fileURLToPath(new URL('..', import.meta.url)), 'public');
const svg = readFileSync(join(PUB, 'icon.svg'), 'utf8');
const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const OUT = join(PUB, 'icons'); mkdirSync(OUT, { recursive: true });
const JOBS = [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['apple-touch-icon.png', 180, 1], ['icon-maskable-512.png', 512, 0.8]];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, inner] of JOBS) {
  await page.setViewportSize({ width: size, height: size });
  const px = Math.round(size * inner), off = Math.round((size - px) / 2);
  await page.setContent(`<body style="margin:0;background:#14172a"><img src="${dataUrl}" style="position:absolute;left:${off}px;top:${off}px;width:${px}px;height:${px}px"></body>`);
  await page.waitForFunction(() => document.images[0].complete);
  writeFileSync(join(OUT, name), await page.screenshot({ omitBackground: false }));
  console.log('ok', name);
}
await browser.close();
