// sections-repo — sub-documents (migration 149) over real SQLite: replace per document, find by section + book words.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

let raw;
const SCHEMA = `
CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, source_site TEXT, deleted_at TEXT, duplicate_of INTEGER, religion TEXT, scope TEXT, paragraph_count INTEGER);
CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, paragraph_index INTEGER, heading TEXT, block_attrs TEXT, external_para_id TEXT, deleted_at TEXT);
CREATE TABLE doc_sections (id INTEGER PRIMARY KEY, doc_id INTEGER NOT NULL, ord INTEGER NOT NULL, level INTEGER, title TEXT NOT NULL,
  start_index INTEGER NOT NULL, end_index INTEGER NOT NULL, paragraphs INTEGER NOT NULL, first_para_id INTEGER,
  source TEXT NOT NULL DEFAULT 'heading-run', UNIQUE (doc_id, ord));
CREATE VIRTUAL TABLE doc_sections_fts USING fts5(title, book, tokenize = 'unicode61 remove_diacritics 2');
CREATE TABLE doc_structure (doc_id INTEGER PRIMARY KEY, sections INTEGER NOT NULL DEFAULT 0, source TEXT, indexed_at INTEGER NOT NULL);
`;
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async (sql, p = []) => { const r = raw.prepare(sql).run(...p); return { rows: [{ changes: r.changes }] }; }),
  queryAll: vi.fn(async (sql, p = []) => raw.prepare(sql).all(...p)),
  queryOne: vi.fn(async (sql, p = []) => raw.prepare(sql).get(...p) ?? null),
  transaction: vi.fn(async (stmts) => { raw.transaction(() => { for (const s of stmts) raw.prepare(s.sql).run(...(s.args || [])); })(); }),
}));
const repo = await import('../../api/lib/repos/sections-repo.js');
const { sectionsFromRows } = await import('../../api/lib/sections.js');

beforeEach(() => {
  raw = new Database(':memory:'); raw.exec(SCHEMA);
  raw.prepare("INSERT INTO docs (id, title, source_site) VALUES (21310, 'God Passes By', NULL), (20894, 'The World Order of Bahá’u’lláh', 'oceanlibrary.com')").run();
  const ins = raw.prepare('INSERT INTO content (id, doc_id, paragraph_index, heading) VALUES (?, ?, ?, ?)');
  [['Foreword'], ['Foreword'], ['The Báb’s Ministry'], ['Retrospect and Prospect'], ['Retrospect and Prospect']].forEach(([h], i) => ins.run(500 + i, 21310, i, h));
  ins.run(900, 20894, 0, 'The Dispensation of Bahá’u’lláh');
});

describe('sections-repo', () => {
  it('a document READ is marked even with no structure; unread documents are what the structure loop queues', async () => {
    expect(await repo.docsWithoutStructure()).toEqual([20894, 21310]);
    await repo.replaceSections(20894, 'The World Order of Bahá’u’lláh', []);
    expect(raw.prepare('SELECT doc_id, sections, source FROM doc_structure').all()).toEqual([{ doc_id: 20894, sections: 0, source: null }]);
    expect(await repo.docsWithoutStructure()).toEqual([21310]);
    raw.prepare("UPDATE docs SET religion = 'Baha''i', paragraph_count = 900 WHERE id = 20894").run();
    const s = await repo.structureSummary();
    expect(s.byTradition).toEqual([{ religion: "Baha'i", scope: 'primary', docs: 1, with_sections: 0, long_without: 1, paragraphs_without: 900 }]);
    expect(s.longestWithout.map((d) => d.id)).toEqual([20894]);
  });
  it('builds from stored headings and finds a part by its name and its book’s', async () => {
    const n = await repo.replaceSections(21310, 'God Passes By', sectionsFromRows(await repo.headingRowsForDoc(21310)));
    expect(n).toBe(3);
    const hit = (await repo.findSections('god passes by retrospect'))[0];
    expect(hit).toMatchObject({ doc_id: 21310, book: 'God Passes By', title: 'Retrospect and Prospect', start_index: 3, end_index: 4, first_para_id: 503 });
    expect((await repo.sectionsOfDoc(21310)).map((s) => s.title)).toEqual(['Foreword', 'The Báb’s Ministry', 'Retrospect and Prospect']);
  });
  it('apostrophes and diacritics fold: "Dispensation of Bahaullah" finds the section', async () => {
    await repo.replaceSections(20894, 'The World Order of Bahá’u’lláh', sectionsFromRows(await repo.headingRowsForDoc(20894)));
    expect((await repo.findSections('Dispensation of Bahaullah'))[0]).toMatchObject({ doc_id: 20894, title: 'The Dispensation of Bahá’u’lláh' });
  });
  it('a rebuild replaces, never duplicates (FTS rows included)', async () => {
    const s = sectionsFromRows(await repo.headingRowsForDoc(21310));
    await repo.replaceSections(21310, 'God Passes By', s);
    await repo.replaceSections(21310, 'God Passes By', s);
    expect(raw.prepare('SELECT COUNT(*) n FROM doc_sections').get().n).toBe(3);
    expect(raw.prepare('SELECT COUNT(*) n FROM doc_sections_fts').get().n).toBe(3);
  });
  it('a retired book’s sections are not found', async () => {
    await repo.replaceSections(21310, 'God Passes By', sectionsFromRows(await repo.headingRowsForDoc(21310)));
    raw.prepare('UPDATE docs SET duplicate_of = 1 WHERE id = 21310').run();
    expect(await repo.findSections('foreword')).toEqual([]);
  });
});

describe('ranking', () => {
  it('the whole part named outranks a one-paragraph mention elsewhere (10-15)', async () => {
    raw.prepare("INSERT INTO docs (id, title, source_site) VALUES (1, 'Directives from the Guardian', NULL)").run();
    raw.prepare('INSERT INTO content (id, doc_id, paragraph_index, heading) VALUES (1, 1, 0, ?)').run('Dispensation of Bahá’u’lláh');
    for (let i = 1; i < 40; i++) raw.prepare('INSERT INTO content (id, doc_id, paragraph_index, heading) VALUES (?, 20894, ?, ?)').run(900 + i, i, 'The Dispensation of Bahá’u’lláh');
    await repo.replaceSections(1, 'Directives from the Guardian', sectionsFromRows(await repo.headingRowsForDoc(1)));
    await repo.replaceSections(20894, 'The World Order of Bahá’u’lláh', sectionsFromRows(await repo.headingRowsForDoc(20894)));
    const hits = await repo.findSections('Dispensation of Bahaullah');
    expect(hits[0]).toMatchObject({ doc_id: 20894, paragraphs: 40 });
    expect(hits[0]._site).toBeUndefined();
  });
});
