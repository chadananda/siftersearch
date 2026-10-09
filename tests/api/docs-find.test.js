// findDocuments — title/author lookup in SQLite (docs_fts, migration 142) instead of a search engine's documents index.
// Real in-memory SQLite: the FTS table, its triggers and the scope policy are what is under test.
import { describe, it, expect, vi, beforeAll } from 'vitest';
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
  it('stays current through the triggers', async () => {
    const { findDocuments } = await import('../../api/lib/docs-repo.js');
    db.prepare('UPDATE docs SET title = ? WHERE id = 3').run('Mount Carmel Notes');
    expect((await findDocuments('hira', { fields: ['id'] })).docs).toEqual([]);
    expect((await findDocuments('carmel', { fields: ['id'] })).docs.map((d) => d.id)).toEqual([3]);
  });
  it('neutralises FTS syntax in user text', async () => {
    const { ftsQuery } = await import('../../api/lib/docs-repo.js');
    expect(ftsQuery('"Dawn" OR NEAR(*)')).toBe('"dawn"* "or"* "near"*');
  });
});
