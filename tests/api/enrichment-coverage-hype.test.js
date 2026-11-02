// enrichmentCoverage reports HyPE per prompt version (hyp_model), so a book still on an old prompt is visible (11-02).
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(),
  queryOne: vi.fn(async (sql) => (/FROM docs/.test(sql) ? { file_path: 'x.md', title: 'X', duplicate_of: null }
    : { total: 10, noted: 10, hyped: 9, aligned: 0 })),
  queryAll: vi.fn(async (sql, _p, name) => (name === 'docs-repo:enrichment-hype-by-version'
    ? [{ version: 'hype-v15-seeker', n: 6 }, { version: 'hype-v9', n: 3 }] : [{ version: 'concept-disambig-v1', n: 10 }])),
}));
const { enrichmentCoverage } = await import('../../api/lib/docs-repo.js');

describe('enrichmentCoverage', () => {
  it('splits hyped paragraphs by hype version', async () => {
    const r = await enrichmentCoverage(7);
    expect(r.hyped).toBe(9);
    expect(r.hypeByVersion).toEqual([{ version: 'hype-v15-seeker', n: 6 }, { version: 'hype-v9', n: 3 }]);
  });
});
