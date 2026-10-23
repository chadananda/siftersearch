// A published talk whose re-run fails stays published (10-23: blocked re-links took 15 talks off the catalogue).
import { describe, it, expect, vi } from 'vitest';
const upd = vi.fn(async () => ({}));
vi.mock('../../api/lib/repos/media-repo.js', async (orig) => ({ ...(await orig()), getMediaItem: vi.fn(async (id) => ({ id, slug: 's', state: id === 1 ? 'done' : 'transcribed', published_at: id === 1 ? '2026-10-22' : null })), updateMediaItem: (...a) => upd(...a) }));
vi.mock('../../api/lib/repos/activity-repo.js', () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(async () => null), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { mediaItemJob } from '../../api/lib/ops/media-jobs.js';

describe('a failed re-run', () => {
  const runItem = async () => { throw new Error('publish blocked: 1 text problem(s)'); };
  it('of a published talk keeps it published, the reason recorded', async () => {
    upd.mockClear();
    const r = await mediaItemJob({ id: 1, redo: ['update'] }, { runItem });
    expect(r.failed).toBe(true);
    expect(upd.mock.calls.at(-1)).toEqual([1, { state: 'done', why: 'update failed: publish blocked: 1 text problem(s)' }]);
  });
  it('of an unpublished talk fails it', async () => {
    upd.mockClear();
    await mediaItemJob({ id: 2 }, { runItem });
    expect(upd.mock.calls.at(-1)[1].state).toBe('failed');
  });
});
