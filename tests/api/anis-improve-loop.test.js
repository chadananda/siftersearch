// The closed improvement loop (Chad 11-04 v2, no human step): DATA suggestions → ONE Opus edit per strategy → replay-promote →
// the suggestions settle themselves (done / rejected, by 'system'); the per-day edit cap; CODE suggestions carry acceptance
// scenarios (parse, first-wins storage, digest text); the progress overview's state logic and its changes timeline.
import { describe, it, expect, afterEach, vi } from 'vitest';
vi.mock('../../api/lib/repos/ai-usage-repo.js', () => ({ dailySpendByCaller: vi.fn(async () => ({})) }));
import { openStrategiesDb, catalog, resetStrategiesCache } from '../../api/lib/repos/strategies-repo.js';
import { ensureCandidatesSchema, listPromotions, strategyRow, listDesigns } from '../../api/lib/repos/strategy-candidates-repo.js';
import { openImproveDb, applySuggestions } from '../../api/lib/repos/improve-repo.js';
import { editStage } from '../../api/lib/assistant/strategy-improve.js';
import { EDIT_CALLER, groupDataSuggestions, uneditable } from '../../api/lib/assistant/strategy-edit.js';
import { IMPROVE_CFG } from '../../api/lib/assistant/strategy-gaps.js';
import { parseScenario, parseScenarios, parseSuggestions, mergeSuggestions, scenariosOf } from '../../api/lib/audit/improve.js';
import { digestText, scenarioLines } from '../../api/lib/audit/improve-digest-text.js';
import { overviewState, strategyChanges, improveOverview, stallReason } from '../../api/lib/audit/improve-overview.js';

afterEach(() => resetStrategiesCache());
const freshS = () => { const db = ensureCandidatesSchema(openStrategiesDb(':memory:')); resetStrategiesCache({ db }); return db; };

// a valid edit of strategy.understanding: a new template + step, one node
const EDIT = {
  name: 'understanding', description: 'The reader wants a TEACHING explained from the Writings, scripture first, then the Guardian, then commentary.',
  exemplars: ['What does the Faith teach about the soul after death?', 'Explain the station of the Manifestation from the Writings.'],
  templates: [{ id: 'understanding.scripture-first', text: 'Lead with the Writings, then the Guardian. {{base}}' }],
  steps: [{ id: 'understanding.scripture-first', activity: 'strategy.understanding', params: { how: 'understanding.scripture-first' } }],
  graph: { entry: 'answer', nodes: { answer: { step: 'understanding.scripture-first' } }, edges: [{ from: 'answer', on: '*', to: '$end' }] },
  change: 'lead with scripture before commentary',
};
const opus = (o = EDIT) => vi.fn(async () => ({ text: JSON.stringify(o), usd: 0.2 }));
const deps = (win) => ({
  writeQuestions: async ({ nGuard }) => ({ class: ['c1', 'c2', 'c3'], guard: Array.from({ length: nGuard }, (_, i) => ({ strategy: 'prayer', question: `g${i}` })), usd: 0.01 }),
  tryTurn: async ({ question, pin }) => ({ reply: pin ? `cand ${question}` : `cur ${question}`, path: {}, ms: 900, usd: 0.02, jev_pick: pin ? 'understanding' : null }),
  judge: async ({ reply }) => ({ verdict: 'pass', score: reply.startsWith('cand') ? (win ? 9 : 5) : 7, usd: 0.01 }),
  jevPick: async () => 'prayer',
});
const sug = (strategy, change, key) => ({ stage: 'STRATEGY', file: null, target: 'strategy', strategy, change, severity: 2, evidence: [key] });
const seed = (idb, rows) => applySuggestions(idb, { inserts: rows, bumps: [] });
const row = (idb, id) => idb.prepare('SELECT * FROM improvements WHERE id = ?').get(id);

