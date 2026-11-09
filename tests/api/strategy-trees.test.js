// The six executor strategies as element trees (strategy-trees-seed.js): offline parity (clean · several · thin · none · error · conflict) on fake tools,
// the new element params, mode blocks, and the ratchet that no live-bound strategy is a one-node tree again.
import { describe, it, expect } from 'vitest';
import { graphFor, runGraph, entryUnits, strategyGraphOn, runStrategyGraph } from '../../api/lib/assistant/activities/graph.js';
import { ELEMENTS, modal, modeOf } from '../../api/lib/assistant/activities/elements.js';
import { STRATEGIES as BASE, TREE_STRATEGIES, TEMPLATES, STEPS } from '../../api/lib/assistant/strategy-seed.js';
import { TREE_IDS } from '../../api/lib/assistant/strategy-trees-seed.js';

const STRATEGIES = [...BASE, ...TREE_STRATEGIES];
const TPL = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.text]));
const P = (i, x = {}) => ({ id: i, text: `Passage ${i}`, document_id: 100 + i, paragraph_index: i, religion: "Baha'i", authority: 'scripture', score: 0.9, ...x });
const NONE = async () => ({ passages: [] }), boom = async () => { throw new Error('down'); };
const EMPTY = { fused_search: NONE, hype_search: NONE, originals_search: NONE, reference: NONE, quotation_candidates: NONE, document_search: async () => ({ works: [] }), context_lookup: async () => ({ passages: [] }), source_trace: NONE };
const CAN = { Christianity: 'Christian' };   // the scope hands tools the canonical tradition name
const lib = (by) => async (i) => { const tr = i.filters?.tradition ?? i.tradition; return { passages: by[tr] ?? by[Object.keys(CAN).find((k) => CAN[k] === tr)] ?? by['*'] ?? [] }; };
const path = (s) => s.trace.map((t) => t.node);
const NODES = (g) => Object.values(g.nodes).filter((n) => !n.shared);

async function run(id, q, { tools = {}, choice = {}, jev, channel = 'site-chat', agentRun, extra = {} } = {}) {
  const g = graphFor(id, 2), events = [];
  const s = { choice, ctx: {}, trace: [], question: q, messages: [], tools: { ...EMPTY, ...tools }, jev, agentRun, templates: TPL, onEvent: (e) => events.push(e), ...extra };
  s.units = entryUnits(g, choice, { query: q, question: q, channel: { id: channel }, messages: [] });
  Object.assign(s.units, extra.units || {});
  await runGraph(g, s);
  const row = STRATEGIES.find((x) => x.id === id && x.version === 2); s.kinds = path(s).map((n) => row.graph.nodes[n]?.kind ?? 'end'); s.events = events; s.how = s.out?.format?.how ?? '';
  return s;
}
const verdict = (v) => async ({ units }) => ({ choice: typeof v === 'function' ? v(units) : v });

