// Rev B trees (claim_check, timeline, history_fact): criteria/entries planned by the light generators, searched per value, weighed once at tree level;
// the generalized dated-claims judge (any subject); the web path reaches the writer labelled; every new tree passes validateCandidate. All mocked: no model spend.
import { describe, it, expect } from 'vitest';
import { graphFor, runGraph, entryUnits } from '../../api/lib/assistant/activities/graph.js';
import { ELEMENTS } from '../../api/lib/assistant/activities/elements.js';
import { TEMPLATES } from '../../api/lib/assistant/strategy-seed.js';
import { TREE_GRAPHS, TREE_STEPS, TREE_TEMPLATES, TREE_DESCRIPTIONS } from '../../api/lib/assistant/strategy-trees-seed.js';
import { validateCandidate } from '../../api/lib/assistant/strategy-design.js';
import { catalog } from '../../api/lib/repos/strategies-repo.js';
import { generateList } from '../../api/lib/assistant/judges.js';
import { withAIContext, currentAIContext } from '../../api/lib/ai-context.js';
import { judgeTimeline } from '../../api/lib/assistant/judges.js';

const TPL = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.text]));
const NONE = async () => ({ passages: [] });
const EMPTY = { fused_search: NONE, hype_search: NONE, originals_search: NONE, web_search: async () => null };
const path = (s) => s.trace.map((t) => t.node);
const NEW = ['claim_check', 'timeline', 'history_fact', 'history_event'];

async function run(id, q, { tools = {}, units = {}, jev, extra = {} } = {}) {
  const g = graphFor(id, 2);
  const s = { choice: { units }, ctx: {}, trace: [], question: q, messages: [], tools: { ...EMPTY, ...tools }, jev, templates: TPL, onEvent: () => {}, judges: { generate: async () => ({ items: [], ok: false, error: 'no model in tests' }) }, ...extra };
  s.units = entryUnits(g, { units }, { query: q, question: q, channel: { id: 'site-chat' }, messages: [] });
  await runGraph(g, s);
  s.how = s.out?.format?.how ?? '';
  return s;
}
const stored = (id) => JSON.stringify([TREE_STEPS.filter((x) => x.id.startsWith(`tree.${id}.`)), TREE_TEMPLATES.filter((t) => t.id.startsWith(`${id}.`))]);

describe('plan.criteria / plan.entries: light generators, the subject itself by default', () => {
  it('generator wired → its list; none → [subject] and fail', async () => {
    const mk = (tools, units) => ({ node: 'n', question: 'q', tools, units: { ...units }, ctx: {}, judges: { generate: async () => ({ items: [], ok: false, error: 'no model in tests' }) } });
    let s = mk({ criteria: async ({ subject }) => [`${subject} a`, `${subject} b`] }, { challenged_claim: 'c' });
    expect(await ELEMENTS['plan.criteria'].run(s, { n: 2 })).toBe('done'); expect(s.units.criteria).toEqual(['c a', 'c b']);
    s = mk({}, { challenged_claim: 'c', topic: 't' }); expect(await ELEMENTS['plan.criteria'].run(s, {})).toBe('fail'); expect(s.units.criteria).toEqual(['c']);
    s = mk({}, { topic: 't' }); expect(await ELEMENTS['plan.entries'].run(s, {})).toBe('fail'); expect(s.units.entries).toEqual(['t']);
  });
});

