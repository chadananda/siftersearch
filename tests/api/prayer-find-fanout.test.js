// Battery 11-10 prayer-healing (20 s): every tradition fired one phrase search PER prayer work, and the tradition-wide searches waited
// for the works lookup. Now: one documentId-list search per tradition, started alongside the works lookup. Fake search, no network.
import { describe, it, expect } from 'vitest';
import { findPrayers } from '../../api/lib/assistant/prayer-find.js';

const WORKS = [{ id: 1, title: 'Prayers One', religion: 'Christian' }, { id: 2, title: 'Book of Prayer', religion: 'Christian' }, { id: 3, title: 'Prayer Psalter', religion: 'Christian' }];
function rig({ worksMs = 0 } = {}) {
  const calls = [];
  let worksDone = false;
  const search = async (layer, { query, limit, filters = {} }) => {
    calls.push({ layer, limit, documentId: filters.documentId, worksDone });
    return { passages: [] };
  };
  const findDocuments = async () => { await new Promise((r) => setTimeout(r, worksMs)); worksDone = true; return { docs: WORKS }; };
  return { calls, d: { search, findDocuments, paragraphsInRange: async () => [] } };
}

describe('findPrayers fan-out (battery 11-10 prayer-healing)', () => {
  it('a need → ONE phrase search over all the tradition’s prayer works (a documentId list), not one per work', async () => {
    const { calls, d } = rig();
    await findPrayers({ tradition: 'Christian', need: 'healing' }, d);
    const perWork = calls.filter((c) => c.documentId != null);
    expect(perWork.length).toBe(1);
    expect(perWork[0].documentId).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(perWork[0].limit).toBe(12);
  });
  it('the tradition-wide searches start before a slow works lookup finishes', async () => {
    const { calls, d } = rig({ worksMs: 30 });
    await findPrayers({ tradition: 'Christian', need: 'healing' }, d);
    const wide = calls.filter((c) => c.documentId == null);
    expect(wide.length).toBe(2);
    expect(wide.every((c) => c.worksDone === false)).toBe(true);
  });
});
