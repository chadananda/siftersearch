// pipeline/premise-pilot — target selection (range, match + neighbours), unverified proof dropped + counted, empty premises fine,
// maxUsd stop, credit refusal waits, result shape, billing key, policy gate. Everything injected; no network, no DB.
import { describe, it, expect } from 'vitest';
import { SYSTEM, premisePilotJob, selectParas, parsePremises, PILOT_TARGETS, CONCEPTS, EST_USD_PER_PARA, spanPresent } from '../../api/lib/pipeline/premise-pilot.js';
import { SpendCapError } from '../../api/lib/spend-caps.js';
import { currentAIContext } from '../../api/lib/ai-context.js';
import { assertAnthropicAllowed, isPremisePilotAllowed } from '../../api/lib/anthropic-policy.js';
import { modelFor } from '../../api/lib/model-roles.js';

const TEXTS = Array.from({ length: 10 }, (_, i) => `Paragraph ${i + 1} of the work, long enough to count as a paragraph. ${i === 4 ? 'The king taxes the poor unjustly.' : 'Nothing special here.'}`);
const paras = TEXTS.map((text, i) => ({ id: 1000 + i, doc_id: 7, paragraph_index: i * 2, text, heading: 'Sec' }));
const reply = (premises) => ({ content: JSON.stringify({ premises }), usage: { promptTokens: 1000, completionTokens: 100 } });
const good = (p) => ({ premise: 'A sovereign can be wrong.', concept: CONCEPTS[1], basis: 'presupposes', proof: 'The king taxes the poor unjustly.', why: 'rebuke implies fault', strength: 'strong' });
function world({ ask, extra = {} } = {}) {
  const w = { asked: [], billTo: [], logs: [], runs: [], sleeps: 0 };
  const deps = {
    doc: async (id) => (id === 404 ? null : { id, title: 'The Work', author: 'An Author' }),
    paragraphs: async () => paras,
    ask: async (m) => { w.asked.push(m); w.billTo.push(currentAIContext().billTo); return ask ? ask(m, w) : reply([]); },
    sleep: async () => { w.sleeps++; }, draining: async () => false, log: async (k, t) => { w.logs.push(t); },
    writeRun: (n, o) => { w.runs.push({ n, o }); return `data/run/${n}`; }, now: () => new Date('2026-11-11T00:00:00Z'),
    ...extra,
  };
  return { w, deps };
}

describe('selection', () => {
  it('range is inclusive, 1-based among prose paragraphs', () => {
    expect(selectParas(paras, { from: 3, to: 5 }).picked.map((p) => p.ord)).toEqual([3, 4, 5]);
  });
  it('match takes the matching paragraph plus one neighbour each side', () => {
    expect(selectParas(paras, { match: 'TAXES' }).picked.map((p) => p.ord)).toEqual([4, 5, 6]);
  });
  it('match at the edge and tiny paragraphs', () => {
    const ps = [{ id: 1, text: 'taxes are due here and this is long enough to count.' }, { id: 2, text: 'Heading' }];
    expect(selectParas(ps, { match: 'taxes' }).picked.map((p) => p.id)).toEqual([1]);
  });
  it('default targets are the four pilot books', () => expect(PILOT_TARGETS.map((t) => t.docId)).toEqual([20806, 21307, 20911, 21310]));
});