describe('claim_check', () => {
  const claim = "Bahá'u'lláh taught the equality of women";
  it('the claim → criteria planned → each searched (own texts, scholarship, web) → weighed per criterion → shaped criterion by criterion', async () => {
    const crit = ['the equality of women and men in the Writings of Bahá’u’lláh', 'the education of girls'];
    const shelfQ = [], webQ = [], asked = [];
    const tools = {
      criteria: async ({ subject }) => { expect(subject).toBe(claim); return crit; },
      fused_search: async (i) => { shelfQ.push(i.query); return { passages: [{ id: `${i.query}|${shelfQ.length}`, text: `On ${i.query}`, document_id: shelfQ.length, paragraph_index: 1, religion: "Baha'i", authority: 'scripture', score: 0.9 }] }; },
      web_search: async (i) => { webQ.push(i.query); return { text: `web on ${i.query}`, citations: [`https://example.org/${webQ.length}`] }; },
    };
    const jev = async ({ question, options }) => { asked.push(question); expect(options.map((o) => o.edge)).toEqual(['supports', 'contradicts', 'silent']); return { choice: 'supports' }; };
    const s = await run('claim_check', claim, { tools, units: { challenged_claim: claim, topic: 'equality of women' }, jev });
    expect(path(s)).toEqual(['k1', 'k3', 'k4', 'k5', 'k6']);
    expect([...new Set(shelfQ)].sort()).toEqual([...crit].sort()); expect(shelfQ.length).toBe(4);   // two library tiers per criterion, the query = the criterion, nothing added
    expect(webQ.sort()).toEqual([...crit].sort());
    expect(asked.length).toBe(2); crit.forEach((c, i) => expect(asked[i]).toContain(c));
    expect(s.units.criterion_verdicts).toEqual(crit.map((c) => `${c}: supports`));
    const themes = s.out.passages.map((p) => p.theme);
    for (const c of crit) { expect(themes).toContain(c); expect(themes).toContain(`${c} · web (outside the library)`); }
    expect(s.out.passages.filter((p) => p.web).every((p) => p.author === 'web search' && /^Web: /.test(p.title))).toBe(true);
    expect(s.how).toContain(claim); expect(s.how).toContain('criterion by criterion'); expect(s.how).not.toMatch(/\{\{\w+\}\}/);
  });
  it('"is X a cult": no criterion is stored anywhere; with no generator the claim itself is the one criterion and the query', async () => {
    expect(stored('claim_check')).not.toMatch(/\bcult|\bsect\b|authoritarian|charismatic|coerc|totalitarian|brainwash/i);
    const q = [];
    const s = await run('claim_check', 'is X a cult', { tools: { fused_search: async (i) => { q.push(i.query); return { passages: [] }; }, web_search: async () => ({ text: 'w', citations: ['https://e.org'] }) }, units: { challenged_claim: 'X is a cult' }, jev: async () => ({ choice: 'silent' }) });
    expect(s.units.criteria).toEqual(['X is a cult']); expect(q).toEqual(['X is a cult', 'X is a cult']);
    expect(path(s)).toEqual(['k1', 'k3', 'k4', 'k7']); expect(s.how).toContain('silent');
  });
});