describe('Phase 4: DATA suggestions become tested candidates', () => {
  it('two suggestions on one strategy → ONE edit (improve-* caller), replayed, promoted → both done by system', async () => {
    const db = freshS(), idb = openImproveDb(':memory:');
    const ids = seed(idb, [sug('understanding', 'put scripture before commentary in understanding answers', 'reply:1'),
      sug('understanding', 'the understanding writer should quote the Guardian before secondary sources', 'reply:2')]);
    const call = opus();
    const r = await editStage(db, { improveDb: idb, call, deps: deps(true), branches: null });
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][4]).toBe(EDIT_CALLER);
    expect(EDIT_CALLER).toMatch(/^improve-/);
    expect(r).toMatchObject({ status: 'promoted', id: 'understanding', settled: 2 });
    expect(strategyRow(db, 'understanding', r.version).status).toBe('active');
    expect(listPromotions(db)[0]).toMatchObject({ action: 'promote', strategy_id: 'understanding', version: r.version });
    for (const id of ids) {
      expect(row(idb, id)).toMatchObject({ status: 'done', reviewed_by: 'system', candidate: `understanding@${r.version}` });
      expect(row(idb, id).status_note).toMatch(new RegExp(`^promoted understanding@v${r.version}: score 7→9`));
    }
    expect(await editStage(db, { improveDb: idb, call, deps: deps(true), branches: null })).toBe('idle');   // nothing left
  });

  it('a candidate that does not beat the current version → rejected with the first failed rule; current stays active', async () => {
    const db = freshS(), idb = openImproveDb(':memory:');
    const [id] = seed(idb, [sug('understanding', 'scripture first', 'reply:1')]);
    const before = catalog().strategies.find((s) => s.name === 'understanding').version;
    const r = await editStage(db, { improveDb: idb, call: opus(), deps: deps(false), branches: null });
    expect(r.status).toBe('rejected');
    expect(row(idb, id)).toMatchObject({ status: 'rejected', reviewed_by: 'system' });
    expect(row(idb, id).status_note).toMatch(/^tried understanding@v\d+, kept current: /);
    expect(strategyRow(db, 'understanding', before).status).toBe('active');
  });

  it('the per-day edit cap holds: the second strategy waits, its suggestion stays open', async () => {
    const db = freshS(), idb = openImproveDb(':memory:');
    const [, second] = seed(idb, [sug('understanding', 'scripture first', 'reply:1'), sug('prayer', 'offer the prayer text in full first', 'reply:2')]);
    const cfg = { ...IMPROVE_CFG, edits_per_day: 1 };
    const call = opus();
    expect((await editStage(db, { improveDb: idb, call, deps: deps(true), branches: null, cfg })).status).toBe('promoted');
    expect(await editStage(db, { improveDb: idb, call, deps: deps(true), branches: null, cfg })).toMatchObject({ status: 'capped' });
    expect(call).toHaveBeenCalledTimes(1);
    expect(row(idb, second)).toMatchObject({ status: 'open', candidate: null });
    expect(listDesigns(db).filter((d) => d.cluster_key?.startsWith('edit:'))).toHaveLength(1);
  });

  it('uneditable groups (unknown strategy, the respond graph) are rejected with the reason and no Opus call; unnamed ones stay open', async () => {
    const db = freshS(), idb = openImproveDb(':memory:');
    const ids = seed(idb, [sug('nosuch', 'x change', 'reply:1'), sug(null, 'y change', 'reply:2')]);
    const call = opus();
    expect(await editStage(db, { improveDb: idb, call, deps: deps(true), branches: null })).toMatchObject({ settled: 1 });
    expect(call).not.toHaveBeenCalled();
    expect(row(idb, ids[0]).status_note).toMatch(/no active strategy "nosuch"/);
    expect(row(idb, ids[1]).status).not.toBe('rejected');
    const other = groupDataSuggestions([{ strategy: 'other' }], { strategies: [{ id: 'other', name: 'other' }] })[0];
    expect(uneditable(other)).toMatch(/respond graph/);
  });

  it('an edit that stays invalid after the retry rejects its suggestions with the error', async () => {
    const db = freshS(), idb = openImproveDb(':memory:');
    const [id] = seed(idb, [sug('understanding', 'scripture first', 'reply:1')]);
    const call = opus({ ...EDIT, steps: [{ id: 'understanding.bad', activity: 'no.such.activity', params: {} }] });
    expect(await editStage(db, { improveDb: idb, call, deps: deps(true), branches: null })).toMatchObject({ status: 'dropped' });
    expect(call).toHaveBeenCalledTimes(2);
    expect(row(idb, id)).toMatchObject({ status: 'rejected' });
    expect(row(idb, id).status_note).toMatch(/^edit invalid: /);
  });
});

