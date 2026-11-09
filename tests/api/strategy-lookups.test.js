// The five lookups (book, quote_trace, term, original, about) are strategies of their own (Chad 11-09): Unmatched holds none of their nodes,
// Jev's options name them with Unmatched last, each graph runs its steps and ends, and a turn Jev routes to one answers EXACTLY as the same
// turn did inside the Unmatched graph (respond@2, pinned) on the same fixtures. Timing: LOOKUP_REPORT=<file> writes p50 ms before/after.
import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { anisRespond } from '../../api/lib/assistant/respond.js';
import { decisionLog } from '../../api/lib/assistant/decision-log.js';
import { withAIContext } from '../../api/lib/ai-context.js';
import { STRATEGIES, STEPS, LOOKUP_GRAPHS, LOOKUP_STRATEGIES, RESPOND_UNMATCHED_GRAPH, UNMATCHED } from '../../api/lib/assistant/strategy-seed.js';
import { strategyOptions } from '../../api/lib/assistant/strategy-choice.js';
import { graphFor } from '../../api/lib/assistant/activities/graph.js';
import { catalog } from '../../api/lib/repos/strategies-repo.js';
import { strategySpecs } from '../../api/lib/repos/strategies-repo.js';

const NAMES = ['book', 'quote_trace', 'term', 'original', 'about'];
const LIFTED = ['work', 'read_question', 'hunt', 'hunt_wait', 'source_reply', 'term', 'original', 'original_wait', 'conversational', 'religions'];
const PIN = { row: STRATEGIES.find((x) => x.id === 'respond' && x.version === 2), steps: new Map(STEPS.map((x) => [`${x.id}@${x.version}`, x])) };
const P = (i) => ({ id: i, text: `Passage ${i}: the earth is but one country.`, title: 'Gleanings', author: 'Bahá’u’lláh', religion: "Baha'i", document_id: 8300 + i, paragraph_index: i, citation_url: `https://x/g#${i}` });
const WORK = { doc: { id: 77, title: 'The Dawn-Breakers', author: 'Nabíl', religion: "Baha'i", slug: 'dawn-breakers' }, others: [] };
const QUOTE = 'The wisdom of it will be fully revealed in the future';

