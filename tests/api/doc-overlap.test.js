// doc-overlap: which sections of a compilation of compilations are already held elsewhere (Chad 10-21).
import { describe, it, expect } from 'vitest';
import { sectionOverlap, docOverlapJob } from '../../api/lib/ops/doc-overlap-job.js';

const secs = [{ level: 1, title: 'Prayer', start_index: 0, end_index: 3 }, { level: 2, title: 'sub', start_index: 1, end_index: 2 }, { level: 1, title: 'Huqúqu’lláh', start_index: 4, end_index: 5 }];
const rows = [{ pidx: 0, other: 9 }, { pidx: 1, other: 9 }, { pidx: 2, other: 7 }, { pidx: 3, other: null }, { pidx: 4, other: null }, { pidx: 5, other: null }];

describe('doc-overlap', () => {
  it('per top-level section: paragraphs held elsewhere and by whom', () => {
    const r = sectionOverlap(secs, rows);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ title: 'Prayer', paras: 4, held: 3, share: 0.75, holders: [[9, 2], [7, 1]] });
    expect(r[1]).toMatchObject({ title: 'Huqúqu’lláh', held: 0, share: 0 });
  });
  it('the job reads through injected repos', async () => {
    const r = await docOverlapJob({ ids: [5] }, { held: async () => rows, sections: async () => secs, doc: async () => ({ id: 5, title: 'CoC' }) });
    expect(r.docs[0]).toMatchObject({ id: 5, paras: 6, held: 3 });
  });
});
