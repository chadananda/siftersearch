// Book metadata hunt (Chad 10-23): imprint parsing, publisher classes, the hunt over fake catalogues, apply = high only,
// the publisher rights rule (dry run), resume.
import { describe, it, expect, vi } from 'vitest';
import { imprintFromText, publisherClass } from '../../api/lib/books/publishers.js';
import { huntBook, mainTitle, authorAgrees, isbn10Of, portraitProblem, HUNT_VERSION } from '../../api/lib/books/hunt.js';
import { bookHuntJob, applicable, bookHuntApplyJob, rightsPublisherJob, bookMetaCoverageReport } from '../../api/lib/ops/book-hunt-job.js';

const p = (texts) => texts.map((text, i) => ({ paragraph_index: i, text }));
const res = (body, ok = true) => ({ ok, json: async () => body });
const fakeFetch = (routes) => vi.fn(async (url) => {
  for (const [re, body] of routes) if (re.test(url)) return typeof body === 'function' ? res(body(url)) : res(body);
  return res(null, false);
});

describe('publishers', () => {
  it('classes', () => {
    expect(publisherClass('George Ronald, Oxford')).toEqual({ name: 'George Ronald', class: 'commercial' });
    expect(publisherClass('Kalimát Press')).toMatchObject({ class: 'commercial' });
    expect(publisherClass('Bahá’í Publishing Trust, Wilmette')).toMatchObject({ class: 'review' });
    expect(publisherClass('Bahá’í World Centre')).toMatchObject({ class: 'institutional' });
    expect(publisherClass('Oxford University Press')).toMatchObject({ class: 'commercial' });
    expect(publisherClass('John Smith')).toBe(null);
  });
  it('reads the imprint from the copyright page, not from "also by" lists', () => {
    const r = imprintFromText(p(['The Book', 'BY THE SAME AUTHOR Iran’s Secret Pogrom (Neville Spearman)', 'GEORGE RONALD, Publisher 46 High Street, Kidlington, Oxford',
      '© David Piff 2000 All Rights Reserved', 'Second revised edition', 'Reprinted 2004']));
    expect(r.publisher).toMatchObject({ value: 'George Ronald', class: 'commercial' });
    expect(r.year.value).toBe(2000);
    expect(r.edition.value).toBe('second edition');
    expect(r.printing_year.value).toBe(2004);
  });
});

describe('a publisher named elsewhere is not the imprint (10-23 dry run)', () => {
  it.each([
    'Giachery, Ugo. _Shoghi Effendi, Recollections_. Oxford: George Ronald, 1973. -- Ugo Giachery was a Hand of the Cause',
    'Taherzadeh, Adib. The Covenant of Bahá’u’lláh (Bahá’í Publishing Trust, London, 1972)',
    'Note: All page references to the Íqán correspond to the edition of the Bahá’í Publishing Trust of 1989.',
    'BY THE SAME AUTHOR Iran’s Secret Pogrom (Neville Spearman) The Phoenix and the Ashes (George Ronald, Publisher)',
    'Approved by the National Spiritual Assembly of the Bahá’ís of Jamaica',
    'George Ronald, 1989).',
    'My deep appreciation to the National Spiritual Assembly of the Bahá’ís of Canada for permission to quote',
    '[17]: From a letter from the Universal House of Justice dated August 11, 1970',
  ])('%s', (line) => { expect(imprintFromText(p([line])).publisher).toBeUndefined(); });
  it('still reads a real imprint line', () => {
    expect(imprintFromText(p(['Approved by the National Spiritual Assembly', 'GEORGE RONALD OXFORD'])).publisher.value).toBe('George Ronald');
    expect(imprintFromText(p(['Bahá’í Publishing Trust, 27 Rutland Gate, London SW7 1PD Copyright Rúḥíyyih Rabbání 1988 All rights reserved'])).publisher)
      .toMatchObject({ value: 'Bahá’í Publishing Trust', class: 'review' });
  });
});

