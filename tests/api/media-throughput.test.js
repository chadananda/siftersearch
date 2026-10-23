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
  it('tower model work runs in two slots', async () => {
    const { towerSlot } = await import('../../api/lib/media/item.js');
    let live = 0, peak = 0;
    const job = () => towerSlot(async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 15)); live--; });
    await Promise.all([job(), job(), job(), job()]);
    expect(peak).toBe(2);
  });
  it('a failing item keeps its retry count (so transient retries stop after two)', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../api/lib/ops/media-jobs.js', import.meta.url), 'utf8');
    expect(src).toMatch(/const prior = \/\^retry:\\d\+\/\.exec\(item\.why/);
    const repo = readFileSync(new URL('../../api/lib/repos/media-repo.js', import.meta.url), 'utf8');
    expect(repo).toMatch(/if \(n >= max && !hostFault\) continue;/);   // a host-disk failure is retried regardless (media-disk.test.js)
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

describe('stage lanes (Chad 10-22: no internet dependencies on GPU processing)', () => {
  it('the feed keeps the compute and LLM queues deep, separately', async () => {
    const { mediaLanesFeedPass } = await import('../../api/lib/ops/media-jobs.js');
    const queue = vi.fn();
    const repo = { nextToProcess: vi.fn(async (n) => [{ id: 1 }, { id: 2 }, { id: 3 }].slice(0, n)), nextTranscribed: vi.fn(async (n) => [{ id: 9 }].slice(0, n)),
      updateMediaItem: vi.fn(), nextToDownload: async () => [], youtubeHeldSince: async () => ({ n: 0 }) };
    const ops = { pendingRuns: async (name) => (name === 'media-compute' ? [{}, {}] : name === 'media-llm' ? [] : []) };
    const r = await mediaLanesFeedPass({ repo, ops, queue, computeDepth: 4, llmDepth: 2 });
    expect(r).toMatchObject({ compute: [1, 2], llm: [9], compute_pending: 2, llm_pending: 0 });
    expect(queue.mock.calls.map((c) => c[0])).toEqual(['media-compute', 'media-compute', 'media-llm']);
    expect(repo.updateMediaItem.mock.calls).toContainEqual([9, { state: 'llm_queued' }]);
  });
  it('the compute job runs only the LAN stages and hands the item to the LLM lane', async () => {
    const { mediaComputeJob, COMPUTE_STAGES } = await import('../../api/lib/ops/media-jobs.js');
    expect(COMPUTE_STAGES).toEqual(['archive', 'grade', 'enhance', 'web', 'transcribe', 'diarize', 'trim']);
    expect(COMPUTE_STAGES.some((s) => ['correct', 'clean', 'describe', 'quotes', 'links', 'assess'].includes(s))).toBe(false);
  });
  it('a diarization with a job id is a detached boss job (re-attached after a restart)', async () => {
    const { diarize } = await import('../../api/lib/media/tools.js');
    const { mkdtempSync, writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const out = join(mkdtempSync(join(tmpdir(), 'dj-')), 'd.json');
    const asrJob = vi.fn(async (input, opts, o) => { writeFileSync(opts.output, JSON.stringify({ turns: [{ speaker: 'S1' }, { speaker: 'S2' }] })); return { reattached: true }; });
    const r = await diarize('/a.flac', out, { host: 'boss', job: 'talk-dz-1', deps: { asrJob } });
    expect(asrJob.mock.calls[0][1]).toEqual({ verb: 'diarize', output: out });
    expect(asrJob.mock.calls[0][2]).toMatchObject({ host: 'boss', job: 'talk-dz-1' });
    expect(r).toMatchObject({ speakers: 2, turns: 2, reattached: true });
  });
});

describe('failures never just sit (10-22 watchdog)', () => {
  it('every failure older than 30 min goes back to the queue, at most twice; a removed video does not', async () => {
    const db = await import('../../api/lib/db.js');
    db.queryAll.mockImplementationOnce(async (sql) => {
      expect(sql).toMatch(/Private video/);
      expect(sql).not.toMatch(/why LIKE '%timed out%'/);   // not only "transient" errors any more
      return [{ id: 1, why: 'grade exit 1: unbound variable', stage: 'grade' }, { id: 2, why: 'retry:2 IndexError' }, { id: 3, why: 'retry:1 x', stage: 'clean' }];
    });
    db.transaction.mockClear();
    const { retryTransientFailures } = await import('../../api/lib/repos/media-repo.js');
    expect(await retryTransientFailures()).toEqual([1, 3]);
    expect(db.transaction.mock.calls[0][0][0].args.slice(0, 2)).toEqual(['queued', 'retry:1 grade exit 1: unbound variable']);
    expect(db.transaction.mock.calls[1][0][0].args.slice(0, 2)).toEqual(['transcribed', 'retry:2 x']);   // an LLM-stage failure → the LLM lane
  });
  it('pipelineHealth: failures in the window by stage, running and backlog per lane', async () => {
    const db = await import('../../api/lib/db.js');
    db.queryOne.mockImplementationOnce(async () => ({ failed_window: 3, failed_total: 9, compute_running: 0, llm_running: 1, compute_backlog: 40, llm_backlog: 0, published_window: 0 }));
    db.queryAll.mockImplementationOnce(async () => [{ stage: 'enhance', n: 2 }, { stage: 'grade', n: 1 }]);
    const { pipelineHealth } = await import('../../api/lib/repos/media-repo.js');
    expect(await pipelineHealth()).toMatchObject({ failed: 3, failed_total: 9, failed_by_stage: { enhance: 2, grade: 1 }, compute_running: 0, compute_backlog: 40 });
  });
});

describe('feed the GPUs (10-22)', () => {
  it('keeps 3 × the compute workers in hand and claims each download run its own ids (two runs at once)', async () => {
    const { mediaLanesFeedPass } = await import('../../api/lib/ops/media-jobs.js');
    const queue = vi.fn();
    const upd = vi.fn();
    const repo = { nextToProcess: vi.fn(async (n) => Array.from({ length: n }, (_, i) => ({ id: 100 + i }))), nextTranscribed: async () => [], updateMediaItem: upd,
      nextToDownload: async () => [{ id: 7 }, { id: 8 }], youtubeHeldSince: async () => ({ n: 0 }) };
    const ops = { pendingRuns: async (name) => (name === 'media-fetch' ? [{ id: 1 }] : name === 'media-compute' ? [{}, {}] : []) };
    const r = await mediaLanesFeedPass({ repo, ops, queue, computeWorkers: 6, fetchRuns: 2 });
    expect(repo.nextToProcess).toHaveBeenCalledWith(16);   // 18 in hand − 2 pending
    expect(r.fetch).toEqual([7, 8]);
    expect(upd).toHaveBeenCalledWith(7, { state: 'scheduled', stage: 'download' });
    expect(queue.mock.calls.at(-1)).toEqual(['media-fetch', { ids: [7, 8] }, 'media-feed']);
  });
  it('a download run gives back the ids it did not reach (drain)', async () => {
    const upd = vi.fn(async () => ({}));
    let n = 0;
    const repo = { youtubeHeldSince: async () => ({ n: 0 }), getMediaItem: async (id) => ({ id }), updateMediaItem: upd };
    const r = await mediaFetchJob({ ids: [1, 2, 3], pauseMs: 0 }, { repo, runItem: async () => ({}), draining: () => n++ >= 1, nap: async () => {} });
    expect(r.downloaded).toEqual([1]);
    expect(upd).toHaveBeenCalledWith(2, { state: 'queued', stage: null });
    expect(upd).toHaveBeenCalledWith(3, { state: 'queued', stage: null });
  });
});

describe('the live view is what is running now', () => {
  it('items come from running runs, by id; none running → none shown', async () => {
    const db = await import('../../api/lib/db.js');
    const { liveItemsByIds } = await import('../../api/lib/repos/media-repo.js');
    db.queryAll.mockClear();
    expect(await liveItemsByIds([])).toEqual([]);
    expect(db.queryAll).not.toHaveBeenCalled();
    db.queryAll.mockImplementationOnce(async (sql, args) => { expect(sql).toMatch(/WHERE id IN \(\?,\?\)/); expect(args).toEqual([3, 4]); return [{ id: 3 }]; });
    expect((await liveItemsByIds([3, '4'])).map((x) => x.id)).toEqual([3]);
  });
});

describe('prep and ASR are separate lanes (10-22: ASR slots waited on tower prep)', () => {
  it('ASR runs are fed from the prepped buffer (2 × slots in hand); prep stops once the buffer is full', async () => {
    const { mediaLanesFeedPass } = await import('../../api/lib/ops/media-jobs.js');
    const queue = vi.fn(); const upd = vi.fn();
    const base = { nextTranscribed: async () => [], updateMediaItem: upd, nextToDownload: async () => [], youtubeHeldSince: async () => ({ n: 0 }) };
    const ops = { pendingRuns: async (name) => (name === 'media-asr' ? [{}, {}] : []) };
    // 6 slots: 12 ASR in hand wanted → 10 more; buffer 20 prepped (≥ 18) → no new prep
    const repo = { ...base, nextPrepped: vi.fn(async (n) => Array.from({ length: n }, (_, i) => ({ id: 200 + i }))), preppedCount: async () => 20, nextToProcess: vi.fn(async () => []) };
    const r = await mediaLanesFeedPass({ repo, ops, queue, computeWorkers: 6 });
    expect(repo.nextPrepped).toHaveBeenCalledWith(10);
    expect(r.asr).toHaveLength(10);
    expect(upd).toHaveBeenCalledWith(200, { state: 'asr_queued' });
    expect(repo.nextToProcess).toHaveBeenCalledWith(0);
    // an empty buffer → prep fills up to the depth
    const repo2 = { ...base, nextPrepped: async () => [], preppedCount: async () => 0, nextToProcess: vi.fn(async () => []) };
    await mediaLanesFeedPass({ repo: repo2, ops, queue, computeWorkers: 6 });
    expect(repo2.nextToProcess).toHaveBeenCalledWith(18);
  });
  it('prep ends prepped; ASR ends asr_done; diarize ends transcribed', async () => {
    const src = (await import('fs')).readFileSync(new URL('../../api/lib/ops/media-jobs.js', import.meta.url), 'utf8');
    expect(src).toMatch(/mediaComputeJob = .*PREP_STAGES, 'prepped'\)/);
    expect(src).toMatch(/mediaAsrJob = .*\['transcribe'\], 'asr_done'\)/);
    expect(src).toMatch(/mediaDiarJob = .*\['diarize', 'trim'\], 'transcribed'\)/);
  });
});

