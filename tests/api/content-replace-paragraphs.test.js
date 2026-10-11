// replaceParagraphsByDoc: a document is never left without paragraphs. The old delete-all-then-insert order left 10,124
// bahai-library docs empty from June to October when runs were interrupted between the two steps (Chad 10-11: "figure out
// what failed before and fix it. We don't want a 'hollow-mode' pass every time").
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

let db;
let failInsert = false;
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async (sql, args = []) => ({ changes: db.prepare(sql).run(...args).changes })),
  queryAll: vi.fn(async (sql, args = []) => db.prepare(sql).all(...args)),
  queryOne: vi.fn(async (sql, args = []) => db.prepare(sql).get(...args) ?? null),
  transaction: vi.fn(async (stmts) => {
    if (failInsert) throw new Error('writer: other side closed');
    return db.transaction((ss) => ss.map(({ sql, args = [] }) => db.prepare(sql).run(...args)))(stmts);
  }),
}));

const cols = `id INTEGER PRIMARY KEY, doc_id INTEGER, paragraph_index INTEGER, text TEXT, content_hash TEXT, normalized_hash TEXT,
  heading TEXT, blocktype TEXT, embedding BLOB, embedding_model TEXT, hyp_thesis TEXT, hyp_questions TEXT, context TEXT,
  context_model TEXT, enhanced_synced INTEGER, external_para_id TEXT, pdf_page INTEGER, block_attrs TEXT, synced INTEGER,
  created_at TEXT, updated_at TEXT, deleted_at TEXT`;
const para = (i, text) => ({ paragraphIndex: i, text, blocktype: 'paragraph' });
const texts = (docId) => db.prepare('SELECT text FROM content WHERE doc_id = ? ORDER BY paragraph_index, id').all(docId).map((r) => r.text);

describe('replaceParagraphsByDoc', () => {
  beforeEach(() => {
    failInsert = false;
    db = new Database(':memory:');
    db.exec(`CREATE TABLE content (${cols})`);
    const ins = db.prepare('INSERT INTO content (doc_id, paragraph_index, text) VALUES (?, ?, ?)');
    ins.run(7, 0, 'old one'); ins.run(7, 1, 'old two'); ins.run(8, 0, 'other doc');
  });

  it('ends with exactly the new paragraphs and leaves other documents alone', async () => {
    const { content } = await import('../../api/lib/content.js');
    const r = await content.replaceParagraphsByDoc(7, [para(0, 'new one'), para(1, 'new two'), para(2, 'new three')]);
    expect(r).toEqual({ inserted: 3, removed: 2 });
    expect(texts(7)).toEqual(['new one', 'new two', 'new three']);
    expect(texts(8)).toEqual(['other doc']);
  });

  it('a failed insert keeps the old paragraphs (never an empty document)', async () => {
    const { content } = await import('../../api/lib/content.js');
    failInsert = true;
    await expect(content.replaceParagraphsByDoc(7, [para(0, 'new one')])).rejects.toThrow(/other side closed/);
    expect(texts(7)).toEqual(['old one', 'old two']);
  });
});
