import { describe, it, expect } from 'vitest';
import { mediaStagesJob } from '../../api/lib/ops/media-jobs.js';

const items = { 1: { id: 1, restored: 1, published_at: 'x', stages_done: ',remaster,transcribe,diarize,correct,headings,quotes,links,assess,ingest,catalog,' },
  2: { id: 2, restored: 0, published_at: 'x', stages_done: ',remaster,transcribe,diarize,correct,headings,' }, 3: { id: 3, restored: 0, published_at: null, stages_done: ',transcribe,' } };
const deps = (queued) => ({ repo: { doneItemIds: async () => [1, 2, 3], getMediaItem: async (i) => items[i] }, ops: { pendingRuns: async () => [{ params: { id: 3 } }] }, queue: async (n, p) => queued.push([n, p]) });

describe('media-stages', () => {
  it('reports completeness and what each stage is missing without queueing', async () => {
    const q = [], r = await mediaStagesJob({}, deps(q));
    expect(r.complete).toBe(1); expect(r.missing.quotes).toBe(2); expect(r.missing.catalog).toBe(2); expect(q).toEqual([]);
  });
  it('write queues exactly the missing stages, in engine order, skipping busy talks', async () => {
    const q = [], r = await mediaStagesJob({ write: true }, deps(q));
    expect(q).toEqual([['media-item', { id: 2, redo: ['ingest', 'catalog', 'quotes', 'links', 'assess', 'update'] }]]);
    expect(r.queued).toBe(1); expect(r.skipped_busy).toBe(1);
  });
  it('redo forces named stages on selected talks even when done', async () => {
    const q = []; await mediaStagesJob({ write: true, ids: [1], redo: ['links'] }, deps(q));
    expect(q[0][1]).toEqual({ id: 1, redo: ['links', 'update'] });
  });
});
