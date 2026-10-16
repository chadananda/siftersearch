// coverage-repo — the index coverage ledger over real SQLite: one document measured across every layer, saved, summarised.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

let raw;
const SCHEMA = `
CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, language TEXT, religion TEXT, scope TEXT, deleted_at TEXT, duplicate_of INTEGER, author TEXT, collection TEXT, source_site TEXT, authority INTEGER);
CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, synced INTEGER, embedding BLOB, context TEXT, hyp_questions TEXT, hyp_model TEXT,
  extract_model TEXT, translation TEXT, deleted_at TEXT, is_duplicate INTEGER);
CREATE TABLE entity_mentions_v2 (id INTEGER PRIMARY KEY, doc_id INTEGER, para_id TEXT, status TEXT);
CREATE TABLE concept_claims (id INTEGER PRIMARY KEY, doc_id INTEGER, para_id TEXT, proof_ok INTEGER);
CREATE TABLE content_alignment (id INTEGER PRIMARY KEY, trans_id INTEGER, orig_id INTEGER, retired_at INTEGER);
CREATE TABLE doc_sections (id INTEGER PRIMARY KEY, doc_id INTEGER, paragraphs INTEGER);
CREATE TABLE index_coverage (doc_id INTEGER NOT NULL, layer TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0, generated INTEGER NOT NULL DEFAULT 0,
  current INTEGER NOT NULL DEFAULT 0, indexed INTEGER NOT NULL DEFAULT 0, version TEXT, core INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (doc_id, layer)) WITHOUT ROWID;
`;
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async (sql, p = []) => { raw.prepare(sql).run(...p); return {}; }),
  queryAll: vi.fn(async (sql, p = []) => raw.prepare(sql).all(...p)),
  queryOne: vi.fn(async (sql, p = []) => raw.prepare(sql).get(...p) ?? null),
  transaction: vi.fn(async (stmts) => { raw.transaction(() => { for (const s of stmts) raw.prepare(s.sql).run(...(s.args || [])); })(); }),
}));
const repo = await import('../../api/lib/repos/coverage-repo.js');
const counts = { paragraphs_kw: 3, phrases: 9, hype: 14, concepts: 2 };
const count = async (c) => counts[c];

beforeEach(() => {
  raw = new Database(':memory:'); raw.exec(SCHEMA);
  raw.prepare("INSERT INTO docs VALUES (1, 'Book', 'en', 'Baha''i', 'primary', NULL, NULL, 'Some Pilgrim', NULL, NULL, 3), (2, 'Lawh', 'fa', 'Baha''i', 'primary', NULL, NULL, 'Bahá’u’lláh', NULL, NULL, 10)").run();
  const ins = raw.prepare('INSERT INTO content (id, doc_id, synced, embedding, context, hyp_questions, hyp_model, extract_model, translation) VALUES (?,?,?,?,?,?,?,?,?)');
  ins.run(1, 1, 1, Buffer.from([1]), 'ctx', '["q1","q2"]', 'v15', 'x', null);
  ins.run(2, 1, 1, Buffer.from([1]), null, '["q"]', 'v14', null, null);
  ins.run(3, 1, 0, null, null, null, null, null, null);
  ins.run(4, 2, 1, null, null, null, null, null, 'English rendering');
  raw.prepare("INSERT INTO entity_mentions_v2 (doc_id, para_id, status) VALUES (1, 'p1', 'active'), (1, 'p1', 'active')").run();
  raw.prepare("INSERT INTO concept_claims (doc_id, para_id, proof_ok) VALUES (1, 'p1', 1), (1, 'p2', 0)").run();
  raw.prepare('INSERT INTO content_alignment (trans_id, orig_id) VALUES (1, 4)').run();
});

describe('coverage ledger', () => {
  it('measures one document across every layer', async () => {
    const m = Object.fromEntries((await repo.measureDoc(1, { hypeVersion: 'v15', count })).map((r) => [r.layer, r]));
    expect(m.text).toMatchObject({ total: 3, generated: 3, indexed: 2 });
    expect(m.embedding).toMatchObject({ generated: 2, indexed: 2 });
    expect(m.keyword.indexed).toBe(3);
    expect(m.hype).toMatchObject({ generated: 2, current: 1, indexed: 14, version: 'v15' });
    expect(m.entities).toMatchObject({ generated: 1, indexed: 1 });
    expect(m.concepts).toMatchObject({ generated: 1, indexed: 2 });
    expect(m.alignment.generated).toBe(1);
    expect(m.translation.total).toBe(0);                 // English book: no translation layer
    expect(repo.LAYERS.every((l) => m[l])).toBe(true);
    expect(m.text.core).toBe(0);
    expect((await repo.measureDoc(2, { hypeVersion: 'v15', count }))[0].core).toBe(1);   // doctrinal core flagged
  });
  it('a non-English document counts its translations; save + summary + stalest', async () => {
    const t = (await repo.measureDoc(2, { hypeVersion: 'v15', count })).find((r) => r.layer === 'translation');
    expect(t).toMatchObject({ total: 1, generated: 1 });
    expect(await repo.stalestDocs(10)).toEqual([1, 2]);
    await repo.saveCoverage(1, await repo.measureDoc(1, { hypeVersion: 'v15', count }), 100);
    expect(await repo.stalestDocs(10)).toEqual([2, 1]);  // unmeasured first, then the stalest
    const s = await repo.coverageSummary();
    expect(s).toMatchObject({ live_docs: 2, measured_docs: 1 });
    expect(s.rows.find((r) => r.layer === 'hype')).toMatchObject({ total: 3, generated: 2, current: 1 });
  });
});
