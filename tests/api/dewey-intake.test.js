// Dewey's wanted list → research → source → intake. Real SQLite for the queue; network, files and the ingester faked.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

let raw;
vi.mock('../../api/lib/db.js', () => ({
  queryAll: vi.fn(async (sql, p = []) => raw.prepare(sql).all(...p)),
  queryOne: vi.fn(async (sql, p = []) => raw.prepare(sql).get(...p) ?? null),
  query: vi.fn(async () => ({})),
  transaction: vi.fn(async (stmts) => { raw.transaction(() => { for (const s of stmts) raw.prepare(s.sql).run(...(s.args || [])); })(); }),
}));
vi.mock('../../api/lib/audit.js', () => ({ audit: vi.fn(async () => {}) }));
vi.mock('../../api/lib/repos/activity-repo.js', () => ({ logActivity: vi.fn() }));
vi.mock('../../api/lib/ops/ctai-jobs.js', () => ({ waitForQuietWriter: async () => {} }));
const repo = await import('../../api/lib/repos/dewey-repo.js');
const { researchWork, titleMatches } = await import('../../api/lib/dewey/research.js');
const { proseGate, toMarkdown } = await import('../../api/lib/dewey/intake.js');
const { deweyIntakeJob } = await import('../../api/lib/ops/dewey-intake-job.js');

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(`CREATE TABLE dewey_items (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, author TEXT, kind TEXT, identified TEXT, research TEXT,
    state TEXT NOT NULL DEFAULT 'wanted', source_url TEXT, original_path TEXT, sha256 TEXT, cover_path TEXT, doc_id INTEGER,
    log TEXT NOT NULL DEFAULT '[]', created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
});

const PROSE = Array.from({ length: 80 }, (_, i) => `This is sentence ${i} of a real book about the early history of the Faith in Persia.`).join(' ');

describe('wanted list', () => {
  it('an item is created wanted; state changes are logged with their reason', async () => {
    const it1 = await repo.createItem({ title: 'The Chosen Highway', author: 'Lady Blomfield', by: 'chad' });
    expect(it1).toMatchObject({ state: 'wanted', title: 'The Chosen Highway' });
    const it2 = await repo.updateItem(it1.id, { state: 'researched' }, 'research: ISBN found');
    expect(it2.log.map((l) => l.state)).toEqual(['wanted', 'researched']);
    expect(await repo.findOpenByTitle('the chosen highway')).toMatchObject({ id: it1.id });
  });
});

describe('research', () => {
  it('title match: the asked words must all be in the record’s title', () => {
    expect(titleMatches('The Chosen Highway', 'The chosen highway')).toBe(true);
    expect(titleMatches('The Chosen Highway', 'Highways of the World')).toBe(false);
  });
  it('merges OpenLibrary and Google Books; a non-matching record is a candidate, not metadata', async () => {
    const fetchImpl = async (url) => ({ ok: true, json: async () => (url.includes('openlibrary')
      ? { docs: [{ key: '/works/OL1W', title: 'The Chosen Highway', author_name: ['Lady Blomfield'], first_publish_year: 1940, isbn: ['9780853980536'], publisher: ['George Ronald'], cover_i: 42, edition_count: 4, ia: ['chosenhighway00blom'] }] }
      : { items: [{ volumeInfo: { title: 'The Chosen Highway', description: 'Memoir.', infoLink: 'https://books.google.com/x' } }] }) });
    const r = await researchWork({ title: 'The Chosen Highway', author: 'Blomfield' }, { fetchImpl });
    expect(r).toMatchObject({ matched: true, isbn13: '9780853980536', publisher: 'George Ronald', year: 1940, editions: 4, description: 'Memoir.' });
    expect(r.sources.map((s) => s.kind)).toEqual(['openlibrary', 'google-books', 'archive.org']);
    expect(r.cover.url).toContain('/b/id/42-L.jpg');
    const miss = await researchWork({ title: 'An Unknown Pamphlet' }, { fetchImpl: async (url) => ({ ok: true, json: async () => (url.includes('openlibrary') ? { docs: [{ title: 'Something Else', author_name: ['X'] }] } : {}) }) });
    expect(miss).toMatchObject({ matched: false, isbn13: null });
    expect(miss.candidates[0]).toContain('Something Else');
  });
});

describe('intake', () => {
  it('prose gate: letters in any script count; a scan reads as a scan', () => {
    expect(proseGate(PROSE).ok).toBe(true);
    expect(proseGate('بسم الله '.repeat(400)).ok).toBe(true);
    expect(proseGate('', { pages: 200 })).toMatchObject({ ok: false, scan: true });
  });
  it('frontmatter carries what research found and leaves out what nothing states', () => {
    const md = toMarkdown({ title: 'The Chosen Highway', author: null, language: 'en', research: { publisher: 'George Ronald', isbn13: '9780853980536' }, sha256: 'abc', itemId: 7 }, 'Text.');
    expect(md).toContain('publisher: "George Ronald"'); expect(md).toContain('isbn: "9780853980536"'); expect(md).not.toContain('author:');
  });
  const deps = (o = {}) => ({ read: async (p) => (p.endsWith('.jpg') ? Buffer.from('jpg') : Buffer.from(o.text ?? PROSE)), shelves: () => ({ "Baha'i": ['Books', 'Papers'] }),
    choose: async () => o.shelf === undefined ? { religion: "Baha'i", collection: 'Books', why: 'a Bahá’í memoir' } : o.shelf,
    write: async ({ religion, collection }) => `${religion}/${collection}/the-chosen-highway.md`, ingest: async () => ({ documentId: 999, status: 'created' }), storeCover: vi.fn(async () => ({})) });
  it('a text source becomes a document on an existing shelf, with its cover; the item is ingested', async () => {
    const item = await repo.createItem({ title: 'The Chosen Highway' });
    await repo.updateItem(item.id, { state: 'source', original_path: '/x/abc.txt', sha256: 'abc', cover_path: '/c/1.jpg', research: { matched: true, title: 'The Chosen Highway', cover: { source: 'openlibrary' } } });
    const d = deps();
    const r = await deweyIntakeJob({ id: item.id }, d);
    expect(r).toMatchObject({ state: 'ingested', doc_id: 999, rel: "Baha'i/Books/the-chosen-highway.md" });
    expect(d.storeCover).toHaveBeenCalledWith(999, expect.any(Buffer), expect.objectContaining({ source: 'openlibrary' }));
    expect((await repo.getItem(item.id)).state).toBe('ingested');
  });
  it('a scanned PDF waits for OCR; no fitting shelf asks a person', async () => {
    const a = await repo.createItem({ title: 'A Scan' });
    await repo.updateItem(a.id, { state: 'source', original_path: '/x/s.pdf' });
    const scan = await deweyIntakeJob({ id: a.id }, { ...deps(), read: async () => Buffer.from('x') });
    expect(scan.state).toBe('failed');   // not a real PDF here: unreadable → failed with its reason (a real empty-text PDF → needs-ocr)
    const b = await repo.createItem({ title: 'Homeless' });
    await repo.updateItem(b.id, { state: 'source', original_path: '/x/b.txt' });
    expect((await deweyIntakeJob({ id: b.id }, deps({ shelf: null }))).state).toBe('needs-human');
  });
  it('a BOOK whose file is only a few pages waits for a person (the Apocalypse Unsealed preface, 10-18); a pilgrim note does not', async () => {
    const book = await repo.createItem({ title: 'The Apocalypse Unsealed', identified: { appraisal: { kind: 'book' } } });
    await repo.updateItem(book.id, { state: 'source', original_path: '/x/apocalypse.txt' });
    const r = await deweyIntakeJob({ id: book.id }, deps());
    expect(r).toMatchObject({ state: 'needs-human', why: 'book fragment' });
    const note = await repo.createItem({ title: 'Pilgrim notes', identified: { appraisal: { kind: 'pilgrim notes' } } });
    await repo.updateItem(note.id, { state: 'source', original_path: '/x/notes.txt' });
    expect((await deweyIntakeJob({ id: note.id }, deps())).state).toBe('ingested');
  });

  // Chad 10-18: "we do not want to add a book if it is only a sample of the beginning"
  const slpPages = (n) => Array.from({ length: n }, (_, k) => `<!-- pdf:${k + 1} -->\n\n${PROSE}`).join('\n\n');
  it('OCR text that stops at page 3 of 40 is not added', async () => {
    const it1 = await repo.createItem({ title: 'A Long Memoir', identified: { appraisal: { kind: 'memoir' }, slp: { path: '/ocr/m.slp.md', pages: 3 } } });
    await repo.updateItem(it1.id, { state: 'source', original_path: '/tank/library-originals/m.pdf' });
    const r = await deweyIntakeJob({ id: it1.id }, { ...deps({ text: slpPages(3) }), pdfPages: async () => 40, skipRecheck: true });
    expect(r).toMatchObject({ state: 'needs-human', why: 'partial' });
    expect((await repo.getItem(it1.id)).log.at(-1).why).toMatch(/stops at page 3 of 40/);
  });
  it('a short PDF of a long published book is not added', async () => {
    const big = await repo.createItem({ title: 'The Proud Helper', identified: { appraisal: { kind: 'book' }, slp: { path: '/ocr/p.slp.md', pages: 6 } } });
    await repo.updateItem(big.id, { state: 'source', original_path: '/tank/library-originals/p.pdf' });
    const text = slpPages(6).repeat(1) + ('\n\n' + PROSE).repeat(4);   // ~13,000 words: past the fragment rule, far short of 320 pages
    const r = await deweyIntakeJob({ id: big.id }, { ...deps({ text }), pdfPages: async () => 6, skipRecheck: true, research: async () => ({ matched: true, pages: 320 }) });
    expect(r).toMatchObject({ state: 'needs-human', why: 'partial' });
    expect((await repo.getItem(big.id)).log.at(-1).why).toMatch(/published book has about 320 pages/);
  });
});

import { previewSigns } from '../../api/lib/ops/dewey-intake-job.js';
describe('previewSigns', () => {
  it('a Google/publisher preview is recognised; ordinary prose is not', () => {
    expect(previewSigns('… Pages 23 to 180 are not shown in this preview. …')).toMatch(/not shown in this preview/);
    expect(previewSigns('You have reached the end of this sample.')).toBeTruthy();
    expect(previewSigns('He gave them a sample of the soil from the garden and a preview of the plans.')).toBeNull();
  });
});
