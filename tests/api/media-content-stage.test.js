// Content stage + cut trim through runItem (rules §8), and the DEPLOY SAFETY: a published v2-quiet talk with no content stage stays on air, wanting only the new stage.
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { REG, missingStages, recordFor } from '../../api/lib/media/stages.js';
import { isComplete, indexFields, runItem } from '../../api/lib/media/item.js';
import { nextJobs } from '../../api/lib/media/stage-jobs.js';
import { hasQuiet, QUIET_REPAIR_VERSION, QUIET_AIR_VERSION } from '../../api/lib/media/quiet-record.js';
import { webTime } from '../../api/lib/media/trim.js';

const ticked = (skip = []) => Object.fromEntries(REG.STAGES.filter((s) => !skip.includes(s)).map((s) => [s, { at: 'x', ...recordFor(s, {}, REG) }]));
const published = (stages, v = 2) => ({ slug: 'x', original: 'o.mp3', stages, enhancement: { listening: 'unipase' }, web_listening: 'unipase', duration_s: 700,
  remaster: { status: 'done', verdict: 'pass-auto', swapped: 0, output_assessment: { passed: true }, quiet: { v } }, qa: {} });

describe('deploy safety: nothing on air goes off air', () => {
  it('a published talk made with quiet v2 and no content stage is complete and on air', () => {
    const m = published(ticked(['content']), 2);
    expect(QUIET_REPAIR_VERSION).toBeGreaterThan(2);   // the bump that must not take it off air
    expect(hasQuiet(m)).toBe(true);
    expect(QUIET_AIR_VERSION).toBeLessThanOrEqual(2);
    expect(isComplete(m)).toBe(true);
    expect(indexFields(m)).toMatchObject({ restored: 1 });
  });
  it('content is not required: nothing is missing, the feed never queues it on its own (no `feed`): the backfill (ops media rerun content, canary then full) is what reaches it, and it is a text job only', () => {
    const m = published(ticked(['content']), 2);
    expect(missingStages(m)).toEqual([]);
    expect(REG.BY.content.required).toBe(false);
    expect(REG.AIR_STAGES).not.toContain('content');
    expect(REG.FEED_STAGES).not.toContain('content');
    expect(nextJobs(m)).toEqual(['text']);   // eligible for the text job when a campaign asks; never an audio job
  });
  it('the old v1 quiet record (QUIET_AIR_VERSION) is still on air as well', () => expect(hasQuiet(published(ticked(['content']), 1))).toBe(true));
});

describe('the content stage', () => {
  const setup = (llm) => {
    const dir = mkdtempSync(join(tmpdir(), 'content-')); mkdirSync(join(dir, 'enhanced'), { recursive: true });
    const w = (n, s, e) => ({ w: `w${n}`, s, e });
    const paragraphs = [{ n: 1, t0: 0, t1: 10, words: [w(1, 0, 9)] }, { n: 2, t0: 20, t1: 40, words: [w(2, 20, 25), w(3, 26, 40)] }, { n: 3, t0: 41, t1: 60, words: [w(4, 41, 60)] }];
    writeFileSync(join(dir, 'transcript.work.json'), JSON.stringify({ paragraphs }));
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...published(ticked(['content']), 2), dir }));
    const deps = { reg: REG, tools: { ffmpeg: vi.fn(), ffprobe: vi.fn(), tool: vi.fn(), asr: vi.fn(), remasterGuard: vi.fn() }, llm, repo: { updateMediaItem: async () => ({}), getMediaItem: async () => ({ state: 'done' }) }, draining: async () => false, loadVocab: async () => ({}), now: () => 't' };
    return { dir, deps, run: () => runItem({ id: 1, dir, state: 'done', source_kind: 'file' }, { only: ['content'] }, deps) };
  };
  it('records meta.content (segments, cuts, kept_s) and the cuts that trim will apply; no audio tool runs', async () => {
    const llm = { contentTalk: vi.fn(async () => ({ segments: [{ from_n: 1, to_n: 1, kind: 'music', why: 'song' }, { from_n: 2, to_n: 3, kind: 'content', why: 'talk' }] })) };
    const { dir, deps, run } = setup(llm);
    const out = await run();
    expect(out.done).toEqual(['content']);
    const m = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    expect(m.content).toMatchObject({ v: 1, segments: [{ kind: 'music' }, { kind: 'content' }] });
    expect(m.content.cuts[0]).toMatchObject({ kind: 'music', from: 0 });
    expect(m.content.cuts[0].to).toBeCloseTo(19.7, 1);
    expect(m.stages.content).toMatchObject({ at: 't', cuts: m.content.cuts.length });
    for (const t of Object.values(deps.tools)) expect(t).not.toHaveBeenCalled();
    expect(llm.contentTalk).toHaveBeenCalledTimes(1);
  });
  it('a model answer with no segments is recorded as a review, never an alarm, and cuts nothing but dead gaps', async () => {
    const { dir, run } = setup({ contentTalk: async () => ({}) });
    await run();
    const m = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    expect(m.content.review).toBeTruthy();
    expect(m.content.cuts.filter((c) => c.kind !== 'gap')).toEqual([]);
  });
  it('webTime of a cut-aware trim record matches what the player will seek to', () => {
    const trim = { start_s: 0, cuts: [{ from: 0, to: 19.7 }] };
    expect(webTime(25, trim)).toBeCloseTo(5.3, 6);
  });
});
