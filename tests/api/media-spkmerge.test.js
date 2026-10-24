// Invented second speakers (10-23): a labelled 'other' goes back to the main speaker only when its voice AND the paragraph's
// own voice match the main speaker's; a real questioner (different voice) stays.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { spansOf, decideMerge, applyMerge } from '../../api/lib/media/spkmerge.js';
import { mediaSpeakerMergeJob } from '../../api/lib/ops/media-jobs.js';

const paras = [
  { n: 1, t0: 0, t1: 60, spk: 'S1' }, { n: 2, t0: 60, t1: 75, spk: 'S2' }, { n: 3, t0: 75, t1: 200, spk: 'S1' },
  { n: 4, t0: 200, t1: 230, spk: 'S2' }, { n: 5, t0: 230, t1: 240, spk: 'S3' }, { n: 6, t0: 240, t1: 400, spk: 'S1' },
];

describe('speaker merge decisions', () => {
  it('spans: the main speaker by time, the others with their paragraph indexes', () => {
    const s = spansOf(paras);
    expect(s.mainKey).toBe('S1');
    expect(s.others).toEqual({ S2: [[60, 75], [200, 230]], S3: [[230, 240]] });
    expect(s.index).toEqual({ S2: [1, 3], S3: [4] });
  });
  it("Nakhjavání's 'Co-presenter' (the same voice) is merged paragraph by paragraph; a questioner (a different voice) stays", () => {
    const s = spansOf(paras);
    const r = { others: { S2: { cos: 0.92, spans: [0.9, 0.62] }, S3: { cos: 0.41, spans: [0.4] } } };
    const d = decideMerge(r, s);
    expect(d.merge).toEqual([1]);                       // S2's second paragraph does not match by itself → kept
    expect(d.summary).toMatchObject({ S2: { merged: 1, kept: 1 }, S3: { merged: 0, why: 'a different voice' } });
    const a = applyMerge(paras, { S1: 'Ali Nakhjavání', S2: 'Co-presenter', S3: 'Questioner' }, s.mainKey, d.merge);
    expect(a.paragraphs[1]).toMatchObject({ spk: 'S1', spk_merged_from: 'S2' });
    expect(a.speakers).toEqual({ S1: 'Ali Nakhjavání', S2: 'Co-presenter', S3: 'Questioner' });   // S2 still has a paragraph
    const all = applyMerge(paras, { S1: 'A', S2: 'B' }, 'S1', [1, 3]);
    expect(all.speakers).toEqual({ S1: 'A' });          // a name with no paragraph left is dropped
  });
});

describe('media-speaker-merge backfill', () => {
  it('multi-speaker talks not yet merged get one run with merge_speakers; a queued run is folded, a running one skipped', async () => {
    const files = {
      '/a': { meta: {}, work: { paragraphs: paras } }, '/b': { meta: {}, work: { paragraphs: [{ spk: 'S1' }] } },
      '/c': { meta: { speaker_merge: { merged: 0 } }, work: { paragraphs: paras } }, '/d': { meta: {}, work: { paragraphs: paras } }, '/e': { meta: {}, work: { paragraphs: paras } },
    };
    const items = { 1: '/a', 2: '/b', 3: '/c', 4: '/d', 5: '/e' };
    const queued = [], cancelled = [];
    const deps = { repo: { doneItemIds: async () => [1, 2, 3, 4, 5], getMediaItem: async (id) => ({ id, dir: items[id] }) }, readFiles: async (d) => files[d],
      ops: { pendingRuns: async (n) => (n === 'media-item' ? [{ id: 90, status: 'queued', params: { id: 4, redo: ['web', 'trim', 'update'] } }, { id: 91, status: 'running', params: { id: 5, redo: ['links', 'update'] } }] : []), cancel: async (id) => cancelled.push(id) },
      queue: async (n, p) => queued.push(p) };
    const r = await mediaSpeakerMergeJob({ write: true }, deps);
    expect(r).toMatchObject({ talks: 5, multi: 4, done_before: 1, queued: 2, folded: 1, skipped_busy: 1 });
    expect(queued).toEqual([{ id: 1, redo: ['update'], merge_speakers: true }, { id: 4, redo: ['web', 'trim', 'update'], merge_speakers: true }]);
    expect(cancelled).toEqual([90]);
  });
});
