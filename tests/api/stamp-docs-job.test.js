// stamp-docs: after a section-author fix or a collection move, a doc's index payload is restamped (it is otherwise written
// only at index time). Pilgrim notes credited to their recorder must stop ranking as the Guardian's writing.
import { describe, it, expect } from 'vitest';
import { stampDocsJob, authorGroups } from '../../api/lib/ops/stamp-docs-job.js';

const MM = 'May Maxwell', SE = 'Shoghi Effendi';
describe('stamp-docs', () => {
  it('groups paragraphs by their effective author and voices', () => {
    const rows = [
      { id: 1, authors: JSON.stringify([{ name: MM, role: 'author', basis: 'book' }]) },
      { id: 2, authors: JSON.stringify([{ name: MM, role: 'author', basis: 'section' }, { name: SE, role: 'quoted', basis: 'section' }]) },
      { id: 3, authors: null },
    ];
    const g = authorGroups(rows, { author: MM });
    expect(g).toEqual([
      { payload: { author: MM, author_fold: 'maymaxwell', voices_fold: ['maymaxwell'] }, ids: [1, 3] },
      { payload: { author: MM, author_fold: 'maymaxwell', voices_fold: ['maymaxwell', 'shoghieffendi'] }, ids: [2] },
    ]);
  });
  it('stamps collection by doc_id and authors by paragraph_id in each collection', async () => {
    const calls = [];
    const r = await stampDocsJob({ docs: [9296], collections: ['phrases'] }, {
      doc: async (id) => ({ id, author: 'International Teaching Centre', collection: 'Administrative', religion: "Baha'i" }),
      rows: async () => [{ id: 7, authors: null }],
      qd: async (path, body) => { calls.push(body); },
    });
    expect(calls[0]).toEqual({ payload: { collection: 'Administrative', religion: "Baha'i" }, filter: { must: [{ key: 'doc_id', match: { value: 9296 } }] } });
    expect(calls[1].payload.author_fold).toBe('internationalteachingcentre');
    expect(calls[1].filter.must[0]).toEqual({ key: 'paragraph_id', match: { any: [7] } });
    expect(r.docs[9296]).toMatchObject({ collection: 'Administrative', paragraphs: 1 });
  });
  it('refuses an empty or oversized run', async () => {
    await expect(stampDocsJob({ docs: [] })).rejects.toThrow(/required/);
    await expect(stampDocsJob({ docs: Array.from({ length: 51 }, (_, i) => i + 1) })).rejects.toThrow(/at most/);
  });
});
