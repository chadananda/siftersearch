// keyword-fill — BM25 gaps closed from the coverage ledger: core documents first, live paragraphs only, one point per
// paragraph with the shared tokenizer, ledger re-measured after. Real SQLite for the repo; Qdrant and the ledger writer mocked.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

let raw;
vi.mock('../../api/lib/db.js', () => ({
  queryAll: vi.fn(async (sql, p = []) => raw.prepare(sql).all(...p)),
  queryOne: vi.fn(async (sql, p = []) => raw.prepare(sql).get(...p) ?? null),
  query: vi.fn(async () => ({})), transaction: vi.fn(async () => {}),
}));
const measured = [];
vi.mock('../../api/lib/repos/coverage-repo.js', () => ({
  measureDoc: vi.fn(async (id) => [{ layer: 'keyword', total: 2, indexed: 2 }]),
  saveCoverage: vi.fn(async (id) => { measured.push(id); }),
  saveUnindexable: vi.fn(async () => {}),
}));
vi.mock('../../api/lib/ops/coverage-job.js', () => ({ hypeVersion: async () => 'v' }));
vi.mock('../../api/lib/repos/activity-repo.js', () => ({ logActivity: vi.fn() }));
const { keywordGapDocs, keywordRowsForDoc } = await import('../../api/lib/repos/keyword-repo.js');
const { keywordFillJob, keywordPoint } = await import('../../api/lib/ops/keyword-fill-job.js');

beforeEach(() => {
  measured.length = 0;
  raw = new Database(':memory:');
  raw.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, language TEXT, religion TEXT, collection TEXT, author TEXT, scope TEXT, deleted_at TEXT, duplicate_of INTEGER);
    CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, text TEXT, authors TEXT, deleted_at TEXT, is_duplicate INTEGER);
    CREATE TABLE index_coverage (doc_id INTEGER, layer TEXT, total INTEGER, indexed INTEGER, core INTEGER);
    INSERT INTO docs VALUES (1,'en','Islam','Core','Muhammad','primary',NULL,NULL), (2,'en','Islam','Lit','X','primary',NULL,NULL),
      (3,'en','Islam','Lit','Y','primary',NULL,NULL), (4,'en','Other','Web','Z','supplemental',NULL,NULL);
    INSERT INTO content VALUES (10,1,'In the name of God',NULL,NULL,0), (11,1,'the Merciful',NULL,NULL,0), (12,1,'gone',NULL,'2026',0),
      (13,1,'copy',NULL,NULL,1), (14,1,'',NULL,NULL,0);
    INSERT INTO index_coverage VALUES (1,'keyword',2,0,1), (2,'keyword',900,0,0), (3,'keyword',5,5,0), (4,'keyword',9,0,0), (2,'phrase',900,0,0);`);
});

describe('keyword fill', () => {
  it('gap documents: core first, then the largest gap; complete and supplemental documents left out', async () => {
    expect((await keywordGapDocs()).map((d) => d.id)).toEqual([1, 2]);
    expect((await keywordGapDocs({ scope: 'supplemental' })).map((d) => d.id)).toEqual([4]);
  });
  it('significant gaps only: nothing indexed or > max(20, 2%) short — not a few punctuation-only paragraphs', async () => {
    raw.exec(`INSERT INTO docs VALUES (5,'en','Islam','Lit','W','primary',NULL,NULL), (6,'en','Islam','Lit','V','primary',NULL,NULL);
      INSERT INTO index_coverage VALUES (5,'keyword',138000,137780,0), (6,'keyword',138000,130000,0);`);
    expect((await keywordGapDocs({ significant: true })).map((d) => d.id)).toEqual([1, 6, 2]);
  });
  it('a document\'s rows: live, not duplicate, not empty', async () => {
    expect((await keywordRowsForDoc(1)).map((r) => r.id)).toEqual([10, 11]);
  });
  it('a point: id = paragraph id, sparse bm25, payload as the indexer writes it; no tokens → no point', () => {
    const p = keywordPoint({ id: 10, doc_id: 1, text: 'In the name of God', language: 'en', religion: 'Islam', collection: 'Core', author: 'Muhammad', scope: 'primary' }, 74);
    expect(p.id).toBe(10);
    expect(p.vector.bm25.indices.length).toBe(5);
    expect(p.payload).toMatchObject({ paragraph_id: 10, doc_id: 1, religion: 'Islam', author: 'Muhammad', scope: 'primary' });
    expect(keywordPoint({ id: 1, text: '— · —' }, 74)).toBeNull();
  });
  it('upserts each gap document\'s paragraphs and re-measures it', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({ url, ids: JSON.parse(init.body).points.map((p) => p.id) }); return { ok: true, json: async () => ({}) }; };
    const stats = await keywordFillJob({ limit: 1 }, { fetchImpl });
    expect(calls).toEqual([{ url: expect.stringContaining('/collections/paragraphs_kw/points?wait=true'), ids: [10, 11] }]);
    expect(measured).toEqual([1]);
    expect(stats).toMatchObject({ docs: 1, of: 2, points: 2, still_short: 0 });
  });
  it('a document indexed except for rows with no words is only recorded — nothing re-sent', async () => {
    raw.exec(`UPDATE index_coverage SET total = 3, indexed = 2 WHERE doc_id = 1 AND layer = 'keyword'; INSERT INTO content VALUES (15,1,'|',NULL,NULL,0);`);
    const calls = [];
    const stats = await keywordFillJob({ limit: 1 }, { fetchImpl: async (u) => { calls.push(u); return { ok: true, json: async () => ({}) }; } });
    expect(calls).toEqual([]);
    expect(stats).toMatchObject({ docs: 1, tokenless: 1, recorded_only: 1, points: 0 });
  });
});
