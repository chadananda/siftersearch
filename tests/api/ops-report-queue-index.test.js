// claimNext's queued-poll must use the partial queued index (migration 184), not walk every finished row of those names.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { migrations } from '../../api/lib/migrations/runner.js';

const POLL = `SELECT * FROM ops_report_runs WHERE status = 'queued' AND name IN (?,?,?)
  ORDER BY CASE WHEN params LIKE '%"priority":true%' THEN 0 ELSE 1 END, CASE WHEN name = 'spend' THEN 0 ELSE 2 END, id LIMIT 1`;

describe('ops_report_runs queued poll', () => {
  it('migration 184 is defined and the poll plans on the partial index', () => {
    expect(typeof migrations[184]).toBe('function');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE ops_report_runs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, params TEXT, status TEXT NOT NULL DEFAULT 'queued',
      requested_at TEXT, result TEXT);
      CREATE INDEX idx_ops_report_runs_status ON ops_report_runs(status, id);
      CREATE INDEX idx_ops_report_runs_name ON ops_report_runs(name, id);
      CREATE INDEX idx_ops_report_runs_queued ON ops_report_runs(name, id) WHERE status = 'queued'`);
    const ins = db.prepare(`INSERT INTO ops_report_runs (name, status, requested_at) VALUES (?, ?, '')`);
    for (let i = 0; i < 5000; i++) ins.run(['phrase-index', 'section-index', 'keyword-fill'][i % 3], 'done');
    ins.run('phrase-index', 'queued');
    db.exec('ANALYZE');
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${POLL}`).all('phrase-index', 'section-index', 'keyword-fill').map((r) => r.detail).join(' | ');
    expect(plan).toMatch(/idx_ops_report_runs_queued/);
    expect(db.prepare(POLL).get('phrase-index', 'section-index', 'keyword-fill').status).toBe('queued');
  });
});
