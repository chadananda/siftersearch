// Strategy graph, Phase 1: the 'respond' graph (strategy-seed.js + activities/respond-steps.js, run by activities/graph.js)
// must behave EXACTLY as the old cascade (respond.js legacyGather, ANIS_STRATEGY_GRAPH=0). Every turn of a matrix
// (fast × work × conversational × strategy × huntable, each with term / position / language / original / research /
// religions / agent switched on one at a time) runs both ways with recording fake deps; the two must make the same calls in
// the same order with the same arguments, emit the same events, log the same decisions and return the same reply.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { anisRespond } from '../../api/lib/assistant/respond.js';
import { decisionLog } from '../../api/lib/assistant/decision-log.js';
import { withAIContext } from '../../api/lib/ai-context.js';
import { STRATEGIES, STEPS } from '../../api/lib/assistant/strategy-seed.js';

// respond@2 = the whole cascade as graph nodes; respond@3 (Unmatched without the five lookups) differs from the cascade BY DESIGN
// (tests/api/strategy-lookups.test.js), so the equivalence is held on the retained @2 row, pinned.
const PIN = { row: STRATEGIES.find((x) => x.id === 'respond' && x.version === 2), steps: new Map(STEPS.map((x) => [`${x.id}@${x.version}`, x])) };

const P = (i, extra = {}) => ({ id: i, text: `Passage ${i}: the earth is but one country, and mankind its citizens.`, title: 'Gleanings', author: 'Bahá’u’lláh',
  religion: "Baha'i", document_id: 8300 + i, paragraph_index: i, source_url: `https://x/g#${i}`, citation_url: `https://x/g#${i}`, ...extra });
const WORK = { doc: { id: 77, title: 'The Dawn-Breakers', author: 'Nabíl', religion: "Baha'i", slug: 'dawn-breakers' }, others: [] };
const QUOTE = 'The wisdom of it will be fully revealed in the future';

// times and durations differ run to run; functions are compared by presence
const VOLATILE = /(^ms$|_ms$|Ms$|^at$|^t0$|^elapsed)/;
function norm(v, seen = new WeakSet()) {
  if (typeof v === 'function') return '[fn]';
  if (typeof v === 'symbol') return String(v);
  if (!v || typeof v !== 'object') return v;
  if (seen.has(v)) return '[cycle]';
  seen.add(v);
  if (Array.isArray(v)) return v.map((x) => norm(x, seen));
  if (v instanceof Error) return `Error: ${v.message}`;
  const o = {};
  for (const [k, x] of Object.entries(v)) if (!VOLATILE.test(k) && k !== 'timings' && k !== 'steps') o[k] = norm(x, seen);
  return o;
}

