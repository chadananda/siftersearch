// Every quoted voice is findable by author (Chad 10-19: Mazindarani quoting the Báb answers "what did the Báb say").
import { describe, it, expect } from 'vitest';
import { paragraphVoices } from '../../api/lib/authorship/effective.js';
import { toQdrantFilter } from '../../api/lib/search/qdrant-layers.js';
import { stampVoicesJob } from '../../api/lib/ops/stamp-voices-job.js';

const MAZ = JSON.stringify([{ name: 'Mázandarání', role: 'author', basis: 'book' }, { name: 'The Báb', role: 'quoted', basis: 'window' }]);

describe('voices', () => {
  it('a paragraph has its author and every quoted voice', () => {
    expect(paragraphVoices({ authors: MAZ, author: 'Mázandarání' })).toEqual(['Mázandarání', 'The Báb']);
  });
  it('an author filter matches the writer OR a quoted voice', () => {
    const f = toQdrantFilter({ author: 'The Báb' });
    const cond = f.must.find((m) => m.should);
    expect(cond.should.map((s) => s.key)).toEqual(['author_fold', 'voices_fold']);
    expect(cond.should[1].match.any).toEqual(['thebab']);
  });
  it('stamps voices_fold on every collection, grouped by voice set, only where someone is quoted', async () => {
    const calls = [];
    const r = await stampVoicesJob({ span: 1000, collections: ['phrases', 'paragraphs_kw'] }, {
      top: async () => 1000, index: async () => {},
      rows: async () => [{ id: 7, authors: MAZ, author: 'Mázandarání' }, { id: 8, authors: MAZ, author: 'Mázandarání' },
        { id: 9, authors: JSON.stringify([{ name: 'Shoghi Effendi', role: 'author', basis: 'book' }]), author: 'Shoghi Effendi' }],
      qd: async (path, body) => calls.push([path.split('/')[2], body]),
    });
    expect(r).toMatchObject({ paragraphs: 2, groups: 1, calls: 2 });
    expect(calls[0][1]).toEqual({ payload: { voices_fold: ['mazandarani', 'thebab'] }, filter: { must: [{ key: 'paragraph_id', match: { any: [7, 8] } }] } });
    expect(calls.map((c) => c[0])).toEqual(['phrases', 'paragraphs_kw']);
  });
});
