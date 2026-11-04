// activeRuns() (pipeline/state.js) SCANned doc_pipeline and temp-sorted it on every call: 958 calls, avg 126 ms on the API
// thread (11-03, GET /api/admin/server/query-time?hours=6). Migration 196's partial index serves it as a read of 8 index
// entries. Pins: the query is named, the plan uses the index with no sort, and the migration creates exactly that index.
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

const calls = [];
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(), queryOne: vi.fn(),
  queryAll: vi.fn(async (sql, params, name) => { calls.push({ sql, name }); return []; }),
}));
vi.mock('../../api/lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { activeRuns, ACTIVE_RUNS_SQL } = await import('../../api/lib/pipeline/state.js');
const ROOT = join(import.meta.dirname, '..', '..');
const INDEX_SQL = 'CREATE INDEX IF NOT EXISTS idx_doc_pipeline_run ON doc_pipeline(updated_at) WHERE run_json IS NOT NULL';

function table() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE doc_pipeline (doc_id INTEGER PRIMARY KEY, priority INTEGER NOT NULL DEFAULT 1000, enabled INTEGER NOT NULL DEFAULT 0,
    disambig_status TEXT NOT NULL DEFAULT 'pending', hype_status TEXT NOT NULL DEFAULT 'pending', extract_status TEXT NOT NULL DEFAULT 'pending',
    updated_at INTEGER, run_json TEXT);
    CREATE INDEX idx_doc_pipeline_worklist ON doc_pipeline(enabled, priority, disambig_status);
    CREATE INDEX idx_doc_pipeline_stages ON doc_pipeline(enabled, priority, hype_status, extract_status);`);
  return db;
}
const plan = (db) => db.prepare(`EXPLAIN QUERY PLAN ${ACTIVE_RUNS_SQL}`).all().map((r) => r.detail).join(' | ');

describe('activeRuns', () => {
  it('is a named query (its cost shows by name in the query-time report)', async () => {
    await activeRuns();
    expect(calls.at(-1).name).toBe('pipeline:active-runs');
    expect(calls.at(-1).sql).toBe(ACTIVE_RUNS_SQL);
  });
  it('without the index: a scan + temp sort (the 126 ms shape)', () => {
    expect(plan(table())).toMatch(/SCAN doc_pipeline/);
  });
  it('with migration 196: reads idx_doc_pipeline_run, no scan, no sort', () => {
    const db = table(); db.exec(INDEX_SQL);
    const p = plan(db);
    expect(p).toMatch(/idx_doc_pipeline_run/);
    expect(p).not.toMatch(/SCAN doc_pipeline\b(?! USING)/);
    expect(p).not.toMatch(/TEMP B-TREE/);
  });
  it('migration 196 creates exactly that index, and CURRENT_VERSION covers it', async () => {
    expect(readFileSync(join(ROOT, 'api/lib/migrations/v72-v90.js'), 'utf8')).toContain(INDEX_SQL);
    const { CURRENT_VERSION } = await import('../../api/lib/migrations/runner.js');
    expect(CURRENT_VERSION).toBeGreaterThanOrEqual(196);
  });
});
