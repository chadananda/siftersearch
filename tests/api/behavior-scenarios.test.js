// Behaviour scenarios (tests/behavior/): check evaluation, the judge parse, the seed counts, the proposal file
// (`ops.mjs anis-improve-scenarios <id> --write`), run states and the digest's proposed-improvements section. No network, no prod DB.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { evaluateCheck, evaluateChecks, applyJudge, scenarioState, scenarioMessages, scenariosIn } from '../behavior/checks.mjs';
import { chunkSizes, seedRouting, seedDecisions } from '../behavior/seed.mjs';
import { proposalFile, writeProposal, runStateOf, proposalRel } from '../../api/lib/audit/behavior-proposal.js';
import { parseBehaviorJudge, judgeBehavior, behaviorJudgeMessage, BEHAVIOR_JUDGE_CALLER } from '../../api/lib/audit/behavior-judge.js';
import { behaviorTrace } from '../../api/lib/assistant/behavior-trace.js';
import { improveDigest } from '../../api/lib/audit/improve.js';
import { digestText, WORKFLOW } from '../../api/lib/audit/improve-digest-text.js';
import { improveOverview, theoryChanges, gateAccuracy, ladderShares } from '../../api/lib/audit/improve-overview.js';
import { openImproveDb, applySuggestions, getImprovement, recordBehaviorRuns, behaviorRunStates, improveDigestData } from '../../api/lib/repos/improve-repo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readQ = (f) => JSON.parse(readFileSync(join(ROOT, 'tests/quality', f), 'utf8'));
const SCEN = { title: 'Asked for a book, gives the book', given: { reader: 'a new reader', history: ['who was Tahirih?'] },
  when: { asks: 'for a book by name', examples: ['where can I read the Kitab-i-Iqan?', 'link me to Gleanings'] },
  then: [{ check: 'links_book', expect: 'yes' }, { check: 'tool_not_called', expect: 'web_search' }] };