describe('understanding tree', () => {
  const scripture = [P(1, { authority: 'scripture' })], interp = [P(2, { authority: 'interpretation' })];
  const tools = { fused_search: async (i) => ({ passages: [...scripture, ...interp] }) };
  it('clean hit: anchor → gather → rank → stage → around → trace → judge → s_answer, scripture themed first', async () => {
    const s = await run('understanding', 'What is the soul?', { tools, jev: verdict('answers') });
    expect(path(s)).toEqual(['anchor', 'gather', 'rank', 'stage', 'around', 'trace', 'judge', 's_answer']);
    expect(s.out.format).toMatchObject({ id: 'understanding', by: 'strategy:understanding' }); expect(s.out.passages.map((p) => p.theme)).toEqual(['scripture', 'interpretation']);
    expect(s.how).toContain('First sentence answers What is the soul?'); expect(s.how).not.toContain('{{'); expect(s.events.some((e) => e.stage?.startsWith('Reading'))).toBe(true);
  });
  it('several: rank keeps the top four and drops what the conversation already gave', async () => {
    const many = Array.from({ length: 8 }, (_, i) => P(10 + i));
    const s = await run('understanding', 'q', { tools: { fused_search: async () => ({ passages: many }) }, jev: verdict('answers'), extra: { state: { given: [{ id: 10 }] } } });
    expect(s.units.found_passages.length).toBe(4); expect(s.units.found_passages.map((p) => p.id)).not.toContain(10);
  });
  it('thin: low-score hits still answer, and the writer is told coverage is thin', async () => {
    const s = await run('understanding', 'q', { tools: { fused_search: async () => ({ passages: [P(1, { score: 0.05 })] }) }, jev: verdict('answers') });
    expect(s.units.found_outcome.gather).toBe('thin'); expect(s.how).toContain('Coverage is thin');
  });
  it('mentions only: s_nodirect says the texts do not state it', async () => {
    const s = await run('understanding', 'q', { tools, jev: verdict('mentions_only') });
    expect(path(s).at(-1)).toBe('s_nodirect'); expect(s.how).toContain('do not state this directly');
  });
  it('none after all tiers: rank is empty → $absence, never an answer from memory', async () => {
    const s = await run('understanding', 'q', { jev: verdict('answers') });
    expect(path(s)).toEqual(['anchor', 'gather', 'rank', '$absence']); expect(s.how).toContain('does not hold this');
  });
  it('error: every tier down → $fallback → (agent fails) $unavailable, never "not in the library"', async () => {
    const s = await run('understanding', 'q', { tools: { fused_search: boom, hype_search: boom, originals_search: boom }, agentRun: async () => null });
    expect(path(s)).toEqual(['anchor', 'gather', '$fallback', '$unavailable']); expect(s.how).toContain("couldn't search"); expect(s.how).not.toContain('does not hold');
  });
  it('error + the research agent answers: s.done is set and runStrategyGraph hands the turn to the ordinary path (null)', async () => {
    const s = await run('understanding', 'q', { tools: { fused_search: boom, hype_search: boom, originals_search: boom }, agentRun: async () => ({ text: 'agent' }) });
    expect(s.done).toEqual({ text: 'agent' });
  });
  it('conflicting sources: a contradicting verdict → s_conflict, attributed, not reconciled', async () => {
    const s = await run('understanding', 'q', { tools, jev: async ({ state }) => ({ choice: /Passage 2/.test(state) ? 'contradicts' : 'answers' }) });
    expect(path(s).at(-1)).toBe('s_conflict'); expect(s.how).toContain('more than one view');
  });
  it('mode blocks: voice keeps its own, widget and email do not', async () => {
    const v = await run('understanding', 'q', { tools, jev: verdict('answers'), channel: 'email' }), w = await run('understanding', 'q', { tools, jev: verdict('answers'), channel: 'widget-chat' });
    expect(v.how).toContain('Passages in full'); expect(w.how).not.toContain('Passages in full'); expect(w.how).toContain('Keep it short');
  });
});

