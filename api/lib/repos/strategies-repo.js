// strategies-repo — Anís's strategy graph as data (planning/anis-strategy-graph-plan.md, Phase 1): its OWN SQLite (STRATEGIES_DB,
// default /tank/sifter/anis/strategies.db; ':memory:' under vitest), never sifter.db. Rows are versioned and append-only:
// templates (writer instructions), steps (an activity + params), strategies (a graph of steps). Seeded from strategy-seed.js
// (insert-if-absent, so a seed bump adds a new version). catalog() is the reply path's read: an in-process cache that re-reads
// only when meta.rev changes (checked at most every REV_CHECK_MS), ~0 ms per turn. Store unreadable → the seed, in memory.
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { TEMPLATES, STEPS, STRATEGIES } from '../assistant/strategy-seed.js';

export const STRATEGIES_DB = () => process.env.STRATEGIES_DB || (process.env.VITEST ? ':memory:' : '/tank/sifter/anis/strategies.db');
const REV_CHECK_MS = 15_000;
const safeJson = (s, d = null) => { try { return JSON.parse(s); } catch { return d; } };
const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS templates (
  id TEXT NOT NULL, version INTEGER NOT NULL, text TEXT NOT NULL, created_at TEXT, created_by TEXT,
  PRIMARY KEY (id, version));
CREATE TABLE IF NOT EXISTS steps (
  id TEXT NOT NULL, version INTEGER NOT NULL, activity TEXT NOT NULL, params_json TEXT NOT NULL DEFAULT '{}',
  template_id TEXT, template_version INTEGER, budget_ms INTEGER, budget_usd REAL, created_at TEXT, created_by TEXT,
  PRIMARY KEY (id, version));
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, exemplars_json TEXT NOT NULL DEFAULT '[]',
  graph_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', parent_version INTEGER, created_at TEXT, created_by TEXT,
  PRIMARY KEY (id, version));
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`;

/** Open (and create + seed) the store. Callers close it; tests pass ':memory:'. */
export function openStrategiesDb(path = STRATEGIES_DB()) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('busy_timeout = 5000');
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  seedStrategies(db);
  return db;
}

export const bumpRev = (db) => db.prepare(`INSERT INTO meta (key, value) VALUES ('rev', '1')
  ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`).run();
export const revOf = (db) => Number(db.prepare("SELECT value FROM meta WHERE key = 'rev'").get()?.value ?? 0);

/** Insert every seed row whose (id, version) is absent; returns how many were added (any → rev bumps). */
export function seedStrategies(db, seed = { TEMPLATES, STEPS, STRATEGIES }) {
  const at = nowIso();
  const tpl = db.prepare('INSERT OR IGNORE INTO templates (id, version, text, created_at, created_by) VALUES (?, ?, ?, ?, ?)');
  const stp = db.prepare(`INSERT OR IGNORE INTO steps (id, version, activity, params_json, template_id, template_version, budget_ms, budget_usd, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const str = db.prepare(`INSERT OR IGNORE INTO strategies (id, version, name, description, exemplars_json, graph_json, status, parent_version, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  return db.transaction(() => {
    let n = 0;
    for (const t of seed.TEMPLATES) n += tpl.run(t.id, t.version, t.text, at, 'seed').changes;
    for (const s of seed.STEPS) n += stp.run(s.id, s.version, s.activity, JSON.stringify(s.params || {}), s.template_id ?? null, s.template_version ?? null,
      s.budget_ms ?? null, s.budget_usd ?? null, at, 'seed').changes;
    for (const s of seed.STRATEGIES) n += str.run(s.id, s.version, s.name, s.description ?? null, JSON.stringify(s.exemplars || []), JSON.stringify(s.graph),
      s.status || 'active', s.parent_version ?? null, at, s.created_by || 'seed').changes;
    if (n) bumpRev(db);
    return n;
  })();
}

/** Every row, read once (the catalog's source and the admin view). */
export function readAll(db) {
  return {
    templates: db.prepare('SELECT * FROM templates ORDER BY id, version').all(),
    steps: db.prepare('SELECT * FROM steps ORDER BY id, version').all().map(({ params_json, ...s }) => ({ ...s, params: safeJson(params_json, {}) })),
    strategies: db.prepare('SELECT * FROM strategies ORDER BY rowid').all().map(({ exemplars_json, graph_json, ...s }) => ({ ...s, exemplars: safeJson(exemplars_json, []), graph: safeJson(graph_json) })),
  };
}

// latest version per id; strategies: latest ACTIVE version, kept in first-seeded order
function build(rows, rev, source) {
  const latest = (list) => { const m = new Map(); for (const r of list) if (!m.has(r.id) || m.get(r.id).version < r.version) m.set(r.id, r); return m; };
  const byKey = (list) => new Map(list.map((r) => [`${r.id}@${r.version}`, r]));
  const order = [...new Set(rows.strategies.map((s) => s.id))];
  const active = latest(rows.strategies.filter((s) => s.status === 'active'));
  return {
    rev, source,
    templates: { latest: latest(rows.templates), byKey: byKey(rows.templates) },
    steps: { latest: latest(rows.steps), byKey: byKey(rows.steps) },
    strategies: order.map((id) => active.get(id)).filter(Boolean),
  };
}
const fromSeed = () => build({ templates: TEMPLATES, steps: STEPS, strategies: STRATEGIES.map((s) => ({ ...s })) }, 0, 'seed');

let conn = null, cached = null, checkedAt = 0, failed = false;
/** The catalog the reply path reads: cached; re-read when meta.rev moves. Never throws (store unusable → the seed). */
export function catalog({ now = Date.now() } = {}) {
  if (cached && now - checkedAt < REV_CHECK_MS) return cached;
  checkedAt = now;
  if (failed) return (cached ||= fromSeed());
  try {
    conn ||= openStrategiesDb();
    const rev = revOf(conn);
    if (!cached || cached.rev !== rev || cached.source !== 'db') cached = build(readAll(conn), rev, 'db');
  } catch (err) {
    failed = true;
    console.warn(`[strategies-repo] store unavailable (${err.message}); using the checked-in seed`);
    cached = fromSeed();
  }
  return cached;
}

/** Tests / admin: drop the cache (and, with a db, use that connection). */
export function resetStrategiesCache({ db = null } = {}) { cached = null; checkedAt = 0; failed = false; if (db) conn = db; else if (conn) { try { conn.close(); } catch { /* closed */ } conn = null; } }

/** The admin read: every row plus the catalog's rev and source. */
export function strategiesSnapshot() {
  const c = catalog();
  const rows = c.source === 'db' && conn ? readAll(conn) : { templates: TEMPLATES, steps: STEPS, strategies: STRATEGIES };
  return { rev: c.rev, source: c.source, db: c.source === 'db' ? STRATEGIES_DB() : null, ...rows };
}
