// ops-report-repo claimNext: a run is claimed by exactly one lane, whatever shape the writer returns the change count in.
import { describe, it, expect, vi } from 'vitest';

let rows, shape;
vi.mock('../../api/lib/db.js', () => ({
  queryOne: vi.fn(async () => rows.find((r) => r.status === 'queued') || null),
  queryAll: vi.fn(async () => []),
  query: vi.fn(async (sql, p) => {
    const r = rows.find((x) => x.id === p[1] && x.status === 'queued');
    if (r) r.status = 'running';
    const changes = r ? 1 : 0;
    return shape === 'writer' ? { rows: [{ changes }] } : { changes };
  }),
}));
const { claimNext } = await import('../../api/lib/repos/ops-report-repo.js');

describe('claimNext is atomic across lanes', () => {
  for (const s of ['writer', 'direct']) {
    it(`two lanes racing for one queued run: one wins (${s} result shape)`, async () => {
      shape = s;
      rows = [{ id: 105, name: 'phrase-index', status: 'queued', params: null }];
      const [a, b] = await Promise.all([claimNext({}), claimNext({})]);
      expect([a, b].filter(Boolean)).toHaveLength(1);
    });
  }
});
