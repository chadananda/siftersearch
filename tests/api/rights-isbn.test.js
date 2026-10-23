// Chad 10-23 ISBN rule: canonical predicate, own-ISBN detection (checksums, citation ≠ own), the report, the preview window.
import { describe, it, expect } from 'vitest';
import { canonicalOf, isCanonical, docType } from '../../api/lib/rights/canonical.js';
import { validIsbn10, validIsbn13, normalizeIsbn, findIsbns, ownIsbn } from '../../api/lib/rights/isbn.js';
import { previewWindow, PREVIEW_PARAGRAPHS, canReadFull, cacheControlFor } from '../../api/lib/rights/preview.js';
import { rightsIsbnJob } from '../../api/lib/ops/rights-isbn-job.js';

const B = "Baha'i";
describe('canonical predicate', () => {
  it.each([
    [{ author: "Bahá'u'lláh", religion: B, collection: 'Books' }, 'writings'],
    [{ author: '‘Abdu’l-Bahá', religion: B, collection: 'Books' }, 'writings'],
    [{ author: 'Abdul-Baha', religion: B, collection: 'Books' }, 'writings'],
    [{ author: 'The Báb', religion: B, collection: 'Books' }, 'writings'],
    [{ author: 'Shoghi Effendi', religion: B, collection: "Baha'i Books" }, 'writings'],
    [{ author: 'The Universal House of Justice', religion: B, collection: 'Books' }, 'institutional'],
    [{ author: 'Research Department of the Universal House of Justice (compiler)', religion: B, collection: 'Books' }, 'institutional'],
    [{ author: 'National Spiritual Assembly of the United States', religion: B, collection: 'Books' }, 'institutional'],
    [{ author: 'Bahá’í International Community', religion: B, collection: 'Papers' }, 'institutional'],
    [{ author: 'Anon', religion: B, collection: 'Books', source_site: 'oceanlibrary.com' }, 'oceanlibrary'],
    [{ author: 'Anon', religion: 'Judaism', collection: 'Talmud and Mishnah' }, 'scripture'],
    [{ author: 'Anon', religion: 'Buddhist', collection: 'Pali Canon' }, 'scripture'],
    [{ author: 'Anon', religion: B, collection: 'Core Tablets' }, 'collection:Core Tablets'],
    [{ author: 'Anon', religion: B, collection: 'Áthár-i-Qalam-i-A‘lá, vol. 1' }, 'collection:Áthár-i-Qalam-i-A‘lá, vol. 1'],
  ])('%o is canonical (%s)', (doc, basis) => { expect(canonicalOf(doc)).toEqual({ canonical: true, basis }); });
  it.each([
    { author: 'Adib Taherzadeh', religion: B, collection: 'Books' },
    { author: 'H. M. Balyuzi', religion: B, collection: "Baha'i Books" },   // ABOUT ‘Abdu’l-Bahá, not by Him
    { author: 'Moojan Momen', religion: B, collection: 'Papers' },
    { author: 'Karen Armstrong', religion: 'Christian', collection: 'Modern Theology' },
    { author: 'Babak Rahimi', religion: B, collection: 'Books' },            // "Bab" inside a name is not the Báb
  ])('%o is NOT canonical', (doc) => { expect(isCanonical(doc)).toBe(false); });
});

