// API HTTP (JSON) de contas e personagens. Autenticação por `Authorization: Bearer <sessão>` (sem cookies ⇒ sem CSRF).
// O servidor é a fonte oficial do personagem: o cliente pede, o servidor valida (core/savedoc.js) e decide.
import http from 'node:http';
import { createAuth, AuthError, publicAccount } from './auth.js';
import { MAX_CHARACTERS, newToken } from './db.js';
import { checkSave, sanitizeImport } from './plausible.js';
import { RateLimiter } from '../public/src/core/protocol.js';
import { cleanName, migrate, validate, parseSave } from '../public/src/core/savedoc.js';
import { newCharacter, createSpirit } from '../public/src/core/progression.js';
import { makeRng } from '../public/src/core/rng.js';
import { CLASSES } from '../public/src/data/classes.js';

const SMALL = 8 * 1024, BIG = 320 * 1024;

export function normalizeDoc(obj) {
  const m = migrate(obj);
  if (!m.ok) return m;
  const v = validate(m.doc);
  return v.ok ? { ok: true, char: v.char, warnings: v.warnings } : v;
}

// Personagem novo criado PELO SERVIDOR (igual ao Game.newGame do cliente): o cliente só escolhe nome e classe.
export function newOfficialCharacter(name, classId, seed = Date.now() & 0x7fffffff) {
  const rng = makeRng(seed);
  const c = newCharacter(cleanName(name), classId, rng);
  const sp = createSpirit(rng, { rarity: 'common' });
  c.spirits.push(sp); c.activeSpirit = sp.id;
  return c;
}

// Ids de itens/spirits de um save importado passam a ser do servidor (impede reaproveitar ids forjados/duplicados entre contas).
function reId(doc) {
  const map = new Map();
  const fresh = (old) => { const n = 'i' + newToken(9); map.set(old, n); return n; };
  for (const k of Object.keys(doc.equipment)) doc.equipment[k] = { ...doc.equipment[k], id: fresh(doc.equipment[k].id) };
  doc.inventory = doc.inventory.map((it) => ({ ...it, id: fresh(it.id) }));
  doc.spirits = doc.spirits.map((sp) => ({ ...sp, id: fresh(sp.id) }));
  doc.activeSpirit = map.get(doc.activeSpirit) ?? doc.spirits[0]?.id ?? null;
  return doc;
}

