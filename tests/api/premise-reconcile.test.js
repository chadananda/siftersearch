// pipeline/premise-reconcile — grouping, chunking with shared framing, verdict application, unverified framing flagged, maxUsd stop,
// credit wait, dry estimate, billing key. Everything injected; no network, no DB.
import { describe, it, expect } from 'vitest';
import { premiseReconcileJob, groupByConcept, chunk, parseReconcile, SYSTEM, CHUNK, estCall } from '../../api/lib/pipeline/premise-reconcile.js';
import { SpendCapError } from '../../api/lib/spend-caps.js';
import { currentAIContext } from '../../api/lib/ai-context.js';

const NOBLE = 'human nature (noble vs. corrupt)', LAW = 'equality before the law';
const entry = (i, concept) => ({ docId: 1, title: 'Book', paraId: i, ord: i, text: 't', premise: `premise ${i}`, concept, basis: 'states', proof: 'p', why: 'w', strength: 'strong' });
const src = (list) => ({ name: 'premise-pilot-x.json', premises: list });
const ANCHOR = 'I have created thee noble, why hast thou abased thyself';
const hit = (id, core = true) => ({ id, text: id === 'h1' ? ANCHOR : `anchor ${id}`, title: 'Hidden Words', author: "Bahá'u'lláh", core });
const verdictsFor = (m) => [...m[1].content.matchAll(/^\[(e\d+)\] /gm)].map((x) => x[1]);
const okReply = (m, over = {}) => ({ content: JSON.stringify({ framing: 'Two natures.', framingProof: [{ anchorId: 'a1', words: 'created thee noble' }], verdicts: verdictsFor(m).map((id) => ({ id, verdict: 'keep', reason: 'ok' })), ...over }), usage: { promptTokens: 1000, completionTokens: 100 } });
function world({ list, ask, extra = {} }) {
  const w = { asked: [], billTo: [], logs: [], runs: [], sleeps: 0, searches: [] };
  const deps = {
    readRun: () => src(list), search: async (q) => { w.searches.push(q); return { hits: [hit('h1'), hit('h2'), hit('h3', false)] }; }, isCore: async (h) => h.core,
    ask: async (m) => { w.asked.push(m); w.billTo.push(currentAIContext().billTo); return ask ? ask(m, w) : okReply(m); },
    sleep: async () => { w.sleeps++; }, draining: async () => false, log: async (k, t) => { w.logs.push(t); },
    writeRun: (n, o) => { w.runs.push({ n, o }); return `data/run/${n}`; }, now: () => new Date('2026-11-11T00:00:00Z'), ...extra,
  };
  return { w, deps };
}

describe('grouping', () => {
  it('groups by concept; a lone "other:" entry is skipped, a lone named concept is not', () => {
    const { groups, skipped } = groupByConcept([entry(1, NOBLE), entry(2, NOBLE), entry(3, LAW), entry(4, 'other: x')]);
    expect(groups.map((g) => [g.concept, g.entries.length])).toEqual([[NOBLE, 2], [LAW, 1]]);
    expect(skipped.map((s) => s.id)).toEqual(['e4']);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['e1', 'e2']);
  });
  it('chunk splits at the limit', () => expect(chunk(Array.from({ length: 130 }), CHUNK).map((c) => c.length)).toEqual([60, 60, 10]));
  it('parseReconcile rejects junk', () => { expect(parseReconcile('no')).toBeNull(); expect(parseReconcile('{"verdicts":[]}')).toMatchObject({ verdicts: [] }); });
  it('prompt: authority order, framing with distinctions, rescope/drop', () => {
    for (const t of ["Bahá'u'lláh and the Báb > 'Abdu'l-Bahá > Shoghi Effendi", 'two natures', 'rescope', 'drop', 'never invent']) expect(SYSTEM.toLowerCase()).toContain(t.toLowerCase());
  });
});

