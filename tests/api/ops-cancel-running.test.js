// 10-20: a running ops job could not be cancelled (cancel matched status='queued' only). A running run is now cancellable,
// keeps 'cancelled' when it later finishes, and requeueStale (status='running') never brings it back.
import { describe, it, expect, vi } from 'vitest';

let raw = null;
try { const Database = (await import('better-sqlite3')).default; raw = new Database(':memory:'); } catch { /* skip */ }
const run = (sql, p = []) => { const s = raw.prepare(sql); return /^\s*(INSERT|CREATE|UPDATE|DELETE)/i.test(sql) ? s.run(...p) : s.all(...p); };
vi.mock('../../api/lib/db.js', () => ({ query: async (sql, p = []) => ({ rows: [].concat(run(sql, p)) }), queryAll: async (sql, p = []) => run(sql, p), queryOne: async (sql, p = []) => run(sql, p)[0] || null }));

describe.skipIf(!raw)('cancel a running ops run', () => {
  it('cancels, survives finish, is not requeued', async () => {
    raw.exec(`CREATE TABLE ops_report_runs (id INTEGER PRIMARY KEY, name TEXT, params TEXT, status TEXT, requested_by TEXT, requested_at INT, started_at INT, finished_at INT, ms INT, result TEXT, error TEXT);
      INSERT INTO ops_report_runs (id, name, status) VALUES (849, 'paragraph-authors', 'running');`);
    const repo = await import('../../api/lib/repos/ops-report-repo.js');
    await repo.cancel(849);
    expect(run('SELECT status FROM ops_report_runs WHERE id = 849')[0].status).toBe('cancelled');
    await repo.finish(849, { result: { yielded: false }, ms: 5 });
    expect(run('SELECT status FROM ops_report_runs WHERE id = 849')[0].status).toBe('cancelled');
    await repo.requeueStale({ only: ['paragraph-authors'] });
    expect(run('SELECT status FROM ops_report_runs WHERE id = 849')[0].status).toBe('cancelled');
  });
});
