// Contract test — the SifterSearch Store adapter satisfies the Store port against a REAL in-memory schema.
// Proves the adapter's SQL + column→domain mapping without the production DB. db.js/content.js are mocked
// onto an in-memory better-sqlite3 (the repo's standard pattern).
import { describe, it, expect, beforeAll, vi } from 'vitest';

// better-sqlite3 is a native module; skip this contract tier where its prebuilt binary can't load for the
// running arch (e.g. an x86_64 node_modules under an arm64 node). The library's own tests need no native dep.
let raw = null, HAVE_SQLITE = true;
try { const Database = (await import('better-sqlite3')).default; raw = new Database(':memory:'); }
catch { HAVE_SQLITE = false; }
const run = (sql, p = []) => { const s = raw.prepare(sql); return /^\s*(INSERT|CREATE|UPDATE|DELETE)/i.test(sql) ? s.run(...p) : s.all(...p); };

vi.mock('../../api/lib/db.js', () => ({
  queryAll: async (sql, p = []) => run(sql, p),
  query: async (sql, p = []) => ({ rows: run(sql, p) }),
}));
const updateContextOnly = vi.fn(async () => {});
vi.mock('../../api/lib/content.js', () => ({ default: { updateContextOnly } }));

const { makeStore } = await import('../../api/lib/rag-adapter/store.js');
const store = makeStore();

describe.skipIf(!HAVE_SQLITE)('Store adapter contract', () => {
  beforeAll(() => {
    raw.exec(`
      CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, religion TEXT, collection TEXT, year INT, description TEXT, lang TEXT);
      CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INT, external_para_id TEXT, paragraph_index INT, heading TEXT, text TEXT, context TEXT, context_model TEXT, blocktype TEXT, deleted_at TEXT);
      INSERT INTO docs VALUES (7, 'God Passes By', 'Shoghi Effendi', 'bahai', 'History', 1944, 'A history.', 'en');
      INSERT INTO content VALUES (100, 7, 'para_1', 1, 'Chapter I', '${'the Báb declared His mission in Shíráz. '.repeat(8)}', NULL, NULL, 'paragraph', NULL);
      INSERT INTO content VALUES (101, 7, NULL,      2, 'Chapter I', 'short', NULL, NULL, 'paragraph', NULL);
      INSERT INTO content VALUES (102, 7, 'para_3', 3, 'Chapter I', 'a deleted line', NULL, NULL, 'paragraph', '2026-01-01');
    `);
  });

  it('getDocMeta maps columns to the DocMeta shape', async () => {
    expect(await store.getDocMeta(7)).toMatchObject({ id: 7, title: 'God Passes By', author: 'Shoghi Effendi' });
  });

  it('getSampleText returns a substantial, non-deleted paragraph', async () => {
    const s = await store.getSampleText(7);
    expect(s.length).toBeGreaterThan(200);
    expect(s).toContain('Báb');
  });

  it('getParagraphs returns Paragraph shapes in order, skips deleted, synthesises pid when missing', async () => {
    const ps = await store.getParagraphs(7);
    expect(ps).toHaveLength(2);                        // the deleted row is excluded
    expect(ps[0]).toMatchObject({ id: 100, pid: 'para_1', pidx: 1, heading: 'Chapter I' });
    expect(ps[1].pid).toBe('p101');                   // no external id → 'p'||id
    expect(ps[0].text).not.toMatch(/\s{2,}/);         // whitespace-normalised
  });

  it('saveContext forwards paragraph id, note, and method version to the writer path', async () => {
    await store.saveContext(100, '@Shíráz, ~1844 — the Declaration', 'disambig-v1');
    expect(updateContextOnly).toHaveBeenCalledWith(100, '@Shíráz, ~1844 — the Declaration', 'disambig-v1');
  });
});
