// quote_trace / term / original for ANY tradition (brief D, 11-09): source-hunt held to a tradition's own core, the verse reference of a
// non-Bahá'í source, editions.js (work family aligned by reference, else meaning; never translates), the three v2 trees on fake tools,
// the work-families repo + report, and validateCandidate over the new trees. All deps faked; no model, no production.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sourceHunt } from '../../api/lib/source-hunt.js';
import { editionsOf, referenceOf, langCode } from '../../api/lib/assistant/editions.js';
import * as tools from '../../api/lib/assistant/tools.js';
import { graphFor, runGraph, entryUnits } from '../../api/lib/assistant/activities/graph.js';
import { STRATEGIES as BASE, TREE_STRATEGIES, TEMPLATES, STEPS } from '../../api/lib/assistant/strategy-seed.js';
import { LOOKUP_TREE_IDS } from '../../api/lib/assistant/strategy-trees-seed.js';
import { validateCandidate } from '../../api/lib/assistant/strategy-design.js';
import { catalog } from '../../api/lib/repos/strategies-repo.js';

let rig;
vi.mock('../../api/lib/db.js', async (orig) => ({ ...(await orig()), queryOne: (...a) => rig.queryOne(...a), queryAll: (...a) => rig.queryAll(...a) }));
const { memDb } = await import('../dewey/helpers.js');
const { workFamily } = await import('../../api/lib/repos/alignment-repo.js');
const { REPORTS } = await import('../../api/lib/ops/reports.js');

const STRATEGIES = [...BASE, ...TREE_STRATEGIES];
const TPL = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.text]));
const NONE = async () => ({ passages: [] });
const EMPTY = { fused_search: NONE, hype_search: NONE, quotation_candidates: NONE, context_lookup: NONE, source_trace: NONE, edition_lookup: async () => ({ passages: [], family: [], self: null, missing_language: null }) };
const path = (s) => s.trace.map((t) => t.node);
async function run(id, q, { tools: t = {}, choice = {}, judges = {}, jev, units = {} } = {}) {
  const g = graphFor(id, 2);
  const s = { choice, ctx: {}, trace: [], question: q, messages: [], tools: { ...EMPTY, ...t }, jev, judges, templates: TPL, onEvent: () => {} };
  s.units = entryUnits(g, choice, { query: q, question: q, channel: { id: 'site-chat' }, messages: [] });
  Object.assign(s.units, units);
  await runGraph(g, s);
  s.how = s.out?.format?.how ?? '';
  return s;
}
const verdict = (v) => async () => ({ choice: v });
const holdsAll = async ({ passages }) => ({ passages: passages.map((x) => ({ ...x, verdict: 'holds' })), asked: 0, judged: true });

// ── source-hunt: a tradition's own core, and no Bahá'í default ───────────────────────────────────────────────────────────
const JOHN = 'For God so loved the world, that he gave his only begotten Son';
const GITA = 'You have a right to your actions, but never to the fruits of your actions';
const hunt = (ROWS) => ({
  phrases: async () => ({ hits: Object.keys(ROWS).map((id) => ({ paragraph_id: +id })) }), keyword: async () => ({ hits: [] }),
  rows: async (ids) => ids.map((i) => ROWS[i]).filter(Boolean).map((r) => ({ ...r, url: `u/${r.id}` })),
  links: async (ids) => new Map(ids.map((id) => [id, { sources: [], quotedBy: { count: 0, passages: [] } }])),
  passages: async () => new Map(), meta: async () => ({}),
});
describe('sourceHunt: tradition-general', () => {
  it('a Bible quote with tradition Christian → the KJV book holding it, not a Bahá’í book quoting it', async () => {
    const ROWS = { 1: { id: 1, doc_id: 10, text: `As Christ said, “${JOHN}.”`, authors: null, book_author: 'Helen Hornby', title: 'Lights of Guidance', religion: "Baha'i" },
      2: { id: 2, doc_id: 20, text: `${JOHN}, that whosoever believeth in him should not perish.`, authors: null, book_author: 'Bible', title: 'The Gospel of John', religion: 'Christian', collection: 'The Bible (KJV)' } };
    const r = await sourceHunt(JOHN, hunt(ROWS), { coreOnly: true, tradition: 'Christianity' });
    expect(r.origin).toMatchObject({ id: 2, title: 'The Gospel of John', religion: 'Christian' });
    expect(r.tablet).toBeNull();
  });
  it('a Gita line with no tradition named is not forced to Bahá’í: the Gita holding it verbatim is the source', async () => {
    const ROWS = { 1: { id: 1, doc_id: 10, text: `‘Abdu’l-Bahá’s hearers knew the Gita: “${GITA}.”`, authors: null, book_author: 'A Scholar', title: 'Bahá’í Studies Review', religion: "Baha'i" },
      2: { id: 2, doc_id: 20, text: `${GITA}.`, authors: null, book_author: 'Vyasa', title: 'Bhagavad Gita', religion: 'Hindu', collection: 'Bhagavad Gita' } };
    const r = await sourceHunt(GITA, hunt(ROWS), { coreOnly: true });
    expect(r.origin?.religion).toBe('Hindu');
  });
});

