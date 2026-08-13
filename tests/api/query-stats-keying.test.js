// query_stats keys must match the in-memory counters, or the accounting merges distinct query types and
// reports confidently wrong totals — worse than no tool at all. Caught by a flush test on 2026-08-13:
// counters keyed on NAME while the table's PK was (hour, proc, kind, fingerprint), so two names that share
// a statement shape collided into one row. These pin the invariant in both directions.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';

const SCHEMA = `CREATE TABLE query_stats (
  hour INTEGER NOT NULL, proc TEXT NOT NULL, db_name TEXT, kind TEXT NOT NULL,
  label TEXT NOT NULL, name TEXT, fingerprint TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0, total_ms INTEGER NOT NULL DEFAULT 0, max_ms INTEGER NOT NULL DEFAULT 0,
  sql_sample TEXT, PRIMARY KEY (hour, proc, kind, label))`;

const upsert = (db, e) => db.prepare(
  `INSERT INTO query_stats (hour, proc, db_name, kind, label, name, fingerprint, n, total_ms, max_ms, sql_sample)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)
   ON CONFLICT(hour, proc, kind, label) DO UPDATE SET
     n = n + excluded.n, total_ms = total_ms + excluded.total_ms, max_ms = MAX(max_ms, excluded.max_ms)`
).run(e.hour ?? 1, e.proc ?? 'api', null, e.kind ?? 'read', e.name || e.fp, e.name ?? null, e.fp, e.n, e.total, e.max, e.fp);

let db;
const fresh = () => { db = new Database(':memory:'); db.exec(SCHEMA); return db; };

describe('distinct query types stay distinct', () => {
  it('two NAMES sharing one statement shape do not merge', () => {
    fresh();
    const fp = 'SELECT COALESCE(SUM(?),?) FROM ai_usage WHERE provider=?';
    upsert(db, { name: 'budget-check', fp, n: 672, total: 871000, max: 1696 });
    upsert(db, { name: 'admin:spend-report', fp, n: 5, total: 400, max: 120 });
    const rows = db.prepare('SELECT label, n FROM query_stats ORDER BY n DESC').all();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.label)).toEqual(['budget-check', 'admin:spend-report']);
  });

  it('one NAME spanning several shapes aggregates into a single line', () => {
    fresh();
    // The budget check has a bounded and a legacy form: same decision, one row.
    upsert(db, { name: 'budget-check', fp: 'SELECT ... timestamp > ?', n: 600, total: 40000, max: 90 });
    upsert(db, { name: 'budget-check', fp: 'SELECT ... no window', n: 72, total: 90000, max: 1696 });
    const rows = db.prepare('SELECT label, n, total_ms, max_ms FROM query_stats').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].n).toBe(672);
    expect(rows[0].total_ms).toBe(130000);
    expect(rows[0].max_ms).toBe(1696);          // worst case survives the merge
  });

  it('unnamed statements are keyed by shape and stay separate from each other', () => {
    fresh();
    upsert(db, { fp: 'SELECT a FROM docs', n: 3, total: 30, max: 20 });
    upsert(db, { fp: 'SELECT b FROM content', n: 4, total: 40, max: 25 });
    expect(db.prepare('SELECT COUNT(*) c FROM query_stats').get().c).toBe(2);
  });

  it('the same query type in DIFFERENT processes is attributed separately', () => {
    fresh();
    upsert(db, { name: 'budget-check', fp: 'x', proc: 'api', n: 600, total: 800000, max: 1600 });
    upsert(db, { name: 'budget-check', fp: 'x', proc: 'worker', n: 12, total: 900, max: 120 });
    const rows = db.prepare('SELECT proc, n FROM query_stats ORDER BY n DESC').all();
    expect(rows.map((r) => r.proc)).toEqual(['api', 'worker']);
  });

  it('reads and writes of the same name are not conflated', () => {
    fresh();
    upsert(db, { name: 'doc-pipeline', fp: 'x', kind: 'read', n: 10, total: 100, max: 20 });
    upsert(db, { name: 'doc-pipeline', fp: 'y', kind: 'write', n: 2, total: 500, max: 400 });
    expect(db.prepare('SELECT COUNT(*) c FROM query_stats').get().c).toBe(2);
  });
});

describe('an unnamed line is a worklist item, not a dead end', () => {
  it('keeps a real SQL sample so the query can be found and named', () => {
    fresh();
    upsert(db, { fp: 'SELECT COUNT(*) FROM content WHERE doc_id=?', n: 1684, total: 4800, max: 12 });
    const r = db.prepare('SELECT name, label, sql_sample FROM query_stats').get();
    expect(r.name).toBeNull();                                   // flags "wants a name"
    expect(r.sql_sample).toContain('FROM content');
  });
});
