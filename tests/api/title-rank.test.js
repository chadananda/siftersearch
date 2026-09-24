/**
 * TITLE LOOKUP: the NAMED work must win.
 *
 * THE BUG (2026-09-24, reproduced live): asked "What does The Dawn-Breakers say about the Conference of
 * Badasht?", the chat answered "The Dawn-Breakers does not specifically discuss the Conference of Badasht."
 * It is one of the most famous chapters in that book, and the book is fully indexed.
 *
 * find_document_for_citation sorted by AUTHORITY first and used title relevance only as a tie-break:
 *     .sort((a, b) => (b._authority - a._authority) || (a._idx - b._idx))
 * authorityScore gives +60 for a canonical author. "The Dawn-Breakers" is by Nabíl (0); "The Advent of
 * Divine Justice" is by Shoghi Effendi (60+). So the named book could never win, the subagent read the
 * wrong document, and the answer was confidently wrong.
 *
 * The rule: HOW WELL THE TITLE MATCHES DECIDES FIRST. Authority breaks ties only among works whose titles
 * match equally well — which is what it was actually for (canonical Íqán over "Notes on the Íqán").
 */
import { describe, it, expect } from 'vitest';
import { titleTier, rankByTitle } from '../../api/lib/title-rank.js';

const doc = (title, author, authority = 0) => ({ title, author, _authority: authority });

describe('titleTier', () => {
  it('exact match outranks everything', () => {
    expect(titleTier('The Dawn-Breakers', 'The Dawn-Breakers')).toBeGreaterThan(titleTier('The Dawn-Breakers', 'Dawn-Breakers study guide'));
  });
  it('ignores a leading article so "Kitab-i-Iqan" matches "The Kitáb-i-Íqán" exactly', () => {
    expect(titleTier('Kitab-i-Iqan', 'The Kitáb-i-Íqán')).toBe(titleTier('x', 'x'));
  });
  it('folds diacritics and apostrophe variants', () => {
    expect(titleTier("Baha'u'llah and the New Era", 'Bahá’u’lláh and the New Era')).toBe(titleTier('x', 'x'));
  });
  it('a title that merely contains the words ranks below an exact match', () => {
    expect(titleTier('Paris Talks', 'Talks in Paris and London')).toBeLessThan(titleTier('Paris Talks', 'Paris Talks'));
  });
  it('an unrelated title scores zero', () => {
    expect(titleTier('The Dawn-Breakers', 'The Advent of Divine Justice')).toBe(0);
  });
});

describe('rankByTitle', () => {
  it('THE NAMED BOOK WINS over a higher-authority book with an unrelated title', () => {
    const hits = [
      doc('The Advent of Divine Justice', 'Shoghi Effendi', 120),
      doc('Shoghi Effendi on the Book of Certitude', 'Ugo Giachery', 60),
      doc('The Dawn-Breakers', 'Nabil Zarandi', 0),
    ];
    expect(rankByTitle('The Dawn-Breakers', hits)[0].title).toBe('The Dawn-Breakers');
  });

  it('God Passes By beats a Tablet of Visitation carrying canonical authority', () => {
    const hits = [
      doc('Tablet of Visitation for Imám Ḥusayn', "Bahá'u'lláh", 120),
      doc('God Passes By', 'Shoghi Effendi', 60),
    ];
    expect(rankByTitle('God Passes By', hits)[0].title).toBe('God Passes By');
  });

  it('AUTHORITY STILL DECIDES among equally-matching titles — the point it was added for', () => {
    const hits = [
      doc('Notes on the Kitáb-i-Íqán', 'A Student', 20),
      doc('The Kitáb-i-Íqán', "Bahá'u'lláh", 120),
    ];
    expect(rankByTitle('Kitab-i-Iqan', hits)[0].title).toBe('The Kitáb-i-Íqán');
  });

  it('keeps Meilisearch order as the last tie-break, so ranking is stable', () => {
    const hits = [doc('Same Title', 'A', 0), doc('Same Title', 'B', 0)];
    expect(rankByTitle('Same Title', hits).map((h) => h.author)).toEqual(['A', 'B']);
  });

  it('never drops candidates — re-ranking reorders, it does not filter', () => {
    const hits = [doc('One', 'A', 0), doc('Two', 'B', 99), doc('Three', 'C', 5)];
    expect(rankByTitle('Nothing matches this', hits)).toHaveLength(3);
  });
});
