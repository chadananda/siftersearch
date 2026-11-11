// 11-10 live battery: strategies found passages but the writer got none. history_fact@5 — a religion Jev set for the turn carried the DEFAULT
// floor 'interpretation', so every history/scholarship hit was scoped out; quote_trace@2 — the lookup TREE ran over the turn state (no units,
// whole question to quotation_candidates, its output never reached the writer). All mocked: no model spend.
import { describe, it, expect, vi } from 'vitest';

const calls = [];
const SE = { id: 11, role: 'source', score: 1, text: 'Small wonder if by the Pen of Bahá’u’lláh these pregnant words were revealed: “The earth is but one country, and mankind its citizens.”', title: 'The Promised Day Is Come', author: 'Shoghi Effendi', religion: "Baha'i", authority: 'interpretation', document_id: 501, paragraph_index: 3, citation_url: 'https://x/pdc#3' };
const DHP = { id: 21, role: 'source', score: 1, text: 'Hatred ceases by love — this is an old rule.', title: 'Dhammapada (tr. F. Max Mueller)', author: 'Buddha', religion: 'Buddhist', authority: 'scripture', document_id: 601, paragraph_index: 5, citation_url: 'https://x/dhp#5' };
vi.mock('../../api/lib/assistant/tools.js', async (orig) => {
  const m = await orig();
  return { ...m, run: async (name, input) => {
    calls.push({ name, input });
    if (name === 'quotation_candidates') return { passages: /hatred/i.test(input.quotation) ? [DHP] : [SE] };
    if (name === 'source_trace' || name === 'edition_lookup') return { passages: [] };
    if (name === 'web_search') return null;
    return { passages: [] };
  } };
});

const { anisRespond } = await import('../../api/lib/assistant/respond.js');
const { decisionLog } = await import('../../api/lib/assistant/decision-log.js');
const { withAIContext } = await import('../../api/lib/ai-context.js');
const { TREE_STRATEGIES, STEPS, TEMPLATES } = await import('../../api/lib/assistant/strategy-seed.js');
const { TREE_STEPS } = await import('../../api/lib/assistant/strategy-trees-seed.js');
const { graphFor, runGraph, entryUnits, runsOverTurn } = await import('../../api/lib/assistant/activities/graph.js');
const { resolveScope } = await import('../../api/lib/assistant/units.js');

const ALL_STEPS = new Map([...STEPS, ...TREE_STEPS].map((x) => [`${x.id}@${x.version}`, x]));
const PIN = { row: TREE_STRATEGIES.find((x) => x.id === 'quote_trace' && x.version === 2), steps: ALL_STEPS };

describe('history_fact: a religion set for the turn does not carry the default floor (the writer gets the histories)', () => {
  const DB = { id: 1, text: 'The Báb was born in Shíráz on the first day of Muḥarram, 1235 A.H.', title: 'The Dawn-Breakers', authority: 'scholarship', religion: "Baha'i", document_id: 10, paragraph_index: 4 };
  const GPB = { id: 2, text: 'He was born in Shíráz, 20 October 1819.', title: 'God Passes By', authority: 'interpretation', religion: "Baha'i", document_id: 11, paragraph_index: 2 };
  async function runFact(fused) {
    const g = graphFor('history_fact', 2), TPL = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.text]));
    const r = resolveScope({ turn: { religions_specified: ["Baha'i"] } });   // Jev's turn_only religion; the floor stays the default
    const ctx = { query: 'When was the Báb born?', channel: { id: 'site-chat' }, messages: [], scope: { religion: r.religion, units: r.units, source: r.units.scope_source, sources: r.sources } };
    const s = { choice: { units: {} }, ctx: {}, trace: [], question: ctx.query, messages: [], templates: TPL, onEvent: () => {}, jev: async () => ({ choice: 'answers' }),
      tools: { fused_search: fused, hype_search: async () => ({ passages: [] }), originals_search: async () => ({ passages: [] }), web_search: async () => null } };
    s.units = entryUnits(g, { units: {} }, ctx);
    await runGraph(g, s);
    return s;
  }
  it('scholarship + the Guardian\'s history reach the shape; the authority kinds are the search filter', async () => {
    const seen = [];
    const s = await runFact(async (inp) => { seen.push(inp); return { passages: [DB, GPB] }; });
    expect(s.units.authority_floor).toBe('any');
    expect(s.trace.map((t) => t.node).slice(0, 3)).toEqual(['h1', 'h2', 'h3']);   // not h7 (the web path)
    expect(s.out.passages.map((p) => p.title)).toEqual(expect.arrayContaining(['The Dawn-Breakers', 'God Passes By']));
    expect(seen[0].filters).toMatchObject({ tradition: "Baha'i", authority: ['history', 'scholarship'] });   // the histories apart from the Guardian (11-10)
    expect(seen.some((i) => i.filters?.authority?.join() === 'interpretation')).toBe(true);
  });
  it('a floor the reader or Jev really set still filters', () => {
    const r = resolveScope({ turn: { religions_specified: ["Baha'i"], authority_floor: 'scripture' } });
    const u = entryUnits(graphFor('history_fact', 2), { units: {} }, { query: 'q', messages: [], scope: { units: r.units, source: 'turn', sources: r.sources } });
    expect(u.authority_floor).toBe('scripture');
  });
});

