// ops/index-follow — HyPE/concept claims SQLite → Qdrant follow-through: settle hooks queue, the follow loop catches up,
// a clean index marks its docs. Fakes only (no DB, no indexer process); marks live in a temp dir.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { followCapUsd, dailyKey, queueFollowIndex, followCandidates, loadMarks, saveMarks, followedIndexJob, followPass, CHUNK } from '../../api/lib/ops/index-follow.js';
import { indexerArgs } from '../../api/lib/ops/phrase-index-job.js';
import { createHypeBatch } from '../../api/lib/pipeline/hype-batch.js';

const NOW = new Date('2026-11-04T12:00:00Z');
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'index-follow-')); });
const recorder = () => { const calls = []; const enqueue = async (name, params, by) => { calls.push({ name, params, by }); return { id: calls.length }; }; return { calls, enqueue }; };

describe('cap + key', () => {
  it('INDEX_FOLLOW_USD_DAY: default $1, 0 or junk = off', () => {
    expect(followCapUsd({})).toBe(1);
    expect(followCapUsd({ INDEX_FOLLOW_USD_DAY: '2.5' })).toBe(2.5);
    expect(followCapUsd({ INDEX_FOLLOW_USD_DAY: '0' })).toBe(0);
    expect(followCapUsd({ INDEX_FOLLOW_USD_DAY: 'x' })).toBe(0);
  });
  it('the budget key is dated, so the cumulative --max-usd is a daily cap', () => {
    expect(dailyKey('hype', NOW)).toBe('follow-hype-2026-11-04');
    expect(dailyKey('concepts', new Date('2026-11-05T00:00:01Z'))).toBe('follow-concepts-2026-11-05');
  });
});

describe('queueFollowIndex (settle hooks)', () => {
  it('queues the field job with the cap, the daily key and follow:true', async () => {
    const { calls, enqueue } = recorder();
    const r = await queueFollowIndex('hype', [20762, '5', 5, 0, null], 'hype-settle', { enqueue, env: {}, now: NOW });
    expect(r).toEqual({ queued: 1, docs: 2 });
    expect(calls[0]).toEqual({ name: 'hype-index', params: { docs: [5, 20762], maxUsd: 1, budgetKey: 'follow-hype-2026-11-04', follow: true }, by: 'hype-settle' });
  });
  it('concepts → concept-index', async () => {
    const { calls, enqueue } = recorder();
    await queueFollowIndex('concepts', [7], 'concepts-run', { enqueue, env: {}, now: NOW });
    expect(calls[0].name).toBe('concept-index');
  });
  it('chunks large settles', async () => {
    const { calls, enqueue } = recorder();
    const ids = Array.from({ length: CHUNK * 2 + 1 }, (_, i) => i + 1);
    expect((await queueFollowIndex('hype', ids, 'x', { enqueue, env: {}, now: NOW })).queued).toBe(3);
    expect(calls.map((c) => c.params.docs.length)).toEqual([CHUNK, CHUNK, 1]);
  });
  it('off when the cap is 0; nothing queued for no docs', async () => {
    const { calls, enqueue } = recorder();
    expect(await queueFollowIndex('hype', [1], 'x', { enqueue, env: { INDEX_FOLLOW_USD_DAY: '0' } })).toMatchObject({ queued: 0, off: true });
    expect(await queueFollowIndex('hype', [], 'x', { enqueue, env: {} })).toMatchObject({ queued: 0 });
    expect(calls).toHaveLength(0);
  });
  it('never throws on a failed enqueue (the stage must not fail for it)', async () => {
    const r = await queueFollowIndex('hype', [1], 'x', { enqueue: async () => { throw new Error('writer down'); }, env: {}, log: { warn() {} } });
    expect(r).toEqual({ queued: 0, error: 'writer down' });
  });
});

describe('followCandidates', () => {
  const row = (doc_id, generated, current, indexed) => ({ doc_id, generated, current, indexed });
  it('first sight: visibly behind (points < paragraphs with data) is due; complete-looking docs are seeded, not queued', () => {
    const { due, seed } = followCandidates([row(1, 69, 69, 5), row(2, 46, 46, 300), row(3, 0, 0, 0)], {});
    expect(due).toEqual([1]);
    expect(seed).toEqual({ 2: '46:46' });
  });
  it('marked: due only when the signature moved', () => {
    const marks = { 1: '69:69', 2: '46:40' };
    expect(followCandidates([row(1, 69, 69, 900), row(2, 46, 46, 900)], marks).due).toEqual([2]);
    expect(followCandidates([row(1, 682, 682, 900)], marks).due).toEqual([1]);
  });
});