describe('timeline: dated claims about any subject', () => {
  const entries = ["the Buddha's birth", 'the enlightenment', 'the first sermon', 'the death of the Buddha'];
  const DATES = { "the Buddha's birth": ['c. 563 BCE', -563], 'the enlightenment': ['c. 528 BCE', -528], 'the death of the Buddha': ['c. 483 BCE', -483] };
  const tools = { entries: async () => entries, fused_search: async (i) => ({ passages: [{ id: i.query, title: 'A Life of the Buddha', text: `${i.query}${DATES[i.query] ? ` took place in ${DATES[i.query][0]}` : ''}.`, religion: 'Buddhism', authority: 'history', document_id: 1, paragraph_index: entries.indexOf(i.query) }] }) };
  // the model: dates only what the catalog line states (exercises judgeDated's prompt, parse and keep-only-dated)
  const complete = async (messages) => {
    const lines = messages[1].content.split('CATALOG:\n')[1].split('\n');
    return { content: JSON.stringify({ dated: lines.flatMap((l) => { const [id, rest] = [l.slice(0, l.indexOf('|')), l.slice(l.indexOf('|') + 1)]; const e = Object.keys(DATES).find((k) => rest.includes(`${k} took place`)); return e ? [{ id: Number(id), date: DATES[e][0], year: DATES[e][1], event: e }] : []; }) }) };
  };
  it("the Buddha's life: entries searched, dated ones kept oldest first, the undated listed apart, no 'ministry' anywhere", async () => {
    const s = await run('timeline', "a timeline of the Buddha's life", { tools, units: { topic: "the Buddha's life" }, extra: { complete } });
    expect(path(s)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
    expect(s.out.passages.map((p) => p.year)).toEqual([-563, -528, -483]);
    expect(s.out.passages[0].theme).toBe("c. 563 BCE · the Buddha's birth");
    expect(s.units.undated_entries).toEqual(['the first sermon']);
    expect(s.how).toContain('Not dated in the sources found'); expect(s.how).toContain('the first sermon');
    expect(s.how).not.toMatch(/ministr/i); expect(stored('timeline')).not.toMatch(/ministr/i);
  });
  it('nothing dated → the undated shape; the people path of judge.timeline is unchanged', async () => {
    const s = await run('timeline', 'a timeline of X', { tools: { ...tools, entries: async () => ['the first sermon'] }, units: { topic: 'X' }, extra: { complete } });
    expect(path(s)).toEqual(['l1', 'l2', 'l3', 'l6']); expect(s.how).toContain('None of the sources found states a date');
    let seen = null; const people = [{ id: 1, name: 'A', evidence: [{ statement: 's' }] }];
    const st = { node: 'n', question: 'who met X', units: { found_records: people }, ctx: {}, judges: { timeline: async (a) => { seen = a; return { people: [{ ...people[0], clause: 'met X' }], judged: true }; }, dated: async () => { throw new Error('not for people'); } } };
    expect(await ELEMENTS['judge.timeline'].run(st, {})).toBe('matched'); expect(seen.people).toEqual(people); expect(st.units.found_records[0].clause).toBe('met X');
    expect(typeof judgeTimeline).toBe('function');
  });
});

describe('timeline spans the whole range asked (round 5: three ministries, only the Báb and early Bahá’u’lláh reached the writer)', () => {
  it('rank spread: the top k taken in turns across the planned entries, so an early entry with many dated finds cannot crowd out the later ones', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id: `b${i}`, year: 1844 + i, side: 'the ministry of the Báb', text: `b${i}` }));
    const late = [{ id: 'a1', year: 1892, side: "'Abdu'l-Bahá's ministry", text: 'a1' }, { id: 'a2', year: 1921, side: "the passing of 'Abdu'l-Bahá", text: 'a2' }];
    const st = () => ({ node: 'l4', units: { found_passages: [...many, ...late] }, ctx: {} });
    const plain = st(); ELEMENTS.rank.run(plain, { by: ['history'], k: 12 });
    expect(plain.units.found_passages.map((x) => x.id)).not.toContain('a2');   // the global top 12 (oldest first) is all the Báb
    const spread = st(); ELEMENTS.rank.run(spread, { by: ['history'], k: 12, spread: 'side' });
    const ids = spread.units.found_passages.map((x) => x.id);
    expect(ids.length).toBe(12); expect(ids).toContain('a1'); expect(ids).toContain('a2');
    expect(spread.units.found_passages.map((x) => x.year)).toEqual([...spread.units.found_passages.map((x) => x.year)].sort((a, b) => a - b));   // still oldest first
    expect(JSON.stringify(TREE_STEPS.find((x) => x.id === 'tree.timeline.l4'))).toContain('"spread":"side"');
  });
  it('the entries generator is told to cover the whole span, each named figure or period its share', async () => {
    let sys = '';
    await generateList({ kind: 'entries', subject: "the ministries of the Báb, Bahá'u'lláh and 'Abdu'l-Bahá", n: 8, complete: async (m) => { sys = m[0].content; return { content: '{"items":["a"]}' }; } });
    expect(sys).toMatch(/WHOLE span/); expect(sys).toMatch(/fair share/);
  });
});

