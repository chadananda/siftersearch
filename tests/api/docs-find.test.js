// findDocuments — title/author lookup in SQLite (docs_fts, migration 142) instead of a search engine's documents index.
// Real in-memory SQLite: the FTS table, its triggers and the scope policy are what is under test.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as dbmod from '../../api/lib/db.js';
import Database from 'better-sqlite3';

const db = new Database(':memory:');
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async (sql, params = []) => db.prepare(sql).run(...params)),
  queryAll: vi.fn(async (sql, params = []) => db.prepare(sql).all(...params)),
  queryOne: vi.fn(async (sql, params = []) => db.prepare(sql).get(...params)),
}));
vi.mock('../../api/lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

beforeAll(async () => {
  db.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, religion TEXT, collection TEXT, language TEXT, year TEXT,
    description TEXT, file_path TEXT, file_hash TEXT, paragraph_count INTEGER, source_site TEXT, duplicate_of INTEGER, deleted_at TEXT,
    slug TEXT, created_at TEXT, updated_at TEXT, doc_role TEXT)`);
  db.exec('CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, deleted_at TEXT)');
  const ins = db.prepare('INSERT INTO docs (id, title, author, religion, collection, source_site, duplicate_of, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  ins.run(1, 'The Dawn-Breakers', 'Nabíl-i-Zarandí', "Baha'i", 'Histories', null, null, null);
  ins.run(2, 'Gleanings from the Writings of Bahá’u’lláh', 'Bahá’u’lláh', "Baha'i", 'Writings', 'oceanlibrary.com', null, null);
  ins.run(3, 'Dawn over Mount Hira', 'Marzieh Gail', "Baha'i", 'Biographies', 'bahai-library.com', null, null);
  ins.run(4, 'The Dawn-Breakers (old copy)', 'Nabíl', "Baha'i", 'Histories', null, 1, null);
  ins.run(5, 'Deleted Dawn', 'x', "Baha'i", 'x', null, null, '2026-01-01');
  const { migrations } = await import('../../api/lib/migrations/v72-v90.js');
  await migrations[142]();
});

describe('findDocuments (SQLite FTS)', () => {
  it('finds by title words as prefixes, diacritics folded, title ranked first', async () => {
    const { findDocuments } = await import('../../api/lib/docs-repo.js');
    const r = await findDocuments('dawn break', { fields: ['id', 'title'] });
    expect(r.docs.map((d) => d.id)).toEqual([1]);
    const b = await findDocuments('bahaullah gleanings', { fields: ['id'] });
    expect(b.docs.map((d) => d.id)).toEqual([2]);
  });
  it('applies the visibility scope: no duplicates, no tombstones', async () => {
    const { findDocuments } = await import('../../api/lib/docs-repo.js');
    const r = await findDocuments('dawn', { fields: ['id'] });
    expect(r.docs.map((d) => d.id).sort()).toEqual([1, 3]);
    const c = await findDocuments('dawn', { scope: 'canonical', fields: ['id'] });
    expect(c.docs.map((d) => d.id)).toEqual([1]);
  });
  it('ranks the library and OceanLibrary copies ahead of scraped pages with shorter titles', async () => {
    const { findDocuments } = await import('../../api/lib/docs-repo.js');
    db.prepare("INSERT INTO docs (id, title, author, religion, source_site) VALUES (9, 'Tag: Dawn-Breakers', 'x', 'Baha''i', 'bahai-library.com')").run();
    const r = await findDocuments('dawn breakers', { fields: ['id'] });
    expect(r.docs[0].id).toBe(1);
    expect(r.docs.map((d) => d.id)).toContain(9);
  });
  it('the NAMED work wins over a canonical title that merely contains the words', async () => {
    const { findDocuments } = await import('../../api/lib/docs-repo.js');
    db.prepare("INSERT INTO docs (id, title, author, religion, source_site) VALUES (10, 'Letters of the Living, Dawn-Breakers, Quddús', 'y', 'Baha''i', NULL)").run();
    expect((await findDocuments('the dawn-breakers', { fields: ['id'] })).docs[0].id).toBe(1);
    expect((await findDocuments('dawn breakers', { fields: ['id', 'title'], limit: 1 })).docs).toEqual([{ id: 1, title: 'The Dawn-Breakers' }]);
  });
  it('stays current through the triggers', async () => {
    const { findDocuments } = await import('../../api/lib/docs-repo.js');
    db.prepare('UPDATE docs SET title = ? WHERE id = 3').run('Mount Carmel Notes');
    expect((await findDocuments('hira', { fields: ['id'] })).docs).toEqual([]);
    expect((await findDocuments('carmel', { fields: ['id'] })).docs.map((d) => d.id)).toEqual([3]);
  });
  it('neutralises FTS syntax in user text', async () => {
    const { ftsQuery } = await import('../../api/lib/docs-repo.js');
    expect(ftsQuery('"Dawn" OR NEAR(*)')).toBe('"dawn"* "near"*');
  });
});

describe('docIdsInYearRange', () => {
  it('live docs in the range only; no range → null', async () => {
    db.exec(`UPDATE docs SET year = '1932' WHERE id = 1; UPDATE docs SET year = '1950' WHERE id = 3; UPDATE docs SET year = '1932' WHERE id IN (4, 5)`);
    const { docIdsInYearRange } = await import('../../api/lib/docs-repo.js');
    expect(await docIdsInYearRange({ yearFrom: 1930, yearTo: 1940 })).toEqual([1]);      // 4 is a duplicate, 5 deleted
    expect((await docIdsInYearRange({ yearFrom: 1940 })).sort()).toEqual([3]);
    expect(await docIdsInYearRange({})).toBeNull();
  });
});

describe('setDocCover', () => {
  it('sets an image-service URL on a live doc; refuses other URLs; clears with null', async () => {
    try { db.exec('ALTER TABLE docs ADD COLUMN cover_url TEXT'); } catch { /* exists */ }
    const { setDocCover } = await import('../../api/lib/docs-repo.js');
    await setDocCover(1, '/img/covers/1?v=abc123');
    expect(db.prepare('SELECT cover_url FROM docs WHERE id = 1').get().cover_url).toBe('/img/covers/1?v=abc123');
    await expect(setDocCover(1, 'https://elsewhere.example/x.png')).rejects.toThrow('not an image-service URL');
    await setDocCover(5, '/img/covers/5?v=abc');                                  // deleted doc: untouched
    expect(db.prepare('SELECT cover_url FROM docs WHERE id = 5').get().cover_url).toBeNull();
    await setDocCover(1, null);
    expect(db.prepare('SELECT cover_url FROM docs WHERE id = 1').get().cover_url).toBeNull();
  });
});

// THE 573-SECOND QUERY (10-17): Dewey searched a document's first line as a "title"; its words became prefix terms
// ("the"* "of"* …) matching nearly every row, and the ORDER BY re-ran the FTS MATCH once PER ROW — quadratic; better-sqlite3
// is synchronous, so the API froze for 9½ minutes (health [PAGE], restart storm). This must stay fast at library scale.
describe('findDocuments never blocks (the 10-17 freeze)', () => {
  beforeAll(() => {
    const ins = db.prepare('INSERT INTO docs (id, title, author, religion, collection, source_site, duplicate_of, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const words = 'the of and a to in his notes letters pilgrim haifa visit guardian world faith history account talks'.split(' ');
    // long descriptions with many distinct words sharing short prefixes — what makes one prefix MATCH expensive in production
    const vocab = Array.from({ length: 4000 }, (_, k) => ['the', 'of', 'an', 'to', 'in', 'pil', 'gua', 'wor'][k % 8] + (k * 2654435761 % 100000).toString(36));
    const upd = db.prepare('UPDATE docs SET description = ? WHERE id = ?');
    db.transaction(() => { for (let i = 0; i < 20000; i++) {
      ins.run(1000 + i, `The ${words[i % 17]} of the ${words[(i * 7) % 17]} and a ${words[(i * 3) % 17]} ${i}`, 'An author of the faith', "Baha'i", 'Books', 'bahai-library.com', null, null);
      upd.run(Array.from({ length: 60 }, (_, k) => vocab[(i * 31 + k * 97) % 4000]).join(' ') + ' the of and a', 1000 + i);
    } })();
  });
  it('a long, stopword-heavy first line as a title answers in well under a second', async () => {
    const { findDocuments } = await import('../../api/lib/docs-repo.js');
    const t0 = performance.now();
    await findDocuments('Excerpts from the notes of Ben Levy, an American in the Armed Forces in Germany. Pilgrimage to the Holy Land and a visit of the world', { fields: ['id', 'title'], limit: 8 });
    await findDocuments('the of and a to in', { fields: ['id', 'title'], limit: 8 });
    expect(performance.now() - t0).toBeLessThan(300);
  });
  it('the FTS MATCH runs ONCE per search — never per row (the structural cause of the freeze)', async () => {
    const { findDocuments } = await import('../../api/lib/docs-repo.js');
    dbmod.queryAll.mockClear();
    await findDocuments('Dawn Breakers', { fields: ['id', 'title'] });
    const sql = dbmod.queryAll.mock.calls.map(([q]) => q).find((q) => /FROM docs d/.test(q));
    expect((sql.match(/\bMATCH\b/g) || []).length).toBe(1);
    expect(sql).not.toMatch(/MATCH \? AND rowid/);
  });
  it('ftsQuery drops stopwords and 1–2-letter prefixes, keeps ≤ 8 terms', async () => {
    const { ftsQuery } = await import('../../api/lib/docs-repo.js');
    expect(ftsQuery('The Dawn of a New Day')).toBe('"dawn"* "new"* "day"*');
    expect(ftsQuery('Of the')).not.toBe('');
    expect(ftsQuery('one two three four five six seven eight nine ten eleven twelve').split(' ')).toHaveLength(8);
  });
});
