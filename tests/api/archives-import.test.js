// archive-import (approved items → library with "Donated by" provenance) and archive-copy (read-only drive → /tank/archives, verified).
// Real files in temp dirs; the archives repo and the queue are faked.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('../../api/lib/repos/archives-repo.js', () => ({ getDrive: vi.fn(), getDonor: vi.fn(), itemsToImport: vi.fn(), markImported: vi.fn(), itemsImportedUnlinked: vi.fn(),
  setCustody: vi.fn(), upsertDonor: vi.fn(), upsertDrive: vi.fn() }));
vi.mock('../../api/lib/ops/media-jobs.js', () => ({ deweyMediaDir: () => '/x/media' }));
vi.mock('../../api/lib/ops/dewey-ingest-folder-job.js', () => ({ ingestDir: () => '/x/ingest' }));
import * as repo from '../../api/lib/repos/archives-repo.js';
import { importPlan, provenance, archiveImportJob } from '../../api/lib/ops/archive-import-job.js';
import { mountOf, sourceRefusal, tally, archiveCopyJob } from '../../api/lib/ops/archive-copy-job.js';
import { toMarkdown } from '../../api/lib/dewey/intake.js';

let root, out;
const drive = () => ({ id: 'golden-age', donor_id: 'smith', label: 'Golden Age HD', root, status: 'reviewing' });
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'drive-'));
  out = await mkdtemp(join(tmpdir(), 'lib-'));
  await mkdir(join(root, 'talks'));
  await writeFile(join(root, 'talks/a.mp3'), 'audio');
  await writeFile(join(root, 'book.pdf'), 'pdf-bytes');
});
beforeEach(() => vi.clearAllMocks());

describe('importPlan', () => {
  const dirs = { mediaDir: '/m', bookDir: '/b' };
  it('talks → media donors folder; documents → Dewey _add-anyway; the rest is skipped', () => {
    const d = { id: 'g', root: '/tank/archives/g' };
    expect(importPlan(d, { kind: 'talk', primary_rel: 'talks/a.mp3' }, dirs)).toEqual({ kind: 'talk', src: '/tank/archives/g/talks/a.mp3', dest: '/m/donors/g/talks/a.mp3' });
    expect(importPlan(d, { kind: 'scan', primary_rel: 'x/Book.PDF' }, dirs)).toMatchObject({ kind: 'book', dest: '/b/_add-anyway/donors/g/x/Book.PDF' });
    expect(importPlan(d, { kind: 'scan', primary_rel: 'scan/p1.jpg' }, dirs).skip).toMatch(/page images/);
    expect(importPlan(d, { kind: 'photo', primary_rel: 'a.jpg' }, dirs).skip).toMatch(/talks and books only/);
    expect(importPlan(d, { kind: 'talk', primary_rel: '../../etc/passwd' }, dirs).skip).toMatch(/outside/);
  });
  it('provenance names the donor, drive, path and approval', () => {
    const p = provenance(drive(), { name: 'Jane Smith' }, { primary_rel: 'talks/a.mp3', title: 'a', decided_by: 'chad', decided_at: 't0', sample: { rec: { title: 'A Talk', year: 1957 } } },
      { kind: 'talk', src: '/s' }, 't1');
    expect(p).toMatchObject({ provider: 'donor', label: 'Donated by Jane Smith', donor: 'smith', drive: 'golden-age', original_path: '/s', title: 'A Talk', year: 1957, approved_at: 't0', imported_at: 't1' });
  });
  it('the Dewey markdown carries the provenance line', () => {
    expect(toMarkdown({ title: 'T', itemId: 3, provenance: 'Donated by Jane Smith' }, 'body')).toMatch(/provenance: "Donated by Jane Smith"\n/);
  });
});

