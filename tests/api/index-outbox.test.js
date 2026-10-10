// Index outbox (migration 143 + lib/index-outbox.js): every way a paragraph leaves the corpus enqueues it BY TRIGGER, and
// the drain removes it from its own Meili index and every Qdrant paragraph collection. Real in-memory SQLite.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const db = new Database(':memory:');
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async (sql, params = []) => db.prepare(sql).run(...params)),
  queryAll: vi.fn(async (sql, params = []) => db.prepare(sql).all(...params)),
  queryOne: vi.fn(async (sql, params = []) => db.prepare(sql).get(...params)),
  transaction: vi.fn(async (stmts) => db.transaction(() => stmts.forEach((s) => db.prepare(s.sql).run(...(s.args || []))))()),
}));
vi.mock('../../api/lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const outbox = () => db.prepare('SELECT para_id FROM index_outbox ORDER BY para_id').all().map((r) => r.para_id);

beforeAll(async () => {
  db.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, source_site TEXT, deleted_at TEXT, duplicate_of INTEGER)`);
  db.exec(`CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, text TEXT, deleted_at TEXT, is_duplicate INTEGER DEFAULT 0)`);
  const { migrations } = await import('../../api/lib/migrations/v72-v90.js');
  await migrations[143]();
});
beforeEach(() => {
  db.exec('DELETE FROM content; DELETE FROM docs; DELETE FROM index_outbox');   // outbox last: the deletes enqueue themselves
  db.exec(`INSERT INTO docs (id, title, source_site) VALUES (1, 'Library book', NULL), (2, 'Scraped page', 'bahai-library.com')`);
  db.exec(`INSERT INTO content (id, doc_id, text) VALUES (10, 1, 'a'), (11, 1, 'b'), (12, 1, 'c'), (20, 2, 'd'), (21, 2, 'e')`);
  db.exec('DELETE FROM index_outbox');
});

describe('index outbox — triggers', () => {
  it('a soft delete, a duplicate mark and a hard delete each enqueue the paragraph', () => {
    db.exec(`UPDATE content SET deleted_at = '2026-10-09' WHERE id = 10`);
    db.exec(`UPDATE content SET is_duplicate = 1 WHERE id = 11`);
    db.exec(`DELETE FROM content WHERE id = 12`);
    expect(outbox()).toEqual([10, 11, 12]);
  });
  it('ordinary updates (sync flags, text) enqueue nothing', () => {
    db.exec(`UPDATE content SET text = 'changed' WHERE id = 10`);
    expect(outbox()).toEqual([]);
  });
  it('a whole document leaving takes its paragraphs with it', () => {
    db.exec(`UPDATE docs SET deleted_at = '2026-10-09' WHERE id = 2`);
    expect(outbox()).toEqual([20, 21]);
    db.exec(`UPDATE docs SET duplicate_of = 2 WHERE id = 1`);
    expect(outbox()).toEqual([10, 11, 12, 20, 21]);
  });
});

describe('index outbox — drain', () => {
  it('removes dead rows from their own Meili index and all Qdrant collections, skips live-again rows, clears the queue', async () => {
    const { drainIndexOutbox } = await import('../../api/lib/index-outbox.js');
    db.exec(`UPDATE content SET deleted_at = '2026-10-09' WHERE id IN (10, 20)`);
    db.exec(`UPDATE content SET deleted_at = NULL WHERE id = 10`);   // restored: live again → its upsert wins
    const meiliCalls = [];
    const meili = { index: (ix) => ({ deleteDocuments: async (ids) => { meiliCalls.push([ix, ids]); } }) };
    const qdrantCalls = [];
    const qdrant = async (path, body) => { qdrantCalls.push([path, body.filter.must[0].match.any]); };
    const r = await drainIndexOutbox({ meili, qdrant, registry: { 'bahai-library.com': { meili_index_prefix: 'balib' } } });
    expect(r).toMatchObject({ removed: 1, skippedLive: 1 });
    expect(meiliCalls).toEqual([['siftersearch_balib_paragraphs', [20]]]);
    expect(qdrantCalls.map(([p]) => p.split('/')[2])).toEqual(['phrases', 'paragraphs_kw', 'hype']);
    expect(qdrantCalls.every(([, ids]) => ids.length === 1 && ids[0] === 20)).toBe(true);
    expect(outbox()).toEqual([]);
  });
  it('an engine failure keeps the rows queued for the next tick', async () => {
    const { drainIndexOutbox } = await import('../../api/lib/index-outbox.js');
    db.exec(`DELETE FROM content WHERE id = 12`);
    const meili = { index: () => ({ deleteDocuments: async () => { throw new Error('meili down'); } }) };
    await expect(drainIndexOutbox({ meili })).rejects.toThrow('meili down');
    expect(outbox()).toEqual([12]);
  });
});