// ── the verse reference of a non-Bahá'í source, and quotation_candidates ─────────────────────────────────────────────────
const KJV = { 316: { id: 316, doc_id: 20, paragraph_index: 40, text: JOHN, heading: 'Chapter 3', context: 'Chapter 3 (verse 16)', blocktype: 'paragraph' } };
const edDeps = (rows, extra = {}) => ({ resolveLinks: async () => new Map(), workFamily: async () => ({ self: null, members: [] }), headingStarts: async () => [], paragraphsInRange: async () => [],
  paragraphsByIds: async (ids) => ids.map((i) => rows[i]).filter(Boolean), phrases: async () => ({ hits: [] }), ...extra });
describe('referenceOf + quotation_candidates', () => {
  it('reads chapter and verse from the KJV row (heading "Chapter 3", context "(verse 16)")', async () => {
    expect(await referenceOf(316, edDeps(KJV))).toEqual({ chapter: 3, verse: '16', exact: true });
  });
  it('a Bible quote is traced to its book and verse; the original is the work family’s Greek edition; the tradition goes to the hunt', async () => {
    const sourceHunt = vi.fn(async () => ({ origin: { id: 316, documentId: 20, title: 'The Gospel of John', author: null, religion: 'Christian', text: JOHN, url: 'u/316' }, citedBy: [], tablet: null }));
    const editionsOf = vi.fn(async () => ({ passages: [{ id: 9, document_id: 90, text: 'Οὕτως γὰρ ἠγάπησεν ὁ θεὸς τὸν κόσμον', title: 'Novum Testamentum Graece', language: 'grc', role: 'original', aligned_by: 'reference', exact: true }] }));
    const r = await tools.run('quotation_candidates', { quotation: JOHN, tradition: 'Christianity' }, { sourceHunt, deps: { editionsOf, getLinkMeta: async () => new Map(), editions: edDeps(KJV) } });
    expect(sourceHunt.mock.calls[0][2]).toMatchObject({ coreOnly: true, tradition: 'Christian' });
    const src = r.passages.find((p) => p.role === 'source'), orig = r.passages.find((p) => p.role === 'original');
    expect(src).toMatchObject({ id: 316, ref: 'The Gospel of John 3:16', religion: 'Christian' });
    expect(orig).toMatchObject({ language: 'grc', text: expect.stringContaining('ἠγάπησεν') });
  });
  it('Bahá’í unchanged: a Bahá’í source gets no verse ref and no work-family lookup; the tablet is its original', async () => {
    const sourceHunt = vi.fn(async () => ({ origin: { id: 1, documentId: 10, title: 'Gleanings', religion: "Baha'i", text: 'The earth is but one country', url: 'u/1' }, citedBy: [],
      tablet: { certain: true, documentId: 77, text: 'انّما الارض وطن واحد', title: 'Lawh-i-Maqsud' } }));
    const editionsOf = vi.fn(), referenceOf = vi.fn();
    const r = await tools.run('quotation_candidates', { quotation: 'The earth is but one country' }, { sourceHunt, deps: { editionsOf, referenceOf, getLinkMeta: async () => new Map([[77, { language: 'Arabic' }]]) } });
    expect(editionsOf).not.toHaveBeenCalled(); expect(referenceOf).not.toHaveBeenCalled();
    expect(r.passages.find((p) => p.role === 'source').ref).toBeUndefined();
    expect(r.passages.find((p) => p.role === 'original')).toMatchObject({ language: 'ar' });
    expect(sourceHunt.mock.calls[0][2]).toEqual({ coreOnly: true });
  });
});

