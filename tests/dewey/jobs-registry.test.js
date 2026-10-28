// Dewey job registry (Chad 10-28 Phase 1 A/B/F): state machine, idempotency, retries, parent roll-up, caps, kill switch, status words.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memDb } from './helpers.js';

let rig;
vi.mock('../../api/lib/db.js', () => ({ get query() { return rig.mod.query; }, get queryOne() { return rig.mod.queryOne; }, get queryAll() { return rig.mod.queryAll; }, get transaction() { return rig.mod.transaction; } }));
const R = await import('../../api/lib/dewey/jobs/registry.js');
const repo = await import('../../api/lib/repos/dewey-jobs-repo.js');
const { statusFor, statusLine } = await import('../../api/lib/dewey/jobs/status.js');
const { canMove } = await import('../../api/lib/dewey/jobs/states.js');
const reg = R.makeRegistry(repo);

beforeEach(() => { rig = memDb(); delete process.env.DEWEY_V2; delete process.env.DEWEY_GLOBAL_USD; });

describe('state machine', () => {
  it('allows the forward path and refuses illegal moves', () => {
    expect(canMove('received', 'fetching')).toBe(true);
    expect(canMove('processing', 'awaiting-decision')).toBe(true);
    expect(canMove('published', 'processing')).toBe(false);
    expect(canMove('failed', 'received')).toBe(false);
  });
  it('a finished job stays finished and an illegal move throws', async () => {
    const { job } = await reg.startJob({ kind: 'fetch', by: 'a@b.c', params: { url: 'https://x.org/a.pdf' } });
    await reg.advance(job.id, 'fetching'); await reg.advance(job.id, 'inspecting'); await reg.advance(job.id, 'processing'); await reg.advance(job.id, 'published', { result: { ok: 1 } });
    expect((await reg.advance(job.id, 'processing')).state).toBe('published');
    const j2 = (await reg.startJob({ kind: 'fetch', by: 'a@b.c', params: { url: 'https://x.org/b.pdf' } })).job;
    await reg.advance(j2.id, 'fetching');
    await expect(reg.advance(j2.id, 'awaiting-decision')).rejects.toThrow(/illegal/);
  });
});

describe('idempotency', () => {
  it('the same request twice is one job; a failed one can be asked again', async () => {
    const a = await reg.startJob({ kind: 'fetch', by: 'A@b.c (email)', params: { url: R.canonicalUrl('https://X.org/a.pdf#frag?utm_source=q') } });
    const b = await reg.startJob({ kind: 'fetch', by: 'a@b.c', params: { url: R.canonicalUrl('https://x.org/a.pdf') } });
    expect(a.created).toBe(true); expect(b.created).toBe(false); expect(b.job.id).toBe(a.job.id);
    await reg.advance(a.job.id, 'failed', { error: 'boom' });
    const c = await reg.startJob({ kind: 'fetch', by: 'a@b.c', params: { url: 'https://x.org/a.pdf' } });
    expect(c.created).toBe(true);
  });
  it('canonicalUrl drops tracking, fragment and trailing slash', () => {
    expect(R.canonicalUrl('https://Example.org/a/?utm_medium=x&b=1#top')).toBe('https://example.org/a?b=1');
  });
});

describe('retries', () => {
  it('retries with backoff until max_attempts, then fails', async () => {
    const { job } = await reg.startJob({ kind: 'fetch', by: 'a@b.c', params: { url: 'https://x.org/c' }, maxAttempts: 2 });
    await repo.updateJob(job.id, { attempts: 1 }); await reg.advance(job.id, 'fetching');
    const r1 = await reg.fail(job.id, new Error('timeout'));
    expect(r1.state).toBe('received'); expect(r1.next_run_at).toBeTruthy();
    await repo.updateJob(job.id, { attempts: 2 }); await reg.advance(job.id, 'fetching');
    expect((await reg.fail(job.id, new Error('timeout'))).state).toBe('failed');
  });
});