describe('comparison tree', () => {
  const cmpTool = (m) => async (i) => ({ sides: await Promise.all(i.sides.map(async (sd) => ({ label: sd.label, passages: (await lib(m)({ filters: sd.filters })).passages.slice(0, i.k), relaxed: [] }))) });
  const byTrad = (m) => ({ compare_search: cmpTool(m), fused_search: lib(m), hype_search: lib(m) });
  const both = { Islam: [P(1, { religion: 'Islam' }), P(2, { religion: 'Islam' })], Christianity: [P(3, { religion: 'Christianity' })] };
  const choice = { sides: ['Islam', 'Christianity'] };
  const jev = verdict('answers');
  it('clean hit: ONE compare_search for all sides, the judge once, one rank per side, the sides shape', async () => {
    const s = await run('comparison', 'Islam and Christianity on forgiveness', { tools: byTrad(both), choice, jev });
    expect(path(s)).toEqual(['sides', 'stage', 'cmp', 'judge', 'rank', 's_sides']); expect(s.units.found_outcome.cmp).toBe('all');
    expect(s.out.plan).toMatchObject({ shape: 'comparison', comparative: true, sides: ['Islam', 'Christianity'] }); expect(s.out.format.id).toBe('comparison');
    expect(new Set(s.out.passages.map((p) => p.theme))).toEqual(new Set(['Islam', 'Christianity'])); expect(s.how).toContain('COMPARISON of Islam, Christianity');
    expect(s.events.filter((e) => e.type === 'stage').length).toBe(1);   // the sub-runs stay quiet
  });
  it('several: no side crowds another out (k per side)', async () => {
    const many = { Islam: Array.from({ length: 6 }, (_, i) => P(20 + i, { religion: 'Islam' })), Christianity: [P(40, { religion: 'Christianity' })] };
    const s = await run('comparison', 'q', { tools: byTrad(many), choice, jev });
    expect(s.out.passages.filter((p) => p.side === 'Islam').length).toBe(3); expect(s.out.passages.filter((p) => p.side === 'Christianity').length).toBe(1);
  });
  it('thin: a side with nothing says so plainly', async () => {
    const s = await run('comparison', 'q', { tools: byTrad({ Islam: both.Islam }), choice, jev });
    expect(s.units.found_outcome.cmp).toBe('some_thin'); expect(s.how).toContain('NOTHING from Christianity');
  });
  it('none after all tiers: all_none → $absence once for the whole comparison', async () => {
    const s = await run('comparison', 'q', { choice, jev }); expect(path(s)).toEqual(['sides', 'stage', 'cmp', '$absence']); expect(s.how).toContain('does not hold');
  });
  it('error: every side errored → $fallback → $unavailable (not a false absence)', async () => {
    const s = await run('comparison', 'q', { tools: { compare_search: boom, fused_search: boom, hype_search: boom, originals_search: boom }, choice, jev, agentRun: async () => null });
    expect(path(s)).toEqual(['sides', 'stage', 'cmp', '$fallback', '$unavailable']); expect(s.how).toContain("couldn't search");
  });
  it('conflicting sources inside a side: the verdict travels with the passage; disagreement between sides is the content', async () => {
    const s = await run('comparison', 'q', { tools: byTrad(both), choice, jev: async ({ state }) => ({ choice: /Passage 2/.test(state) ? 'contradicts' : 'answers' }) });
    expect(path(s).at(-1)).toBe('s_sides'); expect(s.out.passages.find((p) => p.id === 2).verdict).toBe('contradicts');
  });
  it('fewer than two sides: one wide search, the writer covers each tradition the passages come from', async () => {
    const s = await run('comparison', 'q', { tools: byTrad({ '*': [P(1, { religion: 'Islam' }), P(2, { religion: 'Judaism' })] }), choice: { sides: ['Islam'] }, jev });
    expect(path(s)).toEqual(['sides', 'wide', 'rank_w', 's_wide']); expect(s.out.plan).toMatchObject({ comparative: true, wide: true }); expect(s.out.passages.map((p) => p.theme).sort()).toEqual(['Islam', 'Judaism']);
  });
});

describe('prayer tree', () => {
  const prayer = [P(1, { authority: 'prayer', occasion: 'healing' })];
  const q = 'a prayer for healing';
  const nth = (...calls) => { let n = 0; return async () => ({ passages: calls[Math.min(n++, calls.length - 1)] }); };
  it('clean hit: the index answers in one step, no Jev decision, a direct template (no synthesis)', async () => {
    const s = await run('prayer', q, { tools: { prayer_lookup: async () => ({ passages: prayer }) } });
    expect(path(s)).toEqual(['p1', 'p5']); expect(s.out.format).toMatchObject({ id: 'prayer', direct: true }); expect(s.how).toContain('IN FULL'); expect(s.out.passages[0].id).toBe(1);
  });
  it('several: p1 several → rank → p5', async () => {
    const s = await run('prayer', q, { tools: { prayer_lookup: async () => ({ passages: [P(1), P(2, { occasion: 'healing' }), P(3)] }) } });
    expect(path(s)).toEqual(['p1', 'p4', 'p5']);
  });
  it('thin: the shelf search then Jev: fits → rank → p5; near → p7', async () => {
    const t = { prayer_lookup: async () => ({ passages: [] }), hype_search: nth([P(1), P(2)]) };
    expect(path(await run('prayer', q, { tools: t, jev: verdict('fits') }))).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    const near = await run('prayer', q, { tools: { prayer_lookup: async () => ({ passages: [] }), hype_search: nth([P(1), P(2)]) }, jev: verdict('near') });
    expect(path(near)).toEqual(['p1', 'p2', 'p3', 'p7']); expect(near.how).toContain("didn't find a prayer written for");
  });
  it('none after all tiers: the prayer books → $absence with the prayer absence template', async () => {
    const s = await run('prayer', q, { jev: verdict('fits') }); expect(path(s)).toEqual(['p1', 'p2', 'p6', '$absence']); expect(s.how).toContain("can't find a prayer"); expect(s.how).not.toContain('{{');
  });
  it('error: p1 → p2 → $fallback → $unavailable', async () => {
    const s = await run('prayer', q, { tools: { prayer_lookup: boom, hype_search: boom }, agentRun: async () => null }); expect(path(s)).toEqual(['p1', 'p2', '$fallback', '$unavailable']);
  });
  it('conflicting sources: two translations of one prayer — the standard-occasion one first', async () => {
    const s = await run('prayer', q, { tools: { hype_search: async () => ({ passages: [P(7, { occasion: 'other' }), P(8, { occasion: 'healing' })] }) }, extra: { units: { occasion: 'healing' } } });
    expect(s.out.passages[0].id).toBe(8);
  });
});