describe('marks', () => {
  it('missing file = null (never ran); save is atomic and round-trips', () => {
    expect(loadMarks('hype', dir)).toBeNull();
    saveMarks('hype', { 1: '2:2' }, dir);
    expect(loadMarks('hype', dir)).toEqual({ 1: '2:2' });
    expect(fs.readdirSync(dir)).toEqual(['index-follow-hype.json']);
  });
});

describe('followedIndexJob', () => {
  const coverage = (layer = 'hype') => ({
    coverageForDocs: async (ids) => Object.fromEntries(ids.map((id) => [id, { [layer]: { generated: 10, current: 9, indexed: 50 } }])),
    layerRowsWithData: async () => [{ doc_id: 4, generated: 3, current: 3, indexed: 9 }],
  });
  it('a clean docs run re-measures, then marks its docs with the fresh signature; follow is not passed to the indexer', async () => {
    const seen = [], refreshed = [];
    const out = await followedIndexJob('hype', { docs: [1, 2], maxUsd: 1, budgetKey: 'k', follow: true },
      { run: async (p) => { seen.push(p); return { code: 0, last: { phase: 'done' } }; }, dir, coverage: coverage(), refresh: async (ids) => refreshed.push(...ids) });
    expect(seen[0]).toEqual({ docs: [1, 2], maxUsd: 1, budgetKey: 'k', field: 'hype' });
    expect(refreshed).toEqual([1, 2]);
    expect(out.marked).toBe(2);
    expect(loadMarks('hype', dir)).toEqual({ 1: '10:9', 2: '10:9' });
  });
  it('a scope run marks from the pre-run snapshot', async () => {
    await followedIndexJob('concepts', { scope: 'library', maxUsd: 1 }, { run: async () => ({ last: { phase: 'done' } }), dir, coverage: coverage('concepts'), refresh: async () => {} });
    expect(loadMarks('concepts', dir)).toEqual({ 4: '3:3' });
  });
  it('no marks after a budget stop or a dry run', async () => {
    const deps = { dir, coverage: coverage(), refresh: async () => {} };
    await followedIndexJob('hype', { docs: [1], maxUsd: 1 }, { ...deps, run: async () => ({ last: { phase: 'stopped', reason: 'budget' } }) });
    await followedIndexJob('hype', { docs: [1], scanOnly: true }, { ...deps, run: async () => ({ last: { phase: 'scan', est_usd: 0.01 } }) });
    expect(loadMarks('hype', dir)).toBeNull();
  });
  it('a failed re-measure keeps the run result (the index ran) and reports markError', async () => {
    const out = await followedIndexJob('hype', { docs: [1], maxUsd: 1 }, { run: async () => ({ last: { phase: 'done' } }), dir, coverage: coverage(), refresh: async () => { throw new Error('busy'); } });
    expect(out).toMatchObject({ last: { phase: 'done' }, markError: 'busy' });
  });
});