describe('behaviour checks', () => {
  const trace = { strategy: 'quote-trace', shape: 'quote', tools: ['quotation_trace', 'fused_search'],
    cited: [{ title: 'Gleanings', tier: 'writings', language: 'en' }, { title: 'Lawh', tier: 'writings', language: 'ar' }],
    reply: 'Read [Gleanings](https://oceanlibrary.com/library/gleanings).' };
  it('mechanical checks decide; judge stays pending', () => {
    const r = evaluateChecks(trace, [
      { check: 'strategy', expect: 'quote-trace | lookup' }, { check: 'shape', expect: 'define or quote' },
      { check: 'tool_called', expect: 'quotation_trace on the quoted words' }, { check: 'tool_not_called', expect: 'web_search' },
      { check: 'source_tier', expect: 'writings first' }, { check: 'cites_original', expect: 'yes' }, { check: 'links_book', expect: 'yes' },
      { check: 'judge', expect: 'answers plainly' }]);
    expect(r.map((x) => x.pass)).toEqual([true, true, true, true, true, true, true, null]);
  });
  it('fails and negations', () => {
    expect(evaluateCheck(trace, { check: 'tool_called', expect: 'web_search' }).pass).toBe(false);
    expect(evaluateCheck(trace, { check: 'tool_not_called', expect: 'fused_search' }).pass).toBe(false);
    expect(evaluateCheck(trace, { check: 'source_tier', expect: 'not secondary' }).pass).toBe(true);
    expect(evaluateCheck(trace, { check: 'source_tier', expect: 'not writings' }).pass).toBe(false);
    expect(evaluateCheck(trace, { check: 'source_tier', expect: 'anything' }).pass).toBe(false);   // names no tier
    expect(evaluateCheck({ ...trace, cited: [{ language: 'EN' }] }, { check: 'cites_original', expect: 'yes' }).pass).toBe(false);
    expect(evaluateCheck({ ...trace, reply: 'no link' }, { check: 'links_book', expect: 'yes' }).pass).toBe(false);
    expect(evaluateCheck({ ...trace, reply: 'see [x](/library/x)' }, { check: 'links_book', expect: 'no' }).pass).toBe(false);
    expect(evaluateCheck(trace, { check: 'nonsense', expect: 'x' }).pass).toBe(false);
    expect(evaluateCheck(null, { check: 'strategy', expect: 'x' }).pass).toBe(false);
  });
  it('judge results fill pending checks in order; a missing one fails', () => {
    const r = applyJudge([{ check: 'judge', pass: null }, { check: 'shape', pass: true }, { check: 'judge', pass: null }], [{ pass: true, why: 'ok' }]);
    expect(r.map((x) => x.pass)).toEqual([true, true, false]);
    expect(r[2].got).toBe('unjudged');
  });
  it('scenario state: passing only when every check of every example passed', () => {
    expect(scenarioState([[{ pass: true }], [{ pass: true }]])).toBe('passing');
    expect(scenarioState([[{ pass: true }], [{ pass: null }]])).toBe('failing');
    expect(scenarioState([[{ pass: true }], []])).toBe('failing');
    expect(scenarioState([])).toBe('failing');
  });
  it('history becomes earlier turns; files of every shape yield scenarios', () => {
    expect(scenarioMessages(SCEN, 'q').map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(scenarioMessages(SCEN, 'q').at(-1).content).toBe('q');
    expect(scenariosIn([SCEN])).toHaveLength(1);
    expect(scenariosIn({ id: 3, scenarios: [SCEN, SCEN] })).toHaveLength(2);
    expect(scenariosIn(SCEN)).toHaveLength(1);
    expect(scenariosIn({})).toEqual([]);
  });
  it('behaviorTrace reads what the turn did', () => {
    const t = behaviorTrace({ path: { strategy: { choice: 'lookup' }, decisions: [{ point: 'depth', by: 'jev', chosen: 'short', extra: 1 }] },
      plan: { shape: 'research', steps: [{ tool: 'fused_search', found: 3 }, { tool: 'fused_search' }, { tool: 'quotation_trace' }] }, format: { id: 'brief' } }, [{ title: 'X' }]);
    expect(t).toMatchObject({ strategy: 'lookup', shape: 'research', format: 'brief', tools: ['fused_search', 'quotation_trace'], cited: [{ title: 'X' }] });
    expect(t.decisions).toEqual([{ point: 'depth', by: 'jev', chosen: 'short' }]);
    expect(behaviorTrace({}).tools).toEqual([]);
  });
});

describe('behaviour judge', () => {
  it('parses by index, fills gaps as unjudged, survives junk', () => {
    expect(parseBehaviorJudge('x {"results":[{"i":2,"pass":true,"why":"b"},{"i":1,"pass":false,"why":"a"}]} y', 3))
      .toEqual([{ pass: false, why: 'a' }, { pass: true, why: 'b' }, { pass: false, why: 'unjudged' }]);
    expect(parseBehaviorJudge('not json', 2)).toEqual([{ pass: false, why: 'unjudged' }, { pass: false, why: 'unjudged' }]);
  });
  it('one call under the improve-behavior-judge caller; no reply = no call', async () => {
    const calls = [];
    const call = async (role, sys, msg, max, caller) => { calls.push({ msg, caller }); return { text: '{"results":[{"i":1,"pass":true,"why":"ok"}]}', usd: 0.02 }; };
    const r = await judgeBehavior({ question: 'q', reply: 'r', cited: [{ title: 'G', tier: 'writings' }], expects: ['is plain'] }, { call });
    expect(r).toEqual({ results: [{ pass: true, why: 'ok' }], usd: 0.02 });
    expect(calls[0].caller).toBe(BEHAVIOR_JUDGE_CALLER);
    expect(BEHAVIOR_JUDGE_CALLER.startsWith('improve-')).toBe(true);
    expect(calls[0].msg).toContain('1. is plain');
    const none = await judgeBehavior({ question: 'q', reply: '', expects: ['a'] }, { call });
    expect(none.results[0].pass).toBe(false);
    expect(calls).toHaveLength(1);
    expect(behaviorJudgeMessage({ question: 'q', reply: 'r', expects: ['a', 'b'] })).toContain('2. b');
  });
});

describe('seeding the suite from the older fixtures', () => {
  it('chunks of 2-3', () => {
    expect(chunkSizes(1)).toEqual([]);
    expect(chunkSizes(2)).toEqual([2]);
    expect(chunkSizes(4)).toEqual([2, 2]);
    expect(chunkSizes(5)).toEqual([3, 2]);
    expect(chunkSizes(7)).toEqual([3, 2, 2]);
    for (let n = 2; n < 40; n++) { const c = chunkSizes(n); expect(c.reduce((a, b) => a + b, 0)).toBe(n); expect(c.every((k) => k >= 2 && k <= 3)).toBe(true); }
  });
  it('routing fixtures: 45 cases → 44 converted in 16 scenarios; the lone class is counted, not lost', () => {
    const r = seedRouting(readQ('routing-fixtures.json'));
    expect(r.counts).toMatchObject({ cases: 45, converted: 44, not_converted: 1 });
    expect(r.counts.not_converted_ids[0].id).toBe('e-define-3');
    expect(r.scenarios).toHaveLength(16);
    expect(r.scenarios.every((s) => s.draft?.research === false && s.then[0].check === 'shape' && s.when.examples.length >= 2)).toBe(true);
  });
  it('answer decisions: 6 cases → 6 converted in 3 scenarios', () => {
    const d = seedDecisions(readQ('answer-decisions.json'));
    expect(d.counts).toMatchObject({ cases: 6, converted: 6, not_converted: 0 });
    expect(d.scenarios).toHaveLength(3);
  });
  it('the committed suite matches the seed', () => {
    const r = JSON.parse(readFileSync(join(ROOT, 'tests/behavior/scenarios/routing.json'), 'utf8'));
    const d = JSON.parse(readFileSync(join(ROOT, 'tests/behavior/scenarios/answer-decisions.json'), 'utf8'));
    expect(scenariosIn(r)).toEqual(seedRouting(readQ('routing-fixtures.json')).scenarios);
    expect(scenariosIn(d)).toEqual(seedDecisions(readQ('answer-decisions.json')).scenarios);
  });
});

describe('proposals: anis-improve-scenarios --write, run state, the digest', () => {
  it('writes proposed/<id>.json once; --force overwrites; no scenarios = nothing written', () => {
    const root = mkdtempSync(join(tmpdir(), 'behavior-'));
    try {
      const imp = { id: 7, status: 'open', target: 'tool', file: 'api/x.js', fn: 'f', change: 'do y', scenarios: [SCEN] };
      expect(proposalFile({ ...imp, scenarios: [] })).toBeNull();
      const a = writeProposal(root, imp);
      expect(a).toMatchObject({ written: true, path: join(root, proposalRel(7)) });
      const j = JSON.parse(readFileSync(a.path, 'utf8'));
      expect(j).toMatchObject({ id: 7, change: 'do y', target: 'tool' });
      expect(scenariosIn(j)).toEqual([SCEN]);
      expect(writeProposal(root, { ...imp, change: 'other' })).toMatchObject({ written: false });
      expect(JSON.parse(readFileSync(a.path, 'utf8')).change).toBe('do y');
      expect(writeProposal(root, { ...imp, change: 'other' }, { overwrite: true }).written).toBe(true);
      expect(writeProposal(root, { id: 8, change: 'z', scenarios: [] })).toMatchObject({ written: false, reason: 'no scenarios' });
      expect(existsSync(join(root, proposalRel(8)))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('run state: never run → failing → passing (every scenario\'s last run)', () => {
    const s = [{ title: 'a' }, { title: 'b' }];
    expect(runStateOf(1, s, new Map()).state).toBe('never run');
    expect(runStateOf(1, s, new Map([['1|a', { state: 'passing', at: 't1' }]])).state).toBe('failing');
    const all = runStateOf(1, s, new Map([['1|a', { state: 'passing', at: 't1' }], ['1|b', { state: 'passing', at: 't2' }]]));
    expect(all).toMatchObject({ state: 'passing', at: 't2' });
  });
  it('the store: a proposal is read by id, runs are recorded, the digest lists it and flags a passing one as possibly stale', () => {
    const db = openImproveDb(':memory:');
    const [id] = applySuggestions(db, { inserts: [{ stage: 'research', file: 'api/lib/assistant/researcher.js', fn: 'plan', target: 'tool', change: 'call quotation_trace first',
      expected_effect: 'quotes found', scenarios: [SCEN], classes: ['quote'], severity: 2, evidence: ['reply:1'] }] });
    const imp = getImprovement(id, { db });
    expect(imp.id).toBe(id);
    const since = new Date(Date.now() - 86400000).toISOString();
    let dg = improveDigest(improveDigestData({ since }, { db }), { since });
    expect(dg.proposals).toMatchObject([{ id, run: 'never run', stale: false }]);
    expect(recordBehaviorRuns([{ scenario: SCEN.title, proposal: id, state: 'failing', checks: [] }, { scenario: 'x', state: 'bogus' }], { db })).toBe(1);
    expect(improveDigest(improveDigestData({ since }, { db }), { since }).proposals[0].run).toBe('failing');
    recordBehaviorRuns([{ scenario: SCEN.title, proposal: id, state: 'passing', checks: [] }], { db });
    expect(behaviorRunStates({ db }).get(`${id}|${SCEN.title}`).state).toBe('passing');
    dg = improveDigest(improveDigestData({ since }, { db }), { since });
    expect(dg.proposals[0]).toMatchObject({ run: 'passing', stale: true });
    const text = digestText(dg);
    expect(text).toContain('PROPOSED TOOL IMPROVEMENTS');
    expect(text).toContain('POSSIBLY STALE');
    expect(text).toContain(`SCENARIO ${SCEN.title}`);
    for (const line of WORKFLOW) expect(text).toContain(line);
  });
});

describe('the progress page: decisions, theory changes, run state, the north star', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  const theories = [
    { id: 3, gate: 'search-plan', kind: 'few-shot', verdict: 'won', created_at: '2026-11-04 10:00:00', strategy_id: 'understanding', version: 5, theory: { kind: 'few-shot', what: 'show two contrast pairs' },
      result: { before: 0.71, after: 0.88, n_historic: 140, n_synthetic: 40, broken: 1, promoted: true } },
    { id: 2, gate: 'search-plan', kind: 'rubric', verdict: 'lost', created_at: '2026-11-03 10:00:00', theory: { kind: 'rubric' },
      result: { before: 0.7, after: 0.69, n_historic: 140, n_synthetic: 40, broken: 4, failed: ['accuracy 70% → 69%: not up by 3%'] } },
    { id: 1, gate: 'depth', kind: 'none', verdict: 'no-bank', created_at: '2026-11-03 09:00:00', result: null },
  ];
  it('theory changes carry before/after and the test sizes; accuracy per gate is the newest tested', () => {
    const ch = theoryChanges(theories);
    expect(ch).toHaveLength(2);
    expect(ch[0]).toMatchObject({ kind: 'theory', gate: 'search-plan', verdict: 'shipped', before: 0.71, after: 0.88, n_historic: 140, n_synthetic: 40, change: 'show two contrast pairs' });
    expect(ch[1]).toMatchObject({ verdict: 'lost', reason: 'accuracy 70% → 69%: not up by 3%' });
    expect(gateAccuracy(theories)).toEqual([{ gate: 'search-plan', accuracy: 0.88, n: 180, at: '2026-11-04 10:00:00' }]);
    expect(gateAccuracy([{ ...theories[0], result: { ...theories[0].result, promoted: false } }])[0].accuracy).toBe(0.71);
  });
  it('ladder shares by activity count; llm-fast $ share not measured yet', () => {
    const l = ladderShares([{ name: 'a', tier: 'code' }, { name: 'b', tier: 'jev' }, { name: 'c', tier: 'llm-fast' }, { name: 'd', tier: 'code' }]);
    expect(l).toMatchObject({ activities: 4, jev_code_share: 0.75, llm_fast_share: 0.25, llm_fast_usd_share: null, llm_fast: ['c'] });
    expect(ladderShares([]).jev_code_share).toBeNull();
  });
  it('the overview: decisions block, theory entries in changes, waiting cards with run state, headline north star', () => {
    const data = { daily: [], w7: null, wprev: null, counts: { judged_today: 1, judged_last_hour: 1, replies_today: 40 }, evidence: new Map(),
      improvements: [{ id: 9, target: 'tool', stage: 'RESEARCH', status: 'open', change: 'trace quotes', scenarios_json: JSON.stringify([SCEN]), first_seen: '2026-11-03 12:00:00', evidence_json: '[]' }] };
    const o = improveOverview({ data, theories, decisions: { theories_tested_7d: 2, shipped_7d: 1, synthetic_cases: 40 },
      runs: new Map([[`9|${SCEN.title}`, { state: 'failing', at: '2026-11-04 11:00:00' }]]),
      ladder: [{ name: 'a', tier: 'code' }, { name: 'b', tier: 'llm-fast' }], anisCap: { spent_usd: 6 }, now });
    expect(o.decisions).toEqual({ theories_tested_7d: 2, shipped_7d: 1, synthetic_cases: 40 });
    expect(o.changes.filter((c) => c.kind === 'theory')).toHaveLength(2);
    expect(o.waiting[0].run).toMatchObject({ state: 'failing', at: '2026-11-04 11:00:00' });
    expect(o.headline).toMatchObject({ usd_per_turn: 0.15, replies_today: 40, ladder: { jev_code_share: 0.5, llm_fast_share: 0.5 }, gate_accuracy: [{ gate: 'search-plan', accuracy: 0.88 }] });
    const bare = improveOverview({ now });
    expect(bare.decisions).toEqual({ theories_tested_7d: 0, shipped_7d: 0, synthetic_cases: 0 });
    expect(bare.headline.usd_per_turn).toBeNull();
  });
});
