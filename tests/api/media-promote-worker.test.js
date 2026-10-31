// promoteWorker (cloud.js): validates the digest + evidence, keeps other accepted settings, records the replaced image, atomic write.
import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promoteWorker, acceptedWorker } from '../../api/lib/media/cloud.js';

const img = (c) => `ghcr.io/chadananda/sifter-media-worker@sha256:${c.repeat(64)}`;

describe('promoteWorker', () => {
  it('refuses a tag or missing evidence', async () => {
    const f = join(await mkdtemp(join(tmpdir(), 'acc-')), 'a.json');
    expect((await promoteWorker({ image: 'ghcr.io/chadananda/sifter-media-worker:latest', evidence: 'x'.repeat(30) }, f)).error).toMatch(/sha256/);
    expect((await promoteWorker({ image: img('a') }, f)).error).toMatch(/evidence/);
  });
  it('replaces the image, keeps settings, drops a stale home build map', async () => {
    const f = join(await mkdtemp(join(tmpdir(), 'acc-')), 'a.json');
    await writeFile(f, JSON.stringify({ image: img('a'), aorus_accepted_at: '2026-10-26', max_inflight_per_pod: 8, home_image: { aorus: 'old' } }));
    const r = await promoteWorker({ image: img('b'), evidence: 'full talk on aorus, dfn+diarize on cuda', quiet_hosts: ['aorus'] }, f, new Date('2026-10-30T12:00:00Z'));
    expect(r.ok).toBe(true);
    const a = JSON.parse(await readFile(f, 'utf8'));
    expect(a).toMatchObject({ image: img('b'), previous_image: img('a'), max_inflight_per_pod: 8, quiet_hosts: ['aorus'], aorus_accepted_at: '2026-10-30T12:00:00.000Z' });
    expect(a.home_image).toBeUndefined();
    expect((await acceptedWorker(f)).image).toBe(img('b'));
  });
});
