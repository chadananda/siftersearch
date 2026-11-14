// Dewey's code findings (11-14): the /doc slug names the WORK's author (doc 430 ¶594); a citation "#n" (the file's para_N) links the row's
// anchor (doc 431 #1739 → #p1716); the book finder puts the library's volumes before a talk of the same title (2209613); doc 366's
// printed paragraph numbers never show (stored text unchanged).
import { describe, it, expect } from 'vitest';
import { docPage, anisDeep, anchorLinks, fixAnchor, anchorMap } from '../../api/lib/anis-links.js';
import { finishLinks } from '../../worker/anis/links.js';
import { toPassage } from '../../api/lib/assistant/tool-kit.js';
import { bookCandidates, libraryFirst } from '../../api/lib/assistant/book-finder.js';
import { shownText, NUMBERED_TEXT_DOCS } from '../../api/lib/assistant/widgets/card-text.js';
import { fromRefs } from '../../api/lib/assistant/widgets/quote.js';
import { toolRunner } from '../../api/lib/assistant/tool-runner.js';

describe('slug: the work’s author, not the paragraph’s writer (doc 430 ¶594)', () => {
  const p594 = { document_id: 430, paragraph_index: 593, title: 'The Revelation of Bahá’u’lláh, Volume 3', author: 'Ḥájí Muḥammad-Ṭáhir-i-Málmírí', book_author: 'Adib Taherzadeh', text: '…' };
  it('docPage uses book_author', () => {
    const u = docPage(p594, 593);
    expect(u).toMatch(/\/doc\/the-revelation-of-bahaullah-volume-3-adib-taherzadeh-430#p593$/);
    expect(u).not.toMatch(/haji|malmiri/);
  });
  it('a reader link in a tool result resolves through the passage to the same slug', () => {
    const out = anisDeep({ ...p594, source_url: 'https://siftersearch.com/library/bahai/books/revelation-3' });
    expect(out.source_url).toMatch(/adib-taherzadeh-430$/);
  });
  it('a document row (no book_author) keeps its own author', () => {
    expect(docPage({ id: 430, title: 'The Revelation of Bahá’u’lláh, Volume 3', author: 'Adib Taherzadeh' })).toMatch(/adib-taherzadeh-430$/);
  });
});

describe('citation #n → the row’s anchor (doc 431: 3,276 file blocks, 3,254 rows)', () => {
  const held = [{ document_id: 431, paragraph_index: 1716, place: '#1739', title: 'The Revelation of Bahá’u’lláh, Volume 2', author: 'Adib Taherzadeh', text: 'x',
    source_url: 'https://siftersearch.com/document/431#p1716' }];
  it('#1739 → #p1716 (a link the writer anchored by the citation number)', () => {
    const { text } = finishLinks('[the passage](https://siftersearch.com/document/431#p1739)', held);
    expect(text).toMatch(/\/doc\/[a-z0-9-]+-431#p1716\)/);
    expect(anchorLinks('https://anis.oceanlibrary.com/doc/x-431#1739.', held)).toBe('https://anis.oceanlibrary.com/doc/x-431#p1716.');
  });
  it('the mapping is the stored para_N → row, never an offset: an unmapped number and a real anchor stay', () => {
    const a = anchorMap(held);
    expect(fixAnchor('#p1716', 431, a)).toBe('#p1716');
    expect(fixAnchor('#p1740', 431, a)).toBe('#p1740');
    expect(fixAnchor('#p1739', 432, a)).toBe('#p1739');
  });
  it('a passage carries para_no from the row (block_attrs para_N), and the map prefers it to the place', () => {
    const p = toPassage({ id: 9, document_id: 431, paragraph_index: 1716, para_no: 1739, text: 't', title: 'R' });
    expect(p).toMatchObject({ para_no: 1739, place: '#1739' });
    // a locator naming the paragraph ("#12" = Íqán ¶12) is not a para_N
    expect(anchorMap([{ document_id: 5, paragraph_index: 40, locator: '#12', place: '#12' }]).get(5).no.size).toBe(0);
  });
});

describe('book finder: library before a talk of the same title (order, never a filter)', () => {
  const vol = (id, n) => ({ kind: 'work', doc: { id, title: `The Revelation of Bahá’u’lláh, Volume ${n}`, author: 'Adib Taherzadeh', collection: 'Books', paragraph_count: 3000 }, score: 10 - n });
  const talk = { kind: 'work', doc: { id: 2209613, title: 'The Revelation of Bahá’u’lláh', author: 'Adib Taherzadeh', collection: 'Media', paragraph_count: 120 }, score: 14 };
  it('the 2209613-like talk ranks under volumes 429–432, and stays a candidate', async () => {
    const retr = async () => [talk, vol(429, 1), vol(430, 2), vol(431, 3), vol(432, 4)];
    const { cands } = await bookCandidates('The Revelation of Bahá’u’lláh', { retrievers: [retr] });
    expect(cands.map((c) => c.doc.id)).toEqual([429, 430, 431, 432, 2209613]);
  });
  it('an identical title: the library work is not dropped as the talk’s duplicate', async () => {
    const book = { kind: 'work', doc: { ...talk.doc, id: 77, collection: 'Books', paragraph_count: 900 } };
    const { cands } = await bookCandidates('The Revelation of Bahá’u’lláh', { retrievers: [async () => [talk, book]] });
    expect(cands.map((c) => c.doc.id)).toEqual([77, 2209613]);
  });
  it('titles that do not tie keep their order', () => {
    const other = { kind: 'work', doc: { id: 1, title: 'Gate of the Heart', collection: 'Books' } };
    expect(libraryFirst([talk, other]).map((c) => c.doc.id)).toEqual([2209613, 1]);
  });
});

describe('doc 366: the printed paragraph number never shows', () => {
  const stored = '12.3 The Universal House of Justice calls the friends to service.';
  it('stripped for doc 366 only; the stored text unchanged and still holds what is shown', () => {
    expect(NUMBERED_TEXT_DOCS).toEqual([366]);
    const shown = shownText(stored, 366);
    expect(shown).toBe('The Universal House of Justice calls the friends to service.');
    expect(stored.includes(shown)).toBe(true);
    expect(shownText(stored, 12)).toBe(stored);
    expect(shownText('3.14 is pi', 12)).toBe('3.14 is pi');
  });
  it('a quote card and the writer’s view of the passage show it without its number', () => {
    const p = { document_id: 366, paragraph_index: 40, title: 'Messages from the Universal House of Justice', author: 'Universal House of Justice', text: stored, source_url: 'https://anis.oceanlibrary.com/doc/m-366#p40' };
    expect(fromRefs(['P1'], { found: new Map([['P1', p]]) }).text).toBe('The Universal House of Justice calls the friends to service.');
    const r = toolRunner({});
    const ref = r.add(p);
    expect(r.show([ref])).toMatch(/\nThe Universal House of Justice calls/);
    expect(r.show([ref])).not.toMatch(/12\.3/);
    expect(r.found.get(ref).text).toBe(stored);
  });
});
