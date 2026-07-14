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

// Point the store's gazetteer at the committed sample BEFORE importing it (the path is read at module load).
import { fileURLToPath } from 'node:url';
process.env.SIFTER_GAZETTEER = fileURLToPath(new URL('../../data/siftersearch-gazetteer.sample.json', import.meta.url));

const { makeStore } = await import('../../api/lib/rag-adapter/store.js');
const { skeletonKeys } = await import('../../api/lib/translit-key.js');
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

      CREATE TABLE graph_entities (id INTEGER PRIMARY KEY, name TEXT, canonical_name TEXT, entity_type TEXT, importance INT, last_assessed_version TEXT);
      CREATE TABLE entity_research (canonical_name TEXT, entity_type TEXT, summary TEXT);
      CREATE TABLE entity_lookup_keys (entity_id INT, skeleton_key TEXT);
      CREATE TABLE entity_decisions (id INTEGER PRIMARY KEY, kind TEXT, target_kind TEXT, target_ids TEXT, payload TEXT, evidence TEXT, rationale TEXT, actor TEXT, actor_tier INT, confidence REAL, status TEXT, valid_time TEXT);
      -- 101 is the gazetteer anchor "Áqáy-i-Kalím"; 999 is the ≠-guarded namesake "Ḥájí Mírzá Músáy-i-Qumí".
      INSERT INTO graph_entities VALUES (101, 'Áqáy-i-Kalím', 'Áqáy-i-Kalím', 'person', 78, NULL);
      INSERT INTO graph_entities VALUES (999, 'Ḥájí Mírzá Músáy-i-Qumí', 'Ḥájí Mírzá Músáy-i-Qumí', 'person', 20, NULL);
    `);
    // Give both entities the SAME skeleton key for "Mírzá Músá" so name-recall alone surfaces both.
    for (const k of skeletonKeys('Mírzá Músá')) { run(`INSERT INTO entity_lookup_keys VALUES (101, ?)`, [k]); run(`INSERT INTO entity_lookup_keys VALUES (999, ?)`, [k]); }
  });

  it('findCandidateEntities: gazetteer form recalls its anchor FIRST (anti-split) and drops the ≠-guarded namesake', async () => {
    // "Mírzá Músá" is a gazetteer FORM of anchor #101; name-recall also surfaces the guarded namesake #999.
    const cands = await store.findCandidateEntities('Mírzá Músá', { type: 'person', limit: 6 });
    expect(cands[0].id).toBe(101);                       // anchor first
    expect(cands.some((c) => c.id === 999)).toBe(false); // ≠guard (Áqáy-i-Kalím ≠ Ḥájí Mírzá Músáy-i-Qumí) dropped
  });

  it('findCandidateEntities: an epithet with no name-recall row still recalls the anchor', async () => {
    const cands = await store.findCandidateEntities('the ablest of His brothers', { type: 'person', limit: 6 });
    expect(cands[0].id).toBe(101);
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

  it('getDecidedClusterNames is scoped to the book: a same-named cluster in another book is NOT skipped', async () => {
    await store.saveDecisions([
      { kind: 'link', targetKind: 'mention-cluster', targetIds: ['para_1'], payload: { resolvedAs: 'Mírzá Aḥmad', docId: 7 }, evidence: {}, rationale: '', actor: 'model', actorTier: 2, confidence: 0.9, status: 'proposed' },
      { kind: 'create', targetKind: 'mention-cluster', targetIds: ['para_2'], payload: { resolvedAs: 'Some Other Name', docId: 99 }, evidence: {}, rationale: '', actor: 'model', actorTier: 2, confidence: 0.8, status: 'proposed' },
    ]);
    const inBook = await store.getDecidedClusterNames(7);
    expect(inBook.has('Mírzá Aḥmad')).toBe(true);          // decided in THIS book → resume skips it
    expect(inBook.has('Some Other Name')).toBe(false);     // decided in a DIFFERENT book → still to be processed here
    const otherBook = await store.getDecidedClusterNames(99);
    expect(otherBook.has('Mírzá Aḥmad')).toBe(false);      // and the reverse holds — no cross-book leakage
  });
});