describe('hunt helpers', () => {
  it('main title, author agreement, ISBN-10', () => {
    expect(mainTitle('The Revelation of Bahá’u’lláh, vol. 1: Baghdad 1853-63')).toBe('The Revelation of Bahá’u’lláh, vol. 1');
    expect(authorAgrees('Adib Taherzadeh', ['Adib Taherzadeh'])).toBe(true);
    expect(authorAgrees('Adib Taherzadeh', ['John Smith'])).toBe(false);
    expect(isbn10Of('9780853982708')).toBe('0853982708');
  });
  it('portrait rules (speaker-gallery): size, single person, licence', () => {
    expect(portraitProblem({ w: 300, h: 900, licence: 'CC BY' })).toMatch(/short side/);
    expect(portraitProblem({ w: 800, h: 900, licence: 'CC BY' }, 'Smith and family.jpg')).toMatch(/single/);
    expect(portraitProblem({ w: 800, h: 900 })).toMatch(/licence/);
    expect(portraitProblem({ w: 800, h: 900, licence: 'CC BY' }, 'Adib Taherzadeh.jpg')).toBe(null);
  });
});

const doc = { id: 9, title: 'The Covenant of Bahá’u’lláh', author: 'Adib Taherzadeh', cover_url: null, purchase_url: null };
const front = p(['The Covenant of Bahá’u’lláh', 'GEORGE RONALD Oxford', '© Adib Taherzadeh 1992 All Rights Reserved']);