describe('premiseReconcileJob', () => {
  it('maxUsd required; no pilot file is an error', async () => {
    expect((await premiseReconcileJob({}, world({ list: [entry(1, NOBLE)] }).deps)).status).toBe('error');
    expect((await premiseReconcileJob({ maxUsd: 5 }, world({ list: [] }).deps)).status).toBe('error');
  });
  it('dry run: concept count + estimate, asks nothing', async () => {
    const { w, deps } = world({ list: [entry(1, NOBLE), entry(2, NOBLE), entry(3, LAW)] });
    const r = await premiseReconcileJob({ maxUsd: 5, dry: true }, deps);
    expect(r).toMatchObject({ dryRun: true, concepts: 2, entries: 3 });
    expect(r.estUsd).toBeCloseTo(estCall(2) + estCall(1), 3);
    expect(w.asked).toHaveLength(0);
  });
  it('anchors are core only, queries use label + synonyms, bills to premise-pilot', async () => {
    const { w, deps } = world({ list: [entry(1, NOBLE), entry(2, NOBLE)] });
    const r = await premiseReconcileJob({ maxUsd: 5 }, deps);
    expect(w.searches[0]).toBe(NOBLE); expect(w.searches.length).toBeGreaterThan(1);
    expect(r.concepts[0].anchors.map((a) => a.id)).toEqual(['a1', 'a2']);   // h3 is not core, repeats deduped
    expect(w.asked[0][1].content).toContain('[a1] Hidden Words');
    expect(w.billTo).toEqual(['premise-pilot']);
  });
  it('verdicts applied: rescope rewrites, drop kept with reason, keep unchanged, missing = unjudged', async () => {
    const { w, deps } = world({ list: [entry(1, NOBLE), entry(2, NOBLE), entry(3, NOBLE), entry(4, NOBLE)], ask: (m) => ({ content: JSON.stringify({ framing: 'F', framingProof: [{ anchorId: 'a1', words: 'created thee noble' }], verdicts: [{ id: 'e1', verdict: 'keep', reason: 'fine' }, { id: 'e2', verdict: 'rescope', premise: 'The higher nature is noble.', reason: 'aspect' }, { id: 'e3', verdict: 'drop', reason: 'overreach' }] }), usage: { promptTokens: 10, completionTokens: 10 } }) });
    const r = await premiseReconcileJob({ maxUsd: 5 }, deps);
    const by = Object.fromEntries(r.entries.map((e) => [e.id, e]));
    expect(by.e1).toMatchObject({ verdict: 'keep', newPremise: 'premise 1' });
    expect(by.e2).toMatchObject({ verdict: 'rescope', newPremise: 'The higher nature is noble.', premise: 'premise 2' });
    expect(by.e3).toMatchObject({ verdict: 'drop', reason: 'overreach', newPremise: 'premise 3' });
    expect(by.e4.verdict).toBe('unjudged');
    expect(r.concepts[0].counts).toEqual({ keep: 1, rescope: 1, drop: 1 });
    expect(w.runs[0].n).toMatch(/^premise-reconcile-.*\.json$/);
  });
  it('large concept is chunked and later chunks share the first framing', async () => {
    const list = Array.from({ length: CHUNK + 5 }, (_, i) => entry(i + 1, NOBLE));
    const { w, deps } = world({ list });
    const r = await premiseReconcileJob({ maxUsd: 5 }, deps);
    expect(w.asked).toHaveLength(2);
    expect(w.asked[0][1].content).not.toContain('FRAMING ALREADY ESTABLISHED');
    expect(w.asked[1][1].content).toContain('FRAMING ALREADY ESTABLISHED');
    expect(w.asked[1][1].content).toContain('Two natures.');
    expect(r.entries.filter((e) => e.verdict === 'keep')).toHaveLength(CHUNK + 5);
  });
  it('framing proof not in the anchors is flagged, not fatal', async () => {
    const { deps } = world({ list: [entry(1, NOBLE), entry(2, NOBLE)], ask: (m) => okReply(m, { framingProof: [{ anchorId: 'a1', words: 'words that no anchor holds anywhere' }] }) });
    const r = await premiseReconcileJob({ maxUsd: 5 }, deps);
    expect(r.status).toBe('complete');
    expect(r.concepts[0].framingUnverified).toHaveLength(1);
  });
  it('stops at maxUsd with status budget', async () => {
    const list = Array.from({ length: CHUNK * 3 }, (_, i) => entry(i + 1, NOBLE));   // three sequential chunks
    const { w, deps } = world({ list, ask: (m) => ({ ...okReply(m), usage: { promptTokens: 200000, completionTokens: 0 } }) });   // $0.60 a call
    const r = await premiseReconcileJob({ maxUsd: 0.65 }, deps);
    expect(r.status).toBe('budget');
    expect(w.asked).toHaveLength(1);
  });
  it('credit refusal waits in place and retries the same call', async () => {
    let n = 0;
    const { w, deps } = world({ list: [entry(1, NOBLE), entry(2, NOBLE)], ask: (m) => { if (n++ === 0) throw new SpendCapError({ group: 'premise-pilot', spent: 0, cap: 0, caller: 'premise-pilot', retryAfterMs: 1, credit: true }); return okReply(m); } });
    const r = await premiseReconcileJob({ maxUsd: 5 }, deps);
    expect(r.status).toBe('complete'); expect(w.sleeps).toBe(1); expect(r.creditWait.resolvedAt).toBeTruthy();
  });
  it('credit refusal while draining yields; a daily cap stops quietly', async () => {
    const boom = () => { throw new SpendCapError({ group: 'g', spent: 0, cap: 0, caller: 'c', retryAfterMs: 1, credit: true }); };
    expect((await premiseReconcileJob({ maxUsd: 5 }, world({ list: [entry(1, NOBLE), entry(2, NOBLE)], ask: boom, extra: { draining: async () => true } }).deps)).status).toBe('yielded');
    const cap = () => { throw new SpendCapError({ group: 'anthropic', spent: 20, cap: 20, caller: 'premise-pilot', retryAfterMs: 1 }); };
    expect((await premiseReconcileJob({ maxUsd: 5 }, world({ list: [entry(1, NOBLE), entry(2, NOBLE)], ask: cap }).deps)).status).toBe('cap');
  });
});