// one turn's fake world, every dep recorded into `log` in call order
function world(c, log) {
  const rec = (name, impl) => async (...args) => { log.push(['call', name, norm(args)]); await null; return impl(...args); };
  const searchHits = (a) => (a?.religion ? [P(1, { religion: a.religion }), P(2, { religion: a.religion }), P(3, { religion: a.religion })] : [P(1), P(2)]);
  const d = {
    search: rec('search', async (a) => ({ passages: searchHits(a), _plan: { shape: 'quote' } })),
    craft: rec('craft', async (a) => { a.onChunk?.('The earth '); return 'The earth is ["but one country"](https://x/g#1) — *Gleanings*.'; }),
    companion: rec('companion', async () => ({ append: '', plan: { mode: 'INQUIRY' }, offer: false })),
    plan: rec('plan', async () => (c.conv ? { shape: 'converse' } : c.religions ? { shape: 'fact', library: 'religions' } : { shape: 'fact' })),
    phrases: rec('phrases', async () => ({ via: 'haiku', phrase: 'one country' })),
    prewarm: rec('prewarm', async () => null),
    findWork: rec('findWork', async () => (c.work ? WORK : null)),
    libraryStats: rec('libraryStats', async () => ({ religionCounts: { "Baha'i": 120, Islam: 40 } })),
    upgradeLinks: rec('upgradeLinks', async (x) => x),
    sourceHunt: rec('sourceHunt', async () => (c.hunt === 'none-found' ? null
      : { origin: { religion: "Baha'i", title: 'Dawn of a New Day', text: `${QUOTE}.`, url: 'https://oceanlibrary.com/dawn/?paraId=p1' }, citedBy: [] })),
    termQuestion: c.term ? (q) => { log.push(['call', 'termQuestion', q]); return { term: 'عرفان', script: 'arabic' }; } : undefined,
    resolveTerm: rec('resolveTerm', async (t) => t),
    ctaiTerm: rec('ctaiTerm', async (w) => ({ term: w, root: 'ع ر ف', total: 12, counted: 10, renderings: [{ en: 'knowledge', count: 7 }, { en: 'recognition', count: 3 }],
      passages: [{ ...P(5), original: 'عرفان' }] })),
    looksLikePosition: (q) => { log.push(['call', 'looksLikePosition', q]); return !!c.position; },
    looksLikeLanguage: (q) => { log.push(['call', 'looksLikeLanguage', q]); return !!c.language; },
    create: rec('create', async () => ({ choices: [{ message: { content: '- THEME: equality | SEARCH: equality of men and women\n- THEME: property | SEARCH: wealth; property' } }] })),
    authorityOf: rec('authorityOf', async () => 1),
    findOriginals: rec('findOriginals', async () => (c.original ? { originals: [{ id: 9, text: 'عرفان', language: 'fa', document: { title: 'Lawh', author: 'Bahá’u’lláh' } }],
      matches: [{ passage: { ...P(1), document: { title: 'Gleanings', author: 'Bahá’u’lláh' } }, overlap: 1 }] } : { originals: [], matches: [] })),
    originalsByIds: rec('originalsByIds', async () => new Map()),
    getParagraphs: rec('getParagraphs', async () => []),
    translationsOf: rec('translationsOf', async () => []),
    ownSourceSearch: rec('ownSourceSearch', async () => ({ passages: [] })),
    ownSourceLink: rec('ownSourceLink', async (h) => h),
    linkTitles: rec('linkTitles', async (x) => x),
    chooseFormat: rec('chooseFormat', async () => null),
    encumberedAmong: rec('encumberedAmong', async () => new Set()),
    stripLinks: (x) => x,
  };
  if (c.research) d.research = rec('research', async () => ({ passages: [P(7)], steps: [{ tool: 'search_library', args: { query: 'x' } }], ms: 3 }));
  if (c.strategy === 'other-hit') d.unmatched = rec('unmatched', async ({ direction: dir, run }) => { dir.strategy = { strategy: { choice: 'understanding', confidence: 0.8 }, sides: [] }; return { via: 'recheck', name: 'understanding', out: await run(dir.strategy) }; });
  if (c.strategy === 'other-miss') d.unmatched = rec('unmatched', async () => null);
  if (c.agent) d.agentCreate = rec('agentCreate', async () => { throw new Error('agent model down'); });
  return d;
}

function question(c) {
  if (c.hunt === 'plain' || c.hunt === 'none-found') return `Where is this from: "${QUOTE}"?`;
  if (c.hunt === 'asks') return `Where is this from: "${QUOTE}" — and who translated it, to whom was it written, and when?`;
  if (c.original) return 'What are the original Persian words of "the earth is but one country"?';
  if (c.term) return 'What does the word عرفان mean?';
  if (c.language) return 'What does the Arabic grammar of fí baytihi mean here?';
  if (c.position) return 'What is the Bahá’í position on socialism, equality and property?';
  return 'What did He say about the earth being one country?';
}

function direction(c) {
  const dir = { channel: 'site-chat', decisions: decisionLog() };
  if (c.hunt !== 'off') dir.kind = 'source_lookup';
  if (c.fast === 'book') { dir.lookup = { kind: 'book', work: WORK }; dir.lookupIntent = 'book'; }
  if (c.fast === 'quote') dir.lookup = { kind: 'quote', passages: [P(4)], phrase: 'one country' };
  if (c.strategy === 'comparison') dir.strategy = { strategy: { choice: 'comparison', confidence: 0.9 }, sides: ['Islam', 'Christian'] };
  if (c.strategy === 'understanding') dir.strategy = { strategy: { choice: 'understanding', confidence: 0.9 }, sides: [] };
  if (c.strategy === 'other-hit' || c.strategy === 'other-miss') dir.strategy = { strategy: { choice: 'other', confidence: 0.3 }, sides: [] };
  if (c.agent) dir.engine = 'agent';
  return dir;
}

async function turn(c, graph) {
  if (graph) delete process.env.ANIS_STRATEGY_GRAPH; else process.env.ANIS_STRATEGY_GRAPH = '0';
  const log = [];
  const warn = vi.spyOn(console, 'warn').mockImplementation((...a) => log.push(['warn', a.map(String).join(' ')]));
  const dir = direction(c);
  let r, err = null;
  try {
    const go = () => anisRespond({ messages: [{ role: 'user', content: question(c) }], profile: { persona_name: 'Anís', default_tradition: "Baha'i" },
      deps: world(c, log), direction: dir, onEvent: (e) => log.push(['event', norm(e)]) });
    r = await withAIContext({ strategyPin: PIN }, go);
  } catch (e) { err = e.message; }
  warn.mockRestore();
  return { log, reply: norm(r), err, decisions: norm(dir.decisions.list()), steps: r?.steps || null };
}