const SCN = { title: 'A seeker asks for a book by title', given: { reader: 'a new reader, no history', history: [] },
  when: { asks: 'for a named book of the Writings', examples: ['Where can I read the Kitáb-i-Íqán?', 'Do you have Some Answered Questions?'] },
  then: [{ check: 'links_book', expect: 'the reply links the book in the library' }, { check: 'tool_not_called', expect: 'talk_search' }] };

describe('acceptance scenarios on CODE suggestions', () => {
  it('parseScenario keeps the valid shape and drops malformed ones; the suggestion survives', () => {
    expect(parseScenario(SCN)).toMatchObject({ title: SCN.title, when: { examples: SCN.when.examples }, then: SCN.then });
    expect(parseScenario({ ...SCN, when: { asks: 'x', examples: ['only one'] } })).toBeNull();
    expect(parseScenario({ ...SCN, then: [{ check: 'vibes', expect: 'good' }] })).toBeNull();
    expect(parseScenario({ ...SCN, given: {} })).toBeNull();
    expect(parseScenarios([SCN, { bad: 1 }, SCN, SCN])).toHaveLength(2);   // max 3 read, the malformed one dropped
    const [s] = parseSuggestions(JSON.stringify({ suggestions: [{ stage: 'STRATEGY', file: 'api/lib/assistant/x.js', target: 'code', change: 'link the book', scenarios: [{ junk: true }] }] }));
    expect(s).toMatchObject({ change: 'link the book', scenarios: [] });
  });

  it('stored as scenarios_json; a repeat keeps the first scenarios (first wins)', () => {
    const idb = openImproveDb(':memory:');
    const a = { stage: 'STRATEGY', file: 'api/lib/assistant/x.js', fn: 'linkBook', target: 'code', change: 'link the book', severity: 2, scenarios: [SCN] };
    const [id] = applySuggestions(idb, mergeSuggestions([], [a], 'reply:1'));
    const open = idb.prepare('SELECT * FROM improvements').all();
    applySuggestions(idb, mergeSuggestions(open, [{ ...a, scenarios: [{ ...SCN, title: 'LATER' }] }], 'reply:2'));
    const r = row(idb, id);
    expect(r.evidence_n).toBe(2);
    expect(scenariosOf(r).map((s) => s.title)).toEqual([SCN.title]);
  });

  it('the digest prints each scenario as Given/When/Then with its checks', () => {
    const t = digestText({ since: 'x', available: true, assessment: { judged: 1, weak: 1, spend_usd: 0 }, data: [],
      code: [{ id: 4, new: true, status: 'open', target: 'code', stage: 'STRATEGY', file: 'x.js', evidence_n: 1, severity: 2, change: 'link the book', scenarios: [SCN] }] });
    expect(t).toMatch(/proposal: link the book/);
    expect(t).toMatch(/SCENARIO A seeker asks for a book by title\n\s+Given a new reader, no history\n\s+When for a named book of the Writings\n\s+e\.g\. "Where can I read the Kitáb-i-Íqán\?"/);
    expect(t).toMatch(/Then links_book: the reply links the book in the library\n\s+And tool_not_called: talk_search/);
    expect(scenarioLines(SCN, '')[0]).toBe(`SCENARIO ${SCN.title}`);
  });
});