describe('history_fact', () => {
  it('no library history: the web path reads web_found and the writer gets the web finds, labelled', async () => {
    const s = await run('history_fact', 'when was the Brahmo Samaj founded', { tools: { web_search: async () => ({ text: 'Founded in 1828 in Calcutta.', citations: ['https://example.org/brahmo'] }) }, units: { topic: 'founding of the Brahmo Samaj', fact_asked: 'date' } });
    expect(path(s)).toEqual(['h0', 'h0b', 'h1', 'h2', 'h7', 'h8']);
    const h7 = graphFor('history_fact', 2).nodes.h7; expect(h7.reads ?? TREE_GRAPHS.history_fact.nodes.h7.reads).toContain('web_found');
    expect(s.out.passages).toEqual([expect.objectContaining({ web: true, text: 'Founded in 1828 in Calcutta.', source_url: 'https://example.org/brahmo', title: 'Web: example.org' })]);
    expect(s.how).toContain('outside the library');
  });
  it('library histories found: judged in historical precedence, the fact shaped; disagreement shaped apart', async () => {
    const tools = { fused_search: async () => ({ passages: [{ id: 1, text: 'In 1828…', authority: 'history', religion: 'Hinduism', document_id: 1, paragraph_index: 1 }] }) };
    let s = await run('history_fact', 'when', { tools, units: { topic: 'founding of the Brahmo Samaj', fact_asked: 'date' }, jev: async () => ({ choice: 'answers' }) });
    expect(path(s)).toEqual(['h0', 'h0b', 'h1', 'h2', 'h3', 'h4', 'h5']); expect(s.how).toContain('historical precedence'); expect(s.how).toContain('The reader asks for the date');
    s = await run('history_fact', 'when', { tools, units: { topic: 'founding' }, jev: async () => ({ choice: 'contradicts' }) });
    expect(path(s)).toEqual(['h0', 'h0b', 'h1', 'h2', 'h3', 'h4c', 'h6']);
  });
  it('round 5 "Who founded Sikhism?": the founder\'s own scripture is searched beside the histories, and passages that only set the fact stay after the one that states it', async () => {
    const auths = [], P = (id, title, authority, text) => ({ id, title, authority, text, religion: 'Sikh', document_id: id, paragraph_index: 1, score: 0.5 });
    const tools = { fused_search: async (i) => { const a = [i.filters?.authority].flat().filter(Boolean); auths.push(a);
      return { passages: a.includes('scripture') ? [P(3, 'Guru Granth Sahib - Japji Sahib', 'scripture', 'There is but one God, whose name is true, the Creator.')]
        : [P(2, 'The Sikh Religion Vol. 1 - Life of Guru Nanak', 'scholarship', 'Guru Nanak was born in 1469 at Talwandi.'), P(1, 'The Sikhs', 'scholarship', 'The Sikh religion as it was founded by Nanak was a pure monotheism.')] }; } };
    const jev = async ({ state }) => ({ choice: /founded/.test(state) ? 'answers' : 'mentions_only' });
    const s = await run('history_fact', 'Who founded Sikhism?', { tools, units: { topic: 'founder of Sikhism', fact_asked: 'founder' }, jev });
    expect(path(s)).toEqual(['h0', 'h0b', 'h1', 'h2', 'h3', 'h4', 'h5']);
    expect(auths.some((a) => a.includes('scripture'))).toBe(true);
    expect(auths.some((a) => a.includes('history'))).toBe(true);
    const ids = s.out.passages.filter((p) => !p.web).map((p) => p.id);
    expect(ids[0]).toBe(1);                                   // the passage that states the founder leads
    expect([...ids].sort()).toEqual([1, 2, 3]);                 // Macauliffe's life and Guru Nanak's own words stay as the setting
    expect(s.how).toContain("the founder's own words");
  });
});