describe('archiveImportJob', () => {
  it('links each approved file with its sidecar, marks it, queues media-scan + Dewey; reruns reuse the link; fills public links later', async () => {
    repo.getDrive.mockResolvedValue(drive());
    repo.getDonor.mockResolvedValue({ name: 'Jane Smith' });
    repo.itemsToImport.mockResolvedValue([{ id: 1, kind: 'talk', primary_rel: 'talks/a.mp3' }, { id: 2, kind: 'book', primary_rel: 'book.pdf' }, { id: 3, kind: 'photo', primary_rel: 'p.jpg' }]);
    repo.itemsImportedUnlinked.mockResolvedValue([{ id: 7, imported_ref: 'media:/m/x.mp3' }, { id: 8, imported_ref: 'dewey:abc' }, { id: 9, imported_ref: 'dewey:notyet' }]);
    const queue = vi.fn();
    const deps = { queue, sha: async () => 'sha-1', now: () => 'T', dirs: { mediaDir: join(out, 'm'), bookDir: join(out, 'b') },
      media: { findMediaBySource: async () => ({ slug: 'x-talk', state: 'done' }) },
      dewey: { findBySha: async (s) => (s === 'abc' ? { doc_id: 42, state: 'ingested' } : { state: 'gate' }) } };
    const r = await archiveImportJob({ drive: 'golden-age' }, deps);
    const talk = join(out, 'm/donors/golden-age/talks/a.mp3'), book = join(out, 'b/_add-anyway/donors/golden-age/book.pdf');
    expect(r.talks).toEqual([{ id: 1, dest: talk, how: 'linked' }]);
    expect(r.books[0]).toMatchObject({ id: 2, dest: book });
    expect(r.skipped).toEqual([{ id: 3, why: expect.stringMatching(/talks and books/) }]);
    expect((await stat(talk)).ino).toBe((await stat(join(root, 'talks/a.mp3'))).ino);   // a hard link: the archive's bytes, never rewritten
    expect(JSON.parse(await readFile(`${book}.source.json`, 'utf8'))).toMatchObject({ label: 'Donated by Jane Smith', rel_path: 'book.pdf' });
    expect(repo.markImported).toHaveBeenCalledWith(1, `media:${talk}`);
    expect(repo.markImported).toHaveBeenCalledWith(2, 'dewey:sha-1');
    expect(queue).toHaveBeenCalledWith('media-scan', { roots: [], paths: [talk] }, 'archive-import');
    expect(queue).toHaveBeenCalledWith('dewey-ingest-folder', { batch: 5 }, 'archive-import');
    expect(repo.setCustody).toHaveBeenCalledWith('golden-age', { status: 'importing' });
    expect(repo.markImported).toHaveBeenCalledWith(7, '/media/x-talk');
    expect(repo.markImported).toHaveBeenCalledWith(8, '/document/42');
    expect(r.linked).toBe(2);
    expect((await archiveImportJob({ drive: 'golden-age' }, deps)).talks[0].how).toBe('existed');
  });
  it('nothing approved → nothing queued', async () => {
    repo.getDrive.mockResolvedValue(drive()); repo.itemsToImport.mockResolvedValue([]); repo.itemsImportedUnlinked.mockResolvedValue([]);
    const queue = vi.fn();
    await archiveImportJob({ drive: 'golden-age' }, { queue, media: {}, dewey: {} });
    expect(queue).not.toHaveBeenCalled();
    expect(repo.setCustody).not.toHaveBeenCalled();
  });
});

describe('archive-copy', () => {
  const MOUNTS = '/dev/sda1 / ext4 rw 0 0\n/dev/sdb1 /mnt/donor\\040drive vfat ro,nosuid 0 0\n/dev/sdc1 /mnt/rw ext4 rw 0 0\n';
  it('finds the mount holding a path; refuses read-write drives, the archive itself and bare paths', () => {
    expect(mountOf('/mnt/donor drive/talks', MOUNTS)).toEqual({ mount: '/mnt/donor drive', ro: true });
    expect(sourceRefusal('/mnt/donor drive', MOUNTS)).toBeNull();
    expect(sourceRefusal('/mnt/rw/x', MOUNTS)).toMatch(/read-write/);
    expect(sourceRefusal('/home/chad/x', MOUNTS)).toMatch(/not a mounted drive/);
    expect(sourceRefusal('/tank/archives/g', MOUNTS)).toMatch(/already inside/);
    expect(sourceRefusal('/tank/incoming/g', MOUNTS)).toBeNull();
    expect(sourceRefusal('rel', MOUNTS)).toMatch(/absolute/);
  });
  it('tally counts files and bytes', async () => {
    expect(await tally(root)).toEqual({ files: 2, bytes: 'audio'.length + 'pdf-bytes'.length });
  });
  const P = { drive: 'golden-age', donor: 'smith', donorName: 'Jane Smith', label: 'HD', source: '/mnt/donor drive' };
  it('registers, copies, verifies, marks cataloged', async () => {
    repo.getDrive.mockResolvedValue(null);
    const copy = vi.fn(async () => 'done');
    const r = await archiveCopyJob(P, { mounts: async () => MOUNTS, copy, count: async () => ({ files: 2, bytes: 9 }), now: () => 'T', draining: () => false, root: '/a' });
    expect(repo.upsertDonor).toHaveBeenCalledWith({ id: 'smith', name: 'Jane Smith' });
    expect(repo.upsertDrive).toHaveBeenCalledWith(expect.objectContaining({ id: 'golden-age', root: '/a/golden-age', status: 'copying', source: '/mnt/donor drive' }));
    expect(copy).toHaveBeenCalledWith('/mnt/donor drive', '/a/golden-age', expect.any(Function));
    expect(repo.setCustody).toHaveBeenCalledWith('golden-age', { received_at: 'T' });
    expect(repo.setCustody).toHaveBeenCalledWith('golden-age', { copied_at: 'T', verified_at: 'T', status: 'cataloged' });
    expect(r).toMatchObject({ verified: true, files: 2 });
  });
  it('a short copy fails; a drain yields with resume; a read-write source is refused before anything is written', async () => {
    repo.getDrive.mockResolvedValue({ received_at: 'old' });
    let n = 0;
    await expect(archiveCopyJob(P, { mounts: async () => MOUNTS, copy: async () => 'done', count: async () => ({ files: n++ ? 1 : 2, bytes: 9 }), draining: () => false })).rejects.toThrow(/copy short/);
    expect(await archiveCopyJob(P, { mounts: async () => MOUNTS, copy: async () => 'stopped', draining: () => true })).toEqual({ drive: 'golden-age', yielded: true, resume: P });
    vi.clearAllMocks();
    await expect(archiveCopyJob({ ...P, source: '/mnt/rw' }, { mounts: async () => MOUNTS, draining: () => false })).rejects.toThrow(/read-write/);
    expect(repo.upsertDrive).not.toHaveBeenCalled();
  });
});
