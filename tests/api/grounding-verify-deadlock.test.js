// The "did not reach verify" deadlock (2026-08-12): a paragraph carrying the CURRENT disambiguation version
// stamp but NO note is invisible to disambiguate's resume filter yet counted un-disambiguated by every gate and
// done-measure — so the book is re-selected forever, dies in seconds with ZERO model calls, and the queue reports
// "did not reach verify". Covered at all three layers: the row's minter (indexer carry-forward), the stage's work
// selector, and the ONE gate bar. Pure fakes (rag test kit) — no DB, no network.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeRag, fakeLLM } from '../rag/kit.js';
import { carriedEnrichment } from '../../api/services/carried-enrichment.js';
import { reachedBound } from '../../api/lib/pipeline/queue.js';

const NOTE = '{"place":"Shíráz","era":"1844","idea":"arrival","resolve":[]}';
const long = (s) => `${s} and there unfolded the whole of his errand before the assembled company.`;

describe('disambiguate work selector — a version stamp WITHOUT a note is still work', () => {
  it('re-disambiguates stamped-but-noteless paragraphs (else coverage can never close)', async () => {
    // The exact shape a re-ingest leaves behind: same stamp, note gone.
    const paras = [
      { id: 1, pid: 'p1', text: long('Mullá Ḥusayn reached Shíráz'), context: '@Shíráz, ~1844 — arrival', contextModel: 'v1' },
      { id: 2, pid: 'p2', text: long('Quddús followed him'), context: null, contextModel: 'v1' },
      { id: 3, pid: 'p3', text: long('The Báb withdrew'), context: null, contextModel: 'v1' },
    ];
    const llm = fakeLLM([{ content: NOTE, finishReason: 'stop' }]);
    const { rag, store } = makeRag({ seed: { paras: { 9: paras } }, llm });
    const stats = await rag.disambiguate(9, { version: 'v1' });
    expect(stats.done).toBe(2);                                        // the two noteless rows were worked
    expect(store.saved.map((s) => s.paragraphId).sort()).toEqual([2, 3]);
    expect(store.saved.every((s) => s.note && s.methodVersion === 'v1')).toBe(true);
  });

  it('still skips a paragraph that HAS a note at the current version (idempotent resume)', async () => {
    const paras = [{ id: 1, pid: 'p1', text: long('Mullá Ḥusayn reached Shíráz'), context: '@Shíráz, ~1844 — arrival', contextModel: 'v1' }];
    const llm = fakeLLM([{ content: NOTE, finishReason: 'stop' }]);
    const { rag, store } = makeRag({ seed: { paras: { 9: paras } }, llm });
    expect((await rag.disambiguate(9, { version: 'v1' })).done).toBe(0);
    expect(store.saved).toHaveLength(0);
    expect(llm.calls).toHaveLength(0);
  });

  it('an examined-but-empty note ("nothing to disambiguate") stays done — it is a valid result', async () => {
    const paras = [{ id: 1, pid: 'p1', text: long('A publisher line'), context: '', contextModel: 'v1' }];
    const { rag, store } = makeRag({ seed: { paras: { 9: paras } }, llm: fakeLLM([{ content: NOTE, finishReason: 'stop' }]) });
    expect((await rag.disambiguate(9, { version: 'v1' })).done).toBe(0);
    expect(store.saved).toHaveLength(0);
  });
});

describe('the disambiguation gate is ONE bar (0.98) for every stage — no 98–99% dead band', () => {
  // resumeStageFor/isDoneFromArtifacts call a book disambiguated at 0.98, so any stage gating higher strands
  // every book between the two numbers: the resume decision skips disambiguate, the stage then refuses forever.
  const at = (ratio) => makeRag({ seed: { coverage: { 9: ratio }, paras: { 9: [] } }, llm: fakeLLM([]) });

  it('mentions accepts a book at 98.5% (the doc-12428 shape: 91 of 92 paragraphs)', async () => {
    const { rag } = at(91 / 92);
    await expect(rag.entities.mentions(9)).resolves.toBeDefined();
  });

  it('reconcile accepts a book at 98.5%', async () => {
    const { rag } = at(0.985);
    await expect(rag.entities.reconcile(9, { resume: true })).resolves.toBeDefined();
  });

  it('every stage still REFUSES a genuinely un-disambiguated book (below the shared bar)', async () => {
    const { rag } = at(0.31);                                          // the doc-12373 shape: 27 of 86
    await expect(rag.entities.mentions(9)).rejects.toThrow(/disambiguated/);
    await expect(rag.retrieval.index(9)).rejects.toThrow(/disambiguated/);
  });
});

