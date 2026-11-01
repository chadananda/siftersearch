// Stage feed rotates (11-01: quiet talks 560 + 1380 failed every pass and, as the two lowest ids, held the depth-2 lane forever; 235 others never ran).
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { mediaLanesFeedPass } from '../../api/lib/ops/media-jobs.js';

const base = () => ({ nextToProcess: async () => [], nextTranscribed: async () => [], updateMediaItem: vi.fn(), nextToDownload: async () => [], youtubeHeldSince: async () => ({ n: 0 }) });
// talks that never leave next_stage quiet (every run fails): the repo honours limit + afterId like the SQL
const stuck = [560, 1380, 1381, 1383, 1384];
const byStage = (ids) => vi.fn(async (stage, limit, after = 0) => (stage === 'quiet' ? ids.filter((id) => id > after).slice(0, limit).map((id) => ({ id })) : []));
const pass = async (repo, cursor, pend = []) => {
  const queue = vi.fn();
  await mediaLanesFeedPass({ repo, ops: { pendingRuns: async () => pend }, queue, computeDepth: 0, stageDepth: 2, feedStages: ['quiet'], stageCursor: cursor, ledger: null });
  return queue.mock.calls.filter((c) => c[0] === 'media-item').map((c) => c[1].id);
};

describe('stage feed: a talk that keeps failing never holds the lane', () => {
  it('each pass starts after the last talk fed and wraps to the start, so every talk gets a turn', async () => {
    const repo = { ...base(), nextByStage: byStage(stuck) }, cursor = {};
    expect(await pass(repo, cursor)).toEqual([560, 1380]);
    expect(await pass(repo, cursor)).toEqual([1381, 1383]);
    expect(await pass(repo, cursor)).toEqual([1384, 560]);
    expect(await pass(repo, cursor)).toEqual([1380, 1381]);
  });
  it('order, not filter: a talk in flight is skipped this turn and the rest keep id order', async () => {
    const repo = { ...base(), nextByStage: byStage(stuck) }, cursor = { quiet: 1380 };
    expect(await pass(repo, cursor, [{ params: { id: 1381 } }])).toEqual([1383, 1384]);
  });
  it('a full lane queues nothing and keeps the cursor', async () => {
    const repo = { ...base(), nextByStage: byStage(stuck) }, cursor = { quiet: 1381 };
    expect(await pass(repo, cursor, [{ params: { id: 9, stage_feed: 'quiet' } }, { params: { id: 8, stage_feed: 'quiet' } }])).toEqual([]);
    expect(cursor.quiet).toBe(1381);
  });
  it('a short list is not fed twice in one pass', async () => {
    const repo = { ...base(), nextByStage: byStage([560]) }, cursor = { quiet: 560 };
    expect(await pass(repo, cursor)).toEqual([560]);
  });
});