function world(c, log) {
  const rec = (name, impl) => async (...a) => { log.push(name); await null; return impl(...a); };
  const d = {
    search: rec('search', async () => ({ passages: [P(1), P(2)], _plan: { shape: 'quote' } })),
    craft: rec('craft', async (a) => { a.onChunk?.('x'); return 'The earth is ["but one country"](https://x/g#1) — *Gleanings*.'; }),
    companion: rec('companion', async () => ({ append: '', plan: { mode: 'INQUIRY' }, offer: false })),
    plan: rec('plan', async () => (c.conv ? { shape: 'converse' } : c.religions ? { shape: 'fact', library: 'religions' } : { shape: 'fact' })),
    phrases: rec('phrases', async () => ({ via: 'haiku', phrase: 'one country' })),
    prewarm: rec('prewarm', async () => null),
    findWork: rec('findWork', async () => (c.work ? WORK : null)),
    libraryStats: rec('libraryStats', async () => ({ religionCounts: { "Baha'i": 120, Islam: 40 } })),
    upgradeLinks: rec('upgradeLinks', async (x) => x),
    sourceHunt: rec('sourceHunt', async () => (c.hunt ? { origin: { religion: "Baha'i", title: 'Dawn of a New Day', text: `${QUOTE}.`, url: 'https://oceanlibrary.com/dawn/?paraId=p1' }, citedBy: [] } : null)),
    termQuestion: c.term ? (q) => { log.push('termQuestion'); return { term: 'عرفان', script: 'arabic' }; } : undefined,
    resolveTerm: rec('resolveTerm', async (t) => t),
    ctaiTerm: rec('ctaiTerm', async (w) => ({ term: w, root: 'ع ر ف', total: 12, counted: 10, renderings: [{ en: 'knowledge', count: 7 }], passages: [{ ...P(5), original: 'عرفان' }] })),
    looksLikePosition: () => false, looksLikeLanguage: () => false,
    findOriginals: rec('findOriginals', async () => (c.original ? { originals: [{ id: 9, text: 'عرفان', language: 'fa', document: { title: 'Lawh', author: 'Bahá’u’lláh' } }],
      matches: [{ passage: { ...P(1), document: { title: 'Gleanings', author: 'Bahá’u’lláh' } }, overlap: 1 }] } : { originals: [], matches: [] })),
    originalsByIds: rec('originalsByIds', async () => new Map()), getParagraphs: rec('getParagraphs', async () => []), translationsOf: rec('translationsOf', async () => []),
    ownSourceSearch: rec('ownSourceSearch', async () => ({ passages: [] })), ownSourceLink: rec('ownSourceLink', async (h) => h), linkTitles: rec('linkTitles', async (x) => x),
    chooseFormat: rec('chooseFormat', async () => null), encumberedAmong: rec('encumberedAmong', async () => new Set()), stripLinks: (x) => x,
  };
  if (c.agent) d.agentCreate = rec('agentCreate', async () => { throw new Error('agent model down'); });
  return d;
}
// the lookup fixtures: question, what the fake world finds, and what code resolved beside triage (direction.lookup)
const FIXTURES = {
  book: [{ q: 'Find me The Dawn-Breakers', c: { work: 1 } }, { q: 'Find me The Dawn-Breakers', c: { work: 1 }, lookup: { kind: 'book', work: WORK } }, { q: 'Find the book Nobody Wrote', c: {} }],
  quote_trace: [{ q: `Where is this from: "${QUOTE}"?`, c: { hunt: 1 } }, { q: `Where is this from: "${QUOTE}"?`, c: {} }],
  term: [{ q: 'What does the word عرفان mean?', c: { term: 1 } }, { q: 'What does the word عرفان mean?', c: {} }],
  original: [{ q: 'What are the original Persian words of "the earth is but one country"?', c: { original: 1 } }, { q: 'What are the original Persian words of "the earth is but one country"?', c: {} }],
  about: [{ q: 'Hello, who are you?', c: { conv: 1 } }, { q: 'Which religions does the library cover?', c: { religions: 1 } }],
};
async function turn(f, name, { chosen }) {
  const log = [];
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const dir = { channel: 'site-chat', decisions: decisionLog(), kind: name === 'quote_trace' ? 'source_lookup' : undefined,
    strategy: { strategy: { choice: chosen ? name : UNMATCHED, confidence: 0.9 }, sides: [] }, ...(f.lookup ? { lookup: f.lookup, lookupIntent: 'book' } : {}) };
  const t = performance.now();
  const go = () => anisRespond({ messages: [{ role: 'user', content: f.q }], profile: { persona_name: 'Anís', default_tradition: "Baha'i" }, deps: world(f.c, log), direction: dir, onEvent: () => {} });
  const r = await (chosen ? go() : withAIContext({ strategyPin: PIN }, go));
  const ms = performance.now() - t;
  warn.mockRestore();
  return { reply: r?.reply, format: r?.format?.id ?? null, shape: r?.plan?.shape ?? null, steps: r?.steps || [], ms, log };
}