describe('followPass (indexer loop)', () => {
  const fakeReports = ({ pending = [], latest = null } = {}) => {
    const { calls, enqueue } = recorder();
    return { calls, enqueue, pendingRuns: async (name) => pending.filter((r) => r.name === name), latest: async (name) => (latest?.name === name ? latest : null) };
  };
  const cov = { layerRowsWithData: async () => [{ doc_id: 1, generated: 69, current: 69, indexed: 5 }, { doc_id: 2, generated: 4, current: 4, indexed: 20 }] };
  it('queues docs behind, seeds the rest', async () => {
    const reports = fakeReports();
    const r = await followPass({ env: {}, now: NOW, dir, deps: { coverage: cov, reports } });
    expect(r.hype).toMatchObject({ due: 1, seeded: 1, queued: 1 });
    expect(reports.calls.map((c) => [c.name, c.params.docs])).toEqual([['hype-index', [1]], ['concept-index', [1]]]);
    expect(loadMarks('hype', dir)).toEqual({ 2: '4:4' });
  });
  it('waits while a follow run is queued/running for that field', async () => {
    const reports = fakeReports({ pending: [{ name: 'hype-index', params: { follow: true } }] });
    const r = await followPass({ env: {}, now: NOW, dir, deps: { coverage: cov, reports } });
    expect(r.hype).toEqual({ waiting: true });
    expect(reports.calls.map((c) => c.name)).toEqual(['concept-index']);
  });
  it("today's cap reached → no new run until tomorrow's key", async () => {
    const stopped = { name: 'hype-index', params: { budgetKey: 'follow-hype-2026-11-04' }, result: { last: { phase: 'stopped' } } };
    expect((await followPass({ env: {}, now: NOW, dir, deps: { coverage: cov, reports: fakeReports({ latest: stopped }) } })).hype).toEqual({ capReached: true });
    const tomorrow = await followPass({ env: {}, now: new Date('2026-11-05T01:00:00Z'), dir, deps: { coverage: cov, reports: fakeReports({ latest: stopped }) } });
    expect(tomorrow.hype.queued).toBe(1);
  });
  it('a stop for a full RAM tier is not a cap: the next pass sends the rest (Chad 11-10)', async () => {
    const full = { name: 'hype-index', params: { budgetKey: 'follow-hype-2026-11-04' }, result: { last: { phase: 'stopped', reason: 'hot RAM disk full: fold into main before indexing more' } } };
    const r = await followPass({ env: {}, now: NOW, dir, deps: { coverage: cov, reports: fakeReports({ latest: full }) } });
    expect(r.hype.capReached).toBeUndefined();
  });
  it('off when INDEX_FOLLOW_USD_DAY=0', async () => {
    expect(await followPass({ env: { INDEX_FOLLOW_USD_DAY: '0' }, dir, deps: { coverage: cov, reports: fakeReports() } })).toEqual({ off: true });
  });
});

describe('indexerArgs scanOnly (the dry run)', () => {
  it('needs no maxUsd, passes --scan-only, never --embed/--qdrant', () => {
    const a = indexerArgs({ scope: 'library', field: 'hype', scanOnly: true, budgetKey: 'b' });
    expect(a).toContain('--scan-only');
    expect(a).not.toContain('--embed');
    expect(a).not.toContain('--qdrant');
    expect(a.slice(-2)).toEqual(['--budget-key', 'b']);
  });
});

describe('hype-batch onSettled', () => {
  it('collect hands the docs that gained questions to onSettled; a hook failure is an error line, not a throw', async () => {
    const hdir = fs.mkdtempSync(path.join(os.tmpdir(), 'hype-batch-follow-'));
    const done = new Set();
    const rag = { retrieval: {
      plan: async (docId, o) => ({ system: 'S', model: 'claude-haiku-5-5', maxTokens: 100, skipped: [], docId,
        units: [docId * 10, docId * 10 + 1].filter((id) => !done.has(id) && !o.exclude?.has(id)).map((id) => ({ id, pid: `p${id}`, parts: ['u'] })) }),
      settle: async (docId, outcomes) => { for (const x of outcomes) done.add(x.id); return { written: docId === 2 ? 0 : outcomes.length, failed: [], exhausted: 0, alreadyDone: 0 }; } } };
    const created = [];
    const transport = { create: async (requests) => { created.push(requests); return `b${created.length}`; }, status: async () => ({ ended: true }),
      async *results(id) { for (const r of created[Number(id.slice(1)) - 1]) yield { custom_id: r.custom_id, ok: true, text: '{}', stopReason: 'end_turn', usage: {} }; } };
    const settledWith = [];
    const hb = createHypeBatch({ rag, transport, dir: hdir, sleep: async () => {}, onSettled: async (ids) => { settledWith.push(ids); throw new Error('queue down'); } });
    await hb.submit([1, 2]);
    const c = await hb.collect();
    expect(settledWith).toEqual([[1]]);
    expect(c.errors).toContain('onSettled: queue down');
  });
});

describe('indexerArgs docsFile (11-07: E2BIG on 28,721 ids)', () => {
  it('passes --docs-file instead of the inline list', () => {
    const a = indexerArgs({ docs: [1, 2, 3], docsFile: '/x/ids.txt', scanOnly: true });
    expect(a).toContain('--docs-file');
    expect(a[a.indexOf('--docs-file') + 1]).toBe('/x/ids.txt');
    expect(a).not.toContain('--docs');
  });
  it('a short list stays inline', () => {
    const a = indexerArgs({ docs: [1, 2], scanOnly: true });
    expect(a[a.indexOf('--docs') + 1]).toBe('1,2');
  });
});