describe('carried enrichment (indexer re-ingest cache) — never a stamp without its note', () => {
  it('carries the note and its version together', () => {
    expect(carriedEnrichment({ context: '@Shíráz, ~1844 — arrival', context_model: 'v1', hyp_thesis: 't', hyp_questions: '["q"]' }))
      .toMatchObject({ context: '@Shíráz, ~1844 — arrival', context_model: 'v1' });
  });

  it('drops the version stamp when no note comes with it (the deadlock row this used to mint)', () => {
    expect(carriedEnrichment({ context: null, context_model: 'v1' })).toMatchObject({ context: null, context_model: null });
    expect(carriedEnrichment({ context: '', context_model: 'v1' })).toMatchObject({ context: null, context_model: null });
  });
});

// The queue's done-measure is the LAST word: it decides 'done' vs "did not reach verify". Exercised against a
// real in-memory schema because the bug is in its SQL, not its arithmetic. Native module → skip where it can't load.
let raw = null, HAVE_SQLITE = true;
try { const Database = (await import('better-sqlite3')).default; raw = new Database(':memory:'); }
catch { HAVE_SQLITE = false; }

describe.skipIf(!HAVE_SQLITE)('reachedBound SQL — "disambiguated" must mean PROCESSED, exactly as the gate reads it', () => {
  const deps = {
    queryOne: async (sql, p = []) => raw.prepare(sql).get(...p),
    queryAll: async (sql, p = []) => raw.prepare(sql).all(...p),
  };

  beforeAll(() => {
    // hyp_model (migration 98) is the hype VERSION STAMP and now the completion measure — a schema without
    // it cannot exercise the real coverage SQL.
    raw.exec(`CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INT, blocktype TEXT, deleted_at TEXT, hyp_model TEXT,
                text TEXT, context TEXT, hyp_questions TEXT, extract_model TEXT);
              CREATE TABLE entity_mentions_v2 (doc_id INT, resolved_as TEXT);
              CREATE TABLE entity_decisions (target_kind TEXT, payload TEXT);`);
    // Doc 1: every prose paragraph processed, but most notes are EMPTY — "examined, nothing to resolve", the
    // valid complete result getDisambigCoverage/resumeStageFor already count as done.
    const long = 'x'.repeat(80);
    for (let i = 1; i <= 45; i++) {
      // extract_model set: this doc's subject is the DISAMBIGUATION measure (empty note = processed), and it
      // is a book that ran the whole pipeline. Leaving the extraction stamp off would fail it for an
      // unrelated reason and hide what this case is actually asserting.
      raw.prepare(`INSERT INTO content (doc_id, blocktype, text, context, hyp_questions, extract_model) VALUES (1,'paragraph',?,?,'["q"]','extract-v2')`)
        .run(long, i <= 43 ? '' : '@Shíráz, ~1844 — arrival');
    }
  });

  it('counts an examined-but-empty note as disambiguated (doc 12443: 43 empty + 2 noted)', async () => {
    expect(await reachedBound(1, {}, deps)).toBe(true);
  });

  it('the bulk measure agrees with the per-doc one (the roadmap and the queue can never disagree)', async () => {
    const { reachedBoundBulk } = await import('../../api/lib/pipeline/queue.js');
    expect((await reachedBoundBulk([1], {}, deps)).has(1)).toBe(true);
  });
});

describe('reachedBound — the shapes that were failing "did not reach verify"', () => {
  // `extracted` mirrors `prose` unless a case overrides it: every book here is a real one that had been
  // through the pipeline, and these cases exist to prove the disamb/hype bars do not false-fail them. The
  // extraction gate is exercised on its own in tests/api/extraction-stamp.test.js.
  const artifacts = (o) => ({ queryOne: async () => ({ prose: 0, disamb: 0, hyped: 0, hypeable: 0, clusters: 0, decisions: 0, extracted: o.prose ?? 0, ...o }) });

  it('a 92-paragraph book with 91 disambiguated + HyPE complete IS done (doc 12428)', async () => {
    expect(await reachedBound(1, {}, artifacts({ prose: 92, disamb: 91, hyped: 77, hypeable: 77 }))).toBe(true);
  });

  it('an 18-paragraph book fully processed IS done (doc 11356)', async () => {
    expect(await reachedBound(1, {}, artifacts({ prose: 18, disamb: 18, hyped: 13, hypeable: 13 }))).toBe(true);
  });

  it('a ONE-paragraph book with nothing to hype IS done, not retried forever (doc 8801)', async () => {
    expect(await reachedBound(1, {}, artifacts({ prose: 1, disamb: 1, hyped: 0, hypeable: 0 }))).toBe(true);
  });

  it('a book whose notes are gone is NOT done — it must be re-disambiguated, not passed (doc 12373)', async () => {
    expect(await reachedBound(1, {}, artifacts({ prose: 86, disamb: 27, hyped: 0, hypeable: 70 }))).toBe(false);
  });
});
