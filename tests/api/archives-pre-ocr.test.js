// Pre-OCR dedup helpers (archives/pre-ocr.js): ISBN, metadata title, the verdict order, SLP rate, chapter files; intake routes an image PDF to SLP.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/docs-repo.js', () => ({ findDocuments: vi.fn(), listDocs: vi.fn(), getParagraphs: vi.fn() }));
const { isbnsIn, frontText, metaTitle, preOcrCheck, slpSpent, chapterFile, verdictOf, evidenceOf, SUBSTANTIAL } = await import('../../api/lib/archives/pre-ocr.js');

describe('isbnsIn / frontText / metaTitle', () => {
  it('finds labelled, checksum-valid ISBNs (10 → also its 13); a wrong checksum or unlabelled number is ignored', () => {
    expect(isbnsIn('Copyright 1990. ISBN 0-85398-000-3 (pbk)')).toEqual(['0853980003', '9780853980001'].filter((x) => isbnsIn('ISBN 0-85398-000-3').includes(x)));
    expect(isbnsIn('ISBN-13: 978-0-306-40615-7')).toEqual(['9780306406157']);
    expect(isbnsIn('ISBN 978-0-306-40615-8')).toEqual([]);
    expect(isbnsIn('call 9780306406157 now')).toEqual([]);
    expect(isbnsIn('urn:isbn:9780306406157')).toEqual(['9780306406157']);
  });
  it('only pages 1-4 are the book’s own front matter', () => {
    expect(frontText('[page 2]\nISBN a\n\n[page 90]\nISBN b')).toBe('[page 2]\nISBN a\n\n');
  });
  it('PDF metadata title/author; file-like or tool-made values are ignored', () => {
    expect(metaTitle('Title:  The Priceless Pearl\nAuthor: Rúhíyyih Khánum\nPages: 5')).toEqual({ title: 'The Priceless Pearl', author: 'Rúhíyyih Khánum' });
    expect(metaTitle('Title: scan0001.pdf\nAuthor: x')).toEqual({ title: null, author: null });
  });
});

const probe = (o = {}) => ({ class: 'scan', pages: 80, sampled: [1, 2, 3], ocr: true, meta_text: '', text: `[page 1]\n${'a long distinctive sentence '.repeat(30)}`, ...o });
describe('preOcrCheck', () => {
  const lib = (verdict, id = 5) => async () => ({ verdict, candidates: [{ id, title: 'Library of Light', paragraph_count: 200 }] });
  it('an ISBN the library holds → held, before anything else is searched', async () => {
    const check = vi.fn();
    const r = await preOcrCheck({ probe: probe({ meta_text: 'x', text: '[page 2]\nISBN 978-0-306-40615-7' }), cat: {}, name: 'a.pdf' }, { check, byIsbn: async () => [{ id: 3, title: 'The Book', paragraph_count: 500 }] });
    expect(r).toMatchObject({ verdict: 'held', by: 'isbn', candidate: '#3 The Book' });
    expect(check).not.toHaveBeenCalled();
  });
  it('the sampled text finds it → held (with the nearest document); a title-only match → probably held; nothing → clear', async () => {
    expect(await preOcrCheck({ probe: probe(), cat: { title: 'T' }, name: 'a.pdf' }, { check: lib('held'), byIsbn: async () => [] })).toMatchObject({ verdict: 'held', by: 'text', candidate: '#5 Library of Light' });
    const shortP = probe({ text: '[page 1]\nshort' });
    expect(await preOcrCheck({ probe: shortP, cat: { title: 'Library of Light' }, name: 'a.pdf' }, { check: lib('undetermined'), byIsbn: async () => [] })).toMatchObject({ verdict: 'probably_held', by: 'title' });
    expect(await preOcrCheck({ probe: shortP, cat: { title: 'Nothing Like It' }, name: 'a.pdf' }, { check: async () => ({ verdict: 'not-held', candidates: [] }), byIsbn: async () => [] })).toMatchObject({ verdict: 'clear' });
  });
  it('text and title evidence: a possible text match is probably held, never held', async () => {
    expect(verdictOf({ verdict: 'possible', candidates: [{ id: 1 }] }).verdict).toBe('probably_held');
    expect(verdictOf({ verdict: 'not-held', candidates: [] }).verdict).toBe('clear');
  });
});

describe('slpSpent / chapterFile', () => {
  it('sums what SLP actually billed; no jobs → no rate, never a guessed one', () => {
    const jobs = [1, 2, 3].map(() => ({ identified: { slp: { cost_cents: 2, pages: 10 } } })).concat([{ identified: {} }]);
    expect(slpSpent(jobs)).toEqual({ jobs: 3, pages: 30, spent_usd: 0.06, cents_per_page_so_far: 0.2 });
    expect(slpSpent([])).toEqual({ jobs: 0, pages: 0, spent_usd: 0, cents_per_page_so_far: null });
  });
  it('chapter files of one book share a set; ordinary books do not', () => {
    const a = chapterFile('BNO/01_PDF format OCR/William Henry Randall/27 William Henry Randall chap 26.pdf'), b = chapterFile('BNO/01_PDF format OCR/William Henry Randall/28 William Henry Randall chap 27.pdf');
    expect(a.set).toBe(b.set);
    expect(chapterFile('x/Chapter 3.pdf')).toBeTruthy();
    expect(chapterFile('x/The Dawn-Breakers.pdf')).toBeNull();
    expect(chapterFile('x/Volume 2.pdf')).toBeNull();
  });
});