export function createApi(db, { googleClientId = null, origins = [], trustProxy = false, fetchJwks, gameUrl = null, now = () => Date.now() } = {}) {
  const auth = createAuth(db, { googleClientId, fetchJwks, now });
  const ipLimit = new Map(), authLimit = new Map();
  const limited = (map, key, max) => { let l = map.get(key); if (!l) map.set(key, (l = new RateLimiter(max))); return !l.allow(now()); };
  if (typeof setInterval === 'function') setInterval(() => { if (ipLimit.size > 5000) ipLimit.clear(); if (authLimit.size > 5000) authLimit.clear(); }, 60_000).unref?.();

  // Cabeçalhos de segurança: a API só devolve JSON (nada de HTML/script), não deve ser embutida nem interpretada como outro tipo.
  const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Cross-Origin-Resource-Policy': 'cross-origin' };
  const json = (res, status, body, headers = {}) => { const s = JSON.stringify(body); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC, ...headers }); res.end(s); };
  const err = (res, status, error, message, h) => json(res, status, { error, message }, h);

  async function readJson(req, limit) {
    const type = String(req.headers['content-type'] ?? '');
    if (!type.startsWith('application/json')) throw new AuthError('bad_content_type', 'Use application/json.', 415);
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > limit) throw new AuthError('too_large', 'Corpo grande demais.', 413); chunks.push(c); }
    try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (v === null || typeof v !== 'object' || Array.isArray(v)) throw 0; return v; } catch { throw new AuthError('bad_json', 'JSON inválido.', 400); }
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) return false;
    const origin = req.headers.origin;
    const cors = origin && origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' } : {};
    if (req.method === 'OPTIONS') { res.writeHead(cors['Access-Control-Allow-Origin'] ? 204 : 403, { ...SEC, ...cors }); res.end(); return true; }
    if (origin && !cors['Access-Control-Allow-Origin']) { err(res, 403, 'bad_origin', 'Origem não permitida.'); return true; }
    const ip = (trustProxy && String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
    if (limited(ipLimit, ip, 240)) { err(res, 429, 'rate_limit', 'Muitas requisições.', cors); return true; }
    const route = `${req.method} ${url.pathname}`;
    try {
      // ---- públicas ----
      if (route === 'GET /api/config') return json(res, 200, { googleClientId, maxCharacters: MAX_CHARACTERS, requireAccount: true, gameUrl }, cors), true;
      if (['POST /api/register', 'POST /api/login', 'POST /api/google', 'POST /api/recover'].includes(route)) {
        if (limited(authLimit, ip, 10)) { err(res, 429, 'rate_limit', 'Muitas tentativas de login. Aguarde um minuto.', cors); return true; }
        const b = await readJson(req, SMALL);
        if (route === 'POST /api/register') return json(res, 201, await auth.register(b.email, b.password, ip), cors), true;
        if (route === 'POST /api/login') return json(res, 200, await auth.login(b.email, b.password, ip), cors), true;
        if (route === 'POST /api/google') return json(res, 200, await auth.loginGoogle(b.idToken, ip), cors), true;
        return json(res, 200, await auth.recover(b.email, b.code, b.newPassword, ip), cors), true;
      }
      // ---- autenticadas ----
      const m = /^Bearer ([\w-]{32,64})$/.exec(String(req.headers.authorization ?? ''));
      const token = m?.[1];
      const acc = token ? auth.authenticate(token) : null;
      if (!acc) { err(res, 401, 'unauthorized', 'Faça login.', cors); return true; }
      const send = (status, body) => json(res, status, body, cors);

      if (route === 'POST /api/logout') { auth.logout(token); return send(200, { ok: true }), true; }
      if (route === 'GET /api/me') return send(200, { account: publicAccount(acc), characters: db.listCharacters(acc.id) }), true;

      if (route === 'POST /api/characters') {
        const b = await readJson(req, SMALL);
        if (!CLASSES[b.classId]) return err(res, 400, 'bad_class', 'Classe inválida.', cors), true;
        if (db.countCharacters(acc.id) >= MAX_CHARACTERS) return err(res, 409, 'slots_full', `Limite de ${MAX_CHARACTERS} personagens.`, cors), true;
        const doc = newOfficialCharacter(b.name, b.classId);
        try { const id = db.createCharacter(acc.id, doc.name, doc.classId, doc, now()); db.audit('char_create', { accountId: acc.id, ip, detail: id }); return send(201, { id, character: doc, rev: 0 }), true; }
        catch { return err(res, 409, 'name_taken', 'Esse nome já está em uso.', cors), true; }
      }
      if (route === 'POST /api/characters/import') {
        const b = await readJson(req, BIG);
        if (db.countCharacters(acc.id) >= MAX_CHARACTERS) return err(res, 409, 'slots_full', `Limite de ${MAX_CHARACTERS} personagens.`, cors), true;
        const r = parseSave(typeof b.save === 'string' ? b.save : JSON.stringify(b.save ?? null));
        if (!r.ok) return err(res, 422, 'bad_save', r.reason, cors), true;
        const doc = sanitizeImport(reId(r.char), newOfficialCharacter('x', r.char.classId)); // itens forjados, pergaminhos e mapas do arquivo local não valem
        // o histórico de arena do save local não é confiável: recomeça no padrão do servidor
        doc.arena = { rating: 1000, wins: 0, losses: 0, bestWave: Math.min(doc.arena.bestWave, 10), ratings: {} };
        let base = doc.name, n = 1, id = null;
        while (id == null && n < 50) { try { doc.name = n === 1 ? base : cleanName(`${base.slice(0, 11)}${n}`); id = db.createCharacter(acc.id, doc.name, doc.classId, doc, now()); } catch { n++; } }
        if (id == null) return err(res, 409, 'name_taken', 'Não foi possível escolher um nome livre.', cors), true;
        db.audit('char_import', { accountId: acc.id, ip, detail: `${id} ${r.warnings.length} ajustes` });
        return send(201, { id, character: doc, rev: 0, warnings: r.warnings }), true;
      }
      const cm = /^\/api\/characters\/(\d{1,12})$/.exec(url.pathname);
      if (cm) {
        const id = Number(cm[1]);
        const c = db.ownedCharacter(acc.id, id);
        if (!c) return err(res, 404, 'not_found', 'Personagem não encontrado.', cors), true;
        if (req.method === 'GET') return send(200, { id, character: c.doc, rev: c.rev }), true;
        if (req.method === 'DELETE') { db.deleteCharacter(acc.id, id, now()); db.audit('char_delete', { accountId: acc.id, ip, detail: id }); return send(200, { ok: true }), true; }
        if (req.method === 'PUT') {
          const b = await readJson(req, BIG);
          if (!Number.isInteger(b.rev)) return err(res, 400, 'bad_rev', 'Revisão ausente.', cors), true;
          const n = normalizeDoc(b.doc);
          if (!n.ok) return err(res, 422, 'bad_doc', n.reason, cors), true;
          const chk = checkSave(c.doc, n.char);
          if (!chk.ok) { db.audit('save_rejected', { accountId: acc.id, ip, detail: `${id} ${chk.reason}` }); return err(res, 422, 'implausible', 'Salvamento recusado: ' + chk.reason, cors), true; }
          const rev = db.saveCharacter(id, chk.doc, b.rev, now());
          if (rev == null) return err(res, 409, 'stale_rev', 'O personagem foi alterado em outro lugar.', cors), true;
          return send(200, { rev, character: chk.doc }), true;
        }
      }
      return err(res, 404, 'not_found', 'Rota inexistente.', cors), true;
    } catch (e) {
      if (e instanceof AuthError) { err(res, e.status, e.code, e.message, cors); return true; }
      console.error('erro na API:', e);
      err(res, 500, 'server_error', 'Erro interno.', cors);
      return true;
    }
  }

  return { handle, auth, server: (extra) => http.createServer(async (req, res) => { if (!(await handle(req, res))) { if (extra) return extra(req, res); res.writeHead(404).end(); } }) };
}