describe('re-runs by slug', () => {
  it('an audit names talks by slug: ids may be slugs', async () => {
    const { mediaItemJob } = await import('../../api/lib/ops/media-jobs.js');
    const queue = vi.fn();
    const repo = { getMediaBySlug: async (s) => (s === 'sears-prophecies-3' ? { id: 41 } : null) };
    const r = await mediaItemJob({ ids: ['sears-prophecies-3', '7', 'nope'], from: 'correct' }, { repo, queue });
    expect(r).toEqual({ queued: 2 });
    expect(queue.mock.calls.map((c) => c[1])).toEqual([{ id: 41, from: 'correct' }, { id: 7, from: 'correct' }]);
  });
});

describe('one run per item', () => {
  it('a re-run fan-out skips items with a run already queued or running', async () => {
    const { mediaItemJob } = await import('../../api/lib/ops/media-jobs.js');
    const queue = vi.fn();
    const r = await mediaItemJob({ ids: [1, 2], redo: ['links'] }, { queue, repo: {}, ops: { pendingRuns: async (n) => (n === 'media-llm' ? [{ params: { id: 2 } }] : []) } });
    expect(r).toEqual({ queued: 1, skipped_busy: [2] });
    expect(queue).toHaveBeenCalledTimes(1);
  });
});