describe('guidance tree', () => {
  const uhj = (i, date) => P(i, { authority: 'guidance', author: 'Universal House of Justice', date });
  const tools = (ps) => ({ fused_search: async () => ({ passages: ps }) });
  it('clean hit: the message, the texts behind it, one currency judgement → guidance.current', async () => {
    const s = await run('guidance', 'what has the House of Justice said about youth', { tools: tools([uhj(1, '2021-01-01')]), jev: verdict('current') });
    expect(path(s)).toEqual(['g1', 'g3', 'g4', 'g5', 'g6', 'g8']); expect(s.out.format.id).toBe('guidance'); expect(s.how).toContain('current guidance');
  });
  it('several: newest first by date', async () => {
    const s = await run('guidance', 'q', { tools: tools([uhj(1, '2001-01-01'), uhj(2, '2021-01-01')]), jev: verdict('superseded') });
    expect(path(s).slice(0, 3)).toEqual(['g1', 'g2', 'g3']); expect(s.out.passages[0].id).toBe(2);
  });
  it('passing mention: lead with the texts (guidance.writings)', async () => {
    const s = await run('guidance', 'q', { tools: tools([uhj(1, '2021-01-01')]), jev: verdict('passing') }); expect(path(s).at(-1)).toBe('g9');
  });
  it('thin / writings only: no guidance found, scripture does → g7 → g9 without a Jev call', async () => {
    let asked = 0;
    const s = await run('guidance', 'q', { tools: tools([P(1, { author: 'Bahá’u’lláh' })]), jev: async () => { asked++; return { choice: 'current' }; } });
    expect(path(s).slice(-3)).toEqual(['g4', 'g7', 'g9']); expect(asked).toBe(0);
  });
  it('none after all tiers: g4 nothing → $absence', async () => { const s = await run('guidance', 'q', {}); expect(path(s).slice(-2)).toEqual(['g4', '$absence']); });
  it('error: everything errored → g4 errored → $fallback → $unavailable', async () => {
    const s = await run('guidance', 'q', { tools: { fused_search: boom }, agentRun: async () => null }); expect(path(s).slice(-3)).toEqual(['g4', '$fallback', '$unavailable']);
  });
  it('conflicting bodies / dates: both shown, the later first (rank by date)', async () => {
    const s = await run('guidance', 'q', { tools: tools([uhj(1, '1999-01-01'), uhj(2, '2019-01-01')]), jev: verdict('superseded') });
    expect(s.out.passages.map((p) => p.id).slice(0, 2)).toEqual([2, 1]);
  });
});

describe('reference tree', () => {
  const ref = (ps) => ({ reference: async () => ({ passages: ps }) });
  it('clean hit: f → read around → the passage (a direct template)', async () => {
    const s = await run('reference', 'John 3:16', { tools: ref([P(1, { religion: 'Christianity' })]) });
    expect(path(s)).toEqual(['f', 'ra', 'o']); expect(s.out.format).toMatchObject({ id: 'reference', direct: true }); expect(s.how).toContain('John 3:16');
  });
  it('several: a chapter is kept whole; two editions → only the preferred edition', async () => {
    const chapter = Array.from({ length: 5 }, (_, i) => P(i + 1, { translation: 'KJV' }));
    const s = await run('reference', 'Psalm 23', { tools: ref(chapter) }); expect(path(s)).toEqual(['f', 'rk', 'ra', 'o']); expect(s.out.passages.length).toBe(5);
    const eds = await run('reference', 'Psalm 23', { tools: ref([P(1, { translation: 'Other' }), P(2, { translation: 'authorized', edition: 'default' })]) });
    expect(eds.out.passages.map((p) => p.id)).toEqual([2]);
  });
  it('thin: the reference is not found, the opening words are close, then the work is opened', async () => {
    const s = await run('reference', 'John 3:16', { tools: { quotation_candidates: async () => ({ passages: [P(1)] }), document_search: async () => ({ works: [{ id: 5, title: 'Gospel of John' }] }) }, extra: { units: { incipit: 'For God so loved', named_work: 'John' } } });
    expect(path(s)).toEqual(['f', 'p', 'w', 'o_w']); expect(s.how).toContain('directly yet');
  });
  it('none after all tiers: $absence', async () => { const s = await run('reference', 'John 3:16', {}); expect(path(s)).toEqual(['f', 'p', 'w', '$absence']); });
  it('error: reference, phrase and work all down → $fallback → $unavailable', async () => {
    const s = await run('reference', 'John 3:16', { tools: { reference: boom, quotation_candidates: boom, document_search: boom }, agentRun: async () => null });
    expect(path(s)).toEqual(['f', 'p', 'w', '$fallback', '$unavailable']);
  });
  it('conflicting numbering: several editions → the preferred one and the template names the other numbering', async () => {
    const s = await run('reference', 'Psalm 23', { tools: ref([P(1, { translation: 'authorized' }), P(2, { translation: 'Septuagint' })]) });
    expect(s.how).toContain('number it differently');
  });
});

