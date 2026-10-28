// media-supersede: the guard, plan/apply/revert/idempotency on a real temp folder, and the repo's guarded UPDATE.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(async () => ({})), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn(async () => ({})) }));
import { supersedeGuard, sampleOverlap, mediaSupersede } from '../../api/lib/media/supersede.js';

const TEXT = Array.from({ length: 120 }, (_, i) => `word${i % 37}${i}`).join(' ');
describe('guard', () => {
  it('passes the same talk, refuses a different one, needs evidence, force needs a reason', () => {
    expect(supersedeGuard({ held: { duration_s: 3000, text: TEXT }, next: { duration_s: 3100, sample_text: TEXT.split(' ').slice(10, 80).join(' ') } })).toMatchObject({ ok: true, overlap: 1 });
    const other = supersedeGuard({ held: { duration_s: 3000, text: TEXT }, next: { duration_s: 3100, sample_text: Array.from({ length: 80 }, (_, i) => `zz${i}`).join(' ') } });
    expect(other.ok).toBe(false); expect(other.problems.join()).toMatch(/overlap/);
    expect(supersedeGuard({ held: { duration_s: 3000, text: TEXT }, next: { duration_s: 9000, overlap: 0.9 } }).problems.join()).toMatch(/ratio/);
    expect(supersedeGuard({ held: { duration_s: 3000, text: TEXT }, next: {} }).ok).toBe(false);
    expect(supersedeGuard({ held: { duration_s: 3000, text: TEXT }, next: { duration_s: 3000, overlap: 0.1 }, force: true, reason: 'short' }).ok).toBe(false);
    expect(supersedeGuard({ held: { duration_s: 3000, text: TEXT }, next: { duration_s: 3000, overlap: 0.1 }, force: true, reason: 'Chad confirmed by ear' })).toMatchObject({ ok: true, forced: true });
    expect(sampleOverlap('too short', TEXT)).toBeNull();
  });
});

