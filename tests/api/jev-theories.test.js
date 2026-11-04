// Decision theories (improve v3): diagnosis → theory parse; the synthetic set frozen + reused; a theory experiment over historic +
// synthetic rows with a stub Jev (a win becomes a candidate with params.enrich, a loss is logged); graph.js applying params.enrich
// on a decision step (and nothing when there is none); the frozen per-class question set reused by the promotion replay.
import { describe, it, expect, afterEach, vi } from 'vitest';
vi.mock('../../api/lib/repos/ai-usage-repo.js', () => ({ dailySpendByCaller: vi.fn(async () => ({})) }));
import { openStrategiesDb, resetStrategiesCache, catalog } from '../../api/lib/repos/strategies-repo.js';
import { ensureCandidatesSchema, strategyRow, listDesigns } from '../../api/lib/repos/strategy-candidates-repo.js';
import { saveCandidate, logDesign } from '../../api/lib/repos/strategy-candidates-repo.js';
import { syntheticSet, appendSynthetic, listTheories, theoryCounts, classSet, freezeClassSet } from '../../api/lib/repos/jev-theories-repo.js';
import { parseTheories, parseSynthetic, ensureSynthetic, decideTheory, theoryLabel, theoryHome, theoryCandidate, theoryStage, testTheory }
  from '../../api/lib/jev-tuning/theories.js';
import { applyEnrich, enrichCall } from '../../api/lib/jev-tuning/enrich.js';
import { compileGraph, runGraph } from '../../api/lib/assistant/activities/graph.js';
import { questionSet } from '../../api/lib/assistant/strategy-promote.js';
import { withAIContext } from '../../api/lib/ai-context.js';

afterEach(() => resetStrategiesCache());
const fresh = () => { const db = ensureCandidatesSchema(openStrategiesDb(':memory:')); resetStrategiesCache({ db }); return db; };
const Q = { route: { type: 'choice', instructions: 'Which search plan?', criteria: { quote: 'find the passage', topic: 'search the topic', book: 'open the book' } } };
const reply = (o, usd = 0.02) => ({ text: JSON.stringify(o), usd });

describe('diagnosis → theories', () => {
  it('keeps valid enrich / reword / needs-code theories (max 3), drops unknown variants and empty ones', () => {
    const t = parseTheories(JSON.stringify({ theories: [
      { kind: 'enrich', variant: 'thread-history', params: { turns: 4 }, why: 'follow-ups lose the topic' },
      { kind: 'enrich', variant: 'no-such-variant', params: {} },
      { kind: 'reword', variant: 'reword', params: { question: 'route', options: { quote: 'the reader quotes words and wants their source' } } },
      { kind: 'needs-code', what: 'the state should say whether the reader pasted a quotation', scenarios: [{ title: 'pasted quote', given: { reader: 'r', history: [] },
        when: { asks: 'where is this from', examples: ['a', 'b'] }, then: [{ check: 'strategy', expect: 'quote' }] }] },
      { kind: 'enrich', variant: 'state-append', params: { text: 'x' } },
    ] }));
    expect(t.map((x) => x.kind)).toEqual(['enrich', 'reword', 'needs-code']);
    expect(t[0]).toMatchObject({ variant: 'thread-history', params: { turns: 4 } });
    expect(t[1].params.options.quote).toMatch(/quotes words/);
    expect(t[2].scenarios).toHaveLength(1);
    expect(parseTheories('no json')).toEqual([]);
    expect(parseTheories(JSON.stringify({ theories: [{ kind: 'reword', variant: 'reword', params: {} }, { kind: 'needs-code', what: '  ' }] }))).toEqual([]);
  });
});

