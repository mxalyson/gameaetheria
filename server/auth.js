// Autenticação: e-mail + senha (scrypt, sal por usuário, comparação em tempo constante), sessões opacas, códigos de recuperação
// (sem e-mail: não há infraestrutura de envio) e login Google (verificação de ID token RS256 contra as chaves públicas do Google).
import { scrypt, randomBytes, timingSafeEqual, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { promisify } from 'node:util';
import { sha256 } from './db.js';

const scryptAsync = promisify(scrypt);
const N = 16384, R = 8, P = 1, KEYLEN = 32;
const WEAK = new Set(['password', 'senha123', '12345678', '123456789', '1234567890', 'qwertyui', 'abcd1234', 'aetheria', 'aetheria1', '11111111', 'password1']);

export const normalizeEmail = (e) => String(e ?? '').trim().toLowerCase();
export const validEmail = (e) => e.length >= 5 && e.length <= 254 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(e);

// Devolve null se a senha é aceitável, ou o motivo.
export function passwordProblem(pw, email = '') {
  if (typeof pw !== 'string') return 'Senha inválida.';
  if (pw.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (pw.length > 128) return 'A senha é longa demais (máximo 128).';
  if (WEAK.has(pw.toLowerCase())) return 'Essa senha é fraca demais; escolha outra.';
  const local = email.split('@')[0];
  if (local && local.length >= 4 && pw.toLowerCase().includes(local)) return 'A senha não pode conter o seu e-mail.';
  if (/^(.)\1+$/.test(pw)) return 'A senha não pode ser um único caractere repetido.';
  return null;
}

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const dk = await scryptAsync(pw, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${dk.toString('base64')}`;
}
export async function verifyPassword(pw, stored) {
  const [alg, n, r, p, saltB, hashB] = String(stored ?? '').split('$');
  if (alg !== 'scrypt') return false;
  const salt = Buffer.from(saltB, 'base64'), want = Buffer.from(hashB, 'base64');
  const got = await scryptAsync(pw, salt, want.length, { N: Number(n), r: Number(r), p: Number(p) });
  return got.length === want.length && timingSafeEqual(got, want);
}
let DUMMY = null; // hash falso para gastar o mesmo tempo quando o e-mail não existe (não revela quais e-mails têm conta)
const dummyHash = async () => (DUMMY ??= await hashPassword('dummy-password-for-timing'));

// 8 códigos de uso único, mostrados UMA vez no cadastro (formato xxxxx-xxxxx, alfabeto sem caracteres ambíguos).
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export function generateRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => { const b = randomBytes(10); const s = [...b].map((x) => ALPHA[x % ALPHA.length]).join(''); return `${s.slice(0, 5)}-${s.slice(5)}`; });
}
export const hashCode = (c) => sha256('rc:' + String(c).trim().toLowerCase());

export class AuthError extends Error { constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; } }

export function createAuth(db, { googleClientId = null, fetchJwks = defaultFetchJwks, now = () => Date.now() } = {}) {
  async function register(emailRaw, password, ip) {
    const email = normalizeEmail(emailRaw);
    if (!validEmail(email)) throw new AuthError('bad_email', 'E-mail inválido.');
    const prob = passwordProblem(password, email);
    if (prob) throw new AuthError('weak_password', prob);
    if (db.accountByEmail(email)) { db.audit('register_duplicate', { ip, detail: email }); throw new AuthError('email_taken', 'Este e-mail já tem conta.', 409); }
    const id = db.createAccount({ email, pwHash: await hashPassword(password) }, now());
    const codes = generateRecoveryCodes();
    db.setRecoveryCodes(id, codes.map(hashCode));
    db.audit('register', { accountId: id, ip });
    return { token: db.createSession(id, now()), account: publicAccount(db.account(id)), recoveryCodes: codes };
  }

  async function login(emailRaw, password, ip) {
    const email = normalizeEmail(emailRaw);
    const acc = validEmail(email) ? db.accountByEmail(email) : null;
    const generic = new AuthError('bad_credentials', 'E-mail ou senha incorretos.', 401);
    if (!acc || !acc.pw_hash) { await verifyPassword(String(password ?? ''), await dummyHash()); throw generic; }
    if (acc.disabled) throw new AuthError('disabled', 'Conta desativada.', 403);
    if (acc.locked_until > now()) { db.audit('login_locked', { accountId: acc.id, ip }); throw new AuthError('locked', 'Muitas tentativas. Tente novamente em alguns minutos.', 429); }
    if (typeof password !== 'string' || !(await verifyPassword(password, acc.pw_hash))) {
      db.registerFailure(acc.id, now()); db.audit('login_fail', { accountId: acc.id, ip }); throw generic;
    }
    db.registerSuccess(acc.id); db.audit('login', { accountId: acc.id, ip });
    return { token: db.createSession(acc.id, now()), account: publicAccount(acc) };
  }

  // Redefinição de senha com um código de recuperação (uso único). Encerra todas as sessões e gera códigos novos.
  async function recover(emailRaw, code, newPassword, ip) {
    const email = normalizeEmail(emailRaw);
    const acc = validEmail(email) ? db.accountByEmail(email) : null;
    const fail = new AuthError('bad_recovery', 'E-mail ou código inválido.', 400);
    if (!acc) { db.audit('recover_unknown', { ip }); throw fail; }
    if (acc.locked_until > now()) throw new AuthError('locked', 'Muitas tentativas. Tente novamente em alguns minutos.', 429);
    const prob = passwordProblem(newPassword, email);
    if (prob) throw new AuthError('weak_password', prob);
    if (!db.consumeRecoveryCode(acc.id, hashCode(code))) { db.registerFailure(acc.id, now()); db.audit('recover_fail', { accountId: acc.id, ip }); throw fail; }
    db.setPassword(acc.id, await hashPassword(newPassword));
    const codes = generateRecoveryCodes(); db.setRecoveryCodes(acc.id, codes.map(hashCode));
    db.audit('recover', { accountId: acc.id, ip });
    return { ok: true, recoveryCodes: codes };
  }

  async function loginGoogle(idToken, ip) {
    if (!googleClientId) throw new AuthError('google_off', 'Login com Google não está configurado neste servidor.', 501);
    const claims = await verifyGoogleIdToken(idToken, { clientId: googleClientId, fetchJwks, nowSec: Math.floor(now() / 1000) });
    let acc = db.accountByGoogle(claims.sub), isNew = false;
    if (!acc) {
      const email = normalizeEmail(claims.email);
      const byMail = validEmail(email) ? db.accountByEmail(email) : null;
      if (byMail) { db.linkGoogle(byMail.id, claims.sub); acc = db.account(byMail.id); } // e-mail verificado pelo Google: vincula
      else { acc = db.account(db.createAccount({ email: validEmail(email) ? email : null, googleSub: claims.sub }, now())); isNew = true; }
    }
    if (acc.disabled) throw new AuthError('disabled', 'Conta desativada.', 403);
    db.audit(isNew ? 'register_google' : 'login_google', { accountId: acc.id, ip });
    return { token: db.createSession(acc.id, now()), account: publicAccount(acc), isNew };
  }

  return { register, login, recover, loginGoogle, authenticate: (token) => db.sessionAccount(token, now()), logout: (token) => db.deleteSession(token) };
}

export const publicAccount = (a) => ({ id: a.id, email: a.email, google: !!a.google_sub, hasPassword: !!a.pw_hash });

// ---------- Google ----------
const b64u = (s) => Buffer.from(s, 'base64url');
let jwksCache = { at: 0, keys: null };
async function defaultFetchJwks() {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new Error('jwks');
  const { keys } = await res.json();
  jwksCache = { at: Date.now(), keys };
  return keys;
}

// Verifica um ID token do Google (JWT RS256): assinatura, emissor, público (nosso client id), validade e e-mail verificado.
export async function verifyGoogleIdToken(idToken, { clientId, fetchJwks, nowSec }) {
  const bad = (m) => new AuthError('bad_google_token', 'Token do Google inválido: ' + m, 401);
  if (typeof idToken !== 'string' || idToken.length > 4096) throw bad('formato');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw bad('formato');
  let header, payload;
  try { header = JSON.parse(b64u(parts[0]).toString()); payload = JSON.parse(b64u(parts[1]).toString()); } catch { throw bad('formato'); }
  if (header.alg !== 'RS256' || !header.kid) throw bad('algoritmo'); // nunca aceitar "none"/HS256
  let keys;
  try { keys = await fetchJwks(); } catch { throw new AuthError('google_unavailable', 'Não foi possível verificar com o Google agora.', 503); }
  const jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) throw bad('chave desconhecida');
  const ok = cryptoVerify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), createPublicKey({ key: jwk, format: 'jwk' }), b64u(parts[2]));
  if (!ok) throw bad('assinatura');
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(payload.iss)) throw bad('emissor');
  if (payload.aud !== clientId) throw bad('público');
  if (!(payload.exp > nowSec)) throw bad('expirado');
  if (payload.iat > nowSec + 60) throw bad('data');
  if (!payload.sub || typeof payload.sub !== 'string') throw bad('sub');
  if (payload.email_verified !== true) throw bad('e-mail não verificado');
  return payload;
}
