// Throughput (Chad 10-22: one item at a time ≈ a month): downloads apart from processing, N items at once by rank, re-runs
// behind new items, the queue order curated → Dunbar → Hands/UHJ → local.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(async () => null), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { rankFor, mediaFetchJob, mediaFeedPass } from '../../api/lib/ops/media-jobs.js';

describe('queue order', () => {
  it('curated sheet → Hooper Dunbar → other Hands/UHJ (YouTube) → local Hands/UHJ → local others', async () => {
    const yt = new Map([['a', { tier: '1-curated', i: 3 }], ['b', { tier: '2-single:Hooper C Dunbar - Talks', i: 140 }], ['c', { tier: '3-other', i: 500 }]]);
    const r = async (row, role = null) => rankFor(row, yt, role);
    const ranks = [await r({ source_kind: 'youtube', youtube_id: 'a' }), await r({ source_kind: 'youtube', youtube_id: 'b' }), await r({ source_kind: 'youtube', youtube_id: 'c' }),
      await r({ source_kind: 'file', id: 7 }, 'hand'), await r({ source_kind: 'file', id: 7 }), await r({ source_kind: 'youtube', youtube_id: 'zz', id: 9 })];
    expect([...ranks].sort((x, y) => x - y)).toEqual(ranks);
  });
});

describe('downloads', () => {
  it('fetches the next YouTube items into the archive only, puts them back for processing, holds on a bot check', async () => {
    const upd = vi.fn(async () => ({}));
    const repo = { youtubeHeldSince: async () => ({ n: 0 }), nextToDownload: async () => [{ id: 1 }, { id: 2 }, { id: 3 }], updateMediaItem: upd };
    const runItem = vi.fn(async (it, opts) => { expect(opts).toEqual({ only: ['archive'] }); if (it.id === 2) { const e = new Error('Sign in to confirm'); e.code = 'BOT_CHECK'; throw e; } return {}; });
    const r = await mediaFetchJob({ limit: 3, pauseMs: 0 }, { repo, runItem, draining: () => false, nap: async () => {} });
    expect(r).toMatchObject({ downloaded: [1], held: [2] });
    expect(upd.mock.calls).toContainEqual([1, { state: 'queued', stage: 'archive' }]);
    expect(runItem).toHaveBeenCalledTimes(2);   // the bot check stops the round
  });
});

describe('the feed', () => {
  it('keeps N new items in processing as priority runs, and one download run queued', async () => {
    const queue = vi.fn();
    const repo = { nextToProcess: vi.fn(async (n) => [{ id: 5 }, { id: 6 }].slice(0, n)), updateMediaItem: vi.fn(), nextToDownload: async () => [{ id: 9 }], youtubeHeldSince: async () => ({ n: 0 }) };
    const ops = { pendingRuns: async (name) => (name === 'media-item' ? [{ params: { id: 1, feed: true } }, { params: { id: 2, from: 'correct' } }] : []) };
    const r = await mediaFeedPass({ repo, ops, queue, parallel: 3 });
    expect(r).toMatchObject({ inflight: 1, scheduled: [5, 6], fetch: true });
    expect(queue.mock.calls[0]).toEqual(['media-item', { id: 5, feed: true, priority: true }, 'media-feed']);
    expect(queue.mock.calls.at(-1)[0]).toBe('media-fetch');
  });
});