describe('the synthetic set: frozen, versioned, append-only, reused', () => {
  it('a gold that is not an option is dropped; the set is written once, then read back without an Opus call', async () => {
    const cases = parseSynthetic(JSON.stringify({ cases: [{ state: 'USER: where is "the earth is but one country" from?', gold: { route: 'quote' } },
      { state: 'USER: tell me about the Covenant please', gold: { route: 'nonsense' } }, { state: 'USER: open the Kitáb-i-Íqán', gold: { route: 'book' }, side: 'title only' }] }), Q);
    expect(cases.map((c) => c.gold.route)).toEqual(['quote', 'book']);
    const db = fresh();
    const call = vi.fn(async () => reply({ cases: [{ state: 'USER: what did Bahá’u’lláh say about unity?', gold: { route: 'topic' } },
      { state: 'USER: open the Hidden Words please', gold: { route: 'book' } }] }));
    const cfg = { synthetic_n: 2, synthetic_max_tokens: 100 };
    const a = await ensureSynthetic(db, 'search-plan', { example: { state: 's', questions: Q }, call, cfg });
    expect(a).toMatchObject({ version: 1, written: 2 });
    const b = await ensureSynthetic(db, 'search-plan', { example: { state: 's', questions: Q }, call, cfg });
    expect(call).toHaveBeenCalledTimes(1);   // frozen: reused, never rewritten
    expect(b.rows.map((r) => r.id)).toEqual(a.rows.map((r) => r.id));
    expect(appendSynthetic(db, 'search-plan', [{ state: a.rows[0].state, questions: Q, gold: { route: 'topic' } }]).added).toBe(0);   // no rewrite
    expect(appendSynthetic(db, 'search-plan', [{ state: 'USER: a new one', questions: Q, gold: { route: 'quote' } }])).toEqual({ version: 2, added: 1 });
    expect(syntheticSet(db, 'search-plan').rows.slice(0, 2)).toEqual(b.rows);   // old rows unchanged
  });
});

// a stub Jev: answers 'topic' unless the state carries the hint the theory adds (then the right answer for that state)
const stubJev = (rightOf) => async (task, state, questions) => {
  const hinted = /HINT/.test(state) || /quotes words/.test(questions?.route?.criteria?.quote || '');
  return { answers: { route: { choice: hinted ? rightOf(state) : 'topic', confidence: 0.9 } }, tokens: 100 + (hinted ? 10 : 0), ms: 5 };
};
const rightOf = (state) => (/"/.test(state) ? 'quote' : /open/.test(state) ? 'book' : 'topic');
const bank = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, ref: `t${i}`, state: i % 2 ? `USER: "quoted words ${i}" source?` : `USER: open book ${i}`,
  questions: Q, gold: { route: i % 2 ? 'quote' : 'book' } }));