// ── editions.js: the Qur'án's Arabic edition by sura:ayah; meaning fallback; honest absence ──────────────────────────────
describe('editionsOf', () => {
  const EN = { id: 1, doc_id: 10, paragraph_index: 300, text: 'Allah! There is no god but He, the Living, the Self-subsisting…', heading: 'Sura 2', context: 'Sura 2 (verse 255)' };
  const AR = (v, id) => ({ id, doc_id: 20, paragraph_index: v, text: `آية ${v}`, heading: null, context: `(verse ${v})` });
  const fam = { self: { id: 10, title: 'The Qur’án (Yusuf Ali)', language: 'English', religion: 'Islam', original_doc_id: null },
    members: [{ id: 20, title: 'القرآن الكريم', language: 'Arabic', religion: 'Islam', basis: 'author' }] };
  const d = (over = {}) => edDeps({ 1: EN, 2255: AR(255, 2255) }, { workFamily: async () => fam,
    headingStarts: async (doc) => [{ paragraph_index: doc === 10 ? 299 : 0, heading: doc === 10 ? 'Sura 2' : 'Surah 2: Al-Baqarah' }],
    paragraphsInRange: async (doc) => (doc === 10 ? [{ ...EN }] : [254, 255, 256].map((v) => AR(v, 2000 + v))), ...over });
  it('an English Qur’án verse → the Arabic edition aligned by sura:ayah (2:255), exact, never translated', async () => {
    const r = await editionsOf(1, { want: 'original' }, d());
    expect(r.passages).toHaveLength(1);
    expect(r.passages[0]).toMatchObject({ id: 2255, language: 'ar', role: 'original', aligned_by: 'reference', exact: true, ref: '2:255', text: 'آية 255' });
    expect(r.self).toMatchObject({ religion: 'Islam', language: 'en' }); expect(r.missing_language).toBeNull();
  });
  it('no shared numbering → aligned by meaning inside the member edition', async () => {
    const phrases = vi.fn(async () => ({ hits: [{ paragraph_id: 2255, score: 0.8 }] }));
    const r = await editionsOf(1, { want: 'original' }, d({ headingStarts: async () => [], phrases }));
    expect(phrases.mock.calls[0][1]).toMatchObject({ filters: { documentId: 20 } });
    expect(r.passages[0]).toMatchObject({ id: 2255, aligned_by: 'meaning', exact: false });
  });
  it('no edition held → an honest absence naming the missing language', async () => {
    const r = await editionsOf(1, { want: 'original' }, d({ workFamily: async () => ({ self: fam.self, members: [] }) }));
    expect(r.passages).toEqual([]); expect(r.missing_language).toBe('Arabic');
  });
  it('the recorded Bahá’í pairing stays the first provider', async () => {
    const resolveLinks = async () => new Map([[1, { original: { id: 77, documentId: 700, text: 'انّما الارض وطن واحد', language: 'ar', document: { title: 'Lawh-i-Maqsud' } } }]]);
    const r = await editionsOf(1, { want: 'original', limit: 1 }, d({ resolveLinks }));
    expect(r.passages[0]).toMatchObject({ id: 77, aligned_by: 'link' });
  });
  it('langCode normalises stored language values', () => { expect(['En', 'Eng', 'Arabic', 'FR'].map(langCode)).toEqual(['en', 'en', 'ar', 'fr']); });
});

