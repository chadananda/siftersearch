// 11-09 follow-up trace: the turn trace names the strategy@version that ran + Jev's decisions; a refers-back "quote" plan hunts the topic, not the ask. Jev mocked.
import { describe, it, expect } from 'vitest';
import { strategyRun } from '../../api/lib/assistant/turn.js';
import { turnTrace } from '../../api/lib/assistant/admin-threads.js';
import { turnText } from '../../scripts/ops/trace-format.mjs';
import { planSearch } from '../../api/lib/search-plan.js';

const ans = (o) => ({ tradition: { choice: 'none', confidence: 0.95 }, comparative: { noul: 0 }, author: { choice: 'none', confidence: 0.95 }, shape: { choice: o.shape ?? 'topic', confidence: 0.9 },
  about: { choice: 'texts', confidence: 0.9 }, request: { choice: 'plain', confidence: 0.9 }, language: { choice: 'none', confidence: 0.9 } });
const THREAD = (q) => [{ role: 'user', content: 'My grandmother passed away. Will I recognise her in the next world?' }, { role: 'assistant', content: 'Abdu\'l-Bahá says [*Selections*](https://oceanlibrary.com/a#1).' }, { role: 'user', content: q }];

describe('trace names what ran', () => {
  const strat = { strategy: { choice: 'phrase_usage_trace', confidence: 0.9 }, sides: [], sources: { Hindu: 'the Gita' }, units: { named_person: "'Abdu'l-Bahá" }, refersBack: true };
  it('strategyRun: strategy id + version (from the graph that ran), shape apart, Jev decisions', () => {
    const r = strategyRun(strat, [{ graph: 'respond@2' }, { graph: 'phrase_usage_trace@1' }], 'quote');
    expect(r).toMatchObject({ shape: 'quote', strategy: 'phrase_usage_trace', version: 1, jev: { picked: 'phrase_usage_trace', refers_back: true, sources: { Hindu: 'the Gita' }, units: { named_person: "'Abdu'l-Bahá" } } });
    expect(strategyRun(null, [], 'topic')).toMatchObject({ strategy: null, version: null, jev: null });
  });
  it('turnTrace carries the decisions; the text view prints strategy@version + decisions', async () => {
    const path = { gate: 'research', plan: { shape: 'quote', stages: { strategy: { choice: 'quote', ...strategyRun(strat, [{ graph: 'phrase_usage_trace@1' }], 'quote') } } },
      decisions: [{ point: 'refers-back', by: 'jev', saw: 'long state', chosen: 'previous', probabilities: { previous: 0.9 }, reason: 'subject from the last turn' },
        { point: 'lookup:reference', by: 'code', saw: '{"work":"33857 The Dawn-Breakers"}', chosen: 'none', reason: 'no numbered unit 25' }] };
    const t = await turnTrace({ thread: async () => ({}), messages: async () => [{ round_index: 0, role: 'user', content: 'q' }, { round_index: 0, role: 'assistant', content: 'a', path_json: JSON.stringify(path) }], traces: async () => [], titles: async () => new Map() }, 'conv_x:0');
    expect(t.decisions).toEqual([{ point: 'refers-back', by: 'jev', chosen: 'previous', probabilities: { previous: 0.9 }, reason: 'subject from the last turn' },
      { point: 'lookup:reference', by: 'code', chosen: 'none', probabilities: null, reason: 'no numbered unit 25', saw: '{"work":"33857 The Dawn-Breakers"}' }]);
    const txt = turnText(t);
    expect(txt).toMatch(/strategy phrase_usage_trace@1  shape quote/); expect(txt).toMatch(/refers-back \[jev\] -> "previous"/);
  });
  it('turnTrace carries the strategy steps with their ms; the text view lists the slowest first', async () => {
    const path = { steps: [{ graph: 'prayer@6', node: 'find', step: 'fetch.prayer@1', ms: 12500.4, edge: 'several' }, { graph: 'prayer@6', node: 'pick', step: 'judge.prayer@1', ms: 900, edge: 'one' }] };
    const t = await turnTrace({ thread: async () => ({}), messages: async () => [{ round_index: 0, role: 'user', content: 'q' }, { round_index: 0, role: 'assistant', content: 'a', path_json: JSON.stringify(path) }], traces: async () => [], titles: async () => new Map() }, 'conv_x:0');
    expect(t.steps).toEqual([{ graph: 'prayer@6', node: 'find', step: 'fetch.prayer@1', ms: 12500.4, edge: 'several' }, { graph: 'prayer@6', node: 'pick', step: 'judge.prayer@1', ms: 900, edge: 'one' }]);
    expect(turnText(t)).toMatch(/steps \(slowest first\):\n\s+12500 ms  prayer@6 find fetch\.prayer@1 -> several\n\s+900 ms/);
  });
});

describe('search plan: refers-back rule', () => {
  const quotePlan = (messages) => planSearch(messages, { apiKey: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ answers: ans({ shape: 'quote' }) }) }), cache: false, resolveName: null });
  it('Jev said quote but the message only points at the last reply → the plan is a topic search, no literal phrase', async () => {
    const m = THREAD('what are the actual words?'); m.refersBack = true;
    const p = await quotePlan(m);
    expect(p.shape).toBe('topic'); expect(p.quote).toBeUndefined(); expect(p.overridden.by).toBe('refers-back-rule');
  });
  it('without refers_back the quote plan stands; a quoted span still hunts its words', async () => {
    expect((await quotePlan(THREAD('what are the actual words?'))).shape).toBe('quote');
    const m = THREAD('where does it say "the soul after death is free"?'); m.refersBack = true;
    expect((await quotePlan(m)).shape).toBe('quote');
  });
});
