// paragraphsByIds counts the fallback "#n" ordinal only once its covering index exists (a per-hit full-document walk made
// search hydrate ~1 s, 11-09): without the index the read asks NULL AS para_ord.
import { describe, it, expect, vi } from 'vitest';

const seen = [];
let hasIndex = false;
vi.mock('../../api/lib/db.js', () => ({
  queryAll: async (sql) => { seen.push(sql); return /sqlite_master/.test(sql) ? (hasIndex ? [{ 1: 1 }] : []) : []; },
  transaction: async () => [],
}));
const repo = await import('../../api/lib/paragraphs-repo.js');

describe('para_ord gate', () => {
  it('no index → the hydrate read carries no per-hit COUNT; rechecked later, not on every read', async () => {
    await repo.paragraphsByIds([1, 2]);
    await repo.paragraphsByIds([3]);
    const reads = seen.filter((s) => /FROM content c JOIN docs/.test(s));
    expect(reads).toHaveLength(2);
    for (const s of reads) { expect(s).toMatch(/NULL AS para_ord/); expect(s).not.toMatch(/COUNT\(\*\)/); }
    expect(seen.filter((s) => /sqlite_master/.test(s))).toHaveLength(1);
  });
});
