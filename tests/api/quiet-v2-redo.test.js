// Quiet v2 redo (Chad 11-01): a v1 remaster is stale (redone), stays on air meanwhile; the order is published first by loud CUTS; pods get Opus input.
import { describe, it, expect } from 'vitest';
import { loudCuts, redoOrder, hasQuiet, QUIET_REPAIR_VERSION } from '../../api/lib/media/quiet-record.js';
import { REG, isStale, markStale, fpOf } from '../../api/lib/media/stages.js';
import { needsOpus } from '../../api/lib/media/r2-stage.js';

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
  it('a source above 96 kbps (a 317 MB WAV tape) is encoded; one already small is not', () => {
    expect(needsOpus(317e6, 3600)).toBe(true);
    expect(needsOpus(30e6, 3600)).toBe(false);
    expect(needsOpus(1e6, 0)).toBe(false);
  });
});
