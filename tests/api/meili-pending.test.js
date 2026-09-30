// Bulk Meili deletions: queued ids go out in a few large jobs; ids that are live again are skipped.
import { describe, it, expect, vi, beforeEach } from 'vitest';
const state = { queue: [], content: new Set() };
vi.mock('../../api/lib/db.js', () => ({
  queryAll: async () => state.queue.map((q) => ({ ...q, live: state.content.has(q.para_id) ? 1 : 0 })),
  transaction: async (stmts) => {
    for (const s of stmts) {
      if (s.sql.startsWith('INSERT')) { if (!state.queue.some((q) => q.para_id === s.args[0] && q.index_uid === s.args[1])) state.queue.push({ para_id: s.args[0], index_uid: s.args[1] }); }
      else state.queue = state.queue.filter((q) => !(q.para_id === s.args[0] && q.index_uid === s.args[1]));
    }
  },
}));
const { queueMeiliDeletes, flushMeiliDeletes } = await import('../../api/lib/meili-pending.js');

describe('meili pending deletes', () => {
  beforeEach(() => { state.queue = []; state.content = new Set(); });
  it('sends many deletions as few jobs and empties the queue', async () => {
    await queueMeiliDeletes(Array.from({ length: 12000 }, (_, i) => i + 1));
    const calls = [];
    const meili = { index: (uid) => ({ deleteDocuments: async (ids) => calls.push([uid, ids.length]) }) };
    const r = await flushMeiliDeletes(meili, { chunk: 5000 });
    expect(r).toEqual({ sent: 12000, skippedLive: 0, jobs: 3 });
    expect(calls).toEqual([['paragraphs', 5000], ['paragraphs', 5000], ['paragraphs', 2000]]);
    expect(state.queue).toHaveLength(0);
  });
  it('never deletes an id that belongs to a live paragraph again', async () => {
    await queueMeiliDeletes([1, 2, 3]);
    state.content.add(2);
    const sent = [];
    const r = await flushMeiliDeletes({ index: () => ({ deleteDocuments: async (ids) => sent.push(...ids) }) });
    expect(sent).toEqual([1, 3]);
    expect(r.skippedLive).toBe(1);
    expect(state.queue).toHaveLength(0);
  });
});
