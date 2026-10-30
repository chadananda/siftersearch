// archive-sample job: first-minute clips of candidate talks → R2, recorded on the item; errors recorded too so reruns move on. Deps injected.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/repos/archives-repo.js', () => ({ getDrive: vi.fn(), itemsToSample: vi.fn(), setSample: vi.fn() }));
import { archiveSampleJob, itemPath, clipKey, SAMPLE_SECS } from '../../api/lib/ops/archive-sample-job.js';

describe('itemPath', () => {
  it('keeps paths inside the drive', () => expect(itemPath('/tank/archives/g', 'a/b.mp3')).toBe('/tank/archives/g/a/b.mp3'));
  it('refuses escapes and empties', () => {
    expect(itemPath('/tank/archives/g', '../../etc/passwd')).toBeNull();
    expect(itemPath('/tank/archives/g', '')).toBeNull();
  });
});

describe('archiveSampleJob', () => {
  const deps = (items, demux) => {
    const saved = {}, put = vi.fn(async () => 1234);
    return { saved, put, d: {
      getDrive: async () => ({ id: 'g', root: '/tank/archives/g' }),
      store: { put },
      demux,
      itemsToSample: async () => items,
      setSample: async (id, s) => { saved[id] = s; },
    } };
  };

  it('clips each talk to R2 and records key, size and length', async () => {
    const { saved, put, d } = deps([{ id: 7, primary_rel: 'talks/x.mp3' }], async () => ({ file: '/nonexistent/x.mp3', ext: 'mp3' }));
    const out = await archiveSampleJob({ drive: 'g' }, d);
    expect(out).toMatchObject({ tried: 1, clipped: 1, failed: 0, bytes: 1234 });
    expect(put).toHaveBeenCalledWith(clipKey('g', 7, 'mp3'), '/nonexistent/x.mp3');
    expect(saved[7].clip).toMatchObject({ key: 'intake/g/7.mp3', secs: SAMPLE_SECS, bytes: 1234 });
  });

  it('records failures (bad path, no audio) without stopping', async () => {
    const { saved, d } = deps([{ id: 1, primary_rel: '../x' }, { id: 2, primary_rel: 'v.avi' }], async () => null);
    const out = await archiveSampleJob({ drive: 'g' }, d);
    expect(out).toMatchObject({ tried: 2, clipped: 0, failed: 2 });
    expect(saved[1].clip.error).toMatch(/outside/);
    expect(saved[2].clip.error).toMatch(/no audio/);
  });

  it('needs a drive and a store', async () => {
    await expect(archiveSampleJob({})).rejects.toThrow(/drive/);
    const { d } = deps([], null);
    await expect(archiveSampleJob({ drive: 'g' }, { ...d, store: null })).rejects.toThrow(/R2/);
  });
});
