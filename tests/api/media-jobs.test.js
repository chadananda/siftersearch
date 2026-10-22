// media-scan: new files and YouTube URLs become queued items; a file already held (same sha256) or a YouTube id already
// held is not added twice; one item job is queued at a time and the scan re-queues itself behind it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
}));
vi.mock('../../api/lib/repos/activity-repo.js', () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock('../../api/lib/repos/ops-report-repo.js', () => ({ enqueue: vi.fn() }));
import { mediaScanJob, mediaItemJob } from '../../api/lib/ops/media-jobs.js';

beforeEach(() => { store.items = []; });

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
  it('a bot check holds the item instead of failing it', async () => {
    store.items.push({ id: 1, state: 'scheduled', source_kind: 'youtube', source_ref: 'u' });
    const runItem = vi.fn(async () => { throw Object.assign(new Error('bot check'), { code: 'BOT_CHECK' }); });
    await expect(mediaItemJob({ id: 1 }, { runItem })).rejects.toThrow('bot check');
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
