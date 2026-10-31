// Quiet is a real checklist stage (item.js): a talk without it is incomplete and off air, jobs run only incomplete stages + dependents, the feed takes them on a home host (never tower). Chad 10-31.
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { indexFields, isComplete, withDependents, runItem, STAGES, COMPLETE_STAGES } from '../../api/lib/media/item.js';
import { mediaLanesFeedPass, backfillRestored } from '../../api/lib/ops/media-jobs.js';

const ticks = (skip = []) => Object.fromEntries([...STAGES, ...COMPLETE_STAGES].filter((k) => !skip.includes(k)).map((k) => [k, { at: 'x' }]));
const talk = (remaster = {}, skip = ['quiet']) => ({ stages: ticks(skip), enhancement: { listening: 'unipase' }, web_listening: 'unipase', remaster_tier: 'heavy', remaster: { status: 'done', verdict: 'pass-auto', swapped: 0, output_assessment: { passed: true }, ...remaster }, qa: {} });

describe('quiet on the checklist', () => {
  it('sits right after realign, before web, and is required for completeness', () => {
    expect(STAGES.slice(STAGES.indexOf('realign'), STAGES.indexOf('web') + 1)).toEqual(['realign', 'quiet', 'web']);
    expect(COMPLETE_STAGES).toContain('quiet');
  });
  it('a remaster without quiet is incomplete: off air, quiet is next', () => {
    const m = talk();
    expect(indexFields(m)).toMatchObject({ restored: 0, next_stage: 'quiet' });
    expect(indexFields(m).stages_missing).toBe(1);
    expect(isComplete(m)).toBe(false);
  });
  it('the remaster.quiet record completes it (a skipped tick alone does not)', () => {
    expect(indexFields(talk({ quiet: { v: 1 } }))).toMatchObject({ stages_missing: 0, next_stage: null });
    expect(isComplete(talk({ quiet: { v: 1 } }, []))).toBe(true); expect(isComplete(talk({}, []))).toBe(false);   // a tick without the record (skipped) never plays
  });
});

describe('dependents', () => {
  it('quiet drags web/trim/update; remaster drags verify, realign, quiet and on', () => {
    expect(withDependents(['quiet']).sort()).toEqual(['quiet', 'trim', 'update', 'web']);
    expect(withDependents(['remaster'])).toEqual(expect.arrayContaining(['verify', 'realign', 'quiet', 'web', 'trim', 'update']));
  });
  it('a text stage drags no audio stage', () => {
    for (const s of ['quotes', 'links', 'headings', 'assess']) expect(withDependents([s])).not.toEqual(expect.arrayContaining(['remaster', 'quiet', 'web']));
  });
});