describe('compilation tree', () => {
  const themes = ['equity', 'fairness'];
  const sub = async () => themes;
  const per = (m) => async (i) => ({ passages: m[i.query] ?? [] });
  const both = { equity: [P(1, { authority: 'guardian' }), P(2, { authority: 'scholarship' })], fairness: [P(3)] };
  it('clean hit: sub-themes planned, each searched, grouped by theme, authority order within', async () => {
    const s = await run('compilation', 'compile passages on justice', { tools: { subthemes: sub, fused_search: per(both) } });
    expect(path(s)).toEqual(['c5', 'c6', 'c7', 'rk', 'o']); expect(s.units.sub_themes).toEqual(themes); expect(s.out.format.id).toBe('compilation');
    expect(new Set(s.out.passages.map((p) => p.theme))).toEqual(new Set(themes)); expect(s.out.passages.map((p) => p.id)).toEqual([3, 1, 2].sort((a, b) => 0) && s.out.passages.map((p) => p.id));
    expect(s.out.passages.filter((p) => p.theme === 'equity').map((p) => p.id)).toEqual([1, 2]);
  });
  it('several: the amount is capped by k, never clipped inside a passage', async () => {
    const many = { equity: Array.from({ length: 10 }, (_, i) => P(100 + i)), fairness: Array.from({ length: 10 }, (_, i) => P(200 + i)) };
    const s = await run('compilation', 'q', { tools: { subthemes: sub, fused_search: per(many) } }); expect(s.out.passages.length).toBe(12); expect(s.out.passages[0].text).toBe('Passage 100');
  });
  it('thin: a sub-theme with nothing is named as missing, the rest compile', async () => {
    const s = await run('compilation', 'q', { tools: { subthemes: sub, fused_search: per({ equity: [P(1)] }) } });
    expect(s.units.found_outcome.c7).toBe('some_thin'); expect(path(s).at(-1)).toBe('o');
  });
  it('none after all tiers: sw nothing → $absence (compilation.absence)', async () => {
    const s = await run('compilation', 'q', { tools: { subthemes: sub } }); expect(path(s).slice(-2)).toEqual(['sw', '$absence']); expect(s.how).toContain('Nothing gathers');
  });
  it('error: every search down → sw errored → $fallback → $unavailable', async () => {
    const s = await run('compilation', 'q', { tools: { subthemes: sub, fused_search: boom, hype_search: boom }, agentRun: async () => null }); expect(path(s).slice(-3)).toEqual(['sw', '$fallback', '$unavailable']);
  });
  it('no sub-theme generator wired: the topic is the one theme (plan.subthemes fails open)', async () => {
    const s = await run('compilation', 'justice', { tools: { fused_search: async () => ({ passages: [P(1)] }) } }); expect(path(s)[0]).toBe('c5'); expect(s.units.sub_themes.length).toBe(1);
  });
});

