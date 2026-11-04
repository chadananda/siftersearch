// Improvement cycle (Chad 11-04): Opus 5.5 judges every search + reply on compact forensic input, weak → deep analysis →
// deduped suggestions; spend in its own 'improve' group, delayed (never dropped) at a cap. No live LLM: the call is injected.
import { describe, it, expect } from 'vitest';
import { CASE_1103 } from '../fixtures/anis-case-1103.js';
import { judgeMessage, parseJudge, deepMessage, parseSuggestions, mergeSuggestions, sameSuggestion, rankImprovements, priorityOf,
  costOf, projectDaily, turnFromPath, itemsForTurn, forensicsReport, JUDGE_SYSTEM } from '../../api/lib/audit/improve.js';
import { deferCoveredSearches } from '../../api/lib/repos/improve-repo.js';
import { openImproveDb, recordForensic, nextWork, saveJudge, openImprovements, applySuggestions, listImprovements, setImprovementStatus,
  forensicsSince, getCursor } from '../../api/lib/repos/improve-repo.js';
import { work, ingest, traceToSearch, replayHits, searchJudgeState } from '../../api/workers/improve-worker.js';
import { assertAnthropicAllowed, isImproveAllowed } from '../../api/lib/anthropic-policy.js';
import { modelFor } from '../../api/lib/model-roles.js';
import { SpendCapError } from '../../api/lib/spend-caps.js';

const item = () => itemsForTurn(CASE_1103, { messageId: 7, sessionId: 's1' });

describe('the gate: Opus 5.5 only for the improve stages', () => {
  it('improve:* + Opus 5.5 passes; Opus elsewhere and other models on improve:* are refused', () => {
    expect(isImproveAllowed({ stage: 'improve:judge', model: 'claude-opus-5-5' })).toBe(true);
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-opus-5-5', stage: 'improve:analysis' })).not.toThrow();
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-opus-5-5', stage: 'interactive:chat' })).toThrow(/REFUSED/);
    expect(isImproveAllowed({ stage: 'improve:judge', model: 'claude-sonnet-5-5' })).toBe(false);
    expect(modelFor('search-judge')).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5' });
    expect(modelFor('improve-analysis').model).toBe('claude-opus-5-5');
  });
});

