// The disambiguation gate on concept extraction must accept EITHER variant.
//
// concepts/disambiguate is documented as "an ALTERNATIVE gate for doctrinal works, not a second pass" and
// writes to the SAME context column — but it stamps 'concept-disambig-v1' while extract filtered for
// 'deepseek-disambig-v1' alone. A fully-noted book therefore reported `paras: 0`: a stage reporting success
// having read nothing. Same open-producer/closed-consumer shape as the heading whitelist and the phrase
// re-rank. Found 2026-08-26 while preparing the core books for extraction.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../../api/lib/rag/concepts/extract.js';

vi.mock('../../api/lib/rag/kernel/gate.js', () => ({ assertDisambiguated: async () => {} }));
// Mutable so a test can set the routing it needs; profileFor is module-mocked, so a per-call `profiler`
// would never be consulted.
const PROFILE = { current: { genre: 'doctrinal', lang: 'en', models: { extract: 'm' }, fallback: 'm' } };
vi.mock('../../api/lib/rag/kernel/profile.js', () => ({ profileFor: async () => PROFILE.current }));

const para = (contextModel) => ({
  id: 1, pid: 'p1', kind: 'paragraph', context: 'the running argument', contextModel,
  text: 'A passage of sufficient length concerning the Covenant and its station.',
});

const makeCtx = (paragraphs) => ({
  config: { versions: { disambig: 'deepseek-disambig-v1', conceptDisambig: 'concept-disambig-v1' } },
  catalog: { get: () => ({ capabilities: [] }) },
  log: { info: () => {} },
  model: { runLadder: async () => ({ parsed: [], escalated: false }) },
  store: {
    getParagraphs: async () => paragraphs,
    getDocMeta: async () => ({ id: 1, title: 'Test Work' }),
    saveConceptClaims: async () => 0,
  },
});

describe('concept extraction disambiguation gate', () => {
  it('reads paragraphs noted by the ENRICH disambiguator', async () => {
    const r = await run(makeCtx([para('deepseek-disambig-v1')]), 1);
    expect(r.paras).toBe(1);
  });

  it('reads paragraphs noted by the CONCEPT disambiguator — the variant it used to skip', async () => {
    const r = await run(makeCtx([para('concept-disambig-v1')]), 1);
    expect(r.paras).toBe(1);
  });

  it('NAMES the reason when nothing is readable, rather than reporting a bare zero', async () => {
    // "paras: 0" is indistinguishable from "this book has no concepts in it".
    const r = await run(makeCtx([para('some-unknown-version')]), 1);
    expect(r.paras).toBe(0);
    expect(r.skippedReason).toMatch(/disambiguation note/i);
  });

  it('distinguishes an unnoted book from a book with no prose at all', async () => {
    const r = await run(makeCtx([]), 1);
    expect(r.skippedReason).toMatch(/no prose paragraphs/i);
  });
});

describe('the model follows the ORIGINAL language, not the document language', () => {
  // Chad, 2026-08-26: "Why would you use Deepseek for something with Arabic or Farsi original_text field?"
  // He is right, and permission alone did not fix it. The spend POLICY allowed Anthropic for such a
  // paragraph, but the model CHOICE still came from profile.models.extract — which, because every one of
  // these books is an English-language document, resolved to deepseek. The original would have sat in the
  // context window unread: paying to show a model a text it cannot see.
  //
  // "Unless we are referring to books originally composed in English (like Nabil or Shoghi Effendi's
  // letters)" — for those the English IS the original, so the cheap path is the CORRECT reading, not a
  // compromise.
  const profile = { genre: 'doctrinal', lang: 'en',
    models: { extract: 'deepseek-v4-flash', bilingualExtract: 'claude-sonnet-4-6' }, fallback: 'deepseek-v4-flash' };
  beforeEach(() => { PROFILE.current = profile; });
  afterEach(() => { PROFILE.current = { genre: 'doctrinal', lang: 'en', models: { extract: 'm' }, fallback: 'm' }; });

  const spyCtx = (paragraphs, docId, seen) => ({
    config: { versions: { disambig: 'deepseek-disambig-v1', conceptDisambig: 'concept-disambig-v1' } },
    catalog: { get: () => ({ capabilities: [] }) },
    log: { info: () => {} },
    model: { runLadder: async ({ route }) => { seen.push(route.model); return { parsed: [], escalated: false }; } },
    store: { getParagraphs: async () => paragraphs, getDocMeta: async () => ({ id: docId }), saveConceptClaims: async () => 0 },
  });
  const para = (o) => ({ id: 1, pid: 'p1', kind: 'paragraph', context: 'note',
    contextModel: 'deepseek-disambig-v1', text: 'A passage about the Covenant of God and its station.', ...o });

  it('sends a PERSIAN original to a model that can read Persian', async () => {
    const seen = [];
    await run(spyCtx([para({ original: 'کلمات', originalLang: 'fa' })], 20810, seen), 20810);
    expect(seen[0]).toMatch(/claude/);
  });

  it('sends an ARABIC original to the same capable model', async () => {
    const seen = [];
    await run(spyCtx([para({ original: 'الكلمات', originalLang: 'ar' })], 21307, seen), 21307);
    expect(seen[0]).toMatch(/claude/);
  });

  it('keeps a paragraph with NO original on the cheap English path', async () => {
    const seen = [];
    await run(spyCtx([para({ original: null, originalLang: null })], 21307, seen), 21307);
    expect(seen[0]).toMatch(/deepseek/);
  });

  it('keeps a book COMPOSED IN ENGLISH on deepseek even if an original is somehow present', async () => {
    // God Passes By is his own English. A stray alignment written onto such a book must never buy it a
    // paid model — hence the explicit englishIsOriginal() check rather than relying on absence.
    const seen = [];
    await run(spyCtx([para({ original: 'کلمات', originalLang: 'fa' })], 21310, seen), 21310);
    expect(seen[0]).toMatch(/deepseek/);
  });
});