describe('restore published talks a failed re-run took off (watchdog 23:49)', () => {
  it('failed + once catalogued → done, reason kept as "update failed: …"; re-runs by "problems"', async () => {
    const db = await import('../../api/lib/db.js');
    db.queryAll.mockImplementationOnce(async (sql) => { expect(sql).toMatch(/published_at IS NOT NULL OR stages_done LIKE '%,catalog,%'/); return [{ id: 5, why: 'retry:1 publish blocked: x' }]; });
    db.transaction.mockClear();
    const { restorePublished } = await import('../../api/lib/repos/media-repo.js');
    expect(await restorePublished()).toEqual([5]);
    expect(db.transaction.mock.calls[0][0][0].args.slice(0, 1)).toEqual(['update failed: publish blocked: x']);
    const { mediaItemJob } = await import('../../api/lib/ops/media-jobs.js');
    const queue = vi.fn();
    expect(await mediaItemJob({ ids: 'problems', redo: ['update'] }, { queue, repo: { publishedProblemIds: async () => [5, 6] } })).toEqual({ queued: 2 });
  });
});

describe('diarization has its own lane (10-23 04:29)', () => {
  it('asr_done items are fed to media-diar; diarize goes to aorus\'s GPU first (2), boss is the overflow (3)', async () => {
    const { mediaLanesFeedPass } = await import('../../api/lib/ops/media-jobs.js');
    const queue = vi.fn(); const upd = vi.fn();
    const repo = { nextAsrDone: vi.fn(async (n) => [{ id: 71 }, { id: 72 }].slice(0, n)), nextPrepped: async () => [], preppedCount: async () => 30, nextToProcess: async () => [],
      nextTranscribed: async () => [], updateMediaItem: upd, nextToDownload: async () => [], youtubeHeldSince: async () => ({ n: 0 }) };
    const r = await mediaLanesFeedPass({ repo, ops: { pendingRuns: async () => [] }, queue, computeWorkers: 6 });
    expect(r.diar).toEqual([71, 72]);
    expect(queue).toHaveBeenCalledWith('media-diar', { id: 71, priority: true }, 'media-feed');
    expect(upd).toHaveBeenCalledWith(71, { state: 'diar_queued' });
    const { pickDiarHost } = await import('../../api/lib/media/tools.js');
    process.env.MEDIA_ASR_HOST = 'boss'; process.env.MEDIA_GPU_HOST = 'aorus';
    expect(pickDiarHost(new Map())).toBe('aorus');   // its GPU first (10-23)
    expect(pickDiarHost(new Map([['aorus', 2]]))).toBe('boss');
    expect(pickDiarHost(new Map([['aorus', 2], ['boss', 3]]))).toBe('aorus');
    delete process.env.MEDIA_ASR_HOST; delete process.env.MEDIA_GPU_HOST;
  });
});
