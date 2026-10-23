// Throughput (Chad 10-22: one item at a time ≈ a month): downloads apart from processing, N items at once by rank, re-runs
// behind new items, the queue order curated → Dunbar → Hands/UHJ → local.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(async () => null), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { rankFor, mediaFetchJob, mediaFeedPass } from '../../api/lib/ops/media-jobs.js';

describe('queue order (Chad 10-22: "first please focus on the historical materials")', () => {
  it('historic recordings → Hands of the Cause → House of Justice → other historic speakers → modern scholars', async () => {
    const { tierOf } = await import('../../api/lib/ops/media-jobs.js');
    expect(tierOf({ source_kind: 'file', collection: 'Historic Recordings', path: "Baha'i/talks/historic-recordings/x.mp3" })).toBe(1);
    expect(tierOf({ source_kind: 'youtube', speaker: 'Martha Root', ytRole: 'Hand of the Cause' })).toBe(1);
    expect(tierOf({ source_kind: 'youtube', speaker: 'William Sears', ytRole: 'Hand of the Cause' })).toBe(2);
    expect(tierOf({ source_kind: 'file', speaker: 'Furútan', role: 'hand' })).toBe(2);
    expect(tierOf({ source_kind: 'youtube', speaker: 'Hooper Dunbar', ytRole: 'UHJ member' })).toBe(3);
    expect(tierOf({ source_kind: 'file', speaker: 'Earl', role: null })).toBe(4);
    expect(tierOf({ source_kind: 'youtube', speaker: 'Steven Phelps', ytRole: 'scholar' })).toBe(5);
  });
  it('oldest first within a tier', async () => {
    const { rankOf } = await import('../../api/lib/ops/media-jobs.js');
    expect(rankOf(2, 1957, 9)).toBeLessThan(rankOf(2, 1985, 1));
    expect(rankOf(2, 9999, 1)).toBeLessThan(rankOf(3, 1950, 1));
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
    expect([1.5e7, 2.1e7, 3.2e7, 4.1e7, 5.3e7, null].map(sourceOfRank)).toEqual(['historic', 'hands', 'uhj', 'historic-speakers', 'scholars', 'scholars']);
  });
  it('registers every target (no Shorts, no "about" videos, one per duplicate group) and ranks by tier', async () => {
    const { mediaRankJob } = await import('../../api/lib/ops/media-jobs.js');
    const { mkdtempSync, writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const d = mkdtempSync(join(tmpdir(), 'rank-'));
    writeFileSync(join(d, 't.json'), JSON.stringify({ curated_sacred_traditions: [{ video_id: 'AAAAAAAAAAA', speaker: 'Steven Phelps' }, { video_id: 'CCCCCCCCCCC', is_short: true }, { video_id: 'DDDDDDDDDDD', relation: 'about' }],
      hands_uhj: [{ video_id: 'EEEEEEEEEEE', duplicate_group: 'g', speaker: 'William Sears', role: 'Hand of the Cause', title: 'Talk 1972' }, { video_id: 'FFFFFFFFFFF', duplicate_group: 'g' }] }));
    const created = [];
    const set = vi.fn();
    const repo = { findMediaByYoutube: async () => null, createMediaItem: async (x) => { created.push(x.youtube_id); return { id: created.length + 100 }; },
      rankRows: async () => [{ id: 101, source_kind: 'youtube', youtube_id: 'EEEEEEEEEEE' }, { id: 1, source_kind: 'youtube', youtube_id: 'AAAAAAAAAAA' }], setQueueRanks: set };
    const r = await mediaRankJob({ talks: join(d, 't.json') }, { repo, listing: { speakerRole: () => null } });
    expect(created).toEqual(['EEEEEEEEEEE', 'AAAAAAAAAAA']);
    const [sears, phelps] = set.mock.calls[0][0];
    expect(Math.floor(sears.rank / 1e7)).toBe(2);
    expect(Math.floor(phelps.rank / 1e7)).toBe(5);
    expect(r.tiers).toMatchObject({ hands: 1, scholars: 1 });
  });
});

describe('stage counters', () => {
  it('the catalogue records completed stages in the form the progress counters match', async () => {
    const { stagesDone } = await import('../../api/lib/media/item.js');
    const s = stagesDone({ archive: { at: 'x' }, enhance: { at: 'x' }, transcribe: { at: 'x' }, quotes: { at: 'x' }, links: {} });
    expect(s).toBe(',archive,enhance,transcribe,quotes,');
    const { readFileSync } = await import('fs');
    const repo = readFileSync(new URL('../../api/lib/repos/media-repo.js', import.meta.url), 'utf8');
    for (const st of ['enhance', 'transcribe', 'quotes']) {
      const pat = new RegExp(`stages_done LIKE '%,${st},%'`);
      expect(repo).toMatch(pat);
      expect(s.includes(`,${st},`)).toBe(true);
    }
  });
});

describe('the process strip', () => {
  it('groups live items by stage, most recent first, capped', async () => {
    const { byStage } = await import('../../api/routes/media.js');
    const items = [{ slug: 'a', stage: 'transcribe', started_at: '2026-10-23T01:00' }, { slug: 'b', stage: 'transcribe', started_at: '2026-10-23T02:00' },
      { slug: 'c', stage: 'archive', started_at: 'x' }, { slug: 'd', stage: 'quotes', started_at: 'x' }, { slug: 'e', stage: 'update', started_at: 'x' }, { slug: 'f', stage: 'mystery' }];
    const s = byStage(items, 1);
    expect(s.transcribe).toEqual({ count: 2, items: [expect.objectContaining({ slug: 'b' })] });
    expect([s.import.count, s.quotes.count, s.publish.count, s.moments.count]).toEqual([1, 1, 1, 0]);
  });
});
