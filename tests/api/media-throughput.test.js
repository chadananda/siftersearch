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

describe('tower stays light with four items in flight', () => {
  it('tower model work runs one at a time', async () => {
    const { towerSlot } = await import('../../api/lib/media/item.js');
    let live = 0, peak = 0;
    const job = () => towerSlot(async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 15)); live--; });
    await Promise.all([job(), job(), job(), job()]);
    expect(peak).toBe(1);
  });
  it('a failing item keeps its retry count (so transient retries stop after two)', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../api/lib/ops/media-jobs.js', import.meta.url), 'utf8');
    expect(src).toMatch(/const prior = \/\^retry:\\d\+\/\.exec\(item\.why/);
    const repo = readFileSync(new URL('../../api/lib/repos/media-repo.js', import.meta.url), 'utf8');
    expect(repo).toMatch(/if \(n >= max\) continue;/);
  });
});

describe('public import progress', () => {
  it('totals, per source in import order, rate over 6 h and an ETA', async () => {
    const { shapeProgress } = await import('../../api/routes/media.js');
    const sources = [['curated', 'Curated talks'], ['hooper-dunbar', 'Hooper Dunbar'], ['local', 'Local recordings'], ['other', 'Other talks']];
    const rows = [{ source: 'local', total: 408, downloaded: 70, transcribed: 66, published: 60, failed: 4 }, { source: 'curated', total: 137, downloaded: 5, transcribed: 2, published: 2, failed: 0 }];
    const p = shapeProgress({ rows, published_6h: 30 }, sources, Date.parse('2026-10-23T00:00:00Z'));
    expect(p).toMatchObject({ total_targets: 545, downloaded: 75, transcribed: 68, published: 62, failed: 4, items_per_hour: 5 });
    expect(p.by_source.map((x) => x.source)).toEqual(['curated', 'local']);
    expect(p.eta_iso).toBe(new Date(Date.parse('2026-10-23T00:00:00Z') + (479 / 5) * 3600_000).toISOString());
    expect(shapeProgress({ rows, published_6h: 0 }, sources).eta_iso).toBeNull();
  });
});

describe('live steps and sources', () => {
  it('maps the pipeline stages to the named steps people see', async () => {
    const { stepsOf, sourceOfRank } = await import('../../api/routes/media.js');
    const st = stepsOf({ archive: { at: 'x', ms: 5000 }, grade: { at: 'x', ms: 2000 }, enhance: { at: 'x', ms: 1000 }, web: { at: 'x', ms: 500 } }, 'transcribe');
    expect(st.map((s) => [s.name, s.state])).toEqual([['download', 'done'], ['grade', 'done'], ['enhance', 'done'], ['transcribe', 'running'], ['align', 'running'], ['diarize', 'running'],
      ['cleanup', 'pending'], ['faithfulness', 'pending'], ['publish', 'pending'], ['subheaders', 'pending'], ['crossref', 'pending'], ['links', 'pending'], ['assess', 'pending'], ['moments', 'pending']]);
    expect(st[2].ms).toBe(1500);
    expect(stepsOf({}, 'archive', 'failed')[0].state).toBe('failed');
    expect([1005, 2100, 3950, 4100, 5200, 6001, null].map(sourceOfRank)).toEqual(['curated', 'hooper-dunbar', 'hands-uhj', 'local', 'local', 'other', 'other']);
  });
  it('registers the targets the queue skipped and ranks them within their own section', async () => {
    const { mediaRankJob } = await import('../../api/lib/ops/media-jobs.js');
    const { mkdtempSync, writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const d = mkdtempSync(join(tmpdir(), 'rank-'));
    writeFileSync(join(d, 'q.json'), JSON.stringify([{ tier: '1-curated', url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' }]));
    writeFileSync(join(d, 't.json'), JSON.stringify({ curated_sacred_traditions: [{ video_id: 'AAAAAAAAAAA' }, { video_id: 'BBBBBBBBBBB', url: 'u' }, { video_id: 'CCCCCCCCCCC', is_short: true }, { video_id: 'DDDDDDDDDDD', relation: 'about' }],
      hands_uhj: [{ video_id: 'EEEEEEEEEEE', duplicate_group: 'g' }, { video_id: 'FFFFFFFFFFF', duplicate_group: 'g' }] }));
    const created = [];
    const set = vi.fn();
    const repo = { findMediaByYoutube: async () => null, createMediaItem: async (x) => { created.push(x.youtube_id); return { id: created.length + 100 }; },
      rankRows: async () => [{ id: 101, source_kind: 'youtube', youtube_id: 'BBBBBBBBBBB' }, { id: 1, source_kind: 'youtube', youtube_id: 'AAAAAAAAAAA' }], setQueueRanks: set };
    const r = await mediaRankJob({ file: join(d, 'q.json'), talks: join(d, 't.json') }, { repo, listing: { speakerRole: () => null } });
    expect(created).toEqual(['BBBBBBBBBBB', 'EEEEEEEEEEE']);
    expect(r.registered).toBe(2);
    expect(set.mock.calls[0][0]).toEqual([{ id: 101, rank: 1901 }, { id: 1, rank: 1000 }]);
  });
});