describe('premisePilotJob', () => {
  it('maxUsd is required', async () => {
    expect((await premisePilotJob({}, world().deps)).status).toBe('error');
    expect((await premisePilotJob({ maxUsd: 0 }, world().deps)).status).toBe('error');
  });
  it('dry run counts and estimates, asks nothing', async () => {
    const { w, deps } = world();
    const r = await premisePilotJob({ maxUsd: 5, dry: true, targets: [{ docId: 7, from: 1, to: 4 }, { docId: 404 }] }, deps);
    expect(r).toMatchObject({ dryRun: true, paragraphs: 4, missingDocs: [404] });
    expect(r.estUsd).toBeCloseTo(4 * EST_USD_PER_PARA, 4);
    expect(w.asked).toHaveLength(0);
  });
  it('verified premise kept with its fields; unverified dropped and counted; empty is fine', async () => {
    const { w, deps } = world({ ask: (m) => (m[1].content.includes('PASSAGE:\nParagraph 5') ? reply([good(), { ...good(), proof: 'words that are nowhere in the passage at all' }]) : reply([])) });
    const r = await premisePilotJob({ maxUsd: 5, targets: [{ docId: 7 }] }, deps);
    expect(r).toMatchObject({ status: 'complete', paragraphs: 10, analysed: 10, withPremises: 1, unverified: 1 });
    expect(r.premises).toHaveLength(1);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0]).toMatchObject({ reason: 'proof-not-found', paraId: 1004, proof: 'words that are nowhere in the passage at all' });
    expect(r.premises[0]).toMatchObject({ docId: 7, title: 'The Work', paraId: 1004, ord: 5, concept: CONCEPTS[1], basis: 'presupposes', strength: 'strong' });
    expect(r.premises[0].text.length).toBeLessThanOrEqual(600);
    expect(r.byConcept).toEqual({ [CONCEPTS[1]]: 1 });
    expect(r.usd).toBeGreaterThan(0);
    expect(w.runs[0].n).toMatch(/^premise-pilot-.*\.json$/);
    expect(r.file).toBe(`data/run/${w.runs[0].n}`);
  });
  it('gives the model prev + next paragraph, heading, title and author; bills to premise-pilot', async () => {
    const { w, deps } = world();
    await premisePilotJob({ maxUsd: 5, targets: [{ docId: 7, from: 5, to: 5 }] }, deps);
    const u = w.asked[0][1].content;
    expect(u).toContain('The Work by An Author'); expect(u).toContain('SECTION: Sec');
    expect(u).toContain('PREVIOUS PARAGRAPH (context only):\nParagraph 4'); expect(u).toContain('NEXT PARAGRAPH (context only):\nParagraph 6');
    expect(w.billTo).toEqual(['premise-pilot']);
  });
  it('a reply that is not JSON is counted unparsed, not a premise', async () => {
    const { deps } = world({ ask: () => ({ content: 'sorry', usage: { promptTokens: 1, completionTokens: 1 } }) });
    expect(await premisePilotJob({ maxUsd: 5, targets: [{ docId: 7, from: 1, to: 2 }] }, deps)).toMatchObject({ unparsed: 2, premises: [] });
  });
  it('stops at maxUsd with status budget', async () => {
    const { w, deps } = world({ ask: () => ({ content: '{"premises":[]}', usage: { promptTokens: 100000, completionTokens: 0 } }) });   // $0.30 per call
    const r = await premisePilotJob({ maxUsd: 0.5, targets: [{ docId: 7 }] }, deps);
    expect(r.status).toBe('budget');
    expect(w.asked.length).toBeLessThan(10);
    expect(r.usd).toBeLessThanOrEqual(0.5 + 0.3 * 4);
  });
  it('credit refusal waits in place and retries the same paragraph', async () => {
    let n = 0;
    const { w, deps } = world({ ask: () => { if (n++ === 0) throw new SpendCapError({ group: 'premise-pilot', spent: 0, cap: 0, caller: 'premise-pilot', retryAfterMs: 1, credit: true }); return reply([]); } });
    const r = await premisePilotJob({ maxUsd: 5, targets: [{ docId: 7, from: 1, to: 1 }] }, deps);
    expect(r).toMatchObject({ status: 'complete', analysed: 1 });
    expect(w.sleeps).toBe(1);
    expect(r.creditWait.resolvedAt).toBeTruthy();
  });
  it('credit refusal while draining yields', async () => {
    const { deps } = world({ ask: () => { throw new SpendCapError({ group: 'g', spent: 0, cap: 0, caller: 'c', retryAfterMs: 1, credit: true }); }, extra: { draining: async () => true } });
    expect((await premisePilotJob({ maxUsd: 5, targets: [{ docId: 7, from: 1, to: 1 }] }, deps)).status).toBe('yielded');
  });
  it('a daily cap stops quietly', async () => {
    const { deps } = world({ ask: () => { throw new SpendCapError({ group: 'anthropic', spent: 20, cap: 20, caller: 'premise-pilot', retryAfterMs: 1 }); } });
    expect((await premisePilotJob({ maxUsd: 5, targets: [{ docId: 7 }] }, deps)).status).toBe('cap');
  });
  it('other errors are counted, the run continues', async () => {
    const { deps } = world({ ask: () => { throw new Error('boom'); } });
    expect(await premisePilotJob({ maxUsd: 5, targets: [{ docId: 7, from: 1, to: 3 }] }, deps)).toMatchObject({ status: 'complete', errors: 3 });
  });
});

