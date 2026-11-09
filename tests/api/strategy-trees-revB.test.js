// Rev B trees (claim_check, timeline, history_fact): criteria/entries planned by the light generators, searched per value, weighed once at tree level;
// the generalized dated-claims judge (any subject); the web path reaches the writer labelled; every new tree passes validateCandidate. All mocked: no model spend.
import { describe, it, expect } from 'vitest';
import { graphFor, runGraph, entryUnits } from '../../api/lib/assistant/activities/graph.js';
import { ELEMENTS } from '../../api/lib/assistant/activities/elements.js';
import { TEMPLATES } from '../../api/lib/assistant/strategy-seed.js';
import { TREE_GRAPHS, TREE_STEPS, TREE_TEMPLATES, TREE_DESCRIPTIONS } from '../../api/lib/assistant/strategy-trees-seed.js';
import { validateCandidate } from '../../api/lib/assistant/strategy-design.js';
import { catalog } from '../../api/lib/repos/strategies-repo.js';
import { judgeTimeline } from '../../api/lib/assistant/judges.js';

const TPL = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.text]));
const NONE = async () => ({ passages: [] });
const EMPTY = { fused_search: NONE, hype_search: NONE, originals_search: NONE, web_search: async () => null };
const path = (s) => s.trace.map((t) => t.node);
const NEW = ['claim_check', 'timeline', 'history_fact'];

async function run(id, q, { tools = {}, units = {}, jev, extra = {} } = {}) {
  const g = graphFor(id, 2);
  const s = { choice: { units }, ctx: {}, trace: [], question: q, messages: [], tools: { ...EMPTY, ...tools }, jev, templates: TPL, onEvent: () => {}, ...extra };
  s.units = entryUnits(g, { units }, { query: q, question: q, channel: { id: 'site-chat' }, messages: [] });
  await runGraph(g, s);
  s.how = s.out?.format?.how ?? '';
  return s;
}
const stored = (id) => JSON.stringify([TREE_STEPS.filter((x) => x.id.startsWith(`tree.${id}.`)), TREE_TEMPLATES.filter((t) => t.id.startsWith(`${id}.`))]);

describe('plan.criteria / plan.entries: light generators, the subject itself by default', () => {
  it('generator wired → its list; none → [subject] and fail', async () => {
    const mk = (tools, units) => ({ node: 'n', question: 'q', tools, units: { ...units }, ctx: {} });
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

describe('history_fact', () => {
  it('no library history: the web path reads web_found and the writer gets the web finds, labelled', async () => {
    const s = await run('history_fact', 'when was the Brahmo Samaj founded', { tools: { web_search: async () => ({ text: 'Founded in 1828 in Calcutta.', citations: ['https://example.org/brahmo'] }) }, units: { topic: 'founding of the Brahmo Samaj', fact_asked: 'date' } });
    expect(path(s)).toEqual(['h1', 'h2', 'h7', 'h8']);
    const h7 = graphFor('history_fact', 2).nodes.h7; expect(h7.reads ?? TREE_GRAPHS.history_fact.nodes.h7.reads).toContain('web_found');
    expect(s.out.passages).toEqual([expect.objectContaining({ web: true, text: 'Founded in 1828 in Calcutta.', source_url: 'https://example.org/brahmo', title: 'Web: example.org' })]);
    expect(s.how).toContain('outside the library');
  });
  it('library histories found: judged in historical precedence, the fact shaped; disagreement shaped apart', async () => {
    const tools = { fused_search: async () => ({ passages: [{ id: 1, text: 'In 1828…', authority: 'history', religion: 'Hinduism', document_id: 1, paragraph_index: 1 }] }) };
    let s = await run('history_fact', 'when', { tools, units: { topic: 'founding of the Brahmo Samaj', fact_asked: 'date' }, jev: async () => ({ choice: 'answers' }) });
    expect(path(s)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5']); expect(s.how).toContain('historical precedence'); expect(s.how).toContain('The reader asks for the date');
    s = await run('history_fact', 'when', { tools, units: { topic: 'founding' }, jev: async () => ({ choice: 'contradicts' }) });
    expect(path(s)).toEqual(['h1', 'h2', 'h3', 'h4c', 'h6']);
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
