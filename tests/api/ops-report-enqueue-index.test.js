// enqueue()'s "same run already live?" check walked idx_ops_report_runs_name over every finished run of the name
// (11-03 query-time report: 17.6k calls, avg 613 ms, worst 2.4 s). Pins: it reads the status index (live rows only) and is named.
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';

const calls = [];
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async () => ({ lastInsertRowid: 1 })), queryAll: vi.fn(async () => []),
  queryOne: vi.fn(async (sql, params, name) => { calls.push({ sql, name }); return { id: 1, name: 'x', params: null, result: null }; }),
}));

const { enqueue, ENQUEUE_SAME_SQL } = await import('../../api/lib/repos/ops-report-repo.js');

describe('ops report enqueue dedup', () => {
  it('is a named query', async () => {
    await enqueue('known-item');
    expect(calls[0].name).toBe('ops-report:enqueue-same');
    expect(calls[0].sql).toBe(ENQUEUE_SAME_SQL);
  });
  it('reads the status index, not the per-name one', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE ops_report_runs (id INTEGER PRIMARY KEY, name TEXT, params TEXT, status TEXT, requested_by TEXT, requested_at TEXT, finished_at TEXT, result TEXT);
      CREATE INDEX idx_ops_report_runs_status ON ops_report_runs(status, id);
      CREATE INDEX idx_ops_report_runs_name ON ops_report_runs(name, id);`);
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${ENQUEUE_SAME_SQL}`).all(['x', null]).map((r) => r.detail).join(' | ');
    expect(plan).toMatch(/idx_ops_report_runs_status/);
    expect(plan).not.toMatch(/idx_ops_report_runs_name/);
  });
});