const MINORS = [{}, { term: 1 }, { position: 1 }, { language: 1 }, { original: 1 }, { research: 1 }, { religions: 1 }, { agent: 1 }];
const CASES = [];
for (const fast of ['none', 'book', 'quote'])
  for (const work of [0, 1])
    for (const conv of [0, 1])
      for (const strategy of ['none', 'comparison', 'understanding', 'other-hit', 'other-miss'])
        for (const hunt of ['off', 'plain', 'asks', 'none-found'])
          for (const m of MINORS) CASES.push({ fast, work, conv, strategy, hunt, ...m });

const saved = process.env.ANIS_STRATEGY_GRAPH;
beforeAll(() => { process.env.ANIS_STRATEGY_GRAPH = saved; });
afterAll(() => { if (saved === undefined) delete process.env.ANIS_STRATEGY_GRAPH; else process.env.ANIS_STRATEGY_GRAPH = saved; });

describe('strategy graph ≡ the old cascade (Phase 1: no behaviour change)', () => {
  it(`${CASES.length} turns: the same calls in the same order with the same arguments, events, decisions and reply`, async () => {
    const routes = new Map(), examples = {};
    let diffs = 0;
    for (const c of CASES) {
      const old = await turn(c, false);
      const neu = await turn(c, true);
      const same = JSON.stringify([old.log, old.reply, old.err, old.decisions]) === JSON.stringify([neu.log, neu.reply, neu.err, neu.decisions]);
      if (!same && diffs++ < 3) {
        expect({ case: c, log: neu.log, reply: neu.reply, err: neu.err, decisions: neu.decisions })
          .toEqual({ case: c, log: old.log, reply: old.reply, err: old.err, decisions: old.decisions });
      }
      expect(old.steps).toBeNull();                       // the old cascade records no steps
      if (neu.steps) expect(neu.steps[0]).toMatchObject({ node: 'fast', step: 'respond.fast@1' });
      const route = old.reply?.format?.id ?? old.reply?.plan?.shape ?? old.err ?? 'none';
      routes.set(route, (routes.get(route) || 0) + 1);
      if (!examples[route]) examples[route] = c;
    }
    expect(diffs).toBe(0);
    // the matrix reaches every early answer and the main routes (a matrix that only ever searched would prove little)
    expect(routes.size).toBeGreaterThanOrEqual(6);
    if (process.env.STRATEGY_GRAPH_REPORT) writeFileSync(process.env.STRATEGY_GRAPH_REPORT, JSON.stringify({ cases: CASES.length, routes: Object.fromEntries(routes), examples }, null, 1));
  }, 120000);

  it('every graph turn records its path: node, step@version, ms, edge — ending where the old code ended', async () => {
    const r = await turn({ fast: 'none', work: 0, conv: 0, strategy: 'none', hunt: 'off' }, true);
    expect(r.steps.map((x) => x.node)).toEqual(['fast', 'agent', 'plan', 'conversational', 'religions', 'work', 'stage_search', 'phrases', 'research',
      'read_question', 'original', 'hunt', 'hunt_wait', 'original_wait', 'source_reply', 'term', 'strategy', 'position', 'language', 'evidence', 'own_source']);
    for (const s of r.steps) { expect(s.step).toMatch(/^respond\.[a-z_-]+@1$/); expect(typeof s.ms).toBe('number'); expect(typeof s.edge).toBe('string'); }
    const hunt = await turn({ fast: 'none', work: 0, conv: 0, strategy: 'none', hunt: 'plain' }, true);
    expect(hunt.steps.at(-1)).toMatchObject({ node: 'source_reply', edge: 'answered' });
  });

  it('interpreter overhead per turn (fake deps, same turns both ways)', async () => {
    const sample = CASES.filter((_, i) => i % 9 === 0);
    const time = async (graph) => { const t = performance.now(); for (const c of sample) await turn(c, graph); return performance.now() - t; };
    await time(false); await time(true);   // warm both
    let old = 0, neu = 0;
    for (let i = 0; i < 5; i++) { old += await time(false); neu += await time(true); }
    const perTurn = (neu - old) / (5 * sample.length);
    if (process.env.STRATEGY_GRAPH_REPORT) writeFileSync(`${process.env.STRATEGY_GRAPH_REPORT}.overhead`, JSON.stringify({ turns: 5 * sample.length, old_ms: old, graph_ms: neu, overhead_ms_per_turn: perTurn }));
    expect(perTurn).toBeLessThan(2);   // measured ~0 (see the brief's Result); 2 ms is a loud ceiling, not the target
  }, 120000);
});