describe('history_fact: the narrative history reaches the writer (11-10 "How was the Báb martyred?")', () => {
  it('the histories are searched on the texts\' own phrasing too (the light generator), not only the question as asked', async () => {
    const queries = [];
    const tools = { fused_search: async (i) => { queries.push([i.query, [i.filters?.authority].flat().join()]); return { passages: [] }; } };
    await run('history_fact', 'How was the Báb martyred?', { tools, units: {}, extra: { judges: { generate: async ({ kind }) => ({ ok: true, items: kind === 'phrasings' ? ['the martyrdom of the Báb at Tabríz'] : [] }) } } });
    expect(queries).toContainEqual(['the martyrdom of the Báb at Tabríz', 'history,scholarship']);
    expect(queries).toContainEqual(['How was the Báb martyred?', 'history,scholarship']);
  });
  it('the standard histories the generator names are searched inside (work filter) on each phrasing and on the question; none named → no in-work search', async () => {
    const calls = [];
    const tools = { fused_search: async (i) => { calls.push(i); return { passages: [] }; } };
    const gen = (hist) => ({ judges: { generate: async ({ kind }) => (kind === 'histories' ? (hist ? { ok: true, items: hist } : { ok: false, error: 'x' }) : { ok: true, items: ['the martyrdom of the Báb'] }) } });
    await run('history_fact', 'How was the Báb martyred?', { tools, units: {}, extra: gen(['The Dawn-Breakers']) });
    expect(calls.filter((c) => c.filters?.work).map((c) => [c.query, c.filters.work]).sort()).toEqual([['How was the Báb martyred?', 'The Dawn-Breakers'], ['the martyrdom of the Báb', 'The Dawn-Breakers']]);
    calls.length = 0;
    await run('history_fact', 'How was the Báb martyred?', { tools, units: {}, extra: gen(null) });
    expect(calls.some((c) => c.filters?.work)).toBe(false);
  });
  it('within one authority kind, a passage found on the texts\' own wording outranks one found on the reader\'s words (Star of the West took the one history slot)', async () => {
    const P = (id, title) => ({ id, title, authority: 'scholarship', score: 0.5, text: `passage ${id}`, religion: "Bahá'í", document_id: id, paragraph_index: 1 });
    const tools = { fused_search: async (i) => ({ passages: !/history/.test([i.filters?.authority].flat().join()) ? []
      : i.query === 'the martyrdom of the Báb' ? [P(10, 'The Dawn-Breakers')] : [1, 2, 3, 4, 5, 6, 7, 8].map((n) => P(n, `Star of the West ${n}`)) }) };
    const s = await run('history_fact', 'How was the Báb martyred?', { tools, units: {}, jev: async () => ({ choice: 'answers' }),
      extra: { judges: { generate: async ({ kind }) => ({ ok: true, items: kind === 'phrasings' ? ['the martyrdom of the Báb'] : [] }) } } });
    expect(s.units.found_passages[0].title).toBe('The Dawn-Breakers');
  });
  it('a passage found inside the named standard history leads its kind even when the judge places another source higher (11-10: Browne and Star of the West took both history slots)', async () => {
    const P = (id, title) => ({ id, title, authority: 'scholarship', score: 0.5, text: `passage ${id}`, religion: "Bahá'í", document_id: id, paragraph_index: 1 });
    const tools = { fused_search: async (i) => ({ passages: i.filters?.work ? [P(10, 'The Dawn-Breakers')] : /history/.test([i.filters?.authority].flat().join()) ? [P(1, 'A Year Amongst the Persians'), P(2, 'Star of the West'), P(3, 'Star of the West 2')] : [] }) };
    const jev = async ({ state }) => ({ choice: /Dawn-Breakers/.test(state) ? 'scholarship' : 'contemporary account' });
    const s = await run('history_fact', 'How was the Báb martyred?', { tools, units: {}, jev,
      extra: { judges: { generate: async ({ kind }) => ({ ok: true, items: kind === 'histories' ? ['The Dawn-Breakers'] : ['the martyrdom of the Báb'] }) } } });
    expect(s.units.found_passages[0].title).toBe('The Dawn-Breakers');
  });
  it('the judge places each answer by its source (primary record first): Nabíl outranks a travel diary of the same kind, and Jev sees the source', async () => {
    const P = (id, title, author) => ({ id, title, author, authority: 'scholarship', score: 0.5, text: `passage ${id}`, religion: "Bahá'í", document_id: id, paragraph_index: 1 });
    const tools = { fused_search: async (i) => ({ passages: /history/.test([i.filters?.authority].flat().join()) ? [P(1, 'Adventures in Persia', 'Sinclair'), P(2, 'The Dawn-Breakers', 'Nabíl-i-A‘ẓam')] : [] }) };
    const seen = [];
    const jev = async ({ options, state }) => { seen.push([options.map((o) => o.edge), state]); return { choice: /Dawn-Breakers/.test(state) ? 'primary record' : 'scholarship' }; };
    const s = await run('history_fact', 'How was the Báb martyred?', { tools, units: { topic: 'martyrdom of the Báb' }, jev });
    expect(s.units.found_passages.map((x) => x.title)).toEqual(['The Dawn-Breakers', 'Adventures in Persia']);
    expect(s.units.found_passages.every((x) => x.verdict === 'answers')).toBe(true);
    const judged = seen.find(([, st]) => /Source: The Dawn-Breakers — Nabíl/.test(st));
    expect(judged?.[0]).toEqual(['primary record', 'contemporary account', 'scholarship', 'mentions_only', 'contradicts']);
  });
  it('the histories are searched apart from the Guardian, and the top k spreads across kinds so a lower-scoring Dawn-Breakers passage survives', async () => {
    const auths = [], P = (id, title, authority, score) => ({ id, title, authority, score, text: `passage ${id}`, religion: "Bahá'í", document_id: id, paragraph_index: 1 });
    const tools = { fused_search: async (i) => { const a = [i.filters?.authority].flat().filter(Boolean); auths.push(a);
      if (a.includes('interpretation')) return { passages: [1, 2, 3].map((n) => P(n, 'God Passes By', 'interpretation', 0.9 - n / 100)) };
      if (a.includes('history')) return { passages: [P(10, 'The Dawn-Breakers', 'scholarship', 0.5)] };
      return { passages: [] }; } };
    const s = await run('history_fact', 'How was the Báb martyred?', { tools, units: { topic: 'martyrdom of the Báb' }, jev: async () => ({ choice: 'answers' }) });
    expect(auths.some((a) => a.includes('history') && !a.includes('interpretation'))).toBe(true);
    expect(auths.some((a) => a.length === 1 && a[0] === 'interpretation')).toBe(true);
    expect(s.out.passages.map((p) => p.id)).toContain(10);
  });
});