describe('runItem runs only what is incomplete', () => {
  const mk = (meta) => { const dir = mkdtempSync(join(tmpdir(), 'qs-')); mkdirSync(join(dir, 'enhanced'), { recursive: true }); writeFileSync(join(dir, 'meta.json'), JSON.stringify({ slug: 'x', original: 'o.mp3', ...meta })); return dir; };
  const deps = (over = {}) => ({ tools: { ffmpeg: vi.fn(), ffprobe: vi.fn(), tool: vi.fn(), asr: vi.fn(), remasterGuard: vi.fn() }, llm: {}, repo: { updateMediaItem: async () => ({}), getMediaItem: async () => ({ state: 'done' }) }, draining: async () => false, loadVocab: async () => ({}), now: () => 't', ...over });
  const meta = (m) => JSON.parse(readFileSync(join(m, 'meta.json'), 'utf8'));
  it('missing only quiet: runs quiet, ticks it, drops web/trim/update when the master changed, touches no other audio tool', async () => {
    const dir = mk(talk()), quietStep = vi.fn(async () => ({ changed: true, quiet: { v: 1, host: 'aorus' } })), d = deps({ quietStep });
    const r = await runItem({ id: 1, dir, state: 'done', source_kind: 'file' }, { only: ['quiet'], remaster: true }, d);
    expect(quietStep).toHaveBeenCalledTimes(1);
    expect(r.done).toEqual(['quiet']);
    const m = meta(dir);
    expect(m.stages.quiet.at).toBeTruthy(); expect(m.remaster.quiet).toMatchObject({ v: 1, host: 'aorus' });
    expect(m.stages.web).toBeUndefined(); expect(m.stages.trim).toBeUndefined(); expect(m.stages.update).toBeUndefined();
    expect(m.stages.transcribe.at).toBe('x'); expect(m.stages.remaster.at).toBe('x');
    expect(d.tools.asr).not.toHaveBeenCalled(); expect(d.tools.remasterGuard).not.toHaveBeenCalled();
    expect(quietStep.mock.calls[0][2].T).toBeTruthy();
  });
  it('a spliced or held talk ticks quiet as skipped and never calls the step', async () => {
    const dir = mk(talk({ swapped: 3 })), quietStep = vi.fn();
    await runItem({ id: 2, dir, state: 'done', source_kind: 'file' }, { only: ['quiet'], remaster: true }, deps({ quietStep }));
    expect(quietStep).not.toHaveBeenCalled(); expect(meta(dir).stages.quiet.skipped).toBeTruthy();
  });
  it('a remaster already carrying quiet is ticked from the record, not re-run', async () => {
    const dir = mk(talk({ quiet: { v: 1 } })), quietStep = vi.fn();
    await runItem({ id: 3, dir, state: 'done', source_kind: 'file' }, { only: ['quiet'], remaster: true }, deps({ quietStep }));
    expect(quietStep).not.toHaveBeenCalled(); expect(meta(dir).stages.quiet.at).toBeTruthy();
  });
  it('missing only a text stage: no quiet step, no audio tool', async () => {
    const dir = mk(talk({ quiet: { v: 1 } }, ['quotes'])), quietStep = vi.fn(), d = deps({ quietStep, quotes: { linkQuotes: vi.fn(), linkTeachings: vi.fn(), breakoutsOf: () => [] }, llm: { findQuotations: vi.fn(async () => ({ quotes: [], teachings: [] })) } });
    await runItem({ id: 4, dir, state: 'done', source_kind: 'file' }, { only: ['quotes'], remaster: true }, d).catch(() => {});
    expect(quietStep).not.toHaveBeenCalled();
    for (const t of Object.values(d.tools)) expect(t).not.toHaveBeenCalled();
  });
});

describe('the feed completes it on a home host', () => {
  const base = () => ({ nextToProcess: async () => [], nextTranscribed: async () => [], updateMediaItem: vi.fn(), nextToDownload: async () => [], youtubeHeldSince: async () => ({ n: 0 }) });
  it('queues paced media-item runs for talks whose next_stage is quiet, skipping busy, respecting in-flight', async () => {
    const queue = vi.fn(), by = vi.fn(async (s) => (s === 'quiet' ? [{ id: 1 }, { id: 2 }, { id: 3 }] : []));   // the other feed stages (registry) have none here
    const out = await mediaLanesFeedPass({ repo: { ...base(), nextByStage: by }, ops: { pendingRuns: async () => [{ params: { id: 1 } }] }, queue, computeDepth: 0, stageDepth: 2 });
    expect(by.mock.calls[0][0]).toBe('quiet');
    expect(queue.mock.calls.filter((c) => c[0] === 'media-item').map((c) => c[1])).toEqual([{ id: 2, remaster: true, stage_feed: 'quiet' }, { id: 3, remaster: true, stage_feed: 'quiet' }]);
    expect(out.stages).toEqual([['quiet', 2], ['quiet', 3]]);
    const q2 = vi.fn();
    await mediaLanesFeedPass({ repo: { ...base(), nextByStage: by }, ops: { pendingRuns: async () => [{ params: { id: 9, stage_feed: 'quiet' } }, { params: { id: 8, stage_feed: 'quiet' } }] }, queue: q2, computeDepth: 0, stageDepth: 2 });
    expect(q2.mock.calls.filter((c) => c[0] === 'media-item')).toHaveLength(0);
  });
  it('the verify pass re-indexes a talk whose next_stage changed', async () => {
    const setIndex = vi.fn(), m = talk();
    const rows = [{ id: 1, dir: '/d/1', restored: 0, next_stage: 'quiet', stages_missing: 1 }, { id: 2, dir: '/d/2', restored: 1, next_stage: 'quiet', stages_missing: 1 }];
    await backfillRestored({ repo: { unclassifiedDone: async () => [], doneRows: async (a) => (a ? [] : rows), setIndex }, readMeta: async () => m });
    expect(setIndex.mock.calls.map((c) => [c[0], c[1].restored, c[1].next_stage])).toEqual([[2, 0, 'quiet']]);
  });
});
