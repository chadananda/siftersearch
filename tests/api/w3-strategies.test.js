// W3 strategies: Jev chooses (typed choice, logged with probabilities), code executes — comparison (parallel per side, each side
// covered or said missing), understanding, prayer shelf (Jev picks the occasion), current guidance (newest first), scripture reference.
import { describe, it, expect } from 'vitest';
import { chooseStrategy, strategyOf, STRATEGIES } from '../../api/lib/assistant/strategy-choice.js';
import { comparison, understanding, runStrategy, interleave, COMPARISON_HOW } from '../../api/lib/assistant/strategies.js';
import { decisionLog, jevProbabilities } from '../../api/lib/assistant/decision-log.js';
import { prayerShelf, splitPrayers, isAttribution } from '../../api/lib/assistant/prayer-shelf.js';
import { currentGuidance, dateOf, newestFirst } from '../../api/lib/assistant/guidance.js';
import { scriptureReference, parseScriptureRef, verseRows, roman } from '../../api/lib/assistant/scripture-ref.js';
import { anisRespond } from '../../api/lib/assistant/respond.js';
import { PICKTHALL, layoutTotal, quranIndex, quranRange } from '../../api/lib/assistant/numbering.js';

const msgs = [{ role: 'user', content: 'How do the Qur’án and the Gospel each speak of forgiveness?' }];
const jev = (answers) => async (url, init) => { jev.last = JSON.parse(init.body); return { ok: true, json: async () => ({ answers }) }; };
const hit = (i, religion, extra = {}) => ({ id: i, text: `passage ${i}`, document_id: 100 + i, religion, title: 'T', author: 'A', ...extra });

