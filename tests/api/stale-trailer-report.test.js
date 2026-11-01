// stale-trailer-authors report: counts trailer-credited paragraphs the bounded trailer rule no longer gives (read-only).
import { describe, it, expect } from 'vitest';
import { staleTrailerReport, staleTrailerRows } from '../../api/lib/ops/stale-trailer-report.js';
import { MAX_TRAILER_RUN } from '../../api/lib/authorship/trailers.js';

const T = JSON.stringify([{ name: 'Bahá’u’lláh', role: 'author', basis: 'trailer' }]);
const book = () => [
  ...Array.from({ length: MAX_TRAILER_RUN + 3 }, (_, i) => ({ id: i + 1, pidx: i, text: `Essay paragraph ${i}.`, blocktype: 'paragraph', authors: T })),
  { id: 100, pidx: 99, text: '(From The Gleanings, page 136.)', blocktype: 'paragraph', authors: '[]' },
  { id: 101, pidx: 100, text: '“O Son of Spirit! …”', blocktype: 'paragraph', authors: T },
  { id: 102, pidx: 101, text: '(Bahá’u’lláh, The Hidden Words, Arabic no. 1)', blocktype: 'paragraph', authors: '[]' },
];

describe('stale-trailer-authors report', () => {
  it('a long run credited by one trailer is stale; a quotation right before its trailer is not', () => {
    const s = staleTrailerRows(book());
    expect(s.length).toBe(MAX_TRAILER_RUN + 3);
    expect(s.some((r) => r.id === 101)).toBe(false);
  });
  it('reports per book with the credited name and range, reading one book at a time', async () => {
    const r = await staleTrailerReport({ ids: [967543] }, { rowsOf: async () => book() });
    expect(r).toMatchObject({ books_scanned: 1, books_affected: 1, paragraphs: MAX_TRAILER_RUN + 3 });
    expect(r.books[0]).toMatchObject({ id: 967543, first_pidx: 0, credited: { 'Bahá’u’lláh': MAX_TRAILER_RUN + 3 } });
  });
});
