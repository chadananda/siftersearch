// anis-tools-repo — the Anís TOOL CATALOG as data (Chad 11-10: tools are fetched from the DB, registered at runtime, never a rebuild).
// Its OWN SQLite (ANIS_TOOLS_DB, default /tank/sifter/anis/tools.db; ':memory:' under vitest), never sifter.db. One row per tool:
// executor 'code' (metadata of a tools.js entry, upserted once per deploy by Anís instance 0, api/anis-index.js), 'http' (defined entirely by its row,
// run by assistant/http-tool.js) or 'none' (a plan row, status planned/built-in-code, not callable). tool_credentials holds secrets
// AES-256-GCM encrypted under TOOL_SECRETS_KEY (env); no read here returns a secret except secretFor(), the executor's.
// catalog() is the reply path's read: cached, re-read only when meta.rev moves (checked every REV_CHECK_MS). Never throws.
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export const TOOLS_DB = () => process.env.ANIS_TOOLS_DB || (process.env.VITEST ? ':memory:' : '/tank/sifter/anis/tools.db');
const REV_CHECK_MS = 5_000;
const PLAN_SEED = join(dirname(fileURLToPath(import.meta.url)), '..', 'assistant', 'anis-tools-plan-seed.json');
const safeJson = (s, d = null) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const J = (v) => (v == null ? null : JSON.stringify(v));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tools (
  name TEXT PRIMARY KEY, label TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'tool', purpose TEXT, description TEXT,
  input_json TEXT, output_json TEXT, output_name TEXT, example_json TEXT,
  status TEXT NOT NULL DEFAULT 'built', executor TEXT NOT NULL, cost_json TEXT, timeout_ms INTEGER,
  http_json TEXT, plan_json TEXT, source TEXT NOT NULL, updated_at TEXT);
