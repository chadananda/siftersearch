// metadata-gaps: live canonical books search cannot tier (no religion, or a digits-only author) — run on a real in-memory SQLite.
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';

const mem = new Database(':memory:');
mem.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, religion TEXT, collection TEXT, source_site TEXT,
  paragraph_count INTEGER, doc_role TEXT, deleted_at TEXT, duplicate_of INTEGER)`);
const ins = mem.prepare('INSERT INTO docs (id,title,author,religion,collection,source_site,paragraph_count,doc_role,deleted_at,duplicate_of) VALUES (?,?,?,?,?,?,?,?,?,?)');
[
  [1, 'Book With Numeric Author', '4461', "Bahá'í", null, null, 300, null, null, null],
  [2, 'Book With No Religion', 'A. Writer', null, 'Pilgrim Notes', 'oceanlibrary.com', 200, null, null, null],
  [3, 'Blank Religion', 'B. Writer', '  ', null, null, 50, null, null, null],
  [4, 'Fine Book', 'C. Writer', "Bahá'í", null, null, 900, null, null, null],
  [5, 'Author With Digits In Name', '1st Edition Press', "Bahá'í", null, null, 10, null, null, null],
  [6, 'Deleted Gap', '12', null, null, null, 10, null, '2026-01-01', null],
  [7, 'Duplicate Gap', '12', null, null, null, 10, null, null, 1],
  [8, 'Scraped Gap', '12', null, null, 'example.org', 10, null, null, null],
  [9, 'Metadata Row', '12', null, null, null, 0, 'metadata', null, null],
].forEach((r) => ins.run(...r));

vi.mock('../../api/lib/db.js', () => ({
  queryAll: vi.fn(async (sql, params) => mem.prepare(sql).all(...params)),
  queryOne: vi.fn(async () => null), query: vi.fn(async () => ({ changes: 0 })),
}));
vi.mock('../../api/lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
const { metadataGaps } = await import('../../api/lib/docs-repo.js');
const { REPORTS } = await import('../../api/lib/ops/reports.js');

describe('metadata gaps', () => {
  it('finds live canonical books with no religion or a digits-only author, biggest first', async () => {
    expect((await metadataGaps()).map((r) => r.id)).toEqual([1, 2, 3]);
  });
  it('the ops report names each gap and counts them', async () => {
    const r = await REPORTS['metadata-gaps']();
    expect(r.counts).toEqual({ 'numeric-author': 1, 'no-religion': 2 });
    expect(r.rows.find((x) => x.id === 1).gaps).toEqual(['numeric-author']);
    expect(r.truncated).toBe(false);
  });
  it('scope live includes scraped copies', async () => {
    expect((await metadataGaps({ scope: 'live' })).map((r) => r.id)).toContain(8);
  });
});
