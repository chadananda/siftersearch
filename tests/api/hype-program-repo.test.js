// hype-program-repo: a chunk returning more rows than the call-stack argument limit must not throw (push(...rows) did, 11-10).
import { describe, it, expect, vi } from 'vitest';

const big = Array.from({ length: 300000 }, (_, i) => ({ id: i, doc_id: 1, len: 100, done: i % 2 }));
vi.mock('../../api/lib/db.js', () => ({ queryAll: vi.fn(async () => big) }));
const { hypeParagraphs, hypeRows } = await import('../../api/lib/repos/hype-program-repo.js');

describe('hype-program-repo large reads', () => {
  it('hypeParagraphs returns every row of a huge chunk', async () => {
    const rows = await hypeParagraphs([1], 'v');
    expect(rows.length).toBe(300000);
    expect(rows[1].done).toBe(true);
  });
  it('hypeRows returns every row of a huge chunk', async () => {
    expect((await hypeRows([1])).length).toBe(300000);
  });
});
