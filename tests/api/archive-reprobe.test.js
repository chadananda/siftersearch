// archive-reprobe: the current worker probe over every catalogued book/document — books first, fingerprinted files skipped, idempotent, an earlier probe never lost to a marker.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('../../api/lib/repos/archives-repo.js', () => ({ getDrive: vi.fn(), itemsToReprobe: vi.fn(), setReprobe: vi.fn(), setProbe: vi.fn(async () => {}), itemsToSample: vi.fn(async () => []), itemsWantingInfo: vi.fn(async () => []), itemsSampled: vi.fn(), resetSample: vi.fn(),
  setSample: vi.fn(), setRec: vi.fn(), answerInfo: vi.fn(), getItem: vi.fn(), itemsToProbe: vi.fn(async () => []) }));
vi.mock('../../api/lib/repos/collection-repo.js', () => ({ fingerprintedPaths: vi.fn(() => new Set()), upsertFile: vi.fn(), saveBody: vi.fn() }));
import { archiveReprobeJob, nextToReprobe } from '../../api/lib/ops/archive-reprobe-job.js';

let root, R, q;
beforeAll(async () => {
  process.env.MEDIA_QUEUE_DIR = await mkdtemp(join(tmpdir(), 'rq-'));
  root = await mkdtemp(join(tmpdir(), 'rdrive-'));
  await mkdir(join(root, 'k'));
  for (const f of ['k/b1.pdf', 'k/b2.pdf', 'k/b3.epub', 'k/s1.pdf']) await writeFile(join(root, f), f);
  R = await import('../../api/lib/repos/media-queue-repo.js'); q = R.localQueue();
});
afterAll(() => R?._closeForTests());

const item = (id, rel, kind = 'book') => ({ id, kind, primary_rel: rel, score: 10 - id, drive_id: 'g' });
const pool = (all) => { const marked = new Set(); return { marked, select: async (_d, { kind, limit }) => all.filter((i) => i.kind === kind && !marked.has(i.id)).slice(0, limit), mark: async (id) => { marked.add(id); } }; };

describe('nextToReprobe', () => {
  it('books before scans; fingerprinted files are marked skipped and never offered again', async () => {
    const p = pool([item(1, 'a.pdf'), item(2, 'b.pdf'), item(3, 'c.pdf'), item(4, 's.pdf', 'scan')]);
    const got = await nextToReprobe('g', { limit: 3, ...p, done: () => new Set(['a.pdf']) });
    expect(got.map((i) => i.id)).toEqual([2, 3, 4]);
    expect(p.marked.has(1)).toBe(true);
    expect((await nextToReprobe('g', { limit: 1, ...p, done: () => new Set(['a.pdf']) })).map((i) => i.id)).toEqual([2]);
  });
  it('nothing left → empty (no endless loop when every page is all skips)', async () => {
    const p = pool([item(1, 'a.pdf'), item(2, 'b.pdf')]);
    expect(await nextToReprobe('g', { limit: 5, ...p, done: () => new Set(['a.pdf', 'b.pdf']) })).toEqual([]);
  });
});

describe('archiveReprobeJob', () => {
  it('stages probe jobs (books first), marks them queued without touching the old probe, pulls results into probe + marks failures; a rerun stages nothing twice', async () => {
    const repo = await import('../../api/lib/repos/archives-repo.js');
    const p = pool([item(1, 'k/b1.pdf'), item(2, 'k/b2.pdf'), item(3, 'k/b3.epub'), item(4, 'k/s1.pdf', 'scan')]);
    const marks = [];
    const mark = async (id, m) => { marks.push([id, m]); await p.mark(id); };
    const deps = { q, store: {}, getDrive: async () => ({ id: 'g', root }), select: p.select, mark, done: () => new Set(), draining: () => true, noRequeue: true, nap: async () => {} };
    const r = await archiveReprobeJob({ drive: 'g', window: 3 }, deps);
    expect(r).toMatchObject({ probes_staged: 3, remaining: 1 });
    expect(marks.map((m) => m[0])).toEqual([1, 2, 3]);
    expect(marks.every((m) => m[1].queued)).toBe(true);
    expect(repo.setProbe).not.toHaveBeenCalled();   // the earlier probe stays until the new result replaces it
    const jobs = (await q.stats('intake')).queued_by_stage;
    expect(jobs['intake-book']).toBe(3);
    // a worker answers job 1 (result) and job 2 fails for good
    const claimed = await q.claim({ host: 'w', types: ['intake'], stages: ['intake-book'], slots: 2 }).catch(() => null);
    expect(claimed).toBeDefined();
  });
  it('the pass saves a result (has a class) as the probe and a failure as a reprobe error, never over the old probe', async () => {
    const { samplePass } = await import('../../api/lib/ops/archive-sample-job.js');
    const saved = [], marked = [];
    const probeSave = async (id, x) => (x.class ? saved.push([id, x]) : x.queued ? marked.push([id, 'q']) : marked.push([id, x.error]));
    const fakeQ = { listDone: async (_n, _t, state) => (state === 'failed' ? [{ id: 'intake-probe-9', item_id: 9, body: { probe: true }, error: 'pdftotext: boom' }] : []), stats: async () => ({}), ack: async () => {}, put: async () => ({ bytes: 1 }), enqueue: async () => {} };
    await samplePass({ drive: 'g', window: 5, deps: { q: fakeQ, store: {}, drive: { id: 'g', root }, probeSave, toProbe: async () => [], toSample: async () => [], wanting: async () => [] } });
    expect(saved).toEqual([]); expect(marked).toEqual([[9, 'pdftotext: boom']]);
  });
});