describe('history_event: what happened, told from the histories (11-10: "How was the Báb martyred?" had no card → a 110 s live plan → general_research)', () => {
  it('searches inside the named history like history_fact, and Jev judges whether each passage NARRATES the event', async () => {
    const calls = [], asked = [];
    const P = (id, title) => ({ id, title, authority: 'scholarship', score: 0.5, text: `passage ${id}`, religion: "Bahá'í", document_id: id, paragraph_index: 1 });
    const tools = { fused_search: async (i) => { calls.push(i); return { passages: i.filters?.work ? [1, 2, 3, 4, 5].map((n) => P(n, 'The Dawn-Breakers')) : [] }; } };
    const jev = async ({ question }) => { asked.push(question); return { choice: 'primary record' }; };
    const s = await run('history_event', 'How was the Báb martyred?', { tools, units: { topic: 'the martyrdom of the Báb' }, jev,
      extra: { judges: { generate: async ({ kind }) => ({ ok: true, items: kind === 'histories' ? ['The Dawn-Breakers'] : ['the martyrdom of the Báb'] }) } } });
    expect(calls.some((c) => c.filters?.work === 'The Dawn-Breakers' && c.limit === 5)).toBe(true);
    expect(asked[0]).toMatch(/narrate the martyrdom of the Báb/);
    expect(s.units.found_passages.length).toBe(5);   // the story keeps every narrating paragraph, not the fact's top 7 across kinds alone
    expect(path(s).at(-1)).toBe('h5');
    expect(TPL['history_event.story']).toMatch(/never say the library lacks a detail a passage below gives/);
  });
  it('its card takes the story of an event and leaves the single date, the person and the chronology to their own cards', () => {
    expect(TREE_DESCRIPTIONS.history_event).toMatch(/how was the Báb martyred/);
    expect(TREE_DESCRIPTIONS.history_fact).toMatch(/Not for: Tell me the story of how Quddús was martyred/);
    expect(TREE_DESCRIPTIONS.history_event).toMatch(/Not for: When did the Báb declare His mission/);
  });
});

describe('every rev-B tree passes validateCandidate', () => {
  for (const id of NEW) it(id, () => {
    const g = TREE_GRAPHS[id], steps = TREE_STEPS.filter((x) => x.id.startsWith(`tree.${id}.`)), templates = TREE_TEMPLATES.filter((t) => t.id.startsWith(`${id}.`));
    const mine = new Set([...steps.map((x) => x.id), ...templates.map((t) => t.id)]), c0 = catalog();
    const drop = (m) => new Map([...m].filter(([k]) => !mine.has(k) && !mine.has(String(k).replace(/@\d+$/, ''))));
    const cat = { ...c0, templates: { ...c0.templates, latest: drop(c0.templates.latest) }, steps: { ...c0.steps, latest: drop(c0.steps.latest), byKey: drop(c0.steps.byKey) } };
    const c = { name: id, description: TREE_DESCRIPTIONS[id], exemplars: ['a first class phrasing?', 'a second class phrasing?'], templates: templates.map(({ id: tid, text }) => ({ id: tid, text })),
      steps: steps.map(({ id: sid, activity, params }) => ({ id: sid, activity, params })), graph: { entry: g.entry, nodes: Object.fromEntries(Object.entries(g.nodes).map(([k, n]) => [k, { step: n.step }])), edges: g.edges } };
    const v = validateCandidate(c, { cat });
    expect(v.errors).toEqual([]); expect(v.ok).toBe(true);
    // every declared edge of every node is routed somewhere (no edge falls to $fallback by omission)
    for (const [nid, n] of Object.entries(g.nodes)) { const st = steps.find((x) => x.id === n.step), el = ELEMENTS[st.activity], outs = el.edgesFor ? el.edgesFor(st.params) : el.edges;
      for (const e of outs) expect(g.edges.some((x) => x.from === nid && (x.on === e || x.on === '*')), `${id}.${nid} edge ${e}`).toBe(true); }
  });
});