describe('the judge input is compact and carries the forensic findings', () => {
  const { reply } = item();
  it('reply item: tiers on every hit, the findings line, bounded size', () => {
    const m = judgeMessage(reply);
    expect(m).toMatch(/#9 \[se-translation\] Epistle to the Son of the Wolf/);
    expect(m).toMatch(/#1 \[secondary\] The Bahá’í World, Volume II/);
    expect(m).toMatch(/FINDINGS: STRATEGY no-originals-search/);
    expect(m.length).toBeLessThan(6000);
  });
  it('the rubric is one fixed block (cacheable) naming the source order and every stage', () => {
    expect(JUDGE_SYSTEM).toMatch(/se-translation[\s\S]*secondary/);
    for (const s of ['STRATEGY', 'RETRIEVAL', 'RANK', 'SELECTION', 'WRITER', 'LATENCY', 'HOLDINGS']) expect(JUDGE_SYSTEM).toContain(`- ${s}:`);
    expect(JUDGE_SYSTEM.length).toBeGreaterThan(4500);   // ≈1.1k+ tokens: above the prompt-cache minimum
  });
  it('a search with a trace id is its own item with its own findings', () => {
    const f = itemsForTurn({ ...CASE_1103 }, { messageId: 7 });
    expect(f.searches.map((s) => s.key)).toEqual(['search:t-1103']);
    expect(f.searches[0].defects.map((d) => d.class)).toEqual(['authority-inversion', 'stage-over-budget']);
  });
});

describe('parsing', () => {
  it('judge: pass/weak with classes; anything else is null (retried, never guessed)', () => {
    expect(parseJudge('{"verdict":"weak","classes":["Authority Inversion"],"stage":"rank","severity":3,"why":"#1 periodical over #9 ESW"}'))
      .toMatchObject({ verdict: 'weak', classes: ['authority-inversion'], stage: 'RANK', severity: 3 });
    expect(parseJudge('{"verdict":"pass","classes":["x"],"stage":"RANK"}')).toMatchObject({ verdict: 'pass', classes: [], stage: null, severity: 0 });
    expect(parseJudge('looks fine to me')).toBeNull();
    expect(parseJudge('{"verdict":"maybe"}')).toBeNull();
  });
  it('judge: score 0-10 kept for comparison across strategies, clamped; absent (older verdicts) → null', () => {
    expect(parseJudge('{"verdict":"pass","score":8}').score).toBe(8);
    expect(parseJudge('{"verdict":"weak","score":14,"severity":2}').score).toBe(10);
    expect(parseJudge('{"verdict":"weak","score":"3.6"}').score).toBe(4);
    expect(parseJudge('{"verdict":"pass"}').score).toBeNull();
  });
  it('deep: suggestions bounded to 3, need a change', () => {
    const s = parseSuggestions('```json\n{"suggestions":[{"stage":"rank","file":"api/lib/search/doctrinal-rank.js","fn":"rankCopies","change":"rank copies of one passage by copy class","expected_effect":"Writings lead quote routes","severity":3},{"stage":"WRITER","change":""}]}\n```');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ stage: 'RANK', fn: 'rankCopies', severity: 3 });
  });
  it('deep input: judge verdict, replay, passages, and only the relevant code map lines', () => {
    const m = deepMessage(item().reply, { verdict: 'weak', stage: 'RANK', classes: ['authority-inversion'], why: 'x' },
      { replay: { hits: [{ rank: 1, title: 'Epistle to the Son of the Wolf', author: 'Bahá’u’lláh', text: 'Religion is…' }] } });
    expect(m).toMatch(/REPLAY \(current code\):\n  #1 \[se-translation\]/);
    expect(m).toMatch(/authority-inversion: api\/lib\/search\/doctrinal-rank\.js/);
    expect(m).not.toMatch(/bare-link:/);
  });
});

describe('dedup: the same fix seen again is evidence, not a new row', () => {
  const a = { id: 1, stage: 'RANK', file: 'api/lib/search/doctrinal-rank.js', fn: 'rankCopies', change: 'rank copies by copy class' };
  it('same stage + file + fn, or a near-identical change', () => {
    expect(sameSuggestion(a, { ...a, change: 'different words entirely' })).toBe(true);
    expect(sameSuggestion(a, { stage: 'RANK', file: 'api/lib/search/doctrinal-rank.js', fn: null, change: 'rank the copies by their copy class first' })).toBe(true);
    expect(sameSuggestion(a, { ...a, stage: 'SELECTION' })).toBe(false);
  });
  it('merge: bump the open one, insert the new one, never two bumps per item', () => {
    const r = mergeSuggestions([a], [{ ...a, id: undefined, severity: 3 }, { ...a, id: undefined }, { stage: 'WRITER', file: 'api/lib/assistant/prompt.js', change: 'no process talk', severity: 1 }], 'reply:7');
    expect(r.bumps).toEqual([{ id: 1, evidence_key: 'reply:7', severity: 3 }]);
    expect(r.inserts.map((x) => x.stage)).toEqual(['WRITER']);
    expect(rankImprovements([{ id: 1, evidence_n: 2, severity: 1 }, { id: 2, evidence_n: 1, severity: 3 }]).map((x) => x.id)).toEqual([2, 1]);
  });
});

describe('cost and order', () => {
  it('Opus 5.5 pricing with cache reads; the daily projection', () => {
    expect(costOf({ promptTokens: 2000, cachedTokens: 1200, completionTokens: 100 })).toBeCloseTo((800 * 4 + 1200 * 0.4 + 100 * 20) / 1e6, 8);
    expect(projectDaily({ judgeUsd: 0.01, deepUsd: 0.05, repliesPerDay: 100, searchesPerDay: 300, weakRate: 0.25 })).toMatchObject({ judged: 400, deep: 100, usd: 9 });
  });
  it('weak replies first, then new replies, weak searches, new searches, backfill', () => {
    expect([priorityOf({ kind: 'reply', step: 'deep' }), priorityOf({ kind: 'reply' }), priorityOf({ kind: 'search', step: 'deep' }),
      priorityOf({ kind: 'search' }), priorityOf({ kind: 'reply', backfill: true })]).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('adapter: a stored reply (path_json) → the forensic turn', () => {
  it('evidence becomes ranked writer passages; cited = the evidence urls the reply links', () => {
    const t = turnFromPath({ question: 'q', reply: 'See [ESW](https://ol/esw).', path: { recipe: 'quote', plan: { research: { steps: [{ tool: 'quote_search', args: { query: 'q' } }] } },
      evidence: [{ title: 'BW II', author: 'x', url: 'https://ol/bw' }, { title: 'Epistle to the Son of the Wolf', author: 'Bahá’u’lláh', url: 'https://ol/esw' }] } });
    expect(t.route).toBe('quote');
    expect(t.searches[0]).toMatchObject({ tool: 'quote_search', query: 'q' });
    expect(t.searches[0].hits.map((h) => h.rank)).toEqual([1, 2]);
    expect(t.cited).toEqual([{ doc_id: null, title: 'Epistle to the Son of the Wolf' }]);
  });
});

describe('the store and the worker (in-memory; the LLM call injected)', () => {
  const setup = () => {
    const db = openImproveDb(':memory:');
    const { reply, searches } = itemsForTurn(CASE_1103, { messageId: 7, sessionId: 's1' });
    recordForensic(db, { ...reply, asked_at: '2026-11-04 10:00:00', priority: 1 });
    recordForensic(db, { ...searches[0], asked_at: '2026-11-04 10:00:01', priority: 3 });
    recordForensic(db, { ...reply, key: 'reply:1', ref_id: '1', asked_at: '2026-10-10 10:00:00', backfill: true, priority: 4 });
    return db;
  };
  it('judges in priority order; weak → deep (first); suggestions dedup across items; status set', async () => {
    const db = setup(), calls = [];
    const call = async (role, system, user) => {
      calls.push(role);
      if (role === 'search-judge') return { text: '{"verdict":"weak","classes":["authority-inversion"],"stage":"RANK","severity":3,"why":"#1 over #9"}', usd: 0.01, usage: {} };
      return { text: '{"suggestions":[{"stage":"RANK","file":"api/lib/search/doctrinal-rank.js","fn":"rankCopies","change":"rank copies by copy class","expected_effect":"Writings lead","severity":3}]}', usd: 0.05 };
    };
    const order = [];
    for (let i = 0; i < 6; i++) { const w = nextWork(db); if (!w) break; order.push(`${w.step}:${w.item_key}`); expect(await work(db, { call, replay: async () => null })).toBe('done'); }
    expect(order).toEqual(['judge:reply:7', 'deep:reply:7', 'judge:search:t-1103', 'deep:search:t-1103', 'judge:reply:1', 'deep:reply:1']);
    const imp = listImprovements({}, { db });
    expect(imp).toHaveLength(1);
    expect(imp[0]).toMatchObject({ evidence_n: 3, severity: 3, status: 'open' });
    expect(imp[0].evidence).toEqual(['reply:7', 'search:t-1103', 'reply:1']);
    expect(setImprovementStatus(imp[0].id, 'accepted', 'doing it', { db })).toBe(1);
    expect(() => setImprovementStatus(imp[0].id, 'maybe', null, { db })).toThrow(/status must be/);
    expect(openImprovements(db)).toHaveLength(1);
    const rows = forensicsSince(3650, {}, { db });
    const rep = forensicsReport(rows, []);
    expect(rep.judge).toMatchObject({ judged: 3, weak: 3, weak_classes: [{ class: 'authority-inversion', n: 3 }] });
    expect(rep.judge.usd).toBeCloseTo(0.18, 6);
    expect(rep.replies.queue.find((e) => e.class === 'cited-weaker-copy').n).toBe(2);
  });
  it('a spend cap delays the work (row stays pending); an unparseable verdict is retried, not guessed', async () => {
    const db = setup();
    const capped = async () => { throw new SpendCapError({ group: 'improve', cap: 5, spent: 5, caller: 'improve-judge', retryAfterMs: 60000 }); };
    const r = await work(db, { call: capped });
    expect(r.wait).toBeGreaterThan(0);
    expect(nextWork(db)).toMatchObject({ step: 'judge', item_key: 'reply:7', attempts: 0 });
    expect(await work(db, { call: async () => ({ text: 'hmm', usd: 0 }) })).toBe('done');
    expect(nextWork(db)).toMatchObject({ item_key: 'reply:7', attempts: 1 });
    saveJudge(db, 'reply:7', { judge: { verdict: 'pass', classes: [] }, usd: 0.01 });
    expect(nextWork(db).item_key).toBe('search:t-1103');
  });
  it('ingest: replies and traces after the cursors, each with its own forensic row', async () => {
    const db = openImproveDb(':memory:');
    const n = await ingest(db, { deps: {
      anisRepliesAfter: async () => [{ id: 41, session_id: 's', round_index: 2, question: 'q', reply: 'r', created_at: '2026-11-04 09:00:00',
        path_json: JSON.stringify({ recipe: 'fact', evidence: [{ title: 'God Passes By', author: 'Shoghi Effendi', url: 'u' }] }) }],
      // migration 197's stored list: [para_id, doc_id, score, layer, tier]
      tracesForTurn: async (turn) => (turn === 's:2' ? [{ trace_id: 'tr-0', endpoint: 'multi-index', tool: 'fused_search', query: 'q', hits_json: '[[5,77,0.9,"bm25","W"]]' },
        { trace_id: 'tr-p', endpoint: 'planned', query: 'q' }] : []),
      docTitles: async () => new Map([[77, { title: 'Gleanings', author: 'Bahá’u’lláh' }]]),
      tracesAfter: async () => [{ id: 900, trace_id: 'tr-1', endpoint: 'multi-index', tool: 'fused_search', thread_id: 's', turn_id: 's:2', route: 'fact', query: 'q',
        filters_json: '{}', timings_json: '{"total":200}', created_at: 1762246800, hits_json: '[[5,77,0.9,"bm25","W"]]' },
      { id: 901, trace_id: 'tr-old', endpoint: 'multi-index', query: 'q', created_at: 1762246800, result_count: 12, hits_json: null }],   // pre-197: skipped
    } });
    expect(n).toBe(2);
    expect(getCursor(db, 'reply_id')).toBe('41');
    expect(getCursor(db, 'trace_id')).toBe('901');
    const rows = forensicsSince(3650, {}, { db });
    expect(rows.map((r) => r.item_key).sort()).toEqual(['reply:41', 'search:tr-1']);
    expect(rows.find((r) => r.kind === 'reply').turn_id).toBe('s:2');
    const reply = nextWork(db).item;   // the reply's searches are its own traces (planned wrapper skipped), titled + tiered
    expect(reply.searches).toHaveLength(1);
    expect(reply.searches[0]).toMatchObject({ trace_id: 'tr-0', tool: 'fused_search', hits: [{ rank: 1, doc_id: 77, title: 'Gleanings', tier: 'writings' }] });
  });
  it('cheap cycle: a turn\'s search is judged through its reply; a turnless search only with a forensic defect', async () => {
    expect(searchJudgeState({ turn_id: 's:2' }, ['x'])).toBe('covered');
    expect(searchJudgeState({ turn_id: null }, [])).toBe('clean');
    expect(searchJudgeState({ turn_id: null }, [['no-results', 'q']])).toBe('pending');
    const db = openImproveDb(':memory:');
    await ingest(db, { deps: { anisRepliesAfter: async () => [], tracesForTurn: async () => [], docTitles: async () => new Map(),
      tracesAfter: async () => [{ id: 900, trace_id: 'tr-1', endpoint: 'multi-index', turn_id: 's:2', query: 'q', created_at: 1762246800, hits_json: '[[5,77,0.9,"bm25","W"]]' }] } });
    expect(nextWork(db)).toBeNull();   // nothing to pay for: the reply carries this search
    recordForensic(db, { key: 'search:old', kind: 'search', ref_id: 'old', turn_id: 's:1', defects: [] });   // queued before the rule
    expect(deferCoveredSearches(db)).toBe(1);
    expect(nextWork(db)).toBeNull();
  });
  it('traceToSearch reads both hit shapes; replayHits puts Writings first and keeps old_rank', () => {
    expect(traceToSearch({ trace_id: 't', endpoint: 'search', hits_json: JSON.stringify([{ title: 'X', doc_id: 3 }]) }).hits[0]).toMatchObject({ rank: 1, doc_id: 3, title: 'X' });
    const r = replayHits({ replays: [{ tool: 'fused_search', query: 'q', diff: { rows: [
      { rank: 1, old_rank: 1, title: 'Talk', tier: 'reported' }, { rank: 2, old_rank: null, title: 'Gleanings', tier: 'writings' }] } }, { error: 'x' }] });
    expect(r.hits.map((h) => h.title)).toEqual(['Gleanings', 'Talk']);
    expect(r.hits[0]).toMatchObject({ old_rank: null, tool: 'fused_search' });
    expect(replayHits({ replays: [] })).toBeNull();
  });
});