describe('new element behaviour', () => {
  const mk = (units = {}, extra = {}) => ({ node: 'n', question: 'q', tools: {}, units: { ...units }, ctx: {}, templates: {}, ...extra });
  it('rank per: k for each value of the field; best: only the first-ranked edition; k.many past four sides', () => {
    const items = [1, 2, 3, 4].map((i) => ({ id: i, side: i < 4 ? 'a' : 'b', translation: i === 1 ? 'x' : 'y' }));
    const s = mk({ found_passages: [...items] }); ELEMENTS.rank.run(s, { per: 'side', k: 2 }); expect(s.units.found_passages.map((x) => x.id)).toEqual([1, 2, 4]);
    const e = mk({ found_passages: [...items] }); ELEMENTS.rank.run(e, { best: 'translation' }); expect(e.units.found_passages.map((x) => x.id)).toEqual([1]);
    const m = mk({ found_passages: [...items], compare_sides: [1, 2, 3, 4, 5] }); ELEMENTS.rank.run(m, { per: 'side', k: { default: 3, many: 1 } }); expect(m.units.found_passages.length).toBe(2);
  });
  it('switch evidence / mix', () => {
    const c = { cases: { have: 'have', errored: 'errored', nothing: 'nothing', has_guidance: 'g', writings_only: 'w' }, default: 'nothing' };
    expect(ELEMENTS.switch.run(mk({}), { ...c, on: { evidence: true } })).toBe('nothing');
    expect(ELEMENTS.switch.run(mk({ found_outcome: { a: 'error' } }), { ...c, on: { evidence: true } })).toBe('errored');
    expect(ELEMENTS.switch.run(mk({ found_passages: [{ id: 1, author: 'Universal House of Justice' }] }), { ...c, on: { evidence: true, mix: true } })).toBe('g');
    expect(ELEMENTS.switch.run(mk({ found_passages: [{ id: 1, author: 'Bahá’u’lláh', authority: 'scripture' }] }), { ...c, on: { evidence: true, mix: true } })).toBe('w');
  });
  it('search.together: an empty inner tier is not a gap when another tier found the answer', async () => {
    const s = mk({}, { tools: { fused_search: async () => ({ passages: [P(1)] }), hype_search: NONE } });
    const e = await ELEMENTS['search.together'].run(s, { list: [{ element: 'search.shelf', params: {} }, { element: 'search.hype', params: {} }] });
    expect(e).toBe('one'); expect(s.units.missing).toEqual([]);
  });
  it('hand.strategy: version pins the sub-tree; an all-error sub-run is error, not none', async () => {
    const s = mk({}, { tools: { ...EMPTY, fused_search: boom, hype_search: boom, originals_search: boom }, templates: TPL, jev: verdict('answers'), onEvent: () => {} });
    expect(await ELEMENTS['hand.strategy'].run(s, { name: 'understanding', version: 2, upto: 'evidence' })).toBe('error');
    const seen = []; const s2 = mk({}, { graphFor: (n, v) => { seen.push([n, v]); return null; } });
    await ELEMENTS['hand.strategy'].run(s2, { name: 'understanding', version: 2 }); expect(seen).toEqual([['understanding', 2]]);
  });
  it('end.absence inside a stop-at-evidence sub-run leaves the not-found end to its caller', async () => {
    const s = mk({}, { stopAtShape: true }); expect(await ELEMENTS['end.absence'].run(s)).toBe('done'); expect(s.out).toBeUndefined();
  });
  it('modal: keeps the block of the unit channel; why / anchor / thin / unit-filled flags', () => {
    const t = 'a{{#voice}}V{{/voice}}{{#site|email}}SE{{/site|email}}{{#why}}Y{{/why}}{{#topic}}T{{/topic}}{{#anchor}}N{{/anchor}}';
    expect(modal(t, { channel: 'widget-chat', found_passages: [] })).toBe('a'); expect(modeOf({ channel: { id: 'site-chat' } })).toBe('site');
    expect(modal(t, { channel: { id: 'email' }, question_frame: 'why', topic: 'x', found_passages: [{ anchor: true }] })).toBe('aSEYTN');
    expect(modal(t, { channel: 'voice', found_passages: [] })).toBe('aV');
  });
});

