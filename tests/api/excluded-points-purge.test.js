import { describe, it, expect } from 'vitest';
import { excludedPointsPurgeJob } from '../../api/lib/ops/excluded-points-purge-job.js';

const exclusion = async () => ({ excluded: { total: 5 }, with_points: { ids: [1, 2, 3], by_collection: { phrases: { docs: 3, points: 30 } } }, check: 'ok' });

describe('excludedPointsPurgeJob', () => {
  it('dry run deletes nothing', async () => {
    const calls = [], r = await excludedPointsPurgeJob({}, { exclusion, request: async (...a) => calls.push(a) });
    expect(r.with_points.docs).toBe(3);
    expect(calls).toEqual([]);
  });
  it('apply deletes by doc_id in every searched collection, chunked', async () => {
    const calls = [], r = await excludedPointsPurgeJob({ apply: true, chunk: 2 }, { exclusion, request: async (p, b) => calls.push([p, b.filter.must[0].match.any]) });
    expect(r.deleted_calls).toBe(8);
    expect(calls[0]).toEqual(['/collections/phrases/points/delete?wait=true', [1, 2]]);
    expect(calls[1][1]).toEqual([3]);
  });
  it('a failed point check refuses', async () => {
    await expect(excludedPointsPurgeJob({ apply: true }, { exclusion: async () => ({ with_points: null, check: 'failed: x' }) })).rejects.toThrow(/failed: x/);
  });
});
