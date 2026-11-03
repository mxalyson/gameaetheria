import { test, expect } from '@playwright/test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { openDb } from '../../server/db.js';
import { createApi } from '../../server/api.js';

// Modo online no jogo real: conta obrigatória, login/cadastro, personagens na nuvem, recusa de salvamento falso, importar save local, Google.
const CLIENT_ID = 'cliente-e2e.apps.googleusercontent.com';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'e2e', alg: 'RS256' };
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const googleToken = (extra = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const data = b64u({ alg: 'RS256', kid: 'e2e' }) + '.' + b64u({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'g-e2e', email: 'gamer@exemplo.com', email_verified: true, iat: now, exp: now + 600, ...extra });
  return data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
};

let db, server, base;
test.beforeAll(async () => {
  db = openDb(':memory:');
  const api = createApi(db, { googleClientId: CLIENT_ID, origins: ['http://localhost:5174'], fetchJwks: async () => [JWK] });
  server = api.server();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); db.close(); });

async function abrir(page, { google = true } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (google) await page.addInitScript(() => { window.google = { accounts: { id: { initialize: (o) => { window.__gcb = o.callback; }, renderButton: () => {} } } }; });
  await page.goto('/?api=' + encodeURIComponent(base));
  return errors;
}
const registrar = async (page, email, senha = 'segredo-bom-123') => {
  await page.click('[data-action="auth-mode"][data-arg="register"]');
  await page.fill('#acc-email', email); await page.fill('#acc-pass', senha);
  await page.click('button[data-action="auth-register"]');
  await expect(page.locator('#recovery-codes code')).toHaveCount(8);
  const codes = await page.locator('#recovery-codes code').allTextContents();
  await page.click('[data-action="chars-refresh"]');
  return codes;
};
const criarPersonagem = async (page, nome, classe = 'mage') => {
  await page.click('[data-action="new-char"]');
  await page.click(`[data-action="pick-class"][data-arg="${classe}"]`);
  await page.fill('#char-name', nome);
  await page.click('[data-action="create"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
};

test('com API configurada a conta é obrigatória: tela de login, sem caminho para jogar sem entrar', async ({ page }) => {
  const errors = await abrir(page);
  await expect(page.locator('#acc-email')).toBeVisible();
  await expect(page.locator('[data-action="continue"]')).toHaveCount(0);
  await expect(page.locator('[data-action="new-char"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.game.char)).toBeFalsy();
  expect(await page.evaluate(() => window.game.mode)).toBe('title');
  // login com senha errada: mensagem genérica
  await page.fill('#acc-email', 'ninguem@exemplo.com'); await page.fill('#acc-pass', 'senha-qualquer-1');
  await page.click('button[data-action="auth-login"]');
  await expect(page.locator('.auth-err')).toContainText('E-mail ou senha incorretos');
  expect(errors).toEqual([]);
});

test('cadastro → personagem → progresso na nuvem → recarregar a página → login → personagem continua', async ({ page }) => {
  const errors = await abrir(page);
  const codes = await registrar(page, 'ana-e2e@exemplo.com');
  expect(codes.every((c) => /^[a-z0-9]{5}-[a-z0-9]{5}$/.test(c))).toBe(true);
  await expect(page.locator('.char-list')).toContainText('ainda não tem personagens');
  await criarPersonagem(page, 'Ana Nuvem', 'mage');
  const gold0 = await page.evaluate(() => window.game.char.gold);
  await page.evaluate(() => { window.game.char.gold -= 7; window.game.save(); }); // STRICT_PVE: o cliente só grava o que NÃO rende (gastar); ganhos vêm por transação/instância
  expect(await page.evaluate(() => window.game.flushCloud())).toBe(true);
  // nada do personagem fica no localStorage do aparelho (o oficial é o servidor)
  expect(await page.evaluate(() => localStorage.getItem('aetheria_save_v1'))).toBeNull();

  await page.reload();                                   // a sessão continua válida
  await expect(page.locator('.char-card')).toContainText('Ana Nuvem');
  await page.click('[data-action="char-select"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  expect(await page.evaluate(() => window.game.char.gold)).toBe(gold0 - 7);

  // sair da conta e voltar a entrar (outra "sessão")
  await page.evaluate(() => window.game.ui.openPanel('options'));
  await page.click('[data-action="logout"]');
  await expect(page.locator('#acc-email')).toBeVisible();
  await page.fill('#acc-email', 'ana-e2e@exemplo.com'); await page.fill('#acc-pass', 'segredo-bom-123');
  await page.click('button[data-action="auth-login"]');
  await expect(page.locator('.char-card')).toContainText('Nv 1');
  expect(errors).toEqual([]);
});

test('salvamento falso é recusado: o servidor devolve o último estado oficial e registra a tentativa', async ({ page }) => {
  const errors = await abrir(page);
  await registrar(page, 'cheat-e2e@exemplo.com');
  await criarPersonagem(page, 'Trapaceiro', 'warrior');
  await page.evaluate(() => { window.game.char.level = 30; window.game.char.gold = 5e8; window.game.save(); });
  expect(await page.evaluate(() => window.game.flushCloud())).toBe(false);
  await expect(page.locator('.toast', { hasText: 'recusou' })).toBeVisible();
  await page.waitForFunction(() => window.game.char.level === 1);
  expect(await page.evaluate(() => window.game.char.gold)).toBeLessThan(1000);
  expect(db.audits('save_rejected').length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('importar o save local para a conta: cria um novo personagem com ids do servidor', async ({ page }) => {
  await abrir(page);
  await page.evaluate(() => localStorage.setItem('aetheria_save_v1', JSON.stringify({
    version: 1, name: 'Velho', classId: 'archer', level: 9, xp: 5, statPoints: 0, alloc: { str: 0, agi: 20, int: 0, vit: 10 }, gold: 321, potions: 2,
    equipment: {}, inventory: [], spirits: [], activeSpirit: null, arena: { rating: 3000, wins: 50, losses: 0, bestWave: 4 }, created: 1700000000000,
  })));
  await registrar(page, 'import-e2e@exemplo.com');
  await page.click('[data-action="char-import-local"]');
  await expect(page.locator('.char-card')).toContainText('Velho');
  await page.click('[data-action="char-select"]');
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  const c = await page.evaluate(() => ({ level: window.game.char.level, gold: window.game.char.gold, rating: window.game.char.arena.rating }));
  expect(c).toEqual({ level: 9, gold: 321, rating: 1000 }); // rating local não é confiável: recomeça em 1000
});

test('login com Google: o token é verificado pelo servidor e entra na conta', async ({ page }) => {
  const errors = await abrir(page);
  await page.waitForFunction(() => typeof window.__gcb === 'function');
  await page.evaluate((t) => window.__gcb({ credential: t }), googleToken());
  await expect(page.locator('.char-list')).toBeVisible();
  await expect(page.locator('.tagline').first()).toContainText('gamer@exemplo.com');
  // token com público errado é recusado e volta ao login com aviso
  await page.evaluate(() => window.game.leaveCharacter().then(() => window.game.online.logout()).then(() => window.game.showAuth('login')));
  await page.waitForFunction(() => typeof window.__gcb === 'function');
  await page.evaluate((t) => window.__gcb({ credential: t }), googleToken({ aud: 'outro' }));
  await expect(page.locator('.auth-err')).toContainText('Token do Google inválido');
  expect(errors).toEqual([]);
});

test('jogo sem API (como no GitHub Pages hoje) continua offline, sem tela de login', async ({ page }) => {
  await page.goto('/?api=');
  await expect(page.locator('[data-action="new-char"]')).toBeVisible();
  await expect(page.locator('#acc-email')).toHaveCount(0);
});