describe('huntBook', () => {
  it('no ISBN on our pages: the work by title+author, the edition our copyright page names → high', async () => {
    const fetchImpl = fakeFetch([
      [/search\.json/, { docs: [{ key: '/works/OL1W', title: 'The Covenant of Bahá’u’lláh', author_name: ['Adib Taherzadeh'], author_key: ['OL9A'], cover_i: 5 }] }],
      [/OL1W\/editions/, { entries: [
        { key: '/books/E1', publishers: ['Bahá’í Publishing Trust'], publish_date: '1995', isbn_13: ['9780877432654'] },
        { key: '/books/E2', publishers: ['George Ronald'], publish_date: '1992', isbn_10: ['0853983437'] }] }],
      [/authors\/OL9A/, { name: 'Adib Taherzadeh', birth_date: '1921', death_date: '2000', remote_ids: { wikidata: 'Q42' } }],
      [/EntityData\/Q42/, { entities: { Q42: { claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }], P18: [{ mainsnak: { datavalue: { value: 'Adib Taherzadeh.jpg' } } }] } } } }],
      [/commons\.wikimedia/, { query: { pages: { 1: { imageinfo: [{ mime: 'image/jpeg', url: 'https://u/full.jpg', thumburl: 'https://u/800.jpg', width: 800, height: 1000, descriptionurl: 'https://c/p',
        extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'X' } } }] } } } }],
    ]);
    const r = await huntBook({ doc, paragraphs: front }, { fetchImpl });
    expect(r.fields.isbn13).toMatchObject({ value: '9780853983439', conf: 'high', source: 'openlibrary' });
    expect(r.fields.publisher).toMatchObject({ value: 'George Ronald', source: 'copyright-page', conf: 'high' });
    expect(r.fields.year.value).toBe(1992);
    expect(r.fields.purchase_url.value).toBe('https://www.amazon.com/s?k=9780853983439');
    expect(r.fields.author_born.value).toBe(1921);
    expect(r.fields.author_image).toMatchObject({ value: 'https://u/800.jpg', conf: 'high', source: 'wikidata-p18' });
    expect(r.fields.cover.value).toContain('9780853983439');
    expect(r.review).toBe(false);
  });
  it('an edition we cannot identify → medium (review), never high', async () => {
    const fetchImpl = fakeFetch([
      [/search\.json/, { docs: [{ key: '/works/OL1W', title: 'The Covenant of Bahá’u’lláh', author_name: ['Adib Taherzadeh'] }] }],
      [/OL1W\/editions/, { entries: [{ key: '/books/E1', publishers: ['Bahá’í Publishing Trust'], publish_date: '1995', isbn_13: ['9780877432654'] }] }],
    ]);
    const r = await huntBook({ doc, paragraphs: p(['The Covenant']) }, { fetchImpl });
    expect(r.fields.isbn13.conf).toBe('medium');
    expect(r.review).toBe(true);
  });
  it('another author’s same-titled book is not a match', async () => {
    const fetchImpl = fakeFetch([[/search\.json/, { docs: [{ key: '/works/OL2W', title: 'The Covenant of Bahá’u’lláh', author_name: ['Someone Else'] }] }]]);
    const r = await huntBook({ doc, paragraphs: p(['x']) }, { fetchImpl });
    expect(r.fields.isbn13).toBeUndefined();
    expect(r.matched.work).toBe(null);
  });
  it('several matching works: Jev picks, the match stays medium', async () => {
    const fetchImpl = fakeFetch([
      [/search\.json/, { docs: [{ key: '/works/A', title: 'The Covenant of Bahá’u’lláh', author_name: ['Adib Taherzadeh'] }, { key: '/works/B', title: 'The Covenant of Bahá’u’lláh and the Station of the Guardian', author_name: ['Adib Taherzadeh'] }] }],
      [/works\/B\/editions/, { entries: [{ key: '/books/EB', publishers: ['X Press'], publish_date: '2001', isbn_13: ['9780877432654'] }] }],
    ]);
    const jev = vi.fn(async () => ({ which: { choice: 'c1', confidence: 0.9 } }));
    const r = await huntBook({ doc, paragraphs: p(['x']) }, { fetchImpl, jev });
    expect(jev).toHaveBeenCalledOnce();
    expect(r.matched).toMatchObject({ work: '/works/B', conf: 'medium' });
    expect(r.fields.isbn13.conf).toBe('medium');
  });
  it('an author we hold verified speaker photos of uses the gallery photo', async () => {
    const r = await huntBook({ doc, paragraphs: front, speakers: [{ key: 'adib-taherzadeh', name: 'Adib Taherzadeh', file: 'media-speakers/a.jpg', sha: 'abcdef0123456789' }] },
      { fetchImpl: fakeFetch([]), photoUrl: (f, s) => `cdn/${f}?v=${s}` });
    expect(r.fields.author_image).toMatchObject({ value: 'cdn/media-speakers/a.jpg?v=abcdef0123456789', source: 'speaker-gallery', conf: 'high' });
  });
  it('Open Library holding one work twice (same title, same surname) is one work — still high', async () => {
    const fetchImpl = fakeFetch([[/search\.json/, { docs: [{ key: '/works/A', title: 'The covenant of Baha’u’llah', author_name: ['Adib Taherzadeh'], edition_count: 1 },
      { key: '/works/B', title: 'The Covenant of Bahá’u’lláh', author_name: ['A. Taherzadeh'], edition_count: 4 }] }]]);
    const r = await huntBook({ doc, paragraphs: p(['x']) }, { fetchImpl });
    expect(r.matched).toMatchObject({ work: '/works/B', conf: 'high' });
  });
});

