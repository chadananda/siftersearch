// Quiet v2 redo (Chad 11-01): a v1 remaster is stale (redone), stays on air meanwhile; the order is published first by loud CUTS; pods get Opus input.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { loudCuts, redoOrder, hasQuiet, QUIET_REPAIR_VERSION } from '../../api/lib/media/quiet-record.js';
import { REG, isStale, markStale, fpOf } from '../../api/lib/media/stages.js';
import { readFileSync } from 'fs';
import { mediaRerunJob } from '../../api/lib/ops/media-jobs.js';
import { isOpus } from '../../api/lib/media/r2-stage.js';

describe('stale = redo', () => {
  const v1 = { stages: { remaster: { at: 'x', tool: 'unipase', fp: fpOf('unipase', {}) } } };
  it('the remaster settings changed (kept Opus, v2): a talk remastered under the old settings is stale; the current ones are not', () => {
    expect(REG.BY.remaster.settings).toMatchObject({ keep: 'opus96', v: 2 });
    expect(isStale(v1, 'remaster', REG)).toBe(true);
    expect(isStale({ stages: { remaster: { at: 'x', tool: 'unipase', fp: fpOf('unipase', REG.BY.remaster.settings) } } }, 'remaster', REG)).toBe(false);
  });
  it('marking it stale keeps the published copy on air (at stays) and quiet v1 still airs until v2 replaces it', () => {
    const m = JSON.parse(JSON.stringify(v1)); m.remaster = { quiet: { v: 1 } };
    markStale(m, 'remaster', { published: true }, REG);
    expect(m.stages.remaster.at).toBe('x'); expect(m.stages.remaster.stale).toBeTruthy();
    expect(hasQuiet(m)).toBe(true); expect(QUIET_REPAIR_VERSION).toBe(2);
  });
});

describe('redo order: published first, most loud cuts first (not seconds)', () => {
  const row = (id, published, q) => ({ id, published, meta: { remaster: { quiet: q } } });
  it('counts loud stretches; v1 falls back to its stretches when it silenced audible noise', () => {
    expect(loudCuts({ remaster: { quiet: { v: 2, loud_stretches: 7 } } })).toBe(7);
    expect(loudCuts({ remaster: { quiet: { v: 1, stretches: 129, noise_silenced_s: 326 } } })).toBe(129);
    expect(loudCuts({ remaster: { quiet: { v: 1, stretches: 40, noise_silenced_s: 0 } } })).toBe(0);
    expect(loudCuts({})).toBe(0);
  });
  it('published before unpublished, then cuts descending even when another has more seconds, then id', () => {
    const rows = [row(1, false, { stretches: 900, noise_silenced_s: 9000 }), row(2, true, { stretches: 5, noise_silenced_s: 600 }), row(3, true, { stretches: 60, noise_silenced_s: 30 }), row(4, true, { stretches: 60, noise_silenced_s: 90 }), row(5, true, {})];
    expect(redoOrder(rows).map((r) => r.id)).toEqual([4, 3, 2, 5, 1]);
  });
});

describe('pods get Opus input', () => {
  it('every source but an .opus is encoded, whatever its size (11-03, Chad: "we only process Opus")', () => {
    for (const n of ['tape.wav', 'talk.mp3', 'talk.mp4']) expect(isOpus(n)).toBe(false);
    expect(isOpus('talk.opus')).toBe(true);
  });
});

describe('UniPASE runs with PLC off (11-01: PLC invents audio and words in digital-zero gaps)', () => {
  it('every model call passes enable_plc=False and the setting is recorded on the stage', () => {
    for (const f of ['scripts/media/runpod_worker.py', 'scripts/media/unipase_job.py', 'scripts/media/remaster-rnd/run_boss_gen.py']) {
      const src = readFileSync(f, 'utf8');
      expect(src).toMatch(/enable_plc=False/); expect(src).not.toMatch(/enable_plc=True/);
    }
    expect(REG.BY.remaster.settings.plc).toBe(false);
  });
});

describe('mediaRerunJob on the remaster', () => {
  it('is accepted (typed chain redo) and returns the work order: published first, most loud cuts first', async () => {
    const q = (n, s) => ({ remaster: { quiet: { stretches: n, noise_silenced_s: s } }, stages: { remaster: { at: 'x', tool: 'unipase', fp: 'old' } } });
    const metas = { '/d/1': q(500, 900), '/d/2': q(5, 50), '/d/3': q(80, 10), '/d/4': q(80, 20) };
    const cands = [1, 2, 3, 4].map((id) => ({ id, dir: `/d/${id}`, duration_s: 3600, state: 'done', published_at: id === 1 ? null : 'p' }));
    const d = { ledger: { rerunCandidates: async () => cands, stageUsd: async () => [], syncItemStages: vi.fn() }, ops: { pendingRuns: async () => [] }, repo: { setIndex: vi.fn() }, readMeta: async (dir) => metas[dir], writeMeta: vi.fn() };
    const redo = vi.fn(async (ids) => ({ typed: ids }));
    const r = await mediaRerunJob({ stage: 'remaster', mode: 'apply' }, { ...d, mediaStatus: { mediaRedoTyped: redo }, redoDeps: {} });
    expect(r.order).toEqual([4, 3, 2, 1]);
    expect(d.writeMeta.mock.calls[0][1].stages.remaster.stale).toBeTruthy();
    // 11-02: the mark alone reached no GPU (tower re-ticked it) — the marked talks become typed-chain work orders, in redo order, as a rerun (band 2)
    expect(redo).toHaveBeenCalledWith([4, 3, 2, 1], {}, expect.stringMatching(/^rerun remaster@/), { rerun: true });
    expect(r.typed).toEqual([4, 3, 2, 1]);
  });
  it('a dry run marks nothing and queues nothing', async () => {
    const redo = vi.fn();
    const d = { ledger: { rerunCandidates: async () => [{ id: 1, dir: '/d/1', duration_s: 60 }], stageUsd: async () => [] }, ops: {}, repo: {}, readMeta: async () => ({}), mediaStatus: { mediaRedoTyped: redo } };
    expect((await mediaRerunJob({ stage: 'remaster' }, d)).talks).toBe(1);
    expect(redo).not.toHaveBeenCalled();
  });
});