describe('the five lookups as strategies', () => {
  it('each graph compiles, starts at fast, ends in the search tail, and a found path ends the turn (never silently empty)', () => {
    for (const n of NAMES) {
      const g = graphFor(n);
      expect(g, n).toBeTruthy();
      expect(g.entry).toBe('fast');
      expect(g.nodes.agent_fallback.activity).toBe('respond.agent');
      expect(g.nodes.agent_fallback.params).toEqual({ fallback: true });   // the research agent is the last lookup node
      expect(g.nodes.agent_fallback.out.get('answered')).toBe('$end');
      expect(Object.keys(g.nodes).slice(-2)).toEqual(['evidence', 'own_source']);
      expect(Object.keys(g.nodes)).toEqual(expect.arrayContaining(['stage_search', 'phrases']));
      expect(g.nodes.own_source.any).toBe('$end');
    }
    expect([...LOOKUP_STRATEGIES].sort()).toEqual([...NAMES].sort());
    expect(Object.keys(LOOKUP_GRAPHS[NAMES[0]].nodes)).toContain('work');
  });

  it('Unmatched (respond@3) has none of the lifted nodes; respond@2 stays as the prior version', () => {
    const nodes = Object.keys(RESPOND_UNMATCHED_GRAPH.nodes);
    for (const n of LIFTED) expect(nodes).not.toContain(n);
    expect(nodes).toEqual(expect.arrayContaining(['fast', 'agent', 'plan', 'research', 'strategy', 'evidence', 'own_source']));
    const rows = STRATEGIES.filter((x) => x.id === 'respond').map((x) => x.version);
    expect(rows).toEqual([2, 3]);
    expect(graphFor('respond').nodes.work).toBeUndefined();
    expect(STRATEGIES.find((x) => x.id === 'respond' && x.version === 3).parent_version).toBe(2);
  });

  it("Jev's options name the five (task wording, each distinct) and Unmatched is last, 'none of these'", () => {
    const o = strategyOptions(), keys = Object.keys(o);
    for (const n of NAMES) { expect(keys).toContain(n); expect(o[n].length).toBeGreaterThan(60); }
    expect(keys.at(-1)).toBe('unmatched');
    expect(o.unmatched).toBe('none of these');
    expect(new Set(Object.values(o)).size).toBe(keys.length);
    expect(catalog().strategies.find((s) => s.id === 'respond').version).toBe(3);
  });

  it('the docs specs: the five patterns are own-graph strategies, none is shared-reply', () => {
    const specs = strategySpecs().filter((x) => x.kind !== 'plan');
    for (const [n, p] of [['book', 'A2'], ['quote_trace', 'A4'], ['term', 'A6'], ['original', 'A7'], ['about', 'H1']]) {
      const x = specs.find((s) => s.name === n);
      expect(x.spec).toMatchObject({ status: 'built', where: 'own', strategy: n });
      expect(x.spec.patterns.map((q) => q.id)).toEqual([p]);
    }
    expect(specs.filter((s) => s.spec.where === 'shared-reply')).toEqual([]);
    expect(specs.map((s) => s.name)).not.toEqual(expect.arrayContaining(['a2']));
  });

  for (const name of NAMES) {
    it(`${name}: Jev's strategy answers exactly as the same turn did inside Unmatched (same reply, format and shape)`, async () => {
      for (const f of FIXTURES[name]) {
        const before = await turn(f, name, { chosen: false });
        const after = await turn(f, name, { chosen: true });
        expect({ reply: after.reply, format: after.format, shape: after.shape }, `${name}: ${f.q}`).toEqual({ reply: before.reply, format: before.format, shape: before.shape });
        if (process.env.LOOKUP_DEBUG) console.log(name, f.q.slice(0, 30), '|', after.format, after.shape, String(after.reply).slice(0, 40), '|', after.steps.map((x) => `${x.node}:${x.edge}`).join(' '), '| before', before.steps.map((x) => `${x.node}:${x.edge}`).join(' '));
        if (f.c && Object.keys(f.c).length) expect(after.reply || after.shape, `${name} found path answers`).toBeTruthy();
        expect(after.steps.length).toBeGreaterThan(0);
        expect(after.steps.map((s) => s.node)).toContain('fast');
        expect(after.steps.at(-1).node).not.toBeUndefined();
      }
    });
  }

  it('a lookup that finds nothing hands on to the research agent, which answers (agent channel)', async () => {
    const log = [];
    const dir = { channel: 'site-chat', decisions: decisionLog(), strategy: { strategy: { choice: 'book', confidence: 0.9 }, sides: [] } };
    const d = { ...world({}, log), agentCreate: async () => ({ choices: [{ message: { content: 'The agent found it.' } }], usage: {} }) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await anisRespond({ messages: [{ role: 'user', content: 'Find the book Nobody Wrote' }], profile: {}, deps: d, direction: { ...dir, engine: 'agent' }, onEvent: () => {} });
    warn.mockRestore();
    const nodes = (r.steps || []).map((s) => s.node);
    expect(nodes).toContain('agent_fallback');
    expect(nodes).not.toContain('research');   // never the Unmatched graph
  });

  it('latency: a lookup strategy is not slower than the same turn in Unmatched (p50 over the fixtures, fake deps)', async () => {
    const med = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
    const rep = {};
    let slow = 0;
    for (const name of NAMES) {
      const b = [], a = [];
      for (let i = 0; i < 15; i++) for (const f of FIXTURES[name]) { b.push((await turn(f, name, { chosen: false })).ms); a.push((await turn(f, name, { chosen: true })).ms); }
      rep[name] = { before_p50_ms: Math.round(med(b) * 100) / 100, after_p50_ms: Math.round(med(a) * 100) / 100 };
      if (med(a) > med(b) + 2) slow++;
    }
    if (process.env.LOOKUP_REPORT) writeFileSync(process.env.LOOKUP_REPORT, JSON.stringify(rep, null, 1));
    expect(slow).toBe(0);
  }, 60000);
});
