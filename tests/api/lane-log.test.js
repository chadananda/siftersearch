// Lane event log (11-03): append, size rotation, never throws, filtered read; the admin endpoint filter.
import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, readdir, chmod } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import Fastify from 'fastify';
import { laneLog, readLaneLog } from '../../api/lib/media/lane-log.js';

vi.mock('../../api/lib/auth.js', () => ({ requireInternal: async () => {} }));   // the guard is covered elsewhere; this tests the route's filter
const tmp = () => mkdtemp(join(tmpdir(), 'lane-log-'));

describe('laneLog', () => {
  it('appends one JSON line with ISO at + ms + kind + fields', async () => {
    const file = join(await tmp(), 'media-lane.jsonl');
    await laneLog('rent', { name: 'p1', ok: true }, { file, now: () => 1_700_000_000_000 });
    const row = JSON.parse((await readFile(file, 'utf8')).trim());
    expect(row).toEqual({ at: new Date(1_700_000_000_000).toISOString(), ms: 1_700_000_000_000, kind: 'rent', name: 'p1', ok: true });
  });
  it('rotates by size and keeps at most `keep` files, newest first on read', async () => {
    const dir = await tmp(), file = join(dir, 'media-lane.jsonl');
    for (let i = 0; i < 30; i++) await laneLog('pass', { i, pad: 'x'.repeat(100) }, { file, maxBytes: 600, keep: 3, now: () => 1000 + i });
    const files = (await readdir(dir)).sort();
    expect(files).toEqual(['media-lane.jsonl', 'media-lane.jsonl.1', 'media-lane.jsonl.2']);
    const rows = await readLaneLog({ file, keep: 3, limit: 1000 });
    expect(rows.at(-1).i).toBe(29);
    expect(rows.map((r) => r.i)).toEqual([...rows.map((r) => r.i)].sort((a, b) => a - b));   // oldest first
    expect(rows.length).toBeLessThan(30);   // the oldest rotated out
  });
  it('never throws into the caller (unwritable path)', async () => {
    const dir = await tmp(); await writeFile(join(dir, 'blocker'), 'x');
    await expect(laneLog('pass', {}, { file: join(dir, 'blocker', 'sub', 'x.jsonl') })).resolves.toBeUndefined();
  });
  it('is a no-op under vitest without a file (tests never write the real log)', async () => {
    await expect(laneLog('pass', {})).resolves.toBeUndefined();
  });
  it('readLaneLog filters by kind list and since', async () => {
    const file = join(await tmp(), 'l.jsonl');
    for (const [k, ms] of [['rent', 1], ['rent_refused', 2], ['move', 3], ['rent', 4]]) await laneLog(k, {}, { file, now: () => ms });
    expect((await readLaneLog({ file, kind: 'rent,rent_refused' })).map((r) => r.ms)).toEqual([1, 2, 4]);
    expect((await readLaneLog({ file, since: 3 })).map((r) => r.ms)).toEqual([3, 4]);
    expect((await readLaneLog({ file, limit: 1 })).map((r) => r.ms)).toEqual([4]);
  });
});

describe('GET /ops/media/log', () => {
  it('returns the filtered rows (since + kind + limit)', async () => {
    const file = join(await tmp(), 'l.jsonl'), prev = process.env.MEDIA_LANE_LOG; process.env.MEDIA_LANE_LOG = file;
    try {
      const now = Date.now();
      await laneLog('rent', { n: 1 }, { file, now: () => now - 7 * 3600_000 }); await laneLog('rent', { n: 2 }, { file, now: () => now - 1000 });
      await laneLog('move', { n: 3 }, { file, now: () => now - 500 });
      const app = Fastify(); await app.register((await import('../../api/routes/media-ops.js')).default);
      const res = await app.inject({ method: 'GET', url: '/ops/media/log?since=6h&kind=rent&limit=10' });
      expect(res.statusCode).toBe(200);
      expect(res.json().rows.map((r) => r.n)).toEqual([2]);
      expect((await app.inject({ method: 'GET', url: '/ops/media/log?kind=rent,move' })).json().rows.map((r) => r.n)).toEqual([1, 2, 3]);
      expect((await app.inject({ method: 'GET', url: '/ops/media/log?since=nonsense' })).json().error).toMatch(/since/);
    } finally { if (prev === undefined) delete process.env.MEDIA_LANE_LOG; else process.env.MEDIA_LANE_LOG = prev; }
  });
});