describe('document type (only a book is eligible)', () => {
  it.each([
    [{ title: 'The Revelation of Bahá’u’lláh', collection: 'Books', paragraph_count: 3000 }, 'book'],
    [{ title: 'A Short Pamphlet', collection: 'Books', paragraph_count: 30 }, 'short'],
    [{ title: 'Some Paper', collection: 'Papers', paragraph_count: 300 }, 'paper'],
    [{ title: 'A Study of the Covenant (PhD thesis)', collection: 'Books', paragraph_count: 900 }, 'thesis'],
    [{ title: 'Pilgrim Notes of X', collection: 'Books', paragraph_count: 300 }, 'pilgrim-notes'],
    [{ title: 'Compilation on Prayer', collection: 'Books', paragraph_count: 300 }, 'compilation'],
    [{ title: 'Talks given in London', collection: 'Books', paragraph_count: 300 }, 'talk'],
    [{ title: 'Letter from the NSA dated 1990', collection: 'Books', paragraph_count: 300 }, 'letter'],
    [{ title: 'National Newsletter 1972', collection: 'Books', paragraph_count: 300 }, 'newsletter'],
    [{ title: 'Some page', collection: 'Unknown', source_site: 'bahai-library.com', paragraph_count: 300 }, 'web-page'],
    [{ title: 'News item', collection: 'News', paragraph_count: 300 }, 'news'],
    [{ title: 'x', collection: 'Books', doc_role: 'metadata', paragraph_count: 300 }, 'metadata'],
  ])('%o → %s', (doc, t) => { expect(docType(doc)).toBe(t); });
});

describe('ISBN checksums', () => {
  it('accepts valid ISBN-13 and ISBN-10, any hyphenation', () => {
    expect(validIsbn13('978-0-306-40615-7')).toBe(true);
    expect(validIsbn10('0-306-40615-2')).toBe(true);
    expect(validIsbn10('0-8044-2957-X')).toBe(true);
    expect(normalizeIsbn('0-306-40615-2')).toBe('9780306406157');
  });
  it('rejects bad check digits and non-ISBNs', () => {
    expect(validIsbn13('978-0-306-40615-8')).toBe(false);
    expect(validIsbn10('0-306-40615-3')).toBe(false);
    expect(normalizeIsbn('123-456-7890')).toBe(null);
    expect(findIsbns('ISBN 978-0-306-40615-8')).toEqual([]);
    expect(findIsbns('Call 0306406152 today')).toEqual([]);           // unlabelled digits are not an ISBN
    expect(findIsbns('ISBN-13: 978-0-306-40615-7')[0].isbn13).toBe('9780306406157');
  });
});

describe("a document's OWN ISBN", () => {
  const p = (texts) => texts.map((text, i) => ({ paragraph_index: i, text }));
  it('metadata', () => {
    expect(ownIsbn({ meta: { isbn: '0-306-40615-2' } })).toMatchObject({ isbn13: '9780306406157', source: 'metadata' });
    expect(ownIsbn({ meta: { isbn: '0-306-40615-3' } })).toBe(null);
  });
  it('copyright page in the first pages, beside the publisher/© line', () => {
    const r = ownIsbn({ paragraphs: p(['The Title', 'by An Author', '© 1998 by An Author. All rights reserved.', 'Published by George Ronald, Oxford', 'ISBN 0-306-40615-2', 'Contents']) });
    expect(r).toMatchObject({ isbn13: '9780306406157', source: 'copyright-page', paragraph_index: 4 });
  });
  it('a bibliography listing ISBNs is NOT the document’s own', () => {
    const bib = p(['Introduction', 'Some running text about history.',
      'Bibliography',
      'Balyuzi, H. M. ‘Abdu’l-Bahá. Oxford: George Ronald, 1971, pp. 12-40. ISBN 0-306-40615-2',
      'Taherzadeh, A. The Revelation of Bahá’u’lláh, vol. 1. Oxford: George Ronald, 1974. ISBN 978-0-306-40615-7',
      'Esslemont, J. E. Bahá’u’lláh and the New Era. Wilmette: Bahá’í Publishing Trust, cited in Smith (1990). ISBN 978-0-306-40615-7']);
    expect(ownIsbn({ paragraphs: bib })).toBe(null);
  });
  it('an ISBN with no imprint nearby, or past the first pages, does not count', () => {
    expect(ownIsbn({ paragraphs: p(['Chapter 1', 'He mentioned ISBN 978-0-306-40615-7 once.', 'More text.']) })).toBe(null);
    const late = p([...Array(45).fill('text'), '© 1998 Publisher', 'ISBN 978-0-306-40615-7']);
    expect(ownIsbn({ paragraphs: late })).toBe(null);
  });
});