describe('jobs', () => {
  const docs = [
    { id: 1, title: 'A Modern Book', author: 'An Author', religion: "Baha'i", collection: 'Books', paragraph_count: 500, encumbered: 0 },
    { id: 2, title: 'Kitáb-i-Íqán', author: "Bahá'u'lláh", religion: "Baha'i", collection: 'Books', paragraph_count: 500, encumbered: 0 },
    { id: 3, title: 'A Paper', author: 'S', religion: "Baha'i", collection: 'Papers', paragraph_count: 500, encumbered: 0 },
    { id: 4, title: 'BPT Book', author: 'B', religion: "Baha'i", collection: 'Books', paragraph_count: 500, encumbered: 0 },
    { id: 5, title: 'ISBN Book', author: 'C', religion: "Baha'i", collection: 'Books', paragraph_count: 500, encumbered: 0 },
  ];
  const page = async ({ afterId }) => docs.filter((d) => d.id > afterId);
  it('book-hunt hunts books only, checkpoints each, skips done ones, yields to a drain with a resume', async () => {
    const saved = new Map();
    const deps = { page, front: async () => [], speakers: async () => [], photoUrl: () => '', jev: null, sleep: async () => {},
      rows: async ([id]) => (saved.has(id) ? [{ state: 'done', version: HUNT_VERSION }] : []),
      save: async (id, r) => saved.set(id, r), hunt: async () => ({ fields: {}, review: false }) };
    const r = await bookHuntJob({}, deps);
    expect([...saved.keys()]).toEqual([1, 2, 4, 5]);
    expect(r.hunted).toBe(4);
    expect((await bookHuntJob({}, deps)).skipped_done).toBe(4);
    saved.clear();
    let calls = 0;
    const y = await bookHuntJob({ limit: 10 }, { ...deps, draining: () => ++calls > 2 });
    expect(y).toMatchObject({ yielded: true, resume: { limit: 8 } });
    expect(saved.size).toBe(2);
  });
  it('apply takes high-confidence fields only', () => {
    const a = applicable({ fields: { isbn13: { value: '9780853983439', conf: 'high', source: 's' }, publisher: { value: 'George Ronald', conf: 'medium' },
      cover: { value: 'https://c', conf: 'high' } } });
    expect(a.values).toMatchObject({ isbn: '9780853983439', publisher: undefined });
    expect(a.cover).toBe('https://c');
    expect(a.meta.publisher).toBeUndefined();
  });
  it('apply job: dry run writes nothing; write fills and stores the cover', async () => {
    const rows = async () => [{ doc_id: 1, state: 'done', review: 0, found: JSON.stringify({ fields: { year: { value: 1992, conf: 'high' }, cover: { value: 'https://c', conf: 'high' } } }) }];
    const apply = vi.fn(async () => ({ changed: 1 }));
    const store = vi.fn(async () => ({ url: '/img/covers/1?v=abc' })), setCover = vi.fn(async () => ({}));
    const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array(5000).buffer });
    expect((await bookHuntApplyJob({}, { rows, apply })).would_apply).toEqual({ pub_year: 1, cover: 1 });
    expect(apply).not.toHaveBeenCalled();
    const w = await bookHuntApplyJob({ write: true }, { rows, apply, fetchImpl, storeCover: store, setCover, sniff: async () => 'jpeg' });
    expect(apply).toHaveBeenCalledWith(1, expect.objectContaining({ pub_year: 1992 }));
    expect(w.covers).toBe(1);
    expect(setCover).toHaveBeenCalledWith(1, '/img/covers/1?v=abc');
  });
  it('rights-publisher: commercial press or found ISBN → encumber; BPT → review; canonical and non-books untouched; dry run', async () => {
    const found = (o) => JSON.stringify({ fields: o });
    const rows = async () => [
      { doc_id: 1, found: found({ publisher: { value: 'George Ronald', conf: 'high', source: 'copyright-page', evidence: 'GEORGE RONALD Oxford' } }) },
      { doc_id: 2, found: found({ publisher: { value: 'George Ronald', conf: 'high', source: 'copyright-page' } }) },
      { doc_id: 4, found: found({ publisher: { value: 'Bahá’í Publishing Trust', conf: 'high', source: 'copyright-page' } }) },
      { doc_id: 5, found: found({ isbn13: { value: '9780853983439', conf: 'high', source: 'openlibrary' }, publisher: { value: 'X', conf: 'medium', source: 'openlibrary' } }) },
    ];
    const encumber = vi.fn();
    const r = await rightsPublisherJob({}, { page, rows, encumber });
    expect(r).toMatchObject({ would_encumber: 2, review: 1, by_reason: { 'publisher-commercial': 1, 'isbn-noncanonical': 1 } });
    expect(r.flagged_ids).toEqual([1, 5]);
    expect(r.george_ronald.map((x) => x.id)).toEqual([1]);
    expect(encumber).not.toHaveBeenCalled();
  });
  it('coverage report counts books by field', async () => {
    const r = await bookMetaCoverageReport({}, { page: async ({ afterId }) => docs.filter((d) => d.id > afterId).map((d) => ({ ...d, isbn: d.id === 5 ? 'x' : null })), rows: async () => [] });
    expect(r.noncanonical).toMatchObject({ books: 3, isbn: 1 });
    expect(r.canonical.books).toBe(1);
  });
});