describe('a theory experiment over historic + synthetic', () => {
  it('reports accuracy per source; decideTheory wins on a real rise and loses on broken rows / token growth', async () => {
    const res = await testTheory({ gate: 'search-plan', theory: { variant: 'state-append', params: { text: 'HINT' } }, historic: bank(4),
      synthetic: [{ id: 'syn:1', state: 'USER: open the Aqdas', questions: Q, gold: { route: 'book' } }], cfg: { max_usd: 1 } }, { rerun: stubJev(rightOf) });
    expect(res.by_src).toMatchObject({ historic: { n: 4, baseline: 0, variant: 1 }, synthetic: { n: 1, variant: 1 } });
    const d = decideTheory(res, { margin: 0.05, max_broken: 2, token_ratio: 1.5 });
    expect(d.win).toBe(true);
    expect(theoryLabel('search-plan', d.numbers)).toBe('Jev on search-plan: 0% → 100% on 4 historic + 1 synthetic, broke 0');
    expect(decideTheory({ ...res, broken: 3 }, { margin: 0.05, max_broken: 2, token_ratio: 1.5 }).failed[0]).toMatch(/broke 3/);
    expect(decideTheory({ ...res, avg_tokens: { baseline: 100, variant: 200 } }, { margin: 0.05, max_broken: 2, token_ratio: 1.5 }).failed[0]).toMatch(/tokens ×2/);
    expect(decideTheory({ labelled: 0 }, { margin: 0.05, max_broken: 2, token_ratio: 1.5 }).win).toBe(false);
  });

  const stageDeps = (db, theories, { promoted = true } = {}) => {
    const promote = vi.fn(async () => ({ promoted, usd: 0.1, decision: { failed: promoted ? [] : ['x'] } }));
    const suggestions = [];
    return { promote, suggestions, deps: {
      call: vi.fn(async (_role, system) => (/SYNTHETIC/.test(system) ? reply({ cases: [{ state: 'USER: open the Hidden Words', gold: { route: 'book' } }] })
        : reply({ theories }))),
      weak: async () => [{ item_key: 'reply:1', gate: 'search-plan', right: 'quote', why: 'pasted quote routed as topic', classes: ['quote-origin'] }],
      sample: async () => bank(6), rerun: stubJev(rightOf),
      applySuggestions: (ins) => { suggestions.push(...ins); return ins.map((_, i) => 100 + i); },
      saveCandidate: (c) => saveCandidate(db, c, { by: 'opus-theory' }), logDesign: (r) => logDesign(db, r), promote } };
  };
  const cfg = { synthetic_n: 1, historic_n: 6, margin: 0.05, max_broken: 2, token_ratio: 1.5, max_usd: 1, per_day: 6, promote: { margin: -0.3 } };

  it('a WIN becomes a candidate: the decision step at a new version with params.enrich, replay-promoted; "What changed" gets the label', async () => {
    const db = fresh();
    const { deps, promote } = stageDeps(db, [{ kind: 'enrich', variant: 'state-append', params: { text: 'HINT' }, why: 'w' }]);
    const r = await theoryStage(db, { deps, cat: catalog(), cfg });
    expect(r.theories[0]).toMatchObject({ verdict: 'won', id: 'respond', promoted: true });
    const row = strategyRow(db, 'respond', r.theories[0].version);
    const plan = Object.values(row.graph.nodes).find((n) => n.step === 'respond.plan');
    expect(plan.step_version).toBe(2);
    const step = db.prepare("SELECT params_json FROM steps WHERE id = 'respond.plan' AND version = 2").get();
    expect(JSON.parse(step.params_json).enrich).toEqual([{ gate: 'search-plan', variant: 'state-append', params: { text: 'HINT' } }]);
    expect(promote).toHaveBeenCalledWith({ id: 'respond', version: r.theories[0].version, cfg: { margin: -0.3 } });
    expect(listDesigns(db)[0]).toMatchObject({ cluster_key: 'theory:search-plan', status: 'theory' });
    expect(listDesigns(db)[0].label).toMatch(/^Jev on search-plan: 0% → 100% on 6 historic \+ 1 synthetic, broke 0$/);
    expect(theoryCounts(db)).toEqual({ theories_tested_7d: 1, shipped_7d: 1, synthetic_cases: 1 });
    // one diagnosis per weak verdict: the same item is not diagnosed again
    expect(await theoryStage(db, { deps, cat: catalog(), cfg })).toBe('idle');
  });

  it('a LOSS is logged (no candidate); a needs-code theory becomes a CODE proposal with its scenarios', async () => {
    const db = fresh();
    const { deps, suggestions, promote } = stageDeps(db, [{ kind: 'enrich', variant: 'state-append', params: { text: 'nothing useful' } },
      { kind: 'needs-code', what: 'say in the state whether the reader pasted a quotation', scenarios: [{ title: 'pasted', given: { reader: 'a returning reader', history: [] },
        when: { asks: 'source of "x"?', examples: ['a', 'b'] }, then: [{ check: 'strategy', expect: 'quote' }] }] }]);
    const r = await theoryStage(db, { deps, cat: catalog(), cfg });
    expect(r.theories.map((t) => t.verdict)).toEqual(['lost', 'code']);
    expect(promote).not.toHaveBeenCalled();
    expect(suggestions[0]).toMatchObject({ target: 'other-code', evidence: ['reply:1'] });
    expect(suggestions[0].scenarios[0].title).toBe('pasted');
    expect(listTheories(db).map((t) => t.verdict).sort()).toEqual(['code', 'lost']);
    expect(theoryCounts(db)).toMatchObject({ theories_tested_7d: 1, shipped_7d: 0 });
  });

  it('a gate with no graph home ships its measured win as a CODE improvement', async () => {
    const db = fresh();
    const { deps, suggestions } = stageDeps(db, [{ kind: 'enrich', variant: 'state-append', params: { text: 'HINT' } }]);
    deps.weak = async () => [{ item_key: 'reply:2', gate: 'anis-triage', right: 'quote', why: 'w' }];
    const r = await theoryStage(db, { deps, cat: catalog(), cfg });
    expect(r.theories[0]).toMatchObject({ verdict: 'code' });
    expect(suggestions[0].expected_effect).toMatch(/^Jev on anis-triage: 0% → 100%/);
    expect(theoryHome('anis-triage', catalog())).toBeNull();
    expect(theoryHome('search-plan', catalog())).toMatchObject({ row: { id: 'respond' }, step: { id: 'respond.plan' } });
  });
});