CREATE TABLE IF NOT EXISTS tool_credentials (name TEXT PRIMARY KEY, iv TEXT NOT NULL, tag TEXT NOT NULL, secret TEXT NOT NULL, updated_at TEXT);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`;

export const STATUSES = ['built', 'planned', 'disabled'];
export const AUTHS = /^(none|basic|bearer|header:[A-Za-z0-9-]{1,64})$/;
export const HTTP_NAME = /^[a-z][a-z0-9_]{1,60}_(search|lookup)$/;   // the naming rule (docs/architecture/anis-tools-api.md)

/** Open (create + seed the plan rows once) the store. Callers close it; tests pass ':memory:'. */
export function openToolsDb(path = TOOLS_DB(), { planSeed = null } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('busy_timeout = 5000');
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  seedPlanTools(db, planSeed);
  return db;
}

export const bumpRev = (db) => db.prepare(`INSERT INTO meta (key, value) VALUES ('rev', '1')
  ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`).run();
export const revOf = (db) => Number(db.prepare("SELECT value FROM meta WHERE key = 'rev'").get()?.value ?? 0);
const metaGet = (db, k) => db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value ?? null;
const metaSet = (db, k, v) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);

/** The planned / built-in-code tool rows (formerly planning/anis-strategies.json "tools"), inserted once: after that the rows are data. */
export function seedPlanTools(db, rows = null) {
  if (metaGet(db, 'plan_seeded')) return 0;
  const seed = rows ?? safeJson(readFileSync(PLAN_SEED, 'utf8'), []);
  const ins = db.prepare(`INSERT OR IGNORE INTO tools (name, label, kind, purpose, status, executor, plan_json, source, updated_at)
    VALUES (?, ?, 'tool', ?, ?, 'none', ?, 'plan', ?)`);
  return db.transaction(() => {
    let n = 0;
    for (const t of seed) n += ins.run(t.id, t.name, t.does ?? null, t.status === 'exists' ? 'built' : 'planned', J({ where: t.where ?? null, cost: t.cost ?? null, status: t.status }), nowIso()).changes;
    metaSet(db, 'plan_seeded', nowIso());
    if (n) bumpRev(db);
    return n;
  })();
}

const rowOut = (r) => (!r ? null : {
  name: r.name, label: r.label, kind: r.kind, purpose: r.purpose, description: r.description,
  input: safeJson(r.input_json), output: safeJson(r.output_json), outputName: r.output_name, example: safeJson(r.example_json),
  status: r.status, executor: r.executor, cost: safeJson(r.cost_json), timeoutMs: r.timeout_ms, http: safeJson(r.http_json),
  plan: safeJson(r.plan_json), source: r.source, updatedAt: r.updated_at,
});
/** Every row (no secrets live in this table). */
export const listTools = (db) => db.prepare('SELECT * FROM tools ORDER BY source, name').all().map(rowOut);
export const getTool = (db, name) => rowOut(db.prepare('SELECT * FROM tools WHERE name = ?').get(name));

/** Upsert the code tools' metadata (tools.js REGISTRY). Idempotent: a row changes only when its metadata did; a code row whose tool
 *  left tools.js is deleted; an admin 'disabled' status survives. One caller per deploy (Anís instance 0, api/anis-index.js). → { added, updated, removed }. */
export function syncCodeTools(db, entries) {
  const meta = (e) => ({ label: e.label, kind: e.kind || 'tool', purpose: e.purpose ?? null, description: e.description ?? null,
    input_json: J(e.input), output_json: J(e.output), output_name: e.outputName ?? null, example_json: J(e.example), cost_json: J(e.cost), timeout_ms: e.timeoutMs ?? null });
  const hash = createHash('sha256').update(JSON.stringify(entries.map((e) => [e.name, meta(e)]))).digest('hex');
  if (metaGet(db, 'code_hash') === hash) return { added: 0, updated: 0, removed: 0, unchanged: true };
  const cur = new Map(db.prepare("SELECT * FROM tools WHERE executor = 'code'").all().map((r) => [r.name, r]));
  const cols = ['label', 'kind', 'purpose', 'description', 'input_json', 'output_json', 'output_name', 'example_json', 'cost_json', 'timeout_ms'];
  const up = db.prepare(`INSERT INTO tools (name, ${cols.join(', ')}, status, executor, source, updated_at) VALUES (@name, ${cols.map((c) => '@' + c).join(', ')}, 'built', 'code', 'code', @at)
    ON CONFLICT(name) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}, executor = 'code', source = 'code', updated_at = excluded.updated_at,
      status = CASE WHEN tools.executor = 'code' THEN tools.status ELSE 'built' END`);
  const del = db.prepare("DELETE FROM tools WHERE name = ? AND executor = 'code'");
  return db.transaction(() => {
    const out = { added: 0, updated: 0, removed: 0, unchanged: false }, at = nowIso(), names = new Set();
    for (const e of entries) {
      names.add(e.name);
      const m = meta(e), old = cur.get(e.name);
      if (old && cols.every((c) => (old[c] ?? null) === (m[c] ?? null))) continue;
      up.run({ name: e.name, ...m, at });
      out[old ? 'updated' : 'added']++;
    }
    for (const n of cur.keys()) if (!names.has(n)) out.removed += del.run(n).changes;
    metaSet(db, 'code_hash', hash);
    if (out.added || out.updated || out.removed) bumpRev(db);
    return out;
  })();
}

const bad = (msg) => Object.assign(new Error(msg), { statusCode: 400, code: 'invalid_input' });
/** Validate an HTTP tool definition; → the normalized row fields, or throws (statusCode 400). Pure. */
export function normalizeHttpTool(d = {}) {
  if (!HTTP_NAME.test(d.name || '')) throw bad('name must be snake_case ending in _search (takes words) or _lookup (takes one known thing)');
  if (!d.label || !d.purpose) throw bad('label and purpose are required');
  const h = d.http || {};
  const method = String(h.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH'].includes(method)) throw bad('http.method must be GET, POST, PUT or PATCH');
  if (!/^https?:\/\/[^\s]+$/.test(h.url || '')) throw bad('http.url must be an http(s) URL template ({field} = an input field)');
  const auth = h.auth || 'none';
  if (!AUTHS.test(auth)) throw bad('http.auth must be none, basic, bearer or header:<Name>');
  if (auth !== 'none' && !h.credential) throw bad('http.credential (a credential name) is required with auth');
  if (h.credential && !/^[a-z0-9_.-]{1,64}$/.test(h.credential)) throw bad('http.credential: lowercase name, letters/digits/_.-');
  if (h.pick != null && typeof h.pick !== 'string' && (typeof h.pick !== 'object' || Array.isArray(h.pick))) throw bad('http.pick is a path string or {outputField: path}');
  const input = d.input || { type: 'object', properties: {}, additionalProperties: true };
  if (input.type !== 'object') throw bad('input must be a JSON Schema object');
  const status = d.status || 'built';
  if (!['built', 'disabled'].includes(status)) throw bad('status must be built or disabled');
  const timeout = Math.min(60_000, Math.max(500, Number(d.timeoutMs ?? d.timeout_ms ?? 10_000) || 10_000));
  return {
    name: d.name, label: String(d.label), kind: 'tool', purpose: String(d.purpose), description: d.description ?? null,
    input_json: J(input), output_json: J(d.output || { type: 'object', additionalProperties: true }), output_name: d.outputName ?? 'Result',
    example_json: J(d.example ?? null), status, executor: 'http',
    cost_json: J({ llm: false, embed: false, p50_ms: Number(d.cost?.p50_ms) || timeout / 4, usd: Number(h.cost_usd ?? d.cost?.usd) || 0 }),
    timeout_ms: timeout, http_json: J({ method, url: h.url, body: h.body ?? null, headers: h.headers ?? null, auth, credential: h.credential ?? null, pick: h.pick ?? null, cost_usd: Number(h.cost_usd) || 0 }),
  };
}

/** Register or update an HTTP tool. Refuses a name held by a code tool or a plan row. → the stored row. */
export function registerHttpTool(db, def) {
  const r = normalizeHttpTool(def);
  const old = db.prepare('SELECT executor FROM tools WHERE name = ?').get(r.name);
  if (old && old.executor !== 'http') throw Object.assign(new Error(`${r.name} is a ${old.executor === 'code' ? 'code' : 'planned'} tool; pick another name`), { statusCode: 409 });
  const cols = Object.keys(r);
  db.prepare(`INSERT INTO tools (${cols.join(', ')}, source, updated_at) VALUES (${cols.map((c) => '@' + c).join(', ')}, 'admin', @at)
    ON CONFLICT(name) DO UPDATE SET ${cols.filter((c) => c !== 'name').map((c) => `${c} = excluded.${c}`).join(', ')}, updated_at = excluded.updated_at`).run({ ...r, at: nowIso() });
  bumpRev(db);
  return getTool(db, r.name);
}

/** built | disabled (| planned for plan rows). → { name, was, status } or null when absent. */
export function setToolStatus(db, name, status) {
  if (!STATUSES.includes(status)) throw bad(`status must be one of ${STATUSES.join(', ')}`);
  const old = db.prepare('SELECT status, executor, plan_json FROM tools WHERE name = ?').get(name);
  if (!old) return null;
  if (status === 'planned' && old.executor !== 'none') throw bad('only plan rows can be planned');
  // re-enabling a plan row restores its plan status (built in code / planned), not 'built'
  if (status === 'built' && old.executor === 'none') status = safeJson(old.plan_json)?.status === 'exists' ? 'built' : 'planned';
  db.prepare('UPDATE tools SET status = ?, updated_at = ? WHERE name = ?').run(status, nowIso(), name);
  bumpRev(db);
  return { name, was: old.status, status };
}

// ── credentials: AES-256-GCM, key = SHA-256(TOOL_SECRETS_KEY). Missing key → nothing can be stored or read. ──
export const secretsKey = (raw = process.env.TOOL_SECRETS_KEY) => (raw ? createHash('sha256').update(String(raw)).digest() : null);
export function encryptSecret(plain, key) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const secret = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), secret: secret.toString('base64') };
}
export function decryptSecret({ iv, tag, secret }, key) {
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(secret, 'base64')), d.final()]).toString('utf8');
}
/** Set or rotate a credential. Throws (503) when TOOL_SECRETS_KEY is unset. → { name, updated_at } (never the secret). */
export function setCredential(db, name, plain, key = secretsKey()) {
  if (!key) throw Object.assign(new Error('TOOL_SECRETS_KEY is not set: credentials cannot be stored'), { statusCode: 503, code: 'unavailable' });
  if (!/^[a-z0-9_.-]{1,64}$/.test(name || '')) throw bad('credential name: lowercase letters, digits, _ . -');
  if (!plain || typeof plain !== 'string') throw bad('secret must be a non-empty string');
  const e = encryptSecret(plain, key), at = nowIso();
  db.prepare(`INSERT INTO tool_credentials (name, iv, tag, secret, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET iv = excluded.iv, tag = excluded.tag, secret = excluded.secret, updated_at = excluded.updated_at`).run(name, e.iv, e.tag, e.secret, at);
  bumpRev(db);
  return { name, updated_at: at };
}
/** Credential names + when set + which tools use them. Never the secret. */
export function credentialList(db) {
  const users = new Map();
  for (const t of listTools(db)) if (t.http?.credential) users.set(t.http.credential, [...(users.get(t.http.credential) || []), t.name]);
  return db.prepare('SELECT name, updated_at FROM tool_credentials ORDER BY name').all().map((c) => ({ ...c, used_by: users.get(c.name) || [] }));
}
export const deleteCredential = (db, name) => { const n = db.prepare('DELETE FROM tool_credentials WHERE name = ?').run(name).changes; if (n) bumpRev(db); return n > 0; };

// ── the cached catalog (reply path) ──
let conn = null, cached = null, checkedAt = 0, failedAt = 0;
const EMPTY = Object.freeze({ rev: -1, source: 'none', tools: new Map(), credentials: new Set() });
/** { rev, source: db|none, tools: Map name → row, credentials: Set of names }. Re-read when meta.rev moves; store unusable → empty
 *  (code tools keep running from tools.js), retried after a minute. */
export function catalog({ now = Date.now() } = {}) {
  if (cached && now - checkedAt < REV_CHECK_MS) return cached;
  checkedAt = now;
  if (failedAt && now - failedAt < 60_000) return (cached ||= EMPTY);
  try {
    conn ||= openToolsDb();
    const rev = revOf(conn);
    if (!cached || cached.rev !== rev || cached.source !== 'db') {
      cached = { rev, source: 'db', tools: new Map(listTools(conn).map((t) => [t.name, t])),
        credentials: new Set(conn.prepare('SELECT name FROM tool_credentials').all().map((c) => c.name)) };
    }
    failedAt = 0;
  } catch (err) {
    failedAt = now;
    if (conn) { try { conn.close(); } catch { /* closed */ } conn = null; }
    console.warn(`[anis-tools-repo] store unavailable (${err.message}); code tools only`);
    cached = EMPTY;
  }
  return cached;
}
/** The executor's one read of a secret (decrypted in memory, never cached, never logged). null when absent or no key. */
export function secretFor(name, key = secretsKey()) {
  if (!key || !name) return null;
  try {
    conn ||= openToolsDb();
    const row = conn.prepare('SELECT iv, tag, secret FROM tool_credentials WHERE name = ?').get(name);
    return row ? decryptSecret(row, key) : null;
  } catch { return null; }
}
/** After a write in this process: the next catalog() re-checks the rev at once (other processes see it within REV_CHECK_MS). */
export const invalidateCatalog = () => { checkedAt = 0; };
/** The admin connection (the same one the catalog reads). */
export const toolsDb = () => (conn ||= openToolsDb());
/** Tests / admin: drop the cache (and, with a db, use that connection). */
export function resetToolsCache({ db = null } = {}) {
  cached = null; checkedAt = 0; failedAt = 0;
  if (db) conn = db; else if (conn) { try { conn.close(); } catch { /* closed */ } conn = null; }
}
/** The plan rows in the plan file's old shape ({ id, name, does, where, cost, status }) for the docs pages. */
export function planToolRows() {
  return [...catalog().tools.values()].filter((t) => t.source === 'plan' && t.status !== 'disabled')
    .map((t) => ({ id: t.name, name: t.label, does: t.purpose, where: t.plan?.where ?? null, cost: t.plan?.cost ?? null, status: t.plan?.status ?? (t.status === 'built' ? 'exists' : 'to build') }));
}