describe('parsePremises + policy', () => {
  it('proof check ignores footnote and page markers (Aqdas unborn ¶ was dropped for [^41])', () => {
    const text = 'When We heard the clamor of the children as yet unborn,[^41] We doubled their share and decreased those of the rest.';
    expect(spanPresent('When We heard the clamor of the children as yet unborn, We doubled their share and decreased those of the rest.', [text])).toBe(true);
    expect(spanPresent('Muhammad never fought against the Christians; on the contrary', ['[pg 26]  Muhammad never fought against the Christians; on the contrary, He treated them'])).toBe(true);
  });
  it('a proof joining separate phrases passes only when every piece is in the passage (11-12 drops)', () => {
    const text = 'Beware lest ye shed the blood of anyone. Unsheathe the sword of your tongue. God\u2019s mercy, hath, verily, encompassed all created things. The one true God hath said: \u201cNone shall bear the burden of another.\u201d';
    expect(spanPresent('Beware lest ye shed the blood of anyone. God\'s mercy, hath, verily, encompassed all created things', [text])).toBe(true);
    expect(spanPresent('Beware lest ye shed the blood of anyone... Unsheathe the sword of your tongue', [text])).toBe(true);
    expect(spanPresent("The one true God hath said: 'None shall bear the burden of another.'", [text])).toBe(true);
    expect(spanPresent('Beware lest ye shed the blood of anyone... words that are nowhere in it at all', [text])).toBe(false);
  });
  it('the prompt asks for implications (lesser right implies the greater) in an "implies" field', () => {
    expect(SYSTEM).toMatch(/unborn/);
    expect(SYSTEM).toMatch(/lesser right/);
    expect(SYSTEM).toMatch(/"implies"/);
    expect(SYSTEM).toMatch(/Manifestation of God founding a new religion/);   // Chad 11-12: never "a religious authority"
    expect(SYSTEM).toMatch(/Keep the passage's OWN terms/);   // Chad 11-12: "love of God" was abstracted to "moral conduct"
    expect(SYSTEM).toMatch(/POTENTIAL/); expect(SYSTEM).toMatch(/never say people are naturally oriented/i);   // Chad 11-12
  });
  it("proof check tolerates straight quotes against the text's curly ones, still rejects absent words", () => {
    const text = "Bahá\u2019u\u2019lláh said \u201Cjustice\u201D \u2014 the best beloved";
    expect(spanPresent("Bahá'u'lláh said \"justice\" - the best beloved", [text])).toBe(true);
    expect(spanPresent("the worst beloved", [text])).not.toBe(true);
  });
  it('prompt carries the scope rule and keeps assumes-not-teaches', () => {
    expect(SYSTEM).toContain('Stay inside what the passage itself addresses');
    expect(SYSTEM).toContain('NAME that aspect');
    expect(SYSTEM).toContain('never "teaches"');
  });
  it('parses wrapped JSON, rejects junk', () => {
    expect(parsePremises('here: {"premises":[]} done')).toEqual([]);
    expect(parsePremises('nope')).toBeNull();
    expect(parsePremises('{"premises":"x"}')).toBeNull();
  });
  it('anthropic gate: only premise-pilot + hype-judge stage + judge model', () => {
    const ok = { provider: 'anthropic', model: modelFor('hype-judge').model, stage: 'hype-judge', caller: 'premise-pilot' };
    expect(isPremisePilotAllowed(ok)).toBe(true);
    expect(() => assertAnthropicAllowed({ ...ok, docId: 20806 })).not.toThrow();
    for (const bad of [{ caller: 'other' }, { stage: 'hype' }, { model: 'claude-opus-5-5' }]) expect(() => assertAnthropicAllowed({ ...ok, ...bad, docId: 999999999 })).toThrow();
  });
});
