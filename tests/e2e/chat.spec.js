import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Publicação em porta única (server/start.js com PORT) + chat online: duas pessoas criam conta e personagem pelo próprio site
// (sem ?api=, a marca <meta name="aetheria-api"> liga o modo online), entram na Vila e conversam.
// porta sorteada a cada subida: o desligamento limpo do servidor segura a porta por SHUTDOWN_GRACE_MS (3 s) e um novo processo na mesma porta falharia
let srv, dir, PORT, BASE;
test.beforeAll(async () => {
  PORT = 5190 + Math.floor(Math.random() * 400); BASE = `http://localhost:${PORT}`;
  dir = mkdtempSync(join(tmpdir(), 'aetheria-chat-'));
  srv = spawn(process.execPath, ['server/start.js'], { env: { ...process.env, PORT: String(PORT), DB_PATH: join(dir, 'chat.db'), LOG_LEVEL: 'warn' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/healthz')).ok) return; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 200)); }
  throw new Error('servidor de porta única não subiu');
});
test.afterAll(async () => { if (srv && srv.exitCode == null) { const done = new Promise((r) => srv.once('exit', r)); srv.kill(); await done; } try { rmSync(dir, { recursive: true, force: true }); } catch { /* arquivo do SQLite ainda aberto no Windows */ } });

async function hero(browser, email, name) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '/');
  await page.click('[data-action="auth-mode"][data-arg="register"]');
  await page.fill('#acc-email', email); await page.fill('#acc-pass', 'segredo-bom-123');
  await page.click('[data-action="auth-register"]');
  await page.waitForSelector('#recovery-codes');
  await page.click('[data-action="chars-refresh"]'); // "Anotei, continuar"
  await page.waitForSelector('[data-action="new-char"]'); await page.click('[data-action="new-char"]');
  await page.fill('.create-row input', name).catch(() => {});
  await page.click('[data-action="create"]');
  await page.waitForFunction(() => window.game?.net?.joined, null, { timeout: 20000 });
  return { page, ctx, errors };
}

test('porta única: login pelo próprio site, limite de 3 personagens no servidor e chat entre dois jogadores', async ({ browser }) => {
  const cfg = await (await fetch(BASE + '/api/config')).json();
  expect(cfg.maxCharacters).toBe(3);
  expect(cfg.gameUrl).toBe('/ws');
  const k = Date.now().toString(36); // e-mails e nomes únicos (o banco é do arquivo inteiro; repetir o teste não colide)
  const A = await hero(browser, `ana${k}@chat.dev`, 'Ana' + k.slice(-4)), B = await hero(browser, `beto${k}@chat.dev`, 'Beto' + k.slice(-4));
  await A.page.click('#chat-btn');
  await A.page.fill('.chat-input', 'Olá, Vila! <b>x</b>'); await A.page.press('.chat-input', 'Enter');
  // com a caixa fechada a mensagem aparece no aviso rápido e no contador do botão
  await B.page.waitForFunction(() => document.querySelector('#chat-feed .chat-text')?.textContent.includes('Olá, Vila!'));
  expect(await B.page.$eval('#chat-btn', (e) => e.dataset.count)).toBe('1');
  await B.page.click('#chat-btn');
  expect(await B.page.$eval('#chat-btn', (e) => e.dataset.count)).toBe('');
  expect(await B.page.evaluate(() => !!document.querySelector('#chat b')), 'HTML de outro jogador vira texto').toBe(false);
  await B.page.fill('.chat-input', 'Bora pro Bosque'); await B.page.press('.chat-input', 'Enter');
  await A.page.waitForFunction(() => [...document.querySelectorAll('#chat .chat-text')].some((e) => e.textContent === 'Bora pro Bosque'));
  // ritmo: duas mensagens seguidas → aviso do servidor na caixa
  await A.page.fill('.chat-input', 'um'); await A.page.press('.chat-input', 'Enter');
  await A.page.fill('.chat-input', 'dois'); await A.page.press('.chat-input', 'Enter');
  await expect(A.page.locator('.chat-hint')).toBeVisible();
  // Grupo desligado sem grupo
  expect(await A.page.$eval('.chat-tab:nth-child(2)', (e) => e.disabled)).toBe(true);
  expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
  await A.ctx.close(); await B.ctx.close();
});
