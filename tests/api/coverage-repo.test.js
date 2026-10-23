// coverage-repo — the index coverage ledger over real SQLite: one document measured across every layer, saved, summarised.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

let raw;
const SCHEMA = `
CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, language TEXT, religion TEXT, scope TEXT, deleted_at TEXT, duplicate_of INTEGER, author TEXT, collection TEXT, source_site TEXT);  -- production docs has no authority column
CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, text TEXT DEFAULT 'words', block_attrs TEXT, pdf_page INTEGER, synced INTEGER, embedding BLOB, context TEXT, hyp_questions TEXT, hyp_model TEXT,
  extract_model TEXT, translation TEXT, deleted_at TEXT, is_duplicate INTEGER);
CREATE TABLE entity_mentions_v2 (id INTEGER PRIMARY KEY, doc_id INTEGER, para_id TEXT, status TEXT);
CREATE TABLE concept_claims (id INTEGER PRIMARY KEY, doc_id INTEGER, para_id TEXT, proof_ok INTEGER);
CREATE TABLE content_alignment (id INTEGER PRIMARY KEY, trans_id INTEGER, orig_id INTEGER, retired_at INTEGER);
CREATE TABLE doc_sections (id INTEGER PRIMARY KEY, doc_id INTEGER, paragraphs INTEGER);
CREATE TABLE doc_structure (doc_id INTEGER PRIMARY KEY, sections INTEGER NOT NULL DEFAULT 0, source TEXT, indexed_at INTEGER NOT NULL);
CREATE TABLE layer_unindexable (doc_id INTEGER NOT NULL, layer TEXT NOT NULL, n INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (doc_id, layer));
CREATE TABLE index_coverage (doc_id INTEGER NOT NULL, layer TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0, generated INTEGER NOT NULL DEFAULT 0,
  current INTEGER NOT NULL DEFAULT 0, indexed INTEGER NOT NULL DEFAULT 0, version TEXT, core INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (doc_id, layer)) WITHOUT ROWID;
CREATE TABLE coverage_totals (religion TEXT NOT NULL, layer TEXT NOT NULL, core INTEGER NOT NULL, docs INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
  generated INTEGER NOT NULL DEFAULT 0, current INTEGER NOT NULL DEFAULT 0, indexed INTEGER NOT NULL DEFAULT 0, reached INTEGER NOT NULL DEFAULT 0,
  docs_with INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (religion, layer, core)) WITHOUT ROWID;
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
  raw.prepare("INSERT INTO docs VALUES (1, 'Book', 'en', 'Baha''i', 'primary', NULL, NULL, 'Some Pilgrim', 'Pilgrim Notes', NULL), (2, 'Lawh', 'fa', 'Baha''i', 'primary', NULL, NULL, 'Bahá’u’lláh', NULL, NULL)").run();
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
  it('recent documents carry every layer of their ledger', async () => {
    raw.exec("ALTER TABLE docs ADD COLUMN created_at TEXT; ALTER TABLE docs ADD COLUMN paragraph_count INTEGER; ALTER TABLE docs ADD COLUMN cover_url TEXT;");
    raw.prepare("UPDATE docs SET created_at = '2026-10-17T00:00:00Z' WHERE id = 2").run();
    raw.prepare("UPDATE docs SET created_at = '2026-01-01T00:00:00Z' WHERE id = 1").run();
    await repo.saveCoverage(2, await repo.measureDoc(2, { hypeVersion: 'v15', count }));
    const r = await repo.recentDocsCoverage(5);
    expect(r.map((d) => d.id)).toEqual([2, 1]);
    expect(Object.keys(r[0].layers)).toEqual(expect.arrayContaining(['text', 'keyword', 'sections', 'refs']));
  });
  it('keyword counts only paragraphs with text — an empty row can never have a point', async () => {
    raw.prepare("UPDATE content SET text = '' WHERE id = 3").run();
    const m = Object.fromEntries((await repo.measureDoc(1, { hypeVersion: 'v15', count })).map((r) => [r.layer, r]));
    expect(m.keyword).toMatchObject({ total: 2, indexed: 3 });
    expect(m.text.total).toBe(3);
    raw.prepare(`UPDATE content SET block_attrs = '{"pn":"3:16"}' WHERE id = 1`).run();
    raw.prepare('UPDATE content SET pdf_page = 12 WHERE id IN (1, 2)').run();
    const r = Object.fromEntries((await repo.measureDoc(1, { hypeVersion: 'v15', count })).map((x) => [x.layer, x])).refs;
    expect(r).toMatchObject({ total: 2, generated: 1, current: 2, indexed: 2 });   // pn on one, pages on two, either on two
    raw.prepare('UPDATE content SET block_attrs = NULL, pdf_page = NULL').run();
    const none = Object.fromEntries((await repo.measureDoc(1, { hypeVersion: 'v15', count })).map((x) => [x.layer, x])).refs;
    expect(none.total).toBe(0);   // no reference system: not needed, counts as done
    raw.prepare(`UPDATE content SET block_attrs = '{"pn":"3:16"}' WHERE id = 1`).run();
    raw.prepare('UPDATE content SET pdf_page = 12 WHERE id IN (1, 2)').run();
    raw.prepare("INSERT INTO doc_structure (doc_id, sections, indexed_at) VALUES (1, 0, 1)").run();
    const st = Object.fromEntries((await repo.measureDoc(1, { hypeVersion: 'v15', count })).map((x) => [x.layer, x])).sections;
    expect(st).toMatchObject({ total: 1, generated: 1, current: 1, indexed: 0 });   // read, no sections, 3 paragraphs: a single work needs none
    await repo.saveUnindexable(1, 'keyword', 1);   // a markup-only row ('|') the keyword job met
    const m2 = Object.fromEntries((await repo.measureDoc(1, { hypeVersion: 'v15', count })).map((r) => [r.layer, r]));
    expect(m2.keyword.total).toBe(1);
  });
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

describe('coverage totals move by deltas (Chad 10-16: only query changes, never re-sum the DB)', () => {
  const snapshot = () => raw.prepare('SELECT * FROM coverage_totals ORDER BY religion, layer, core').all();
  it('re-measuring a document moves the totals exactly as a full rebuild would', async () => {
    await repo.saveCoverage(1, await repo.measureDoc(1, { hypeVersion: 'v15', count }));
    await repo.saveCoverage(2, await repo.measureDoc(2, { hypeVersion: 'v15', count }));
    raw.prepare("UPDATE content SET hyp_model = 'v15', synced = 1 WHERE id IN (2, 3)").run();      // the document changes
    await repo.saveCoverage(1, await repo.measureDoc(1, { hypeVersion: 'v15', count }));           // re-measured: delta
    const byDelta = snapshot();
    await repo.rebuildCoverageTotals();
    expect(snapshot()).toEqual(byDelta);
    const text = byDelta.find((r) => r.layer === 'text' && r.religion === "Baha'i" && r.core === 0);
    expect(text).toMatchObject({ docs: 1, total: 3, indexed: 3 });
  });
  it('empty until the first rebuild; a retired document leaves the totals at the rebuild', async () => {
    expect(await repo.coverageTotalsEmpty()).toBe(true);
    await repo.saveCoverage(1, await repo.measureDoc(1, { hypeVersion: 'v15', count }));
    raw.prepare('UPDATE docs SET duplicate_of = 2 WHERE id = 1').run();
    await repo.rebuildCoverageTotals();
    expect(snapshot()).toEqual([]);
  });
});

describe('a failed vector count is unknown, not zero', () => {
  it('keeps the last good figure when Qdrant does not answer', async () => {
    await repo.saveCoverage(1, await repo.measureDoc(1, { hypeVersion: 'v15', count }));
    const down = async () => null;
    const m = Object.fromEntries((await repo.measureDoc(1, { hypeVersion: 'v15', count: down })).map((r) => [r.layer, r]));
    expect(m.phrase.indexed).toBe(9);
    expect(m.keyword.indexed).toBe(3);
  });
});

describe('unchanged re-measure writes nothing (db-write-path-20261023)', () => {
  it('saveCoverage skips a document whose rows are unchanged; touchCoverage moves only its age', async () => {
    const { transaction } = await import('../../api/lib/db.js');
    const rows = await repo.measureDoc(1, { hypeVersion: 'v15', count });
    expect(await repo.saveCoverage(1, rows, 100)).toBe(rows.length);
    transaction.mockClear();
    expect(await repo.saveCoverage(1, await repo.measureDoc(1, { hypeVersion: 'v15', count }), 200)).toBe(0);
    expect(transaction).not.toHaveBeenCalled();
    counts.hype = 15;   // a real change still writes
    expect(await repo.saveCoverage(1, await repo.measureDoc(1, { hypeVersion: 'v15', count }), 300)).toBe(rows.length);
    counts.hype = 14;
    await repo.touchCoverage([1], 400);
    expect(raw.prepare('SELECT DISTINCT updated_at AS u FROM index_coverage WHERE doc_id = 1').all().map((r) => r.u)).toEqual([400]);
  });
  it('sameAsStored compares every layer and value (core as 0/1, version null-safe)', () => {
    const a = [{ layer: 'text', total: 3, generated: 3, current: 3, indexed: 2, version: null, core: 0 }];
    expect(repo.sameAsStored(a, [{ ...a[0], core: false }])).toBe(true);
    expect(repo.sameAsStored(a, [{ ...a[0], indexed: 1 }])).toBe(false);
    expect(repo.sameAsStored(a, [])).toBe(false);
  });
});
