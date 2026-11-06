// Improvement cycle (Chad 11-04): Opus 5.5 judges every search + reply on compact forensic input, weak → deep analysis →
// deduped suggestions; spend in its own 'improve' group, delayed (never dropped) at a cap. No live LLM: the call is injected.
import { describe, it, expect } from 'vitest';
import { CASE_1103 } from '../fixtures/anis-case-1103.js';
import { judgeMessage, parseJudge, deepMessage, parseSuggestions, mergeSuggestions, sameSuggestion, rankImprovements, priorityOf,
  costOf, projectDaily, turnFromPath, itemsForTurn, forensicsReport, JUDGE_SYSTEM, retarget, resolveFile } from '../../api/lib/audit/improve.js';
import { FIX_WHERE, fixFile, latencyModule } from '../../api/lib/audit/forensics.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deferCoveredSearches } from '../../api/lib/repos/improve-repo.js';
import { openImproveDb, recordForensic, nextWork, saveJudge, openImprovements, applySuggestions, listImprovements, setImprovementStatus,
  forensicsSince, getCursor } from '../../api/lib/repos/improve-repo.js';
import { work, ingest, traceToSearch, replayHits, searchJudgeState, JUDGE_CALL, DEEP_CALL, backfillDays } from '../../api/workers/improve-worker.js';
import { assertAnthropicAllowed, isImproveAllowed } from '../../api/lib/anthropic-policy.js';
import { modelFor } from '../../api/lib/model-roles.js';
import { SpendCapError } from '../../api/lib/spend-caps.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
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
    expect(r.bumps).toEqual([{ id: 1, evidence_key: 'reply:7', severity: 3, scenarios: null, strategy: null }]);
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
    // spec #2 d (11-06): the 2nd and 3rd weak items carry the same (class, stage, file) theme → evidence, no deep call
    expect(calls.filter((c) => c === 'improve-analysis')).toHaveLength(1);
    expect(rep.judge.usd).toBeCloseTo(0.08, 6);
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
  it('a reply cut at max_tokens is parked at once (no 5x retry); an empty deep analysis is a failure, never deep done', async () => {
    const db = setup(), seen = [];
    const cut = async (role, system, user, opts) => { seen.push(opts); return { text: '{"verdict":"we', usd: 0.01, finishReason: 'max_tokens' }; };
    expect(await work(db, { call: cut })).toBe('done');
    expect(seen[0]).toEqual(JUDGE_CALL);
    expect(JUDGE_CALL.maxTokens).toBeGreaterThanOrEqual(2000);   // thinking spends max_tokens on Opus 5.5
    expect(nextWork(db).item_key).not.toBe('reply:7');           // parked, not retried
    const weak = { text: '{"verdict":"weak","classes":["x"],"stage":"RANK","severity":3,"why":"w"}', usd: 0.01, finishReason: 'end_turn' };
    const empty = async (role, s, u, opts) => role === 'search-judge' ? weak : (seen.push(opts), { text: '{"diagnosis":', usd: 0.05, finishReason: 'max_tokens' });
    const k = nextWork(db).item_key;
    await work(db, { call: empty, replay: async () => null });   // judge
    expect(nextWork(db)).toMatchObject({ step: 'deep', item_key: k });
    await work(db, { call: empty, replay: async () => null });   // deep: truncated, empty
    expect(seen.at(-1)).toEqual(DEEP_CALL);
    expect(nextWork(db)?.item_key).not.toBe(k);
    expect(listImprovements({}, { db })).toHaveLength(0);
    const db2 = setup();   // an unparseable reply that was NOT cut off still gets its retries
    await work(db2, { call: async () => ({ text: 'hmm', usd: 0, finishReason: 'end_turn' }) });
    expect(nextWork(db2)).toMatchObject({ item_key: 'reply:7', attempts: 1 });
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

// Spec #2 (11-06): stop paying Opus to reword known findings; stop saving suggestions nobody can apply. Fresh synthetic items
// (no battery question): a slow embed stage, a slow hydrate stage, a respond-route weakness.
describe('spec #2: dedupe before the paid call, applicable targets, real files', () => {
  const slow = (key, stage, question) => ({ key, kind: 'reply', ref_id: key.split(':')[1], session_id: 's9', route: 'teachings', question,
    reply: 'r', searches: [], defects: [{ stage: 'LATENCY', class: 'stage-over-budget', detail: `${stage} slow`, evidence: { stage, ms: 900, budget: 120, kind: 'engine' } }] });
  const judgeWeak = { text: '{"verdict":"weak","classes":["stage-over-budget"],"stage":"LATENCY","severity":2,"why":"slow"}', usd: 0.01 };
  const deepFor = (file) => ({ text: JSON.stringify({ diagnosis: 'd', root_cause: 'rc', suggestions: [{ stage: 'LATENCY', file, fn: null, target: 'index',
    change: `cache the ${file} stage output per query`, expected_effect: 'faster', classes: ['stage-over-budget'], severity: 2 }] }), usd: 0.05 });
  const none = async () => new Set();

  it('a second defect of an open (class, stage, real file) adds evidence and makes NO deep call; a new file still pays', async () => {
    const db = openImproveDb(':memory:'), deep = [];
    recordForensic(db, { ...slow('reply:901', 'embed', 'what did the Guardian write about the oneness of mankind?'), asked_at: '2026-11-06 09:00:00', priority: 1 });
    const call = async (role, s, u) => { if (role === 'search-judge') return judgeWeak; deep.push(u); return deepFor('api/lib/query-embedding.js'); };
    for (let i = 0; i < 2; i++) await work(db, { call, replay: async () => null, strategies: none });
    expect(deep).toHaveLength(1);
    const [row] = listImprovements({}, { db });
    expect(row).toMatchObject({ file: 'api/lib/query-embedding.js', evidence_n: 1 });
    expect(JSON.parse(row.themes_json)).toContain('stage-over-budget|LATENCY|api/lib/query-embedding.js');

    recordForensic(db, { ...slow('reply:902', 'main_embed', 'how should a believer approach fasting when travelling?'), asked_at: '2026-11-06 09:05:00', priority: 1 });
    for (let i = 0; i < 2; i++) await work(db, { call, replay: async () => null, strategies: none });
    expect(deep).toHaveLength(1);                                     // same theme → $0
    const [again] = listImprovements({}, { db });
    expect(again).toMatchObject({ id: row.id, evidence_n: 2 });
    expect(again.evidence).toEqual(['reply:901', 'reply:902']);
    const f = db.prepare('SELECT deep_state, deep_usd, deep_json FROM forensics WHERE item_key = ?').get('reply:902');
    expect(f.deep_state).toBe('done');
    expect(f.deep_usd).toBe(0);
    expect(JSON.parse(f.deep_json).deduped[0]).toMatchObject({ class: 'stage-over-budget', file: 'api/lib/query-embedding.js' });

    recordForensic(db, { ...slow('reply:903', 'hydrate', 'is there a prayer for the departed in Persian?'), asked_at: '2026-11-06 09:10:00', priority: 1 });
    for (let i = 0; i < 2; i++) await work(db, { call, replay: async () => null, strategies: none });
    expect(deep).toHaveLength(2);                                     // different real module (read-pool.js) → analysed
  });

  it('a respond-route change named as a DATA target is saved as a CODE target', async () => {
    const db = openImproveDb(':memory:'), users = [];
    recordForensic(db, { key: 'reply:911', kind: 'reply', ref_id: '911', route: 'lookup', question: 'which tablet mentions the Most Great Peace first?', reply: 'r', searches: [],
      defects: [], asked_at: '2026-11-06 10:00:00', priority: 1 });
    const call = async (role, s, u) => {
      if (role === 'search-judge') return { text: '{"verdict":"weak","classes":["wrong-route-recipe"],"stage":"STRATEGY","severity":2,"why":"w"}', usd: 0.01 };
      users.push(u);
      return { text: JSON.stringify({ diagnosis: 'd', suggestions: [{ stage: 'STRATEGY', file: 'api/lib/assistant/respond.js', fn: null, target: 'strategy', strategy: 'respond',
        change: 'the lookup route should try the chronology index first', expected_effect: 'earliest mention found', classes: ['wrong-route-recipe'], severity: 2 }] }), usd: 0.05 };
    };
    for (let i = 0; i < 2; i++) await work(db, { call, replay: async () => null, strategies: async () => new Set(['guidance', 'reference']) });
    expect(users[0]).toMatch(/EDITABLE STRATEGIES[^\n]*guidance, reference/);
    const [row] = listImprovements({}, { db });
    expect(['strategy', 'step', 'template']).not.toContain(row.target);
    expect(row.strategy).toBeNull();
    expect(retarget({ stage: 'STRATEGY', target: 'step', strategy: 'guidance' }, new Set(['guidance'])).target).toBe('step');   // editable: kept
    expect(retarget({ stage: 'STRATEGY', target: 'strategy', strategy: 'no-such-strategy' }, new Set(['guidance'])).target).not.toBe('strategy');
  });

  it('a suggestion naming a missing file is not saved with that file; a fn not in the file is dropped', async () => {
    const db = openImproveDb(':memory:');
    recordForensic(db, { ...slow('reply:921', 'embed', 'what are the stations of the seven valleys?'), asked_at: '2026-11-06 11:00:00', priority: 1 });
    const call = async (role) => (role === 'search-judge' ? judgeWeak : { text: JSON.stringify({ diagnosis: 'd', suggestions: [{ stage: 'LATENCY',
      file: 'api/lib/search/embed-cache-manager.js', fn: 'warmCache', target: 'index', change: 'warm the embedding cache', classes: ['stage-over-budget'], severity: 2 }] }), usd: 0.05 });
    for (let i = 0; i < 2; i++) await work(db, { call, replay: async () => null, strategies: none });
    const [row] = listImprovements({}, { db });
    expect(existsSync(join(ROOT, 'api/lib/search/embed-cache-manager.js'))).toBe(false);
    expect(row.file).toBe('api/lib/query-embedding.js');              // the theme's real module, not the phantom
    expect(row.fn).toBeNull();
    expect(row.change).toMatch(/embed-cache-manager\.js, which does not exist/);
    const fs = { has: (p) => p === 'api/lib/a.js', source: () => 'export function realOne() {}' };
    expect(resolveFile({ file: 'api/lib/ghost.js', fn: 'x', change: 'c' }, fs, null)).toMatchObject({ file: null, fn: null });
    expect(resolveFile({ file: 'api/lib/a.js', fn: 'missingFn', change: 'c' }, fs)).toMatchObject({ file: 'api/lib/a.js', fn: null });
    expect(resolveFile({ file: 'api/lib/a.js', fn: 'realOne()', change: 'c' }, fs).fn).toBe('realOne()');
  });

  it('every FIX_WHERE first path and every latency module exists in the repo', () => {
    for (const cls of Object.keys(FIX_WHERE)) { const f = fixFile(cls); if (f) expect(existsSync(join(ROOT, f)), `${cls} → ${f}`).toBe(true); }
    expect(fixFile('no-writings-pass')).toBe('api/lib/search/writings-pass.js');
    for (const stage of ['embed', 'main_embed', 'hydrate', 'qdrant', 'phrase', 'bm25', 'spell', 'total']) for (const kind of ['engine', 'planned'])
      expect(existsSync(join(ROOT, latencyModule(stage, { kind }))), `${kind}/${stage}`).toBe(true);
    expect(latencyModule('hydrate')).not.toMatch(/latency-budget/);
  });

  it('backfill is off by default: the read window is the time since live_from; older rows are never worked', async () => {
    expect(backfillDays(undefined)).toBe(0);
    expect(backfillDays('0')).toBe(0);
    expect(backfillDays('7')).toBe(7);
    const db = openImproveDb(':memory:'), seen = [];
    await ingest(db, { deps: { anisRepliesAfter: async (a, o) => (seen.push(o.sinceDays), []), tracesAfter: async (a, o) => (seen.push(o.sinceDays), []) } });
    expect(getCursor(db, 'live_from')).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    expect(seen).toHaveLength(2);
    for (const d of seen) expect(d).toBeLessThan(0.01);
    recordForensic(db, { key: 'reply:1', kind: 'reply', ref_id: '1', asked_at: '2026-10-01 00:00:00', defects: [], priority: 1 });
    expect(nextWork(db, { since: getCursor(db, 'live_from') })).toBeNull();
    expect(nextWork(db)).not.toBeNull();
  });
});
