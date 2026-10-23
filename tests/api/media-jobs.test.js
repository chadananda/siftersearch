// media-scan: new files and YouTube URLs become queued items; a file already held (same sha256) or a YouTube id already
// held is not added twice; one item job is queued at a time and the scan re-queues itself behind it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
process.env.MEDIA_FEED = '0';   // these cover the legacy one-at-a-time scan chain (the feed loop is the default)
const store = { items: [] };
vi.mock('../../api/lib/repos/media-repo.js', () => ({
  createMediaItem: vi.fn(async (f) => { const it = { id: store.items.length + 1, state: 'queued', ...f }; store.items.push(it); return it; }),
  findMediaBySha: vi.fn(async (h) => store.items.find((i) => i.sha256 === h && i.state !== 'duplicate') || null),
  findMediaBySource: vi.fn(async (p) => store.items.find((i) => i.source_ref === p) || null),
  findMediaByYoutube: vi.fn(async (id) => store.items.find((i) => i.youtube_id === id) || null),
  getMediaItem: vi.fn(async (id) => store.items.find((i) => i.id === id)),
  updateMediaItem: vi.fn(async (id, f) => Object.assign(store.items.find((i) => i.id === id), f)),
  pendingMedia: vi.fn(async (n) => store.items.filter((i) => ['queued', 'running'].includes(i.state)).slice(0, n)),
  vocabularyNames: vi.fn(async () => []),
  youtubeHeldSince: vi.fn(async () => ({ n: store.cooling ? 1 : 0 })),
  releaseHeldYoutube: vi.fn(async () => 0),
}));
vi.mock('../../api/lib/repos/activity-repo.js', () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock('../../api/lib/repos/ops-report-repo.js', () => ({ enqueue: vi.fn() }));
import { mediaScanJob, mediaItemJob } from '../../api/lib/ops/media-jobs.js';

beforeEach(() => { store.items = []; store.cooling = false; });

describe('media-scan', () => {
  it('adds new recordings, records duplicates, queues one item and itself', async () => {
    const queue = vi.fn();
    const files = [{ path: '/m/a.mp3' }, { path: '/m/a-copy.mp3' }, { path: '/m/b.mp3' }];
    const sha = vi.fn(async (p) => (p.includes('a') ? 'same' : 'other'));
    const r = await mediaScanJob({ roots: ['/m'], urls: ['https://youtu.be/dQw4w9WgXcQ', 'https://example.com/x'], batch: 1 }, { list: async () => files, sha, queue });
    expect(r.added).toHaveLength(3);   // the YouTube item, a.mp3, b.mp3
    expect(r.held.map((h) => h.why)).toEqual(['not a YouTube video URL', 'duplicate of 2']);
    expect(store.items.find((i) => i.source_ref === '/m/a-copy.mp3').state).toBe('duplicate');
    expect(queue.mock.calls.map((c) => c[0])).toEqual(['media-item', 'media-scan']);
    expect(r.remaining).toBe(2);
    // a second scan adds nothing
    const again = await mediaScanJob({ roots: ['/m'], urls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'], batch: 1 }, { list: async () => files, sha, queue: vi.fn() });
    expect(again.added).toHaveLength(0);
  });
  it('reslug removes an unpublished item\'s folder and archives it again; a published one keeps its slug', async () => {
    process.env.MEDIA_ARCHIVE_ROOT = '/tank/media/library';
    store.items.push({ id: 7, state: 'running', slug: 'bad-name', dir: '/tank/media/library/bahai/x/bad-name' }, { id: 8, state: 'done', slug: 'kept', dir: '/tank/media/library/bahai/x/kept' });
    const rm = vi.fn(async () => {}), runItem = vi.fn(async () => ({ slug: 'good-name', done: ['archive'] }));
    await mediaItemJob({ id: 7, reslug: true }, { runItem, rm });
    expect(rm).toHaveBeenCalledWith('/tank/media/library/bahai/x/bad-name', { recursive: true, force: true });
    expect(runItem.mock.calls[0][0]).toMatchObject({ slug: null, dir: null });
    expect(runItem.mock.calls[0][1]).toMatchObject({ from: 'archive' });
    await expect(mediaItemJob({ id: 8, reslug: true }, { runItem, rm })).rejects.toThrow('keeps its slug');
    store.items.find((i) => i.id === 8).doc_id = 55;
    const retire = vi.fn(async () => ({}));
    await mediaItemJob({ id: 8, reslug: true, force: true }, { runItem, rm, retire });
    expect(retire).toHaveBeenCalledWith([55]);
    expect(rm.mock.calls.some((c) => String(c[0]).endsWith('/Media/kept.md'))).toBe(true);
  });
  it('while YouTube is cooling down after a bot check, only local files are started', async () => {
    store.cooling = true;
    store.items.push({ id: 1, state: 'queued', source_kind: 'youtube', source_ref: 'u' }, { id: 2, state: 'queued', source_kind: 'file', source_ref: '/m/x.mp3' });
    const queue = vi.fn();
    const r = await mediaScanJob({ roots: [], batch: 1, queueOnly: true }, { queue });
    expect(r.queued).toEqual([2]);
    expect(r.remaining).toBe(0);
  });
  it('a resumed run (params carry the stage it stopped at) never redoes its from / reslug', async () => {
    store.items.push({ id: 12, state: 'running', slug: 'new-name', dir: '/tank/media/library/bahai/x/new-name', doc_id: 9 });
    const rm = vi.fn(), retire = vi.fn(), runItem = vi.fn(async () => ({ slug: 'new-name', done: ['quotes'] }));
    await mediaItemJob({ id: 12, reslug: true, force: true, from: 'web', stage: 'quotes' }, { runItem, rm, retire });
    expect(rm).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
    expect(runItem.mock.calls[0][1]).toMatchObject({ from: null });
  });
  it('ids fan out to one media-item run each (\'done\' = every published item); a resumed run drops `redo`', async () => {
    const queue = vi.fn();
    expect(await mediaItemJob({ ids: [9, 28], from: 'thumb' }, { queue })).toEqual({ queued: 2 });
    expect(queue.mock.calls).toEqual([['media-item', { id: 9, from: 'thumb' }], ['media-item', { id: 28, from: 'thumb' }]]);
    const q2 = vi.fn();
    await mediaItemJob({ ids: 'done', redo: ['headings', 'render'] }, { queue: q2, repo: { doneItemIds: async () => [3] } });
    expect(q2.mock.calls[0]).toEqual(['media-item', { id: 3, redo: ['headings', 'render'] }]);
    store.items.push({ id: 14, state: 'running', slug: 'r', dir: '/tank/media/library/bahai/x/r' });
    const runItem = vi.fn(async () => ({ slug: 'r', done: [] }));
    await mediaItemJob({ id: 14, redo: ['headings'], stage: 'render' }, { runItem });
    expect(runItem.mock.calls[0][1]).toMatchObject({ redo: null });
  });
  it('a failing item is recorded on the item, not thrown (no alert mail per odd file)', async () => {
    store.items.push({ id: 13, state: 'scheduled', source_kind: 'file', source_ref: '/m/odd.wma' });
    const r = await mediaItemJob({ id: 13 }, { runItem: vi.fn(async () => { throw new Error('ffmpeg exit 1: Invalid data'); }) });
    expect(r).toMatchObject({ id: 13, failed: true });
    expect(store.items.find((i) => i.id === 13)).toMatchObject({ state: 'failed', why: 'ffmpeg exit 1: Invalid data' });
  });
  it('a bot check holds the item instead of failing it', async () => {
    store.items.push({ id: 1, state: 'scheduled', source_kind: 'youtube', source_ref: 'u' });
    const runItem = vi.fn(async () => { throw Object.assign(new Error('bot check'), { code: 'BOT_CHECK' }); });
    expect(await mediaItemJob({ id: 1 }, { runItem })).toMatchObject({ id: 1, held: true });   // not thrown: no failure alert
    expect(store.items[0].state).toBe('held');
  });
});

describe('media drop folder', () => {
  it('a new file queues one media-scan of the folder; nothing new or a scan already waiting queues nothing', async () => {
    const { mediaDropPass } = await import('../../api/lib/ops/media-jobs.js');
    const queue = vi.fn();
    const list = async () => [{ path: '/tank/dewey-ingest/media/a.mp3' }, { path: '/tank/dewey-ingest/media/b.mp3' }];
    expect(await mediaDropPass({ list, known: async (p) => p.endsWith('a.mp3'), pending: async () => [], queue })).toEqual({ new: 1, queued: true });
    expect(queue).toHaveBeenCalledWith('media-scan', { roots: ['/tank/dewey-ingest/media'], batch: 1 }, 'media-drop');
    expect(await mediaDropPass({ list, known: async () => true, pending: async () => [], queue: vi.fn() })).toEqual({ new: 0, queued: false });
    const q2 = vi.fn();
    expect(await mediaDropPass({ list, known: async () => false, pending: async () => [{ params: { roots: ['/tank/dewey-ingest/media'] } }], queue: q2 })).toEqual({ new: 2, queued: false });
    expect(q2).not.toHaveBeenCalled();
  });
});

describe('media-playback', () => {
  it('sets every item\'s level and re-renders each published item', async () => {
    const { mediaPlaybackJob } = await import('../../api/lib/ops/media-jobs.js');
    const repo = { setPlayback: vi.fn(async () => 4), doneItemIds: vi.fn(async () => [1, 2]) };
    const queue = vi.fn();
    expect(await mediaPlaybackJob({ level: 'full' }, { repo, queue })).toEqual({ level: 'full', changed: 4, rerendered: 2 });
    expect(queue.mock.calls).toEqual([['media-item', { id: 1, redo: ['update'] }, 'media-playback'], ['media-item', { id: 2, redo: ['update'] }, 'media-playback']]);
    await expect(mediaPlaybackJob({ level: 'loud' }, { repo, queue })).rejects.toThrow('level must be');
  });
});

describe('media-grade back-fill', () => {
  it('grades each processed item once, counts grades, yields to a drain with its resume point', async () => {
    const { mediaGradeJob } = await import('../../api/lib/ops/media-jobs.js');
    const repo = { doneItemIds: async () => [1, 2, 3], getMediaItem: async (id) => ({ id, dir: `/d/${id}` }) };
    const runItem = vi.fn(async (it) => ({ meta: { quality: { overall: it.id === 2 ? 'D' : 'B' } } }));
    expect(await mediaGradeJob({}, { repo, runItem, draining: () => false })).toMatchObject({ graded: 3, grades: { B: 2, D: 1 } });
    expect(runItem.mock.calls[0][1]).toEqual({ only: ['grade'] });
    let n = 0;
    expect(await mediaGradeJob({}, { repo, runItem, draining: () => ++n > 1 })).toMatchObject({ yielded: true, resume: { after: 1 } });
  });
});
