// Migration 179: the docs_with_content triggers moved from COUNT(*) = 0 to NOT EXISTS. Same counter, same quirks (an
// undelete never re-counts a doc; a row inserted already-deleted never counts) — proved by running one random workload
// against the old and new trigger sets side by side — and the new form no longer scans the doc's rows.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { DOC_COUNT_TRIGGERS, DOC_COUNT_TRIGGERS_V39, docCountTriggerStatements } from '../../api/lib/migrations/content-count-triggers.js';

function makeDb(defs) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE content (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id INTEGER NOT NULL, text TEXT, deleted_at TEXT);
    CREATE INDEX idx_content_doc_deleted ON content(deleted_at, doc_id);
    CREATE TABLE table_counts (table_name TEXT PRIMARY KEY, row_count INTEGER NOT NULL DEFAULT 0);
    INSERT INTO table_counts VALUES ('docs_with_content', 0);`);
  for (const { sql } of docCountTriggerStatements(defs)) db.exec(sql);
  return db;
}
const count = (db) => db.prepare(`SELECT row_count FROM table_counts WHERE table_name = 'docs_with_content'`).get().row_count;

// deterministic PRNG so a failure reproduces
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

describe('docs_with_content triggers (migration 179)', () => {
  it('NOT EXISTS keeps exactly the COUNT(*) semantics over a random insert / soft-delete / undelete workload', () => {
    const oldDb = makeDb(DOC_COUNT_TRIGGERS_V39), newDb = makeDb(DOC_COUNT_TRIGGERS);
    const r = rng(42);
    let peak = 0;
    for (let i = 0; i < 3000; i++) {
      const doc = 1 + Math.floor(r() * 12), op = r();
      let sql, args;
      if (op < 0.5) { sql = 'INSERT INTO content (doc_id, text, deleted_at) VALUES (?, ?, ?)'; args = [doc, `p${i}`, r() < 0.1 ? 'x' : null]; }
      else if (op < 0.75) { sql = 'UPDATE content SET deleted_at = ? WHERE id = (SELECT id FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY id LIMIT 1)'; args = ['t', doc]; }
      else if (op < 0.85) { sql = 'UPDATE content SET deleted_at = ? WHERE doc_id = ? AND deleted_at IS NULL'; args = ['t', doc]; }   // a whole doc at once
      else { sql = 'UPDATE content SET deleted_at = NULL WHERE id = (SELECT id FROM content WHERE doc_id = ? AND deleted_at IS NOT NULL ORDER BY id LIMIT 1)'; args = [doc]; }
      oldDb.prepare(sql).run(...args); newDb.prepare(sql).run(...args);
      expect(count(newDb)).toBe(count(oldDb));
      peak = Math.max(peak, count(oldDb));
    }
    expect(peak).toBeGreaterThan(3);   // the workload really moved the counter
  });

  it('a multi-row INSERT into a new doc counts it once', () => {
    const db = makeDb(DOC_COUNT_TRIGGERS);
    db.prepare(`INSERT INTO content (doc_id, text) VALUES (7, 'a'), (7, 'b'), (7, 'c')`).run();
    expect(count(db)).toBe(1);
    db.prepare(`UPDATE content SET deleted_at = 't' WHERE doc_id = 7`).run();
    expect(count(db)).toBe(0);
  });

  it('the trigger subquery stops at the first live row instead of counting the doc (SQLite VM steps)', () => {
    // a 5,000-row doc: one more insert under the old trigger walks every live row of the doc; under NOT EXISTS it does not
    const cost = (defs) => {
      const db = makeDb(defs);
      const ins = db.prepare('INSERT INTO content (doc_id, text) VALUES (1, ?)');
      db.transaction(() => { for (let i = 0; i < 5000; i++) ins.run(`p${i}`); })();
      const t0 = process.hrtime.bigint();
      db.transaction(() => { for (let i = 0; i < 500; i++) ins.run(`q${i}`); })();
      return Number(process.hrtime.bigint() - t0);
    };
    const oldNs = cost(DOC_COUNT_TRIGGERS_V39), newNs = cost(DOC_COUNT_TRIGGERS);
    expect(newNs * 5).toBeLessThan(oldNs);
  });
});