function world() {
  return {
    search: async () => ({ passages: [], _plan: { shape: 'fact' } }),
    craft: async (a) => { a.onChunk?.('x'); return 'It is from *The Promised Day Is Come*.'; },
    companion: async () => ({ append: '', plan: { mode: 'INQUIRY' }, offer: false }),
    plan: async () => ({ shape: 'fact' }), phrases: async () => null, prewarm: async () => null, findWork: async () => null,
    libraryStats: async () => ({ religionCounts: {} }), upgradeLinks: async (x) => x, sourceHunt: async () => null,
    looksLikePosition: () => false, looksLikeLanguage: () => false, findOriginals: async () => ({ originals: [], matches: [] }),
    originalsByIds: async () => new Map(), getParagraphs: async () => [], translationsOf: async () => [],
    ownSourceSearch: async () => ({ passages: [] }), ownSourceLink: async (h) => h, linkTitles: async (x) => x,
    chooseFormat: async () => null, encumberedAmong: async () => new Set(), stripLinks: (x) => x,
  };
}
async function quoteTurn(q, { sides = [], sources = {}, scope = null } = {}) {
  calls.length = 0;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const direction = { channel: 'site-chat', decisions: decisionLog(), kind: 'source_lookup', scope,
    strategy: { strategy: { choice: 'quote_trace', confidence: 0.95 }, sides, sources } };
  const r = await withAIContext({ strategyPin: PIN }, () => anisRespond({ messages: [{ role: 'user', content: q }], profile: { persona_name: 'Anís', default_tradition: "Baha'i" }, deps: world(), direction, onEvent: () => {} }));
  warn.mockRestore();
  return r;
}

describe('quote_trace@2: the tree runs as an executor with the turn units; its passages reach the writer', () => {
  it('the tree is not run over the turn state', () => {
    withAIContext({ strategyPin: PIN }, () => expect(runsOverTurn('quote_trace')).toBe(false));
    expect(runsOverTurn('book')).toBe(true);
  });
  it('"the earth is but one country": quotation_candidates gets the quoted words; the writer gets Shoghi Effendi\'s passage', async () => {
    const r = await quoteTurn('Is "the earth is but one country" a quotation?');
    const qc = calls.filter((c) => c.name === 'quotation_candidates');
    expect(qc.length).toBeGreaterThan(0);
    expect(qc[0].input.quotation).toBe('the earth is but one country');
    expect(r.format?.id).not.toBe('honest_absence');
    expect((r.evidence || []).map((e) => e.title)).toContain('The Promised Day Is Come');
  });
  it('a Buddhist side: the side\'s tradition is the filter, not the site default', async () => {
    const r = await quoteTurn('find "hatred ceases" in the Dhammapada', { sides: ['Buddhist'], sources: { Buddhist: 'hatred ceases' } });
    const qc = calls.filter((c) => c.name === 'quotation_candidates');
    expect(qc[0].input).toMatchObject({ quotation: 'hatred ceases', tradition: 'Buddhist' });
    expect(calls.some((c) => /Baha/.test(JSON.stringify(c.input?.filters?.tradition ?? c.input?.tradition ?? '')))).toBe(false);
    expect((r.evidence || []).map((e) => e.title)).toContain('Dhammapada (tr. F. Max Mueller)');
  });
});