describe('the light generators, wired (Result 2): one model call each, metered, the subject itself on failure', () => {
  const reply = (items) => async () => ({ content: JSON.stringify({ items }) });
  it('generateList: each kind → a list; the tradition is context only, never assumed; n bounds the list', async () => {
    const seen = [];
    const complete = async (messages) => { seen.push(messages); return { content: JSON.stringify({ items: ['a', 'b', 'A', 'c'] }) }; };
    for (const kind of ['subthemes', 'criteria', 'entries']) {
      const r = await generateList({ kind, subject: 'the covenant', n: 2, tradition: "Baha'i", complete });
      expect(r).toEqual({ items: ['a', 'b'], ok: true });
    }
    expect(seen[0][0].content).toMatch(/NEVER by author/); expect(seen[1][0].content).toMatch(/true or false/); expect(seen[2][0].content).toMatch(/timeline/);
    expect(seen.every((m) => m[0].content.includes("Baha'i (context only") && m[1].content === 'SUBJECT: the covenant')).toBe(true);
    await generateList({ kind: 'criteria', subject: 'the Buddha taught no self', complete });
    expect(seen.at(-1)[0].content).toContain('do not assume any tradition');
    expect(await generateList({ kind: 'entries', subject: 'x', complete: async () => { throw new Error('timeout'); } })).toEqual({ items: [], ok: false, error: 'timeout' });
    expect((await generateList({ kind: 'entries', subject: 'x', complete: async () => ({ content: 'no json' }) })).ok).toBe(false);
  });
  for (const [name, unit, units, items] of [['plan.subthemes', 'sub_themes', { topic: 'justice' }, ['equity', 'trustworthiness']],
    ['plan.criteria', 'criteria', { challenged_claim: 'X is a cult', topic: 'X' }, ['Does X have a living leader whose word is beyond question?', 'What do X\'s texts say about leaving?']],
    ['plan.entries', 'entries', { topic: 'the life of the Buddha' }, ['birth at Lumbini', 'the enlightenment', 'the first sermon']]]) {
    it(`${name}: no seam → the model generator → done, the unit holds its list, the step carries the call and its cost`, async () => {
      const meter = [], decisions = [];
      const complete = async (messages, opts) => { expect(opts.responseFormat).toEqual({ type: 'json_object' }); currentAIContext().meter.push({ model: 'claude-haiku-5-5', usd: 0.0004 }); return { content: JSON.stringify({ items }) }; };
      const s = { node: 'g1', question: 'q', tools: {}, units: { ...units, religions_specified: ["Baha'i"] }, ctx: { decisions: { record: (pt, d) => decisions.push([pt, d]) } }, complete };
      const edge = await withAIContext({ meter }, () => ELEMENTS[name].run(s, { n: 3 }));
      expect(edge).toBe('done'); expect(s.units[unit]).toEqual(items.slice(0, 3));
      expect(s.note).toMatchObject({ generator: 'model', count: items.slice(0, 3).length, llm: { calls: 1, usd: 0.0004, model: 'claude-haiku-5-5' }, read: { tradition: "Baha'i" } });
      expect(decisions[0]).toEqual([`plan:${unit}`, expect.objectContaining({ by: 'model', chosen: 'done' })]);
    });
    it(`${name}: model error → the subject itself and fail (unchanged)`, async () => {
      const s = { node: 'g1', question: 'q', tools: {}, units: { ...units }, ctx: {}, complete: async () => { throw new Error('upstream 529'); } };
      expect(await ELEMENTS[name].run(s, {})).toBe('fail');
      expect(s.units[unit]).toEqual([Object.values(units)[0]]); expect(s.note).toMatchObject({ generator: 'model', error: 'upstream 529' });
    });
  }
  it('claim_check end to end: the generated criteria are what the tree fans out over', async () => {
    const q = [];
    const s = await run('claim_check', 'is X a cult', { tools: { fused_search: async (i) => { q.push(i.query); return { passages: [] }; } }, units: { challenged_claim: 'X is a cult' },
      jev: async () => ({ choice: 'silent' }), extra: { judges: {}, complete: reply(['Does X control its members?', 'Can members leave freely?']) } });
    expect(s.trace[0]).toMatchObject({ node: 'k1', edge: 'done' }); expect(s.units.criteria.length).toBe(2);
    expect(q.slice(0, 4).sort()).toEqual(['Can members leave freely?', 'Can members leave freely?', 'Does X control its members?', 'Does X control its members?']);   // two library tiers per generated criterion (then $absence's own search of the question)
  });
});
