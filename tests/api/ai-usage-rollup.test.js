// Incremental spend rollups read only the rows added since the last call (the full GROUP BYs stalled the API 37 s, 10-14).
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { rollupSpend, pipelineSpendByBook, _resetRollups } from '../../api/lib/repos/ai-usage-repo.js';

const db = new Database(':memory:');
db.exec(`CREATE TABLE ai_usage (id INTEGER PRIMARY KEY, caller TEXT, document_id TEXT, provider TEXT, service_type TEXT, estimated_cost_usd REAL, timestamp TEXT DEFAULT CURRENT_TIMESTAMP)`);
const add = (doc, provider, usd) => db.prepare(`INSERT INTO ai_usage (caller, document_id, provider, service_type, estimated_cost_usd) VALUES ('corpus-rag', ?, ?, 'grounding:hype', ?)`).run(String(doc), provider, usd);
const deps = { queryAll: async (sql, p = []) => db.prepare(sql).all(...p), queryOne: async (sql, p = []) => db.prepare(sql).get(...p) };
let reads = 0;
const counting = { queryAll: async (sql, p) => { reads++; return deps.queryAll(sql, p); }, queryOne: deps.queryOne };

describe('rollupSpend', () => {
  beforeEach(() => { _resetRollups(); db.exec('DELETE FROM ai_usage'); reads = 0; });
  it('totals per book × provider and then reads only new rows', async () => {
    add(1, 'anthropic', 0.5); add(1, 'anthropic', 0.25); add(2, 'deepseek', 1);
    expect(await pipelineSpendByBook(deps)).toEqual([{ docId: 2, provider: 'deepseek', calls: 1, usd: 1 }, { docId: 1, provider: 'anthropic', calls: 2, usd: 0.75 }]);
    add(1, 'anthropic', 1);
    const second = await pipelineSpendByBook(counting);
    expect(second[0]).toEqual({ docId: 1, provider: 'anthropic', calls: 3, usd: 1.75 });
    expect(reads).toBe(1);                                   // one chunk: just the new row
    reads = 0; await pipelineSpendByBook(counting);
    expect(reads).toBe(0);                                   // nothing new → no read at all
  });
  it('keys are arbitrary SQL expressions', async () => {
    add(3, 'anthropic', 2);
    const s = await rollupSpend('t', { key: 'service_type' }, deps);
    expect(s.get('grounding:hype')).toEqual({ calls: 1, usd: 2 });
  });
});
