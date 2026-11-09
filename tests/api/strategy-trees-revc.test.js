// Brief rev-C (review 11-09): comparison sides chosen by answers over every library tradition, compilation grouped by sub-theme, and both trees pass validateCandidate.
import { describe, it, expect } from 'vitest';
import { graphFor, runGraph, entryUnits } from '../../api/lib/assistant/activities/graph.js';
import { TEMPLATES } from '../../api/lib/assistant/strategy-seed.js';
import { TREE_STEPS, TREE_GRAPHS, TREE_TEMPLATES } from '../../api/lib/assistant/strategy-trees-seed.js';
import { TRADITIONS } from '../../api/lib/scope-extract.js';
import { validateCandidate } from '../../api/lib/assistant/strategy-design.js';
import { catalog } from '../../api/lib/repos/strategies-repo.js';

const TPL = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.text]));
const P = (i, x = {}) => ({ id: i, text: `Passage ${i}`, document_id: 100 + i, paragraph_index: i, religion: "Baha'i", authority: 'scripture', score: 0.9, ...x });
const NONE = async () => ({ passages: [] });
const EMPTY = { fused_search: NONE, hype_search: NONE, originals_search: NONE, reference: NONE, quotation_candidates: NONE, document_search: async () => ({ works: [] }), context_lookup: async () => ({ passages: [] }), source_trace: NONE };
const path = (s) => s.trace.map((t) => t.node);
async function run(id, q, { tools = {}, choice = {}, jev, units = {} } = {}) {
  const g = graphFor(id, 2);
  const s = { choice, ctx: {}, trace: [], question: q, messages: [], tools: { ...EMPTY, ...tools }, jev, templates: TPL, onEvent: () => {} };
  s.units = entryUnits(g, choice, { query: q, question: q, channel: { id: 'site-chat' }, messages: [] });
  Object.assign(s.units, units);
  await runGraph(g, s); s.how = s.out?.format?.how ?? '';
  return s;
}

describe('comparison: how do religions view forgiveness (no sides named)', () => {
  const TRADS = Object.keys(TRADITIONS).filter((t) => t !== 'none');
  // 12 traditions in the mock library (11 + Other); two BIG ones return many passages that only mention forgiveness
  const big = new Set(['Christian', 'Islam']);
  const LIB = Object.fromEntries([...TRADS, 'Other'].map((t, n) => [t, big.has(t) ? Array.from({ length: 10 }, (_, i) => P(1000 + n * 20 + i, { religion: t, text: `Big ${t} ${i}` })) : [P(1000 + n * 20, { religion: t, text: `Answer ${t}` })]]));
  const calls = [];
  const compare_search = async (i) => { calls.push(i); return { sides: i.sides.map((sd) => ({ label: sd.label, passages: (LIB[sd.filters.tradition] ?? []).slice(0, i.k), relaxed: [] })) }; };
  const jev = async ({ state }) => ({ choice: /^Big /.test(state) ? 'mentions_only' : 'answers' });
  it('the sides are every library tradition (Jain included), chosen by answers, not corpus size; the absent sides are named', async () => {
    const s = await run('comparison', 'how do religions view forgiveness', { tools: { compare_search }, jev });
    expect(path(s)).toEqual(['sides', 'stage', 'cmp', 'judge', 'chk', 'rank', 's_sides']);
    expect(calls.at(-1).sides.map((x) => x.label)).toEqual(TRADS); expect(TRADS).toContain('Jain'); expect(calls.at(-1).k).toBeGreaterThanOrEqual(3);
    const sides = new Set(s.out.passages.map((p) => p.side));
    expect(sides.has('Christian') || sides.has('Islam')).toBe(false); expect(sides.size).toBe(TRADS.length - 2);
    expect(s.units.missing.filter((m) => m.side).map((m) => m.side).sort()).toEqual(['Christian', 'Islam']);
    expect(s.how).toMatch(/Nothing the library returned from (Christian, Islam|Islam, Christian) answers this/);
  });
  it('a side with nothing at all is named too', async () => {
    const s = await run('comparison', 'q', { tools: { compare_search: async (i) => ({ sides: i.sides.map((sd) => ({ label: sd.label, passages: sd.label === 'Islam' ? [P(1, { religion: 'Islam' })] : [], relaxed: [] })) }) }, choice: { sides: ['Islam', 'Jain'] }, jev });
    expect(s.units.missing.find((m) => m.side === 'Jain')?.edge).toBe('no_answer'); expect(s.how).toContain('from Jain answers this');
  });
  it('named sides are kept as named, in order', async () => {
    const s = await run('comparison', 'q', { tools: { compare_search }, choice: { sides: ['Jain', 'Sikh'] }, jev });
    expect(calls.at(-1).sides.map((x) => x.label)).toEqual(['Jain', 'Sikh']); expect(s.units.missing.filter((m) => m.side)).toEqual([]);
  });
});