// ── the three trees ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe('quote_trace@2', () => {
  const src = { id: 316, text: JOHN, title: 'The Gospel of John', religion: 'Christian', authority: 'scripture', role: 'source', score: 1, ref: 'The Gospel of John 3:16', document_id: 20 };
  it('Bible quote, Christian scope: q1 → q2 → q3 → q4 → q5; the tradition reaches the tool; the Greek edition is attached', async () => {
    const qc = vi.fn(async () => ({ passages: [src] })), ed = vi.fn(async () => ({ passages: [{ id: 9, text: 'Οὕτως γὰρ', title: 'NT Graece', language: 'grc', role: 'original', religion: 'Christian' }] }));
    const s = await run('quote_trace', JOHN, { tools: { quotation_candidates: qc, edition_lookup: ed }, judges: { holds: holdsAll }, units: { quoted_words: JOHN, quoted_clean: JOHN, religions_specified: ['Christianity'] } });
    expect(path(s)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
    expect(qc.mock.calls[0][0]).toMatchObject({ tradition: 'Christian' }); expect(ed.mock.calls[0][0]).toMatchObject({ paragraph_id: 316, want: 'original' });
    expect(s.units.found_passages.map((p) => p.language)).toContain('grc'); expect(s.how).not.toContain('{{');
  });
  it('no tradition named: the tool gets none (the whole library), never a Bahá’í default', async () => {
    const qc = vi.fn(async () => ({ passages: [{ ...src, text: GITA, title: 'Bhagavad Gita', religion: 'Hindu', ref: undefined }] }));
    await run('quote_trace', GITA, { tools: { quotation_candidates: qc }, judges: { holds: holdsAll }, units: { quoted_words: GITA, quoted_clean: GITA } });
    expect(qc.mock.calls[0][0].tradition).toBeUndefined();
  });
  it('not in the library → q1 → qw (the web, labelled) → qx; web silent → $absence', async () => {
    const web = vi.fn(async () => ({ text: 'Often attributed to Rumi; no source in the Masnavi.', citations: ['https://example.org/rumi'] }));
    const s = await run('quote_trace', 'q', { tools: { web_search: web }, units: { quoted_words: 'Out beyond ideas', quoted_clean: 'Out beyond ideas' } });
    expect(path(s)).toEqual(['q1', 'qw', 'qx']); expect(s.units.web_found.length).toBe(1);
    const none = await run('quote_trace', 'q', { tools: { web_search: async () => ({ text: null, citations: [] }) }, units: { quoted_words: 'x y z', quoted_clean: 'x y z' } });
    expect(path(none)).toEqual(['q1', 'qw', '$absence']);
  });
});

describe('term@2', () => {
  it('the term unit comes from the question\'s own marks when Jev names none (round 4: "irfán" — every {{term}} search ran the whole question)', async () => {
    const fused = vi.fn(async () => ({ passages: [] }));
    const s = await run('term', 'What does the Arabic word irfán mean?', { tools: { fused_search: fused } });
    expect(s.units.term).toBe('irfán');
    expect(fused.mock.calls.slice(0, 3).map(([i]) => i.query)).toEqual(['irfán', 'irfán', 'irfán']);   // t2 ×2 + t3; the absence fallback after them keeps the question
  });
  const TAO = [{ id: 1, text: 'The sage manages affairs without action (wu wei).', title: 'Tao Te Ching (Legge)', religion: 'Tao', authority: 'scripture', score: 0.9, document_id: 10 },
    { id: 2, text: 'Wu wei, non-action, is the way of heaven.', title: 'Chuang Tzu', religion: 'Tao', authority: 'interpretation', score: 0.8, document_id: 11 }];
  it('"wu wei", Tao scope: Tao core + renderings across parallel translations; no CTAI', async () => {
    const fused = vi.fn(async () => ({ passages: TAO })), rend = vi.fn(async () => ({ found: false }));
    const ed = vi.fn(async () => ({ passages: [{ id: 51, text: 'The sage does not act (wei wu wei).', title: 'Tao Te Ching (Mitchell)', religion: 'Tao', language: 'en', role: 'translation' },
      { id: 52, text: '是以聖人處無為之事', title: '道德經', religion: 'Tao', language: 'zh', role: 'translation' }] }));
    const s = await run('term', 'what is wu wei', { tools: { fused_search: fused, rendering_lookup: rend, edition_lookup: ed }, jev: verdict('defines'), units: { term: 'wu wei', topic: 'wu wei', religions_specified: ['Taoism'] } });
    expect(path(s)).toEqual(['t1', 't2', 't3', 'sw', 'rk', 't4', 't5', 't6']);
    expect(rend).not.toHaveBeenCalled();
    expect(fused.mock.calls.every(([i]) => (i.filters?.tradition ?? i.tradition) === 'Tao')).toBe(true);
    expect(ed.mock.calls[0][0]).toMatchObject({ want: 'translations' });
    expect(s.units.found_passages.map((p) => p.title)).toEqual(expect.arrayContaining(['Tao Te Ching (Legge)', '道德經']));
    expect(s.how).toContain('wu wei'); expect(s.how).not.toContain('{{');
  });
  it('only uses the term → t7 usage; nothing found → $absence', async () => {
    const s = await run('term', 'q', { tools: { fused_search: async () => ({ passages: TAO }) }, jev: verdict('uses'), units: { term: 'wu wei', religions_specified: ['Tao'] } });
    expect(path(s).at(-1)).toBe('t7');
    const none = await run('term', 'q', { units: { term: 'wu wei', religions_specified: ['Tao'] } });
    expect(path(none)).toEqual(['t1', 't2', 't3', 'sw', '$absence']);
  });
  it('Bahá’í unchanged: the CTAI renderings run first (labelled Bahá’í-only)', async () => {
    const rend = vi.fn(async () => ({ found: true, term: 'ḥikmat', meaning: 'wisdom', renderings: [{ english: 'wisdom', count: 40 }], passages: [{ id: 7, text: 'wisdom…', religion: "Baha'i", authority: 'scripture' }] }));
    const s = await run('term', 'q', { tools: { rendering_lookup: rend }, judges: { termScript: async () => ({ term_arabic: 'حكمة', via: 'memory' }) }, jev: verdict('defines'),
      units: { term: 'hikmat', religions_specified: ["Baha'i"] } });
    expect(path(s).slice(0, 3)).toEqual(['t1', 't1b', 't1c']); expect(rend).toHaveBeenCalled();
    expect(s.units.found_records.some((r) => r.renderings)).toBe(true);
  });
});