describe('the extractor knows WHOSE translation it is reading', () => {
  // Chad, 2026-08-26: "I want to be sure the extractor will be aware when a translation is Shoghi Effendi
  // so it can be treated differently." The prompt inverts on the answer, so getting it wrong mis-states the
  // doctrine to the model — his word-choice FIXES which sense is operative; a committee's does not.
  //
  // Two sources, DB column first and the curated roster as backstop: relying on the column alone means any
  // future path that stores an original without setting the authority silently UNDER-CREDITS him.
  const profile = { genre: 'doctrinal', lang: 'en',
    models: { extract: 'deepseek-v4-flash', bilingualExtract: 'claude-sonnet-4-6' }, fallback: 'deepseek-v4-flash' };
  beforeEach(() => { PROFILE.current = profile; });

  const seenSystems = [];
  const ctxFor = (paragraphs, docId) => ({
    config: { versions: { disambig: 'deepseek-disambig-v1', conceptDisambig: 'concept-disambig-v1' } },
    catalog: { get: () => ({ capabilities: [] }) },
    log: { info: () => {} },
    model: { runLadder: async ({ system }) => { seenSystems.push(system); return { parsed: [], escalated: false }; } },
    store: { getParagraphs: async () => paragraphs, getDocMeta: async () => ({ id: docId }), saveConceptClaims: async () => 0 },
  });
  const para = (o) => ({ id: 1, pid: 'p1', kind: 'paragraph', context: 'n', contextModel: 'deepseek-disambig-v1',
    text: 'A passage concerning the Covenant.', original: 'کلمات', originalLang: 'fa', ...o });

  it('uses the SHOGHI EFFENDI prompt when the column says so', async () => {
    seenSystems.length = 0;
    await run(ctxFor([para({ translationAuthority: 'shoghi-effendi' })], 20810), 20810);
    expect(seenSystems[0]).toMatch(/neither outranks the other/);
  });

  it('falls back to the ROSTER when the column is empty, rather than under-crediting him', async () => {
    // 20810 is a GUARDIAN_TRANSLATION on the roster. With no column value the naive reading would treat his
    // rendering as one translator's opinion — the opposite of the doctrine.
    seenSystems.length = 0;
    await run(ctxFor([para({ translationAuthority: null })], 20810), 20810);
    expect(seenSystems[0]).toMatch(/neither outranks the other/);
  });

  it('uses the ORIGINAL-GOVERNS prompt for a committee rendering', async () => {
    seenSystems.length = 0;
    await run(ctxFor([para({ translationAuthority: 'committee' })], 21307), 21307);
    expect(seenSystems[0]).toMatch(/THE ORIGINAL GOVERNS HERE/);
  });

  it('REPORTS the authority mix, so an unattributed book is visible', async () => {
    const r = await run(ctxFor([para({ translationAuthority: 'shoghi-effendi' })], 20810), 20810);
    expect(r.byTranslationAuthority).toMatchObject({ 'shoghi-effendi': 1 });
  });
});