// compare.js's candidate shape: { id, title, relation: { relation, ours_in_theirs, theirs_in_ours, length_ratio, in_order } }
const cand = (id, relation, a, b, r = 1) => ({ id, title: `Lib ${id}`, relation: { relation, ours_in_theirs: a, theirs_in_ours: b, length_ratio: r, in_order: 0.9 } });
describe('held by default when the library holds a substantial share', () => {
  // rows = [relation, ours_in_theirs, theirs_in_ours, what the OLD rule said (any held/partly-held/possible → probably held), what the NEW rule says]
  const fixtures = [
    ['same', 0.95, 0.95, 'held', 'held'],
    ['inside', 0.9, 0.2, 'held', 'held'],
    ['partial', 0.2, 0.7, 'probably_held', 'held'],
    ['overlap', 0.3, 0.1, 'probably_held', 'held'],
    ['overlap', 0.1, 0.28, 'probably_held', 'held'],
    ['overlap', 0.15, 0.12, 'probably_held', 'probably_held'],
    ['quotes', 0.2, 0.15, 'probably_held', 'clear'],
    ['unrelated', 0.01, 0.01, 'clear', 'clear'],
  ];
  const verdictFor = ([rel, a, b]) => verdictOf({ verdict: rel === 'same' || rel === 'inside' ? 'held' : rel === 'partial' ? 'partly-held' : rel === 'unrelated' ? 'not-held' : 'possible', candidates: rel === 'unrelated' ? [] : [cand(7, rel, a, b)] });
  it('partial, inside, same and an overlap of at least SUBSTANTIAL (either direction) are held; weak overlap needs a person; quotes and unrelated are new', () => {
    expect(SUBSTANTIAL).toBe(0.25);
    fixtures.forEach((f) => expect(verdictFor(f).verdict, f.join(' ')).toBe(f[4]));
  });
  it('moves on the fixtures: probably_held→held 3, probably_held→clear 1, unchanged 4', () => {
    const moved = fixtures.reduce((m, f) => { const k = f[3] === f[4] ? 'unchanged' : `${f[3]}→${f[4]}`; m[k] = (m[k] || 0) + 1; return m; }, {});
    expect(moved).toEqual({ unchanged: 4, 'probably_held→held': 3, 'probably_held→clear': 1 });
  });
  it('the evidence keeps relation, both shares, length ratio and the top 3 candidates with their numbers (the Breakwell Pilgrim Notes case)', () => {
    const r = { verdict: 'partly-held', candidates: [cand(208557, 'partial', 0.3, 0.8, 0.4), cand(2, 'overlap', 0.2, 0.1), cand(3, 'quotes', 0.1, 0.1), cand(4, 'quotes', 0.1, 0.1)] };
    expect(evidenceOf(r)).toHaveLength(3);
    expect(evidenceOf(r)[0]).toMatchObject({ id: 208557, relation: 'partial', ours_in_theirs: 0.3, theirs_in_ours: 0.8, length_ratio: 0.4 });
    expect(verdictOf(r)).toMatchObject({ verdict: 'held', candidate: { id: 208557 }, evidence: [expect.anything(), expect.anything(), expect.anything()] });
  });
  it('preOcrCheck returns the evidence for held, probably held and clear-with-quotes alike', async () => {
    const mk = (cands, verdict) => async () => ({ verdict, candidates: cands });
    const text = `[page 1]\n${'sampled sentence '.repeat(40)}`;
    const held = await preOcrCheck({ probe: { text, sampled: [1], pages: 9 }, cat: { title: 'T' }, name: 'a.pdf' }, { check: mk([cand(5, 'partial', 0.3, 0.7, 0.5)], 'partly-held'), byIsbn: async () => [] });
    expect(held).toMatchObject({ verdict: 'held', by: 'text', evidence: [expect.objectContaining({ id: 5, relation: 'partial', theirs_in_ours: 0.7, length_ratio: 0.5 })] });
    const quotes = await preOcrCheck({ probe: { text, sampled: [1], pages: 9 }, cat: { title: 'Zzz' }, name: 'a.pdf' }, { check: mk([cand(6, 'quotes', 0.2, 0.1)], 'possible'), byIsbn: async () => [] });
    expect(quotes).toMatchObject({ verdict: 'clear', evidence: [expect.objectContaining({ id: 6, relation: 'quotes' })] });
  });
});