describe('original@2', () => {
  const EN = { id: 1, text: 'Allah! There is no god but He', title: 'The Qur’án (Yusuf Ali)', religion: 'Islam', authority: 'scripture', document_id: 10 };
  it('anchor → o3 (the Arabic edition) → o4 (translations) → o5 side by side', async () => {
    const ed = vi.fn(async (i) => ({ passages: i.want === 'original' ? [{ id: 2255, text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ', language: 'ar', role: 'original', religion: 'Islam' }] : [] }));
    const s = await run('original', 'the Arabic of this verse', { tools: { edition_lookup: ed, context_lookup: async () => ({ passages: [EN] }) }, units: { referent: EN } });
    expect(path(s)).toEqual(['o1', 'o3', 'o4', 'o5']); expect(s.units.found_passages.some((p) => p.language === 'ar')).toBe(true);
  });
  it('no edition held → o6 names the missing language (never a translation)', async () => {
    const ed = async () => ({ passages: [], self: { title: 'The Qur’án (Yusuf Ali)' }, family: [], missing_language: 'Arabic' });
    const s = await run('original', 'q', { tools: { edition_lookup: ed, context_lookup: async () => ({ passages: [EN] }) }, units: { referent: EN } });
    expect(path(s)).toEqual(['o1', 'o3', 'o6']); expect(s.units.found_records).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'absence', missing_language: 'Arabic' })]));
  });
  it('quoted words only → thin anchor → o2 phrase → o2j holds → o3', async () => {
    const qc = async () => ({ passages: [{ ...EN, role: 'source', score: 1 }] });
    const s = await run('original', 'q', { tools: { quotation_candidates: qc }, judges: { holds: holdsAll }, units: { quoted_words: EN.text, quoted_clean: EN.text } });
    expect(path(s).slice(0, 4)).toEqual(['o1', 'o2', 'o2j', 'o3']);
  });
  it('no anchor, no quoted words, a named work → the passage searched inside that work is the anchor → o3 (round 4: the opening chapter of the Qur\'an went to absence)', async () => {
    const SURA = { id: 7, text: 'In the name of God, the Compassionate, the Merciful', title: 'The Quran (Rodwell), Sura I.', religion: 'Islam', authority: 'scripture', document_id: 21104 };
    const fs = vi.fn(async () => ({ passages: [SURA] }));
    const ed = vi.fn(async (i) => ({ passages: i.want === 'original' ? [{ id: 9001, text: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', language: 'ar', role: 'original', religion: 'Islam' }] : [] }));
    const s = await run('original', 'Show me the Arabic of the Throne Verse of the Qur\'an beside an English translation.', { tools: { fused_search: fs, edition_lookup: ed },
      choice: { units: { named_work: 'Qur\'an', topic: 'the Throne Verse' } } });
    expect(path(s).slice(0, 5)).toEqual(['o1', 'o1r', 'o1o', 'o1w', 'o3']);   // no chapter reference: o1r is skipped; a topic was asked: o1o (the opening) is skipped
    expect(fs.mock.calls[0][0]).toMatchObject({ query: 'the Throne Verse' }); expect(ed.mock.calls[0][0]).toMatchObject({ paragraph_id: 7, want: 'original' });
    expect(s.units.found_passages.some((p) => p.language === 'ar')).toBe(true);
  });
});

describe('original@2: a scripture chapter named by order or name (round 5)', () => {
  const PICK = 21207, ARABIC = 21380;
  const PDOC = { id: PICK, title: 'The Meaning of the Glorious Qur’án (Pickthall)', author: 'Unknown', religion: 'Islam', language: 'en', paragraph_count: 6347 };
  const ADOC = { id: ARABIC, title: "The Qur'an (Arabic)", author: 'Muhammad', religion: 'Islam', language: 'ar', paragraph_count: 6350 };
  const P_ROWS = [[2, 'In the name of Allah, the Beneficent, the Merciful.'], [3, 'Praise be to Allah, Lord of the Worlds, The Beneficent, the Merciful.'],
    [4, 'Owner of the Day of Judgment, Thee (alone) we worship; Thee (alone) we ask for help.'], [5, 'Show us the straight path, The path of those whom Thou hast favoured.']].map(([i, t]) => ({ id: 500 + i, doc_id: PICK, paragraph_index: i, text: t }));
  const A_ROWS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: 900 + i, doc_id: ARABIC, paragraph_index: i, text: i ? `آية ${i}` : 'Surah 1', blocktype: i ? 'paragraph' : 'heading2' }));
  const deps = { resolveLinks: async () => new Map(), workFamily: async () => ({ self: { id: PICK, language: 'en', religion: 'Islam' }, members: [] }),   // Pickthall: author "Unknown" → no family
    headingStarts: async () => [], phrases: async () => ({ hits: [] }),
    paragraphsByIds: async (ids) => P_ROWS.filter((r) => ids.includes(r.id)),
    paragraphsInRange: async (doc, a, b) => (doc === ARABIC ? A_ROWS : P_ROWS).filter((r) => r.paragraph_index >= a && r.paragraph_index <= b),
    listDocs: async (q) => ({ docs: q.ids ? [PDOC, ADOC].filter((d) => q.ids.includes(d.id)) : [PDOC, ADOC].filter((d) => d.title.includes(q.title) && (!q.language || d.language === q.language)) }) };
  it('editionsOf: a known Qur’án verse layout aligns exactly by verse table with no work family (Pickthall’s merged row 1:2–3 → Arabic 1:2 and 1:3)', async () => {
    const r = await editionsOf(503, { want: 'original' }, deps);
    expect(r.passages.map((x) => [x.id, x.ref, x.aligned_by, x.exact, x.language])).toEqual([[902, '1:2–3', 'reference', true, 'ar'], [903, '1:2–3', 'reference', true, 'ar']]);
    expect(r.missing_language).toBeNull();
    expect((await editionsOf(502, { want: 'original' }, deps)).passages.map((x) => x.id)).toEqual([901]);   // the basmala row = 1:1, never the heading
    expect((await editionsOf(503, { want: 'translations' }, deps)).passages).toEqual([]);   // the Arabic is the original, not a translation
  });
  it('edition_lookup aligns every verse of the reference given as paragraph_ids, in order', async () => {
    const r = await tools.run('edition_lookup', { paragraph_id: 502, paragraph_ids: [503, 504, 505], want: 'original' }, { deps: { editions: deps } });
    expect(r.passages.map((x) => x.id)).toEqual([901, 902, 903, 904, 905, 906, 907]); expect(r.missing_language).toBeNull();
  });
  it('no anchor → o1r reads the chapter by reference → o3 gets every verse of it (round 5: o1w anchored on a translator’s footnote → "no Arabic edition")', async () => {
    const theme = 'Qur’án 1', ref = vi.fn(async () => ({ passages: P_ROWS.map((r) => ({ ...r, document_id: PICK, title: PDOC.title, religion: 'Islam', theme })) }));
    const ed = vi.fn(async (i) => ({ passages: i.want === 'original' ? [{ id: 901, text: 'آية 1', language: 'ar', role: 'original', religion: 'Islam' }] : [] }));
    const fs = vi.fn(NONE);
    const s = await run('original', 'Show me the Arabic of the opening chapter of the Qur\'an beside an English translation.', { tools: { reference: ref, fused_search: fs, edition_lookup: ed },
      choice: { units: { named_work: 'Qur\'an', topic: 'the opening chapter' } } });
    expect(s.units.scripture_reference).toMatchObject({ kind: 'quran', sura: 1, verse: null });
    expect(path(s).slice(0, 3)).toEqual(['o1', 'o1r', 'o3']); expect(fs).not.toHaveBeenCalled();
    expect(ed.mock.calls[0][0]).toMatchObject({ paragraph_id: 502, paragraph_ids: [503, 504, 505], want: 'original' });
  });
});

// ── the work family: repo + report ──────────────────────────────────────────────────────────────────────────────────────
describe('workFamily + work-families report', () => {
  beforeEach(() => {
    const m = memDb(); rig = m.mod;
    m.db.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, language TEXT, religion TEXT, collection TEXT, original_doc_id INTEGER, duplicate_of INTEGER, deleted_at TEXT);
      CREATE TABLE content_alignment (trans_doc INTEGER, orig_doc INTEGER, retired_at TEXT);
      INSERT INTO docs (id, title, author, language, religion, original_doc_id) VALUES (1, 'Gleanings', 'Bahá’u’lláh', 'en', 'Baha''i', 2), (2, 'Muntakhabat', 'Bahá’u’lláh', 'ar', 'Baha''i', NULL),
        (10, 'Qur’án (Yusuf Ali)', 'Muhammad', 'En', 'Islam', NULL), (11, 'القرآن', 'Muhammad', 'Arabic', 'Islam', NULL), (20, 'Tao Te Ching', 'Laozi', 'en', 'Tao', NULL), (21, '道德經', 'Lao Tzu', 'zh', 'Tao', NULL);
      INSERT INTO content_alignment VALUES (1, 2, NULL);`);
  });
  it('finds members by recorded original, alignment and same author in another language', async () => {
    const f = await workFamily(1);
    expect(f.self.title).toBe('Gleanings'); expect(f.members.map((m) => [m.id, m.basis])).toEqual([[2, 'original_doc_id']]);
    expect((await workFamily(10)).members.map((m) => [m.id, m.basis])).toEqual([[11, 'author']]);
  });
  it('the report states which multilingual traditions have no recorded or aligned family', async () => {
    const r = await REPORTS['work-families']();
    expect(r.traditions.find((t) => t.religion === "Baha'i")).toMatchObject({ recorded: 1, aligned_pairs: 1, linked: true });
    expect(r.missing).toEqual(expect.arrayContaining(['Islam', 'Tao']));
  });
});

// ── the new trees pass the planner's own contract check ─────────────────────────────────────────────────────────────────
describe('validateCandidate over the lookup trees', () => {
  it.each(LOOKUP_TREE_IDS)('%s@2', (id) => {
    const row = STRATEGIES.find((x) => x.id === id && x.version === 2), cat = catalog();
    const own = new Set(Object.values(row.graph.nodes).map((n) => n.step)), pre = (x) => `chk.${x}`;
    const steps = STEPS.filter((x) => own.has(x.id)), tplIds = new Set(steps.map((x) => x.params?.template).filter((t) => t?.startsWith(`${id}.`)));
    const ren = (p) => ({ ...p, ...(tplIds.has(p.template) ? { template: pre(p.template) } : {}) });
    const c = { name: `chk_${id}`, description: row.description, exemplars: [...String(row.description).matchAll(/"([^"]+)"/g)].map((m) => m[1]),   // the seed keeps its class phrasings in the description
      templates: TEMPLATES.filter((t) => tplIds.has(t.id)).map((t) => ({ id: pre(t.id), text: t.text })),
      steps: steps.map((x) => ({ id: pre(x.id), activity: x.activity, params: ren(x.params || {}) })),
      graph: { ...row.graph, nodes: Object.fromEntries(Object.entries(row.graph.nodes).map(([k, n]) => [k, { step: pre(n.step) }])) } };
    const v = validateCandidate(c, { cat });
    expect(v.errors).toEqual([]); expect(v.ok).toBe(true);
  });
});