describe('chooseStrategy (Jev decides, never keywords)', () => {
  it('one typed call: strategy + up to three sides, with the thread and reader card as state; decisions logged with probabilities', async () => {
    const f = jev({ strategy: { choice: 'comparison', confidence: 0.86, distribution: { comparison: 0.86, understanding: 0.1 } },
      side_a: { choice: 'Islam', confidence: 0.9 }, side_b: { choice: 'Christian', confidence: 0.8 }, side_c: { choice: 'none', confidence: 0.9 } });
    const s = await chooseStrategy(msgs, { profile: { default_tradition: "Baha'i" }, apiKey: 'k', fetchImpl: f });
    expect(Object.keys(jev.last.questions)).toEqual(['strategy', 'side_a', 'side_b', 'side_c']);
    expect(jev.last.questions.strategy.type).toBe('choice'); expect(Object.keys(jev.last.questions.strategy.criteria)).toEqual(Object.keys(STRATEGIES));
    expect(jev.last.state).toMatch(/Baha'i/); expect(jev.last.state).toMatch(/forgiveness/);
    expect(s.strategy.choice).toBe('comparison'); expect(s.sides).toEqual(['Islam', 'Christian']); expect(strategyOf(s)).toBe('comparison');
    expect(s.decisions.map((d) => d.point)).toEqual(['strategy', 'sides']);
    expect(s.decisions[0]).toMatchObject({ by: 'jev', chosen: 'comparison', probabilities: { comparison: 0.86, understanding: 0.1 } });
    expect(s.decisions[0].options).toEqual(Object.keys(STRATEGIES));
    expect(s.decisions[1].chosen).toEqual(['Islam', 'Christian']);
  });
  it('low confidence or no answer → other (fail open), the reason logged; errors → null', async () => {
    const low = await chooseStrategy(msgs, { apiKey: 'k', fetchImpl: jev({ strategy: { choice: 'prayer', confidence: 0.4 } }) });
    expect(low.strategy).toMatchObject({ choice: 'other', was: 'prayer', reason: 'low-confidence' }); expect(strategyOf(low)).toBeNull();
    const none = await chooseStrategy(msgs, { apiKey: 'k', fetchImpl: jev({}) });
    expect(none.strategy.reason).toBe('no-answer');
    expect(await chooseStrategy(msgs, { apiKey: 'k', fetchImpl: async () => { throw new Error('x'); } })).toBeNull();
    expect(await chooseStrategy(msgs, { apiKey: '', fetchImpl: jev({}) })).toBeNull();
  });
  it('jevProbabilities reads a distribution, a bare confidence, or a noul', () => {
    expect(jevProbabilities({ choice: 'a', confidence: 0.7, distribution: { a: 0.7, b: 0.3 } })).toEqual({ a: 0.7, b: 0.3 });
    expect(jevProbabilities({ choice: 'a', confidence: 0.7 })).toEqual({ a: 0.7 });
    expect(jevProbabilities({ noul: 0.2 })).toEqual({ yes: 0.2, no: 0.8 });
  });
});

describe('comparison executor', () => {
  it('searches every side in parallel, widens a thin side once, says which side is missing', async () => {
    const calls = [];
    const search = async (a) => { calls.push(a); if (a.religion === 'Islam') return { passages: [hit(1, 'Islam'), hit(2, 'Islam'), hit(3, 'Islam')] };
      if (a.religion === 'Christian' && a.query === 'forgiveness') return { passages: [hit(9, 'Christian')] }; return { passages: [] }; };
    const decisions = decisionLog();
    const out = await comparison({ sides: ['Islam', 'Christian', 'Hindu'] }, { messages: msgs, query: 'how do they speak of forgiveness', distil: () => 'forgiveness', search, decisions });
    expect(calls.filter((c) => c.religion === 'Islam').length).toBe(1);
    expect(calls.filter((c) => c.religion === 'Christian').map((c) => c.query)).toEqual(['how do they speak of forgiveness', 'forgiveness']);
    expect(out.plan.coverage).toEqual({ Islam: 'covered', Christian: 'thin', Hindu: 'missing' });
    expect(out.passages.map((p) => p.theme)).toEqual(['Islam', 'Christian', 'Islam', 'Islam']);
    expect(out.format.id).toBe('comparison'); expect(out.format.how).toMatch(/Hindu/); expect(out.format.how).toMatch(/nothing|missing/i);
    const pts = decisions.list().map((d) => d.point);
    expect(pts).toContain('widen:Christian'); expect(pts).toContain('coverage:Hindu');
    expect(decisions.list().find((d) => d.point === 'coverage:Hindu').chosen).toBe('missing');
  });
  it('fewer than two sides → one wide search, never narrowed, logged', async () => {
    const calls = []; const decisions = decisionLog();
    const out = await comparison({ sides: ['Islam'] }, { messages: msgs, query: 'q', search: async (a) => { calls.push(a); return { passages: [hit(1, 'Islam'), hit(2, 'Christian')] }; }, decisions });
    expect(calls.length).toBe(1); expect(calls[0].religion ?? null).toBeNull();
    expect(out.plan.wide).toBe(true); expect(out.passages.map((p) => p.theme)).toEqual(['Islam', 'Christian']);
    expect(decisions.list()[0]).toMatchObject({ point: 'sides:fallback', chosen: 'one wide search' });
  });
  it('interleave alternates sides and caps', () => {
    expect(interleave([[1, 2, 3], [4], [5, 6]], 5)).toEqual([1, 4, 5, 2, 6]);
    expect(COMPARISON_HOW(['Islam', 'Hindu'], { Islam: 'covered', Hindu: 'missing' })).toMatch(/Hindu/);
  });
});

describe('understanding executor', () => {
  it('scopes to the plan\'s or reader\'s tradition, widens when thin, scripture before interpretation', async () => {
    const calls = []; const decisions = decisionLog();
    const search = async (a) => { calls.push(a); return a.religion ? { passages: [hit(1, "Baha'i", { standing: 'commentary' })] } : { passages: [hit(2, "Baha'i", { standing: 'scripture' }), hit(3, "Baha'i")] }; };
    const out = await understanding({}, { messages: msgs, query: 'q', distil: () => 'subject', search, plan: { filters: { religion: "Baha'i" }, source: { religion: 'jev' } }, decisions });
    expect(calls.map((c) => c.religion ?? null)).toEqual(["Baha'i", null]);
    expect(out.passages.map((p) => [p.id, p.theme])).toEqual([[2, 'scripture'], [1, 'interpretation'], [3, 'interpretation']]);
    expect(out.plan.coverage).toBe('covered'); expect(out.format.id).toBe('understanding');
    expect(decisions.list().map((d) => d.point)).toEqual(['understanding:scope', 'understanding:widen', 'understanding:coverage']);
    expect(decisions.list()[0].by).toBe('jev');
  });
});

describe('runStrategy', () => {
  it('nothing for other/null; a fallthrough is logged; prayer executor reached through the dispatcher', async () => {
    expect(await runStrategy({ strategy: { choice: 'other' } }, {})).toBeNull();
    const decisions = decisionLog();
    const out = await runStrategy({ strategy: { choice: 'prayer', confidence: 0.9 } }, { messages: msgs, query: 'q', search: async () => ({ passages: [] }), decisions, deps: { findTitled: async () => null } });
    expect(out).toBeNull();
    expect(decisions.list().map((d) => d.point)).toEqual(['prayer:book', 'prayer:fallthrough']);
  });
});

const prayerRows = [
  { id: 1, paragraph_index: 260, text: 'Thy name is my healing, O my God…', context: null }, { id: 2, paragraph_index: 261, text: 'Thou art the Healer…', context: null },
  { id: 3, paragraph_index: 262, text: '_—Bahá’u’lláh_' }, { id: 4, paragraph_index: 263, text: 'He is the Healer, the Sufficer…' }, { id: 5, paragraph_index: 264, text: '_—The Báb_' },
  { id: 6, paragraph_index: 265, text: 'O my Lord! Thou knowest the sick…' }, { id: 7, paragraph_index: 266, text: '_—‘Abdu’l-Bahá_' }];
const prayerDeps = (pick, rows = prayerRows) => ({
  findTitled: async () => ({ doc: { id: 20762, title: 'Bahá’í Prayers', author: 'Bahá’u’lláh, the Báb, ‘Abdu’l-Bahá', religion: "Baha'i" } }),
  sectionsOfDoc: async () => [{ section_id: 1, title: 'Healing', level: 1, start_index: 260, end_index: 277, paragraphs: 18 }, { section_id: 2, title: 'Protection', level: 1, start_index: 426, end_index: 440, paragraphs: 15 }],
  pickOccasion: async (m, titles) => { prayerDeps.titles = titles; return pick; }, paragraphsInRange: async () => rows, withLinks: async (h) => h.map((x) => ({ ...x, url: `https://ol/${x.id}` })),
  searchKeywordQdrant: async () => ({ hits: [] }), resolveQdrantFilters: async (f) => f, paragraphsByIds: async () => [] });

describe('prayer shelf', () => {
  it('splits prayers at attribution lines', () => {
    expect(isAttribution('_—Bahá’u’lláh_')).toBe(true); expect(isAttribution('— ‘Abdu’l-Bahá')).toBe(true); expect(isAttribution('O my Lord — hear me, for the night is long and the way is dark and I know not')).toBe(false);
    expect(splitPrayers(prayerRows).map((p) => p.length)).toEqual([3, 2, 2]);
  });
  it('Jev picks the occasion from the book\'s own headings; the first prayer in full, two more by opening line, all linked', async () => {
    const decisions = decisionLog();
    const out = await prayerShelf({ messages: [{ role: 'user', content: 'my mother is ill' }], query: 'q', search: async () => ({ passages: [] }), decisions, deps: prayerDeps({ choice: 'Healing', confidence: 0.9, distribution: { Healing: 0.9, Protection: 0.1 }, ms: 30 }) });
    expect(prayerDeps.titles).toEqual(['Healing', 'Protection']);
    expect(out.passages.map((p) => [p.id, p.theme])).toEqual([[1, 'prayer'], [2, 'prayer'], [3, 'prayer'], [4, 'alternative'], [6, 'alternative']]);
    expect(out.passages[0].source_url).toBe('https://ol/1'); expect(out.plan).toMatchObject({ shape: 'prayer', occasion: 'Healing', prayers: 3 });
    expect(out.format.how).toMatch(/IN FULL/); expect(out.format.how).toMatch(/Healing/);
    const occ = decisions.list().find((d) => d.point === 'prayer:occasion');
    expect(occ).toMatchObject({ by: 'jev', chosen: 'Healing', probabilities: { Healing: 0.9, Protection: 0.1 }, ms: 30 }); expect(occ.options).toContain('none');
  });
  it('no fitting heading (or low confidence) → the prayer book searched, never the whole library', async () => {
    const calls = []; const decisions = decisionLog();
    const out = await prayerShelf({ messages: msgs, query: 'a prayer for travel', search: async (a) => { calls.push(a); return { passages: [hit(5, "Baha'i")] }; }, decisions, deps: prayerDeps({ choice: 'Healing', confidence: 0.3 }) });
    expect(calls[0]).toMatchObject({ document_id: 20762, query: 'a prayer for travel' });
    expect(out.passages[0].theme).toBe('prayer'); expect(out.plan.searched).toBe(true);
    expect(decisions.list().find((d) => d.point === 'prayer:occasion')).toMatchObject({ chosen: 'none', reason: 'low confidence' });
  });
});

describe('prayer shelf: no confident heading (launch gate 11-03: "a prayer for the dead" → "didn\'t find")', () => {
  const departed = [{ section_id: 9, title: 'For The Departed', level: 2, start_index: 106, end_index: 126, paragraphs: 21 }, { section_id: 14, title: 'Forgiveness', level: 2, start_index: 222, end_index: 255, paragraphs: 34 }];
  const rows = [{ id: 50, paragraph_index: 107, text: 'O my God! This is Thy servant and the son of Thy servant…' }, { id: 51, paragraph_index: 108, text: '_—Bahá’u’lláh_' },
    { id: 52, paragraph_index: 109, text: 'O my God! O Thou forgiver of sins…' }, { id: 53, paragraph_index: 110, text: '_—‘Abdu’l-Bahá_' }];
  it('the planned search empty, the literal words scoped to the book find the heading → its prayers served whole', async () => {
    const decisions = decisionLog(); const layer = [];
    const deps = { ...prayerDeps({ choice: 'For The Departed', confidence: 0.35, distribution: { 'For The Departed': 0.35, Forgiveness: 0.3 } }, rows), sectionsOfDoc: async () => departed,
      searchKeywordQdrant: async (q, o) => { layer.push([q, o.filters]); return { hits: [{ paragraph_id: 52 }] }; },
      paragraphsByIds: async () => [{ id: 52, doc_id: 20762, paragraph_index: 109, text: 'O my God! O Thou forgiver of sins…' }] };
    const out = await prayerShelf({ messages: msgs, query: 'prayer for the dead', search: async () => ({ passages: [] }), decisions, deps });
    expect(layer[0]).toEqual(['prayer for the dead', { documentId: 20762 }]);
    expect(out.plan).toMatchObject({ occasion: 'For The Departed', via: 'search' }); expect(out.passages[0]).toMatchObject({ id: 50, theme: 'prayer' });
    expect(decisions.list().find((d) => d.point === 'prayer:section')).toMatchObject({ chosen: 'For The Departed', reason: "Jev's most probable heading among the hits" });
  });
  it('nothing found → Jev\'s top heading (below the bar) is served rather than "didn\'t find"', async () => {
    const decisions = decisionLog();
    const out = await prayerShelf({ messages: msgs, query: 'q', search: async () => ({ passages: [] }), decisions,
      deps: { ...prayerDeps({ choice: 'For The Departed', confidence: 0.4 }, rows), sectionsOfDoc: async () => departed } });
    expect(out.plan).toMatchObject({ occasion: 'For The Departed', via: 'jev-low' });
    expect(decisions.list().find((d) => d.point === 'prayer:section').reason).toBe('search empty; Jev below the bar');
  });
  it('Jev says none and nothing is found → null', async () => {
    expect(await prayerShelf({ messages: msgs, query: 'q', search: async () => ({ passages: [] }), decisions: decisionLog(),
      deps: { ...prayerDeps({ choice: 'none', confidence: 0.9 }, rows), sectionsOfDoc: async () => departed } })).toBeNull();
  });
});

describe('current guidance', () => {
  it('dates letters from the file name or year', () => {
    expect(dateOf({ file_path: 'x/2024-11-28-to-the-bahais-of-the-world.md' })).toBe('2024-11-28'); expect(dateOf({ year: 1985 })).toBe('1985'); expect(dateOf({})).toBeNull();
  });
  it('searches the House of Justice only, orders newest first, undated last, logs the recency decision', async () => {
    const calls = []; const decisions = decisionLog();
    const search = async (a) => { calls.push(a); return { passages: [hit(1, "Baha'i", { document_id: 11, author: 'Universal House of Justice' }), hit(2, "Baha'i", { document_id: 12, author: 'Universal House of Justice' }), hit(3, "Baha'i", { document_id: 13, author: 'Universal House of Justice' }), hit(4, "Baha'i", { document_id: 14, author: 'Shoghi Effendi' })] }; };
    const listDocs = async ({ ids }) => ({ docs: [{ id: 11, year: 1996 }, { id: 12, file_path: '2021-11-25-letter.md' }, { id: 13, title: 'undated' }] });
    const out = await currentGuidance({ messages: msgs, query: 'q', search, decisions, deps: { listDocs } });
    expect(calls[0].author).toBe('Universal House of Justice');
    expect(out.passages.map((p) => [p.document_id, p.theme])).toEqual([[12, '2021-11-25'], [11, '1996'], [13, 'undated']]);
    expect(out.format.how).toMatch(/NEWEST FIRST/); expect(out.format.how).toMatch(/never as interpretation/);
    expect(decisions.list().find((d) => d.point === 'guidance:recency')).toMatchObject({ chosen: 'newest first', reason: '2/3 letters dated; order 12:2021-11-25 11:1996 13:undated' });
    expect(await currentGuidance({ messages: msgs, query: 'q', search: async () => ({ passages: [] }), decisions, deps: { listDocs } })).toBeNull();
  });
  it('newestFirst is a pure order', () => {
    expect(newestFirst([{ document_id: 1 }, { document_id: 2 }], new Map([[2, '2020'], [1, '2001']])).map((p) => p.theme)).toEqual(['2020', '2001']);
  });
});

describe('scripture reference', () => {
  it('parses Bible, Qur’án and Gita references (deterministic — only after Jev chose the strategy)', () => {
    expect(parseScriptureRef('what does John 3:16 say')).toMatchObject({ kind: 'bible', book: 'The Gospel of John', chapter: 3, verse: 16, label: 'The Gospel of John 3:16' });
    expect(parseScriptureRef('1 Cor. 13:4-7')).toMatchObject({ book: '1 Corinthians', chapter: 13, verse: 4, verseEnd: 7 });
    expect(parseScriptureRef('Song of Solomon 2:1')).toMatchObject({ book: 'The Song of Solomon', chapter: 2 });
    expect(parseScriptureRef('Psalm 23')).toMatchObject({ book: 'Psalms', chapter: 23, verse: null });
    expect(parseScriptureRef('Qur’án 2:255')).toMatchObject({ kind: 'quran', sura: 2, verse: 255 });
    expect(parseScriptureRef('Surah 24')).toMatchObject({ kind: 'quran', sura: 24 });
    expect(parseScriptureRef('Bhagavad Gita 2:47')).toMatchObject({ kind: 'gita', chapter: 2, verse: 47 });
    expect(parseScriptureRef('Gleanings 27')).toBeNull(); expect(parseScriptureRef('tell me about love')).toBeNull();
    expect(roman(24)).toBe('XXIV');
  });
  it('finds the verse by the KJV marker, labels an unmarked edition approximate', () => {
    const rows = [{ id: 1, text: 'a', context: 'Chapter 3 (verse 14)' }, { id: 2, text: 'b', context: 'Chapter 3 (verse 15–17)' }, { id: 3, text: 'c', context: 'Chapter 3 (verse 18)' }];
    expect(verseRows(rows, 16)).toMatchObject({ rows: [rows[1]], exact: true });
    expect(verseRows(rows, 14, 18).rows.length).toBe(3);
    expect(verseRows(rows, 40)).toMatchObject({ rows: [], exact: true });
    const plain = Array.from({ length: 20 }, (_, i) => ({ id: i, text: `l${i}` }));
    const v = verseRows(plain, 10); expect(v.exact).toBe(false); expect(v.rows.length).toBe(3);
    expect(verseRows(plain, null)).toMatchObject({ exact: true, whole: true });
  });
  it('Bible: KJV book → chapter section → verse rows, linked, logged', async () => {
    const decisions = decisionLog();
    const deps = { listDocs: async () => ({ docs: [{ id: 501, title: 'The Gospel of John', author: 'KJV' }, { id: 502, title: 'Genesis' }] }),
      sectionsOfDoc: async () => [{ title: 'The Gospel of John - Chapter 1', start_index: 0, end_index: 50 }, { title: 'John 3', start_index: 100, end_index: 136 }],
      paragraphsInRange: async (id, a, b) => { deps.range = [id, a, b]; return [{ id: 7, paragraph_index: 115, text: 'For God so loved the world…', context: 'Chapter 3 (verse 16)' }, { id: 8, paragraph_index: 116, text: 'For God sent not…', context: 'Chapter 3 (verse 17)' }]; },
      withLinks: async (h) => h.map((x) => ({ ...x, url: `https://ol/${x.id}` })) };
    const out = await scriptureReference({ question: 'What does John 3:16 say?', decisions, deps });
    expect(deps.range).toEqual([501, 100, 136]);
    expect(out.passages).toHaveLength(1); expect(out.passages[0]).toMatchObject({ id: 7, theme: 'The Gospel of John 3:16', source_url: 'https://ol/7', document_id: 501 });
    expect(out.plan.exact).toBe(true); expect(out.format.how).not.toMatch(/APPROXIMATE/);
    expect(decisions.list().map((d) => d.point)).toEqual(['reference:parse', 'reference:book', 'reference:chapter', 'reference:verse']);
  });
  it('Qur’án: the sūra section by FTS, ayah approximate; no reference → null, logged', async () => {
    const decisions = decisionLog();
    const deps = { listDocs: async () => ({ docs: [] }), findSections: async () => [{ section_id: 9, doc_id: 21206, book: 'The Qur’án', author: 'Yusuf Ali', title: 'Sūra II.', start_index: 10, end_index: 60 }],
      paragraphsInRange: async () => Array.from({ length: 30 }, (_, i) => ({ id: i + 1, paragraph_index: 10 + i, text: `ayah ${i}` })), withLinks: async (h) => h };
    const out = await scriptureReference({ question: 'Quran 2:255', decisions, deps });
    expect(out.plan.exact).toBe(false); expect(out.format.how).toMatch(/APPROXIMATE/); expect(out.passages[0].document_id).toBe(21206);
    expect(await scriptureReference({ question: 'what is love', decisions, deps })).toBeNull();
    expect(decisions.list().at(-1)).toMatchObject({ point: 'reference:parse', chosen: 'none' });
  });
});

describe('Qur’án by the verse table (launch gate 11-03: 2:255 gave Ṭálút from the approximate Yusuf Ali place)', () => {
  it('Pickthall\'s layout: verified indices (2:255 → 261, 9:1 → 1241, 24:35 → 2846, 112:1 → 6330, 114:6 → 6346) and the 6347 total', () => {
    expect(layoutTotal(PICKTHALL)).toBe(6347);
    expect([[2, 255], [2, 1], [2, 286], [3, 1], [9, 1], [24, 35], [112, 1], [114, 6], [1, 1], [1, 7]].map(([a, b]) => quranIndex(PICKTHALL, a, b))).toEqual([261, 7, 292, 294, 1241, 2846, 6330, 6346, 2, 5]);
    expect(quranIndex(PICKTHALL, 2, 287)).toBeNull(); expect(quranRange(PICKTHALL, { sura: 2, verse: 255, verseEnd: 256 })).toEqual([261, 262]);
    expect(quranRange(PICKTHALL, { sura: 2 })).toEqual([6, 9]);
  });
  const editions = (n) => async (a) => { editions.asked = a; return { docs: [{ id: 21206, title: 'The Holy Qur’án (Yusuf Ali)', paragraph_count: 6403 }, { id: 21207, title: 'The Meaning of the Glorious Qur’án (Pickthall)', author: 'Pickthall', religion: 'Islam', paragraph_count: n }] }; };
  it('the exact verse from Pickthall, heading rows dropped, linked, not labelled approximate', async () => {
    const decisions = decisionLog(); const ranges = [];
    const deps = { listDocs: editions(6347), findSections: async () => { throw new Error('not reached'); },
      paragraphsInRange: async (id, a, b) => { ranges.push([id, a, b]); return [{ id: 900, paragraph_index: 261, text: '## Sūra II', heading: 1 }, { id: 901, paragraph_index: 261, text: 'Alláh! There is no God save Him, the Alive, the Eternal…' }]; },
      withLinks: async (h) => h.map((x) => ({ ...x, url: `https://ol/${x.id}` })) };
    const out = await scriptureReference({ question: 'Qur’án 2:255', decisions, deps });
    expect(editions.asked.title).toBe('Pickthall'); expect(ranges).toEqual([[21207, 261, 261]]);
    expect(out.passages).toHaveLength(1); expect(out.passages[0]).toMatchObject({ id: 901, document_id: 21207, source_url: 'https://ol/901', theme: 'Qur’án 2:255' });
    expect(out.plan.exact).toBe(true); expect(out.format.how).not.toMatch(/APPROXIMATE/);
    expect(decisions.list().find((d) => d.point === 'reference:verse-table').chosen).toBe('exact (verse table)');
  });
  it('a changed edition (paragraph count off the layout) falls back to the chapter section, logged', async () => {
    const decisions = decisionLog();
    const deps = { listDocs: editions(6350), findSections: async () => [{ section_id: 9, doc_id: 21206, book: 'The Qur’án', title: 'Sūra II.', start_index: 10, end_index: 60 }],
      paragraphsInRange: async () => Array.from({ length: 30 }, (_, i) => ({ id: i + 1, paragraph_index: 10 + i, text: `ayah ${i}` })), withLinks: async (h) => h };
    const out = await scriptureReference({ question: 'Quran 2:255', decisions, deps });
    expect(out.plan.exact).toBe(false); expect(out.passages[0].document_id).toBe(21206);
    expect(decisions.list().find((d) => d.point === 'reference:verse-table').reason).toBe('no Pickthall edition with the expected layout');
  });
});

describe('anisRespond with a strategy', () => {
  it('uses the executor\'s passages and format instead of the ordinary search when Jev chose a strategy', async () => {
    const searches = [], crafts = [];
    const d = { search: async (a) => { searches.push(a); return { passages: a.religion === 'Islam' ? [hit(1, 'Islam'), hit(2, 'Islam'), hit(3, 'Islam')] : [hit(4, 'Christian'), hit(5, 'Christian'), hit(6, 'Christian')] }; },
      craft: async (args) => { crafts.push(args); args.onChunk('x'); return 'Side by side.'; }, companion: async () => null };
    const decisions = decisionLog();
    await anisRespond({ messages: msgs, profile: { default_tradition: "Baha'i" }, deps: d, direction: { strategy: { strategy: { choice: 'comparison', confidence: 0.9 }, sides: ['Islam', 'Christian'] }, decisions } });
    expect(searches.map((s) => s.religion)).toEqual(['Islam', 'Christian']);
    const c = JSON.stringify(crafts[0]);
    expect(c).toMatch(/strategy:comparison|COMPARISON/);
    expect(decisions.list().map((x) => x.point)).toContain('coverage:Islam');
  });
});