describe('compilation: grouped by sub-theme, tier order within', () => {
  const W = (i, x = {}) => P(i, { author: 'Bahá’u’lláh', title: 'Gleanings from the Writings of Bahá’u’lláh', ...x });
  const TALK = (i, x = {}) => P(i, { author: 'Some Speaker', collection: 'Core Talks', title: 'A talk', authority: 'reported', ...x });
  const per = (m) => async (i) => ({ passages: m[i.query] ?? [] });
  it('groups follow the planned sub-themes; inside each, the tradition’s own tiers', async () => {
    const m = { equity: [TALK(1), W(2)], fairness: [W(3), TALK(4)] };
    const s = await run('compilation', 'q', { tools: { subthemes: async () => ['equity', 'fairness'], fused_search: per(m) } });
    expect(path(s)).toEqual(['c5', 'c6', 'c7', 'cj', 'sp', 'rk', 'o']);
    expect(s.out.passages.map((p) => p.theme)).toEqual(['equity', 'equity', 'fairness', 'fairness']);
    expect(s.out.passages.map((p) => p.id)).toEqual([2, 1, 3, 4]);
    expect(s.out.passages.every((p) => p.theme !== p.author)).toBe(true);
  });
  it('the planned order wins even when the second sub-theme ranks higher', async () => {
    const m = { equity: [TALK(1)], fairness: [W(3)] };
    const s = await run('compilation', 'q', { tools: { subthemes: async () => ['equity', 'fairness'], fused_search: per(m) } });
    expect(s.out.passages.map((p) => p.theme)).toEqual(['equity', 'fairness']);
  });
  it('passages from several traditions (interfaith host): grouped by tradition, then by sub-theme', async () => {
    const m = { equity: [P(1, { religion: 'Islam' }), W(2)], fairness: [P(3, { religion: 'Islam' }), W(4)] };
    const s = await run('compilation', 'q', { tools: { subthemes: async () => ['equity', 'fairness'], fused_search: per(m) } });
    expect(path(s).slice(-2)).toEqual(['rt', 'ot']);
    const th = s.out.passages.map((p) => p.theme);
    expect(th.indexOf("Islam — fairness")).toBeGreaterThan(th.indexOf("Islam — equity"));
    expect(th.filter((t) => t.startsWith('Islam')).length).toBe(2);
    expect(Math.abs(th.indexOf('Islam — equity') - th.indexOf('Islam — fairness'))).toBe(1);   // a tradition's themes sit together
  });
});

describe('the rev-C trees pass validateCandidate', () => {
  const asCandidate = (id) => {
    const pre = `tree.${id}.`, rename = (sid) => sid.replace(pre, `revc_${id}.`), tplIds = new Map();
    const steps = TREE_STEPS.filter((x) => x.id.startsWith(pre)).map((x) => {
      const params = { ...x.params };
      if (x.activity === 'shape' && params.template) { const nid = `revc_${id}.${params.template.split('.').pop()}`; tplIds.set(params.template, nid); params.template = nid; }
      return { id: rename(x.id), activity: x.activity, params };
    });
    const templates = [...tplIds].map(([old, nid]) => ({ id: nid, text: [...TREE_TEMPLATES].reverse().find((t) => t.id === old).text }));
    const g = TREE_GRAPHS[id];
    return { name: `revc_${id}`, description: `The rev-C ${id} tree, re-validated as a fresh candidate against the live catalog.`, exemplars: ['how do religions view forgiveness?', 'compile passages on justice'],
      templates, steps, graph: { ...g, nodes: Object.fromEntries(Object.entries(g.nodes).map(([k, n]) => [k, { ...n, step: rename(n.step) }])) } };
  };
  for (const id of ['comparison', 'compilation']) it(id, () => { const v = validateCandidate(asCandidate(id), { cat: catalog() }); expect(v.errors).toEqual([]); expect(v.ok).toBe(true); });
});