describe('graph.js applies params.enrich on a decision step', () => {
  const graphWith = (params, seen) => compileGraph({ id: 'g', version: 1, graph: { entry: 'a', nodes: { a: { step: 's', step_version: 1 } }, edges: [{ from: 'a', on: '*', to: '$end' }] } },
    () => ({ id: 's', version: 1, activity: 'act', params }),
    { act: { kind: 'step', edges: [], run: async () => { seen.push(await enrichCall('search-plan', 'STATE', Q)); return 'ok'; } } });

  it('the step\'s Jev calls see the enrichers; with no enrich the call is untouched', async () => {
    const seen = [];
    await runGraph(graphWith({ enrich: [{ gate: 'search-plan', variant: 'state-append', params: { text: 'HINT' } }] }, seen), { messages: [] });
    await runGraph(graphWith({}, seen), { messages: [] });
    await runGraph(graphWith({ enrich: [{ gate: 'anis-triage', variant: 'state-append', params: { text: 'HINT' } }] }, seen), { messages: [] });
    expect(seen[0]).toMatchObject({ state: 'STATE\n\nHINT', applied: ['state-append'] });
    expect(seen[1]).toBeNull();
    expect(seen[2]).toBeNull();   // an entry for another gate leaves this call alone
  });

  it('thread-history reads the turn\'s own messages; a broken enricher never breaks the call', async () => {
    const r = await applyEnrich('search-plan', 'S', Q, [{ variant: 'thread-history', params: { turns: 2 } }, { variant: 'nope' }],
      { messages: [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'answer' }, { role: 'user', content: 'and that?' }] });
    expect(r.state).toBe('S\n\nEARLIER IN THIS CONVERSATION:\nuser: first\nassistant: answer');
    expect(r.applied).toEqual(['thread-history']);
    expect(await withAIContext({}, () => enrichCall('search-plan', 'S', Q))).toBeNull();
  });

  it('overhead with no enrich is ~0 (one property read per node)', async () => {
    const seen = [];
    const g = compileGraph({ id: 'g', version: 1, graph: { entry: 'a', nodes: { a: { step: 's', step_version: 1 } }, edges: [{ from: 'a', on: '*', to: '$end' }] } },
      () => ({ id: 's', version: 1, activity: 'act', params: {} }), { act: { kind: 'step', edges: [], run: () => 'ok' } });
    const t = performance.now();
    for (let i = 0; i < 20000; i++) await runGraph(g, {});
    const perNodeMs = (performance.now() - t) / 20000;
    expect(seen).toEqual([]);
    expect(perNodeMs).toBeLessThan(0.05);
  });
});

describe('the frozen per-class question set (Phase 4 edits are measured on it)', () => {
  it('first run: Opus writes the set (returned for freezing); later runs reuse it with no Opus call; historic questions join as class rows', async () => {
    const db = fresh();
    const cat = catalog();
    const row = cat.strategies.find((s) => s.name !== 'other');
    const writeQuestions = vi.fn(async () => ({ class: ['c1', 'c2'], guard: [], usd: 0.03 }));
    const a = await questionSet({ row, cat, writeQuestions, nFresh: 2, nGuard: 1 });
    expect(a.fresh.map((q) => q.question)).toContain('c1');
    freezeClassSet(db, row.id, a.fresh);
    const b = await questionSet({ row, cat, writeQuestions, nFresh: 2, nGuard: 1, frozen: classSet(db, row.id), historic: ['h1', 'c1'], held: ['held1'] });
    expect(writeQuestions).toHaveBeenCalledTimes(1);
    expect(b.usd).toBe(0);
    expect(b.questions.filter((q) => q.set !== 'guard').map((q) => `${q.set}:${q.question}`)).toEqual(['fresh:c2', 'held:held1', 'historic:h1', 'historic:c1']);
    expect(b.questions.filter((q) => q.set === 'guard')).toHaveLength(a.fresh.filter((q) => q.set === 'guard').length);
  });
});
