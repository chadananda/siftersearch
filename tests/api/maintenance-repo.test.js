// The night maintenance steps (maintenance-repo.js): only dead objects, never an index a query forces or a test relies on;
// the telemetry tables only once telemetry.db is live; the probe leaves nothing behind; a step reports what it freed.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

let content, tel;
vi.mock('../../api/lib/db.js', () => ({
  queryAll: async (sql, params = []) => content.prepare(sql).all(...params),
  telemetryAll: async (sql, params = []) => tel.prepare(sql).all(...params),
  // the single writer: one request = one transaction, rolled back whole on any error
  transaction: async (statements) => content.transaction(() => statements.map(({ sql, args = [] }) => content.prepare(sql).run(...args)))(),
}));
const repo = await import('../../api/lib/repos/maintenance-repo.js');

function makeContent() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, deleted_at TEXT);
    CREATE TABLE content (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id INTEGER NOT NULL REFERENCES docs(id), paragraph_index INTEGER, text TEXT,
      content_hash TEXT, normalized_hash TEXT, blocktype TEXT, synced INTEGER DEFAULT 0, graph_enriched INTEGER DEFAULT 0, deleted_at TEXT);
    CREATE TABLE table_counts (table_name TEXT PRIMARY KEY, row_count INTEGER);
    CREATE INDEX idx_content_graph_unsync ON content(graph_enriched) WHERE graph_enriched = 0 AND deleted_at IS NULL;
    CREATE INDEX idx_content_synced ON content(synced);
    CREATE TRIGGER trg_content_insert AFTER INSERT ON content BEGIN UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'content'; END;
    CREATE TRIGGER trg_docs_insert AFTER INSERT ON docs BEGIN UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'docs'; END;
    CREATE TABLE query_stats (hour INTEGER); CREATE TABLE slow_query_log (at INTEGER); CREATE TABLE db_write_stats (minute TEXT);
    INSERT INTO docs (id) VALUES (1), (2);`);
  const ins = db.prepare('INSERT INTO content (doc_id, paragraph_index, text, synced) VALUES (?, ?, ?, ?)');
  db.transaction(() => { for (let i = 0; i < 3000; i++) ins.run(1 + (i % 2), i, 'x'.repeat(200), i % 2); })();
  return db;
}
function makeTel({ fresh = true } = {}) {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE query_stats (hour INTEGER); CREATE TABLE slow_query_log (at INTEGER); CREATE TABLE db_write_stats (minute TEXT, caller TEXT, name TEXT)');
  const m = new Date(Date.now() - (fresh ? 2 : 120) * 60000).toISOString().slice(0, 16);
  db.prepare('INSERT INTO db_write_stats VALUES (?, ?, ?)').run(m, 'x', 'y');
  return db;
}
beforeEach(() => { content = makeContent(); tel = makeTel(); });

describe('maintenance steps — what may be dropped', () => {
  // indexes a query forces (INDEXED BY), the docs→content CASCADE key, and the ones the live paths and tests name
  const KEEP = ['idx_content_doc', 'idx_content_doc_deleted', 'idx_content_hype_to_sync', 'idx_content_norm_active', 'idx_content_external_para',
    'idx_content_unsynced_partial', 'idx_content_needs_embedding_v2', 'idx_content_oversized', 'idx_content_normalized_hash',
    'idx_content_dirty_doc_updated', 'idx_content_translation_by', 'idx_content_deleted_at'];
  const dropped = repo.MAINTENANCE_STEPS.filter((s) => s.kind === 'index').map((s) => s.name);
  it('never touches a kept index', () => { for (const k of KEEP) expect(dropped).not.toContain(k); });
  it('no code forces or names a dropped index (INDEXED BY / tests), outside migrations and this repo', () => {
    const ROOT = join(import.meta.dirname, '..', '..');
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name.startsWith('.') ? []
      : e.isDirectory() ? walk(join(d, e.name)) : /\.(js|mjs)$/.test(e.name) ? [join(d, e.name)] : []));
    const files = [...walk(join(ROOT, 'api')), ...walk(join(ROOT, 'scripts')), ...walk(join(ROOT, 'tests'))]
      .filter((f) => !f.includes('/migrations/') && !f.endsWith('maintenance-repo.js') && !f.endsWith('maintenance-repo.test.js'));
    for (const f of files) {
      const code = readFileSync(f, 'utf8');
      for (const n of dropped) expect(new RegExp(`INDEXED BY ${n}\\b`).test(code), `${f} forces ${n}`).toBe(false);
    }
  });
  it('every step is named, explained, and has SQL (probes excepted)', () => {
    for (const s of repo.MAINTENANCE_STEPS) { expect(s.name).toBeTruthy(); expect(s.why).toBeTruthy(); if (s.kind !== 'probe') expect(s.sql.length).toBeGreaterThan(0); }
    expect(repo.stepNamed('table-counts-triggers').sql).toHaveLength(12);
  });
});

describe('running a step', () => {
  it('drops the index and reports the pages it freed', async () => {
    const r = await repo.runMaintenanceStep('idx_content_synced');
    expect(r.existed).toEqual(['idx_content_synced']);
    expect(r.remaining).toEqual([]);
    expect(r.freed_pages).toBeGreaterThan(0);
    expect(r.freed_bytes).toBe(r.freed_pages * 4096);
    expect((await repo.runMaintenanceStep('idx_content_synced')).skipped).toBe('already gone');
  });
  it('drops the table_counts triggers on content and docs', async () => {
    await repo.runMaintenanceStep('table-counts-triggers');
    expect(content.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger'`).get().n).toBe(0);
  });
  it('drops a telemetry table only while telemetry.db holds all three and is being written', async () => {
    tel = makeTel({ fresh: false });
    expect((await repo.runMaintenanceStep('slow_query_log')).skipped).toMatch(/telemetry/);
    expect(content.prepare(`SELECT name FROM sqlite_master WHERE name = 'slow_query_log'`).get()).toBeTruthy();
    tel = makeTel();
    expect((await repo.runMaintenanceStep('slow_query_log')).remaining).toEqual([]);
  });
  it('the probe times its inserts and is rolled back whole', async () => {
    const before = content.prepare('SELECT COUNT(*) n, MAX(id) m FROM content').get();
    const r = await repo.runMaintenanceStep('probe-before');
    expect(r).toMatchObject({ kind: 'probe', rows: 200, rolled_back: true, error: null });
    expect(content.prepare('SELECT COUNT(*) n, MAX(id) m FROM content').get()).toEqual(before);
  });
  it('analyze runs with a bounded sample', async () => {
    const r = await repo.runMaintenanceStep('analyze-content');
    expect(r.error).toBeNull();
    expect(content.prepare(`SELECT COUNT(*) n FROM sqlite_stat1 WHERE tbl = 'content'`).get().n).toBeGreaterThan(0);
  });
});