describe('plan / apply / revert on a temp talk', () => {
  let dir, root, rows, queued, purged, repo, deps, newFile;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sup-'));
    dir = join(root, 'library', 'talk'); await mkdir(join(dir, 'original'), { recursive: true }); await mkdir(join(dir, 'web'), { recursive: true });
    await writeFile(join(dir, 'original', 'old.mp3'), 'OLD-AUDIO'); await writeFile(join(dir, 'web', 'talk.ogg'), 'OLD-OGG'); await writeFile(join(dir, 'transcript.md'), TEXT);
    await writeFile(join(dir, 'meta.json'), JSON.stringify({ slug: 'talk', title: 'T', speaker: 'S', duration_s: 3000, audio_version: 3, stages: { archive: { at: 1 }, update: { at: 2 } }, source: { path: '/x/old.mp3', sha256: 'oldsha', bytes: 9 }, original: 'original/old.mp3', web_original: { ogg: 'x' } }));
    await mkdir(join(root, 'inbox'), { recursive: true }); newFile = join(root, 'inbox', 'new.mp3'); await writeFile(newFile, 'NEW-AUDIO');
    rows = { id: 7, slug: 'talk', dir, sha256: 'oldsha', source_ref: '/x/old.mp3', duration_s: 3000, state: 'done' }; queued = []; purged = [];
    repo = { getMediaBySlug: async () => rows, supersedeMediaSource: vi.fn(async (id, f) => { rows = { ...rows, source_ref: f.source_ref, sha256: f.sha256 }; return rows; }) };
    deps = { repo, ops: { pendingRuns: async () => [] }, queue: async (n, p) => { queued.push([n, p]); }, purge: async (s) => { purged.push(s); }, roots: [join(root, 'inbox')], sha256: async () => 'newsha', now: () => 'T0' };
  });
  const evidence = () => ({ duration_s: 3100, sample_text: TEXT.split(' ').slice(5, 90).join(' ') });

  it('plan changes nothing; apply snapshots v1, repoints, queues media-item from archive, purges', async () => {
    const plan = await mediaSupersede({ action: 'plan', slug: 'talk', newSource: newFile, evidence: evidence() }, deps);
    expect(plan).toMatchObject({ status: 'plan', snapshot: 'v1' }); expect(queued).toEqual([]);
    const r = await mediaSupersede({ action: 'apply', slug: 'talk', newSource: newFile, evidence: evidence(), reason: 'complete version', by: 'chad', write: true }, deps);
    expect(r.status).toBe('applied');
    expect(await readFile(join(dir, 'original-superseded', 'v1', 'original', 'old.mp3'), 'utf8')).toBe('OLD-AUDIO');
    expect(await readFile(join(dir, 'original-superseded', 'v1', 'web', 'talk.ogg'), 'utf8')).toBe('OLD-OGG');
    const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'));
    expect(meta).toMatchObject({ slug: 'talk', title: 'T', speaker: 'S', audio_version: 4, supersede_pending: { n: 1, sha256: 'newsha' } });
    expect(meta.supersedes[0]).toMatchObject({ n: 1, by: 'chad', reason: 'complete version', from: { sha256: 'oldsha' }, to: { sha256: 'newsha' } });
    expect(meta.web_original).toBeUndefined(); expect(meta.stages).toEqual({});
    expect(repo.supersedeMediaSource).toHaveBeenCalledWith(7, expect.objectContaining({ source_ref: expect.stringContaining('new.mp3'), sha256: 'newsha', expect_sha256: 'oldsha' }));
    expect(queued).toEqual([['media-item', { id: 7, from: 'archive' }]]); expect(purged).toEqual(['talk']);
  });

  it('is idempotent and refuses a different talk, a busy talk, and a path outside the media roots', async () => {
    await mediaSupersede({ action: 'apply', slug: 'talk', newSource: newFile, evidence: evidence(), reason: 'complete version', write: true }, deps);
    expect(await mediaSupersede({ action: 'apply', slug: 'talk', newSource: newFile, evidence: evidence(), reason: 'complete version', write: true }, deps)).toMatchObject({ status: 'already' });
    expect(queued).toHaveLength(1);
    const wrong = await mediaSupersede({ action: 'apply', slug: 'talk', newSource: newFile, evidence: { duration_s: 3100, overlap: 0.05 }, reason: 'x', write: true }, { ...deps, sha256: async () => 'other' });
    expect(wrong).toMatchObject({ status: 'refused' }); expect(wrong.why).toMatch(/overlap/);
    expect(await mediaSupersede({ action: 'apply', slug: 'talk', newSource: newFile, evidence: evidence(), reason: 'again please', write: true }, { ...deps, sha256: async () => 'third', ops: { pendingRuns: async (n) => (n === 'media-item' ? [{ params: { id: 7 } }] : []) } })).toMatchObject({ status: 'refused', why: expect.stringMatching(/queued or running/) });
    expect((await mediaSupersede({ action: 'plan', slug: 'talk', newSource: '/etc/hosts', evidence: evidence() }, deps)).why).toMatch(/under/);
  });

  it('revert restores v1 (original, meta, web), keeps the superseded state as v2, bumps the audio key and re-ingests', async () => {
    await mediaSupersede({ action: 'apply', slug: 'talk', newSource: newFile, evidence: evidence(), reason: 'complete version', write: true }, deps);
    await writeFile(join(dir, 'original', 'new.mp3'), 'NEW-AUDIO'); await writeFile(join(dir, 'web', 'talk.ogg'), 'NEW-OGG');
    queued.length = 0;
    const r = await mediaSupersede({ action: 'revert', version: 1, slug: 'talk', reason: 'new one is worse', by: 'chad', write: true }, deps);
    expect(r).toMatchObject({ status: 'reverted', snapshot: 'v2' });
    expect(await readFile(join(dir, 'original', 'old.mp3'), 'utf8')).toBe('OLD-AUDIO'); expect(existsSync(join(dir, 'original', 'new.mp3'))).toBe(false);
    expect(await readFile(join(dir, 'web', 'talk.ogg'), 'utf8')).toBe('OLD-OGG');
    expect(await readFile(join(dir, 'original-superseded', 'v2', 'web', 'talk.ogg'), 'utf8')).toBe('NEW-OGG');
    const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'));
    expect(meta.supersede_pending).toBeUndefined(); expect(meta.audio_version).toBeGreaterThan(4); expect(meta.supersedes.at(-1)).toMatchObject({ reverted_to: 1 });
    expect(queued).toEqual([['media-item', { id: 7, redo: ['ingest', 'catalog', 'update'] }]]);
    expect(await readdir(join(dir, 'original-superseded'))).toEqual(['v1', 'v2']);
    expect(await mediaSupersede({ action: 'revert', version: 1, slug: 'talk', write: true }, deps)).toMatchObject({ status: 'already' });
  });
});

describe('repo: supersedeMediaSource is one guarded UPDATE', () => {
  it('updates only while the row holds the expected sha and checks the result', async () => {
    const db = await import('../../api/lib/db.js');
    db.queryOne.mockResolvedValueOnce({ id: 7, sha256: 'newsha', meta: null });
    const { supersedeMediaSource } = await import('../../api/lib/repos/media-repo.js');
    const row = await supersedeMediaSource(7, { source_ref: '/a/new.mp3', sha256: 'newsha', duration_s: 10, expect_sha256: 'oldsha' });
    expect(row.sha256).toBe('newsha');
    const [[stmts]] = db.transaction.mock.calls.slice(-1).map((c) => [c[0]]);
    expect(stmts[0].sql).toMatch(/UPDATE media_items SET source_ref = \?, sha256 = \?.*WHERE id = \? AND \(sha256 IS \?/);
    expect(stmts[0].args.slice(0, 2)).toEqual(['/a/new.mp3', 'newsha']);
    db.queryOne.mockResolvedValueOnce({ id: 7, sha256: 'someoneelse', meta: null });
    await expect(supersedeMediaSource(7, { source_ref: '/a/n2.mp3', sha256: 'n2', expect_sha256: 'oldsha' })).rejects.toThrow(/changed under/);
    await expect(supersedeMediaSource(7, { sha256: 'x' })).rejects.toThrow(/needs source_ref/);
  });
});
