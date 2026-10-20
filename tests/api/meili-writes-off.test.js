// 10-20: Meilisearch was the largest I/O on /fast though search no longer reads it; MEILI_WRITES=off stops the pushes and
// settles dirty rows so `synced` stays a live signal.
import { describe, it, expect } from 'vitest';
import { meiliWritesOn, settleDirty } from '../../api/lib/search/meili-writes.js';

describe('MEILI_WRITES', () => {
  it('on unless explicitly off', () => {
    expect(meiliWritesOn({})).toBe(true);
    expect(meiliWritesOn({ MEILI_WRITES: 'off' })).toBe(false);
    expect(meiliWritesOn({ MEILI_WRITES: 'OFF' })).toBe(false);
  });
  it('settleDirty marks every dirty paragraph of every dirty doc, in batches, and stops when none is left', async () => {
    const dirtyRows = new Map([[1, [11, 12, 13]], [2, [21]]]);
    const marked = [];
    const n = await settleDirty({ batch: 2,
      docs: async () => [...dirtyRows].filter(([, v]) => v.length).map(([id]) => ({ id })),
      dirty: async (docId, lim) => dirtyRows.get(docId).slice(0, lim).map((id) => ({ id })),
      markSynced: async (ids) => { marked.push(...ids); for (const [k, v] of dirtyRows) dirtyRows.set(k, v.filter((x) => !ids.includes(x))); },
    });
    expect(n).toBe(4);
    expect(marked.sort()).toEqual([11, 12, 13, 21]);
  });
  it('never spins when rows stay dirty (markSynced did not take)', async () => {
    let calls = 0;
    const n = await settleDirty({ docs: async () => (++calls > 50 ? [] : [{ id: 1 }]), dirty: async () => [], markSynced: async () => {} });
    expect(n).toBe(0);
    expect(calls).toBe(1);
  });
});