describe('rights-isbn report', () => {
  const docs = [
    { id: 1, title: 'Modern Book', author: 'An Author', religion: B, collection: 'Books', paragraph_count: 500, encumbered: 0 },
    { id: 2, title: 'Gleanings', author: "Bahá'u'lláh", religion: B, collection: 'Books', paragraph_count: 500, encumbered: 0 },
    { id: 3, title: 'Some Paper', author: 'Scholar', religion: B, collection: 'Papers', paragraph_count: 200, encumbered: 0 },
    { id: 4, title: 'Bibliography Book', author: 'B. Writer', religion: B, collection: 'Books', paragraph_count: 500, encumbered: 0 },
    { id: 5, title: 'Already Restricted', author: 'C. Writer', religion: B, collection: "Baha'i Books", paragraph_count: 500, encumbered: 1 },
  ];
  const imprint = [{ paragraph_index: 0, text: 'Title' }, { paragraph_index: 1, text: '© 2001 Kalimát Press' }, { paragraph_index: 2, text: 'ISBN 978-0-306-40615-7' }];
  const fronts = { 1: imprint, 2: imprint, 3: imprint, 4: [{ paragraph_index: 0, text: 'See Smith, Oxford: George Ronald, 1990, pp. 3. ISBN 978-0-306-40615-7' }], 5: imprint };
  const deps = (writes) => ({
    page: async ({ afterId }) => docs.filter((d) => d.id > afterId), front: async (id) => fronts[id] || [],
    record: async (id, x) => { writes.push([id, x]); return { changed: 1 }; }, base: '/lib', random: () => 0.5 });
  it('dry run: only the non-canonical BOOK with its own ISBN would change; nothing written', async () => {
    const writes = [];
    const r = await rightsIsbnJob({}, deps(writes));
    expect(r.would_encumber).toBe(1);
    expect(r.flagged_ids).toEqual([1]);
    expect(r.already_encumbered_books).toBe(1);
    expect(r.own_isbn_by_type).toEqual({ book: 2, paper: 1 });
    expect(r.false_positive_check[0]).toMatchObject({ id: 1, evidence: 'ISBN 978-0-306-40615-7' });
    expect(writes).toEqual([]);
  });
  it('write: encumbers the book, records the paper’s ISBN without encumbering it, never un-encumbers', async () => {
    const writes = [];
    const r = await rightsIsbnJob({ write: true }, deps(writes));
    expect(r.encumbered_now).toBe(1);
    expect(writes).toContainEqual([1, { isbn: '9780306406157', encumber: true }]);
    expect(writes).toContainEqual([3, { isbn: '9780306406157', encumber: false }]);
    expect(writes).toContainEqual([5, { isbn: '9780306406157', encumber: false }]);
    expect(writes.find(([id]) => id === 2 || id === 4)).toBeUndefined();
  });
});

describe('preview window (40 paragraphs, staff override)', () => {
  it('caps an encumbered doc at paragraph 40 for anonymous and signed-in readers', () => {
    expect(previewWindow({ encumbered: 1, offset: 0, limit: 50 })).toMatchObject({ offset: 0, limit: PREVIEW_PARAGRAPHS, capped: true });
    expect(previewWindow({ encumbered: 1, user: { role: 'user' }, offset: 40, limit: 50 })).toMatchObject({ limit: 0, capped: true });
    expect(previewWindow({ encumbered: 1, offset: 30, limit: 50 })).toMatchObject({ limit: 10 });
  });
  it('admins and editors read in full; unencumbered docs are untouched', () => {
    expect(previewWindow({ encumbered: 1, user: { role: 'admin' }, offset: 40, limit: 50 })).toMatchObject({ limit: 50, capped: false });
    expect(canReadFull({ role: 'editor' })).toBe(true);
    expect(previewWindow({ encumbered: 0, offset: 400, limit: 50 })).toMatchObject({ limit: 50, capped: false });
    expect(cacheControlFor({ encumbered: true, full: true })).toBe('private, no-store');
  });
});
