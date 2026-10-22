// RAM-disk Qdrant flush/restore (storage plan §6, R14; scripts/ops/qram.mjs — committed, not installed).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { isDirty, toPrune, newestComplete, restoreArgs, flush, restore } from '../../scripts/ops/qram.mjs';

afterEach(() => vi.unstubAllGlobals());

describe('qram pure logic', () => {
  it('dirty when never flushed, points changed, or storage written since', () => {
    expect(isDirty(undefined, { points: 1, mtimeMs: 1 })).toBe(true);
    expect(isDirty({ points: 5, mtimeMs: 100 }, { points: 5, mtimeMs: 100 })).toBe(false);
    expect(isDirty({ points: 5, mtimeMs: 100 }, { points: 6, mtimeMs: 100 })).toBe(true);
    expect(isDirty({ points: 5, mtimeMs: 100 }, { points: 5, mtimeMs: 101 })).toBe(true);
  });
  it('keeps the two newest snapshots', () => {
    const s = [{ name: 'a', creation_time: '2026-10-01T00:00:00' }, { name: 'c', creation_time: '2026-10-03T00:00:00' }, { name: 'b', creation_time: '2026-10-02T00:00:00' }];
    expect(toPrune(s)).toEqual(['a']);
    expect(toPrune(s.slice(0, 2))).toEqual([]);
  });
  it('restores only from a complete snapshot (has .checksum), newest first', () => {
    expect(newestComplete({ hype: [{ name: 'h1.snapshot', mtimeMs: 1 }, { name: 'h1.snapshot.checksum', mtimeMs: 1 }, { name: 'h2.snapshot', mtimeMs: 2 }] })).toEqual({ hype: 'h1.snapshot' });
    expect(newestComplete({ t: [{ name: 'x.snapshot', mtimeMs: 1 }] })).toEqual({});
  });
  it('never restores over a collection that already has storage', () => {
    expect(restoreArgs({ snapshotsDir: '/s', snapshots: { hype: 'h.snapshot', t_ar: 't.snapshot' }, present: ['hype'] }))
      .toEqual(['--snapshot', '/s/t_ar/t.snapshot:t_ar']);
  });
});

describe('qram flush/restore against a fake qdrant-hot', () => {
  it('snapshots only changed collections, prunes to 2, records state; restore lists missing ones', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qram-'));
    const storage = join(root, 'storage'), snaps = join(root, 'snaps');
    for (const c of ['hype', 't_ar']) { mkdirSync(join(storage, 'collections', c, 'seg'), { recursive: true }); writeFileSync(join(storage, 'collections', c, 'seg', 'f'), 'x'); }
    mkdirSync(snaps, { recursive: true });
    utimesSync(join(storage, 'collections', 't_ar', 'seg', 'f'), 1000, 1000);
    writeFileSync(join(snaps, 'state.json'), JSON.stringify({ t_ar: { points: 7, mtimeMs: 1000 * 1000 } }));
    const calls = [];
    vi.stubGlobal('fetch', async (url, { method = 'GET' } = {}) => {
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      calls.push(`${method} ${path}`);
      const res = (result) => ({ ok: true, json: async () => ({ result }) });
      if (path === '/collections') return res({ collections: [{ name: 'hype' }, { name: 't_ar' }] });
      if (path === '/collections/hype') return res({ points_count: 10 });
      if (path === '/collections/t_ar') return res({ points_count: 7 });
      if (path.startsWith('/collections/hype/snapshots?')) return res({ name: 'hype-3.snapshot', size: 2e9 });
      if (path === '/collections/hype/snapshots') return res([1, 2, 3].map((i) => ({ name: `hype-${i}.snapshot`, creation_time: `2026-10-0${i}` })));
      return res(true);
    });
    const lines = [];
    expect(await flush({ storage, snapshotsDir: snaps, log: (l) => lines.push(l) })).toEqual({ failed: 0 });
    expect(calls).toContain('POST /collections/hype/snapshots?wait=true');
    expect(calls).not.toContain('POST /collections/t_ar/snapshots?wait=true');
    expect(calls).toContain('DELETE /collections/hype/snapshots/hype-1.snapshot?wait=true');
    expect(JSON.parse(readFileSync(join(snaps, 'state.json'), 'utf8')).hype).toMatchObject({ points: 10, snapshot: 'hype-3.snapshot' });
    expect(lines.some((l) => /t_ar: clean/.test(l))).toBe(true);
    mkdirSync(join(snaps, 'concepts'));
    writeFileSync(join(snaps, 'concepts', 'c.snapshot'), 'x'); writeFileSync(join(snaps, 'concepts', 'c.snapshot.checksum'), 'x');
    expect(restore({ storage, snapshotsDir: snaps })).toEqual(['--snapshot', `${join(snaps, 'concepts', 'c.snapshot')}:concepts`]);
  });
});