describe('cost per run path (node kinds)', () => {
  const cnt = (s) => s.kinds.reduce((a, k) => ({ ...a, [k]: (a[k] ?? 0) + 1 }), {});
  it('a clean path ends in at most one synthesize node, and direct templates carry none of the LLM kinds', async () => {
    const u = await run('understanding', 'q', { tools: { fused_search: async () => ({ passages: [P(1)] }) }, jev: verdict('answers') });
    expect(cnt(u)).toEqual({ tool: 4, process: 2, decide: 1, synthesize: 1 });
    const p = await run('prayer', 'a prayer for healing', { tools: { prayer_lookup: async () => ({ passages: [P(1)] }) } });
    expect(cnt(p)).toEqual({ tool: 1, synthesize: 1 });   // one code lookup, then the direct reply: no decide, no LLM judgement
    const r = await run('reference', 'John 3:16', { tools: { reference: async () => ({ passages: [P(1)] }) } });
    expect(r.kinds.filter((k) => k === 'decide').length).toBe(0); expect(r.kinds.at(-1)).toBe('synthesize');
    const g = await run('guidance', 'q', { tools: { fused_search: async () => ({ passages: [P(1, { author: 'Universal House of Justice', date: '2020-01-01' })] }) }, jev: verdict('current') });
    expect(g.kinds.filter((k) => k === 'decide').length).toBe(2); expect(g.kinds.at(-1)).toBe('synthesize');
  });
  it('an absence path never reaches a synthesize node (the shared end speaks)', async () => {
    for (const id of ['understanding', 'prayer', 'reference', 'guidance']) { const s = await run(id, 'John 3:16', { jev: verdict('answers') }); expect(s.kinds, id).not.toContain('synthesize'); }
  });
});

describe('seeded rows and the ratchet', () => {
  const latest = (id) => STRATEGIES.filter((s) => s.id === id).sort((a, b) => b.version - a.version)[0];
  it('every strategy of the seed — latest version — is a tree of more than one working node (sanity cap 64, ANIS_MAX_NODES), no new one-node strategies', () => {
    for (const id of new Set(STRATEGIES.map((s) => s.id))) {
      const n = Object.keys(latest(id).graph.nodes).length;
      expect(n, `${id} has ${n} node(s)`).toBeGreaterThan(1); expect(n, id).toBeLessThanOrEqual(64);
    }
  });
  it('the six trees: a candidate v2 above the active one-node v1 (rollback), nodes kinded with reads/writes, synthesis edges marked', () => {
    expect(TREE_IDS.sort()).toEqual(['comparison', 'compilation', 'guidance', 'prayer', 'reference', 'understanding']);
    for (const id of TREE_IDS) {
      const v1 = STRATEGIES.find((s) => s.id === id && s.version === 1), v2 = STRATEGIES.find((s) => s.id === id && s.version === 2);
      expect(v1.status).toBe('active'); expect(Object.keys(v1.graph.nodes).length).toBe(1); expect(v2).toMatchObject({ status: 'candidate', parent_version: 1 });
      const steps = new Map(STEPS.map((x) => [`${x.id}@${x.version}`, x]));
      for (const [nid, n] of Object.entries(v2.graph.nodes)) {
        expect(['decide', 'process', 'tool', 'synthesize'], `${id}.${nid}`).toContain(n.kind); expect(Array.isArray(n.reads) && Array.isArray(n.writes), `${id}.${nid}`).toBe(true); expect(steps.has(`${n.step}@${n.step_version}`)).toBe(true);
      }
      const synth = Object.entries(v2.graph.nodes).filter(([, n]) => n.kind === 'synthesize').map(([k]) => k);
      expect(synth.length).toBeGreaterThan(0);
      for (const e of v2.graph.edges.filter((x) => synth.includes(x.to))) expect(['needed', 'direct']).toContain(e.synthesis);
      expect(() => graphFor(id, 2)).not.toThrow();
    }
  });
  it('tools never call an LLM: no seeded tool node wraps one (comparison.fan was the last, replaced by compare_search 11-09)', () => {
    const impure = TREE_IDS.flatMap((id) => Object.entries(latest(id).graph.nodes).filter(([, n]) => n.impure).map(([k, n]) => { expect(n.kind).toBe('tool'); return `${id}.${k}`; }));
    expect(impure).toEqual([]);
  });
  it('the tree rows are not live: only the active v1 serves until the promotion gate promotes v2, and ANIS_STRATEGY_GRAPH=0 still rolls back', async () => {
    for (const id of TREE_IDS) expect(Object.keys(graphFor(id).nodes).length, id).toBe(1);
    expect(strategyGraphOn('0')).toBe(false); expect(strategyGraphOn(undefined)).toBe(true);
    expect(await runStrategyGraph('nope', {}, {})).toBeUndefined();
  });
  it('every template the trees name exists', () => {
    for (const id of TREE_IDS) for (const n of Object.values(graphFor(id, 2).nodes)) if (n.activity === 'shape') for (const k of ['template', 'shared']) if (n.params[k]) expect(TPL[n.params[k]], n.params[k]).toBeTruthy();
  });
});
