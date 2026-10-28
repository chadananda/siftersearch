// Defer lane: write-and-forget batches held in RAM, applied in order as one group, flushed on demand (storage-wear 10-28).
import { it, expect, vi } from 'vitest';
import { createDeferLane } from '../../api/lib/write-server.js';

it('holds named batches, answers at once, flushes them in order as one submit', async () => {
  const submit = vi.fn(async () => []);
  const lane = createDeferLane({ submit }, { names: ['coverage:touch'], everyMs: 0 });
  expect(lane.wants('coverage:touch')).toBe(true); expect(lane.wants('media:update')).toBe(false);
  const r = lane.hold([{ sql: 'A', args: [1] }, { sql: 'B' }], { name: 'coverage:touch' });
  lane.hold([{ sql: 'C' }], { name: 'coverage:touch' });
  expect(r).toHaveLength(2); expect(submit).not.toHaveBeenCalled(); expect(lane.stats().held).toBe(2);
  await lane.flush();
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0][0].map((s) => s.sql)).toEqual(['A', 'B', 'C']);
  expect(lane.stats()).toMatchObject({ held: 0, flushes: 1, statements: 3 });
  await lane.flush(); expect(submit).toHaveBeenCalledTimes(1);   // nothing held: no write
});
it('a failed flush reports through onError and does not throw into callers', async () => {
  const onError = vi.fn();
  const lane = createDeferLane({ submit: async () => { throw new Error('boom'); } }, { names: ['x'], everyMs: 0, onError });
  lane.hold([{ sql: 'A' }], { name: 'x' }); await lane.flush();
  expect(onError).toHaveBeenCalled();
});