describe('the progress overview', () => {
  it('state: improving / steady / worse by score, else weak rate; stalled; idle', () => {
    const base = { backlog: 2, judged_last_hour: 3 };
    expect(overviewState({ ...base, score_7d: 7.4, score_prev_7d: 7.0 })).toBe('improving');
    expect(overviewState({ ...base, score_7d: 7.1, score_prev_7d: 7.0 })).toBe('steady');
    expect(overviewState({ ...base, score_7d: 6.5, score_prev_7d: 7.0 })).toBe('worse');
    expect(overviewState({ ...base, weak_rate_7d: 0.10, weak_rate_prev_7d: 0.20 })).toBe('improving');
    expect(overviewState({ ...base, weak_rate_7d: 0.25, weak_rate_prev_7d: 0.20 })).toBe('worse');
    expect(overviewState({ backlog: 5, judged_last_hour: 0, score_7d: 9, score_prev_7d: 5 })).toBe('stalled');
    expect(overviewState({ backlog: 0, judged_last_hour: 0 })).toBe('idle');
    expect(overviewState({ backlog: 0, judged_last_hour: 0, testing_now: 1 })).toBe('steady');
    expect(stallReason({ cap: { blocking: true, spent_usd: 200, cap_usd: 200 } })).toMatch(/spend cap reached/);
    expect(stallReason({})).toMatch(/not reporting/);
  });

  it('changes merge strategy ledger rows and done code behaviours, newest first; dry runs are not changes', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    const promotions = [
      { action: 'promote', strategy_id: 'understanding', version: 4, parent_version: 3, created_at: '2026-11-04 10:00:00', change: 'scripture first', decision: { numbers: { n_class: 12, mean_current: 6.4, mean_candidate: 7.2 } } },
      { action: 'reject', strategy_id: 'prayer', version: 2, parent_version: 1, created_at: '2026-11-03 10:00:00', decision: { failed: ['regression of 4 on one question'], numbers: { n_class: 6 } } },
      { action: 'dry', strategy_id: 'prayer', version: 3, created_at: '2026-11-04 11:00:00', decision: {} },
    ];
    expect(strategyChanges(promotions)).toHaveLength(2);
    const data = { daily: [{ day: '2026-11-04', judged: 10, weak: 2, score_sum: 75, score_n: 10 }], w7: { judged: 40, weak: 8, score_sum: 300, score_n: 40 },
      wprev: { judged: 40, weak: 12, score_sum: 260, score_n: 40 }, counts: { judged_today: 10, judged_last_hour: 2, backlog: 1, diagnosed_7d: 5 },
      improvements: [
        { id: 7, target: 'code', stage: 'STRATEGY', status: 'done', status_at: '2026-11-04 11:30:00', change: 'link the book', scenarios_json: JSON.stringify([SCN]), first_seen: '2026-11-02 00:00:00', evidence_json: '[]' },
        { id: 8, target: 'code', stage: 'RANK', status: 'open', change: 'rank copies', first_seen: '2026-11-01 12:00:00', evidence_json: '["reply:9"]', evidence_n: 2, severity: 2 },
      ], evidence: new Map([['reply:9', { item_key: 'reply:9', kind: 'reply', turn_id: 's1:9', session_id: 's1' }]]) };
    const o = improveOverview({ data, promotions, candidates: [{ id: 'search', version: 5, created_at: '2026-11-04 11:50:00', change: 'phrase first' }], now });
    expect(o.changes.map((c) => `${c.kind}:${c.strategy || c.id}`)).toEqual(['code:7', 'strategy:understanding', 'strategy:prayer']);
    expect(o.changes[1]).toMatchObject({ from_version: 3, version: 4, verdict: 'promoted', before: 6.4, after: 7.2, n: 12 });
    expect(o.changes[2]).toMatchObject({ verdict: 'kept current', reason: 'regression of 4 on one question' });
    expect(o.changes[0].scenarios[0].title).toBe(SCN.title);
    expect(o.headline).toMatchObject({ score_7d: 7.5, score_prev_7d: 6.5, status: { state: 'improving' } });
    expect(o.headline.status.sentence).toMatch(/^Improving: 10 answers judged today; 2 strategy changes tested this week, 1 promoted \(\+0\.8\), 1 testing now\. 1 code behaviour waiting/);
    expect(o.flow.data).toMatchObject({ tested: 2, promoted: 1, rejected: 1, testing_now: 1 });
    expect(o.flow.code).toMatchObject({ open: 1, done: 1, oldest_open_hours: 72 });
    expect(o.testing).toEqual([{ strategy: 'search', version: 5, since: '2026-11-04 11:50:00', change: 'phrase first' }]);
    expect(o.waiting[0]).toMatchObject({ id: 8, age_hours: 72, scenarios: [], examples: [{ trace: '/api/admin/anis/turns/s1%3A9/trace', thread: '/admin/anis#threads:s1' }] });
    expect(improveOverview({ now }).available).toBe(false);
  });
});