describe('parent roll-up', () => {
  it('counts children, waits while any is active, parks for a decision, then finishes', async () => {
    const p = (await reg.startJob({ kind: 'archive', by: 'a@b.c', params: { name: 'x.zip' } })).job;
    await reg.advance(p.id, 'fetching'); await reg.advance(p.id, 'processing');
    const kids = [];
    for (let i = 0; i < 4; i++) kids.push((await reg.startJob({ kind: 'file', by: 'a@b.c', parentId: p.id, key: `k${i}`, params: { name: `f${i}.pdf` } })).job);
    await reg.advance(kids[0].id, 'deduping'); await reg.advance(kids[0].id, 'skipped', { result: { reason: 'duplicate' } });
    await reg.advance(kids[1].id, 'processing'); await reg.advance(kids[1].id, 'awaiting-decision', { question: { text: 'add?' } });
    await reg.advance(kids[2].id, 'processing'); await reg.advance(kids[2].id, 'published', { result: { outcome: 'added' } });
    let cur = await repo.getJob(p.id);
    expect(cur.state).toBe('processing'); expect(cur.counts).toMatchObject({ found: 4, dupes: 1, added: 1, awaiting: 1, active: 1 });
    await reg.advance(kids[3].id, 'failed', { error: 'unreadable' });
    cur = await repo.getJob(p.id);
    expect(cur.state).toBe('awaiting-decision'); expect(cur.question.text).toMatch(/1 work is new/);
    await reg.advance(kids[1].id, 'processing'); await reg.advance(kids[1].id, 'published');
    cur = await repo.getJob(p.id);
    expect(cur.state).toBe('published'); expect(cur.counts).toMatchObject({ added: 2, dupes: 1, failed: 1 }); expect(cur.finished_at).toBeTruthy();
  });
});

describe('caps, global ceiling and the valve', () => {
  it('refuses past the daily job cap with a plain reason; admins get 5x', async () => {
    for (let i = 0; i < 20; i++) expect((await reg.startJob({ kind: 'fetch', by: 'u@x.org', params: { i } })).created).toBe(true);
    const r = await reg.startJob({ kind: 'fetch', by: 'u@x.org', params: { i: 99 } });
    expect(r.refused).toBe('cap'); expect(r.reason).toMatch(/limit \(20 jobs; 20 used\)/);
    for (let i = 0; i < 21; i++) expect((await reg.startJob({ kind: 'fetch', by: 'chadananda@gmail.com', params: { i } })).created).toBe(true);
  });
  it('DEWEY_V2=0 and the paused flag refuse new work', async () => {
    process.env.DEWEY_V2 = '0';
    expect((await reg.startJob({ kind: 'fetch', by: 'u@x.org', params: { a: 1 } })).refused).toBe('disabled');
    delete process.env.DEWEY_V2;
    await repo.setFlag('paused', '1');
    expect((await reg.startJob({ kind: 'fetch', by: 'u@x.org', params: { a: 2 } })).refused).toBe('disabled');
  });
  it('spend: the 80% note fires once, the ceiling pauses everything', async () => {
    process.env.DEWEY_GLOBAL_USD = '10';
    const notes = []; const r2 = R.makeRegistry(repo, { sendNote: async (g) => notes.push(g) });
    const { job } = await r2.startJob({ kind: 'fetch', by: 'u@x.org', params: { a: 3 } });
    await r2.addCost(job.id, 'u@x.org', 7); expect(notes).toHaveLength(0);
    await r2.addCost(job.id, 'u@x.org', 1.5); expect(notes).toHaveLength(1);
    await r2.addCost(job.id, 'u@x.org', 0.2); expect(notes).toHaveLength(1);
    await r2.addCost(job.id, 'u@x.org', 2); expect(await repo.getFlag('paused')).toMatch(/ceiling/);
    expect((await r2.startJob({ kind: 'fetch', by: 'v@x.org', params: { a: 4 } })).refused).toBe('disabled');
    expect((await repo.getJob(job.id)).cost_usd).toBeCloseTo(10.7);
  });
});

describe('status in words', () => {
  it('reads the registry: counts, waiting for a worker, awaiting decision', async () => {
    const p = (await reg.startJob({ kind: 'archive', by: 'a@b.c', params: { name: 'pamphlets.zip' } })).job;
    expect((await statusFor('a@b.c')).text).toMatch(/pamphlets\.zip.*received|queued|waiting/i);
    await reg.advance(p.id, 'processing', { counts: { found: 38, checked: 31, dupes: 4, awaiting: 3, added: 24 } });
    const s = await statusFor('A@B.C');
    expect(s.text).toMatch(/38 files; 31 checked, 4 already in the library/);
    expect((await statusFor('someone@else.org')).text).toMatch(/Nothing is in progress/);
  });
  it('another person cannot read my job by id', async () => {
    const p = (await reg.startJob({ kind: 'fetch', by: 'a@b.c', params: { url: 'https://x.org/z' } })).job;
    expect((await statusFor('b@b.c', { jobId: p.id })).jobs).toEqual([]);
    expect(statusLine({ kind: 'fetch', state: 'fetching', params: { url: 'https://x.org/z' }, counts: { fetched_bytes: 5 * 1024 ** 2, total_bytes: 10 * 1024 ** 2 } }, [])).toMatch(/5 MB of 10 MB/);
  });
});
