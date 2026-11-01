// archive-import (approved items → library with "Donated by" provenance) and archive-copy (read-only drive → /tank/archives, verified).
// Real files in temp dirs; the archives repo and the queue are faked.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('../../api/lib/repos/archives-repo.js', () => ({ getDrive: vi.fn(), getDonor: vi.fn(), itemsToImport: vi.fn(), itemsForDedup: vi.fn(async () => []), markImported: vi.fn(), itemsImportedUnlinked: vi.fn(),
  setCustody: vi.fn(), upsertDonor: vi.fn(), upsertDrive: vi.fn() }));
vi.mock('../../api/lib/ops/media-jobs.js', () => ({ deweyMediaDir: () => '/x/media' }));
vi.mock('../../api/lib/ops/dewey-ingest-folder-job.js', () => ({ ingestDir: () => '/x/ingest' }));
import * as repo from '../../api/lib/repos/archives-repo.js';
import { importPlan, provenance, archiveImportJob } from '../../api/lib/ops/archive-import-job.js';
import { mountOf, sourceRefusal, tally, archiveCopyJob, runRsync } from '../../api/lib/ops/archive-copy-job.js';
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
  it('talks → media donors folder; documents → Dewey _approved (never _add-anyway, which bypasses the held check); the rest is skipped', () => {
    const d = { id: 'g', root: '/tank/archives/g' };
    expect(importPlan(d, { kind: 'talk', primary_rel: 'talks/a.mp3' }, dirs)).toEqual({ kind: 'talk', src: '/tank/archives/g/talks/a.mp3', dest: '/m/donors/g/talks/a.mp3' });
    expect(importPlan(d, { kind: 'scan', primary_rel: 'x/Book.PDF' }, dirs)).toMatchObject({ kind: 'book', dest: '/b/_approved/donors/g/x/Book.PDF' });
    expect(importPlan(d, { kind: 'scan', primary_rel: 'scan/p1.jpg' }, dirs).skip).toMatch(/page images/);
    expect(importPlan(d, { kind: 'photo', primary_rel: 'a.jpg' }, dirs).skip).toMatch(/talks and books only/);
    expect(importPlan(d, { kind: 'talk', primary_rel: '../../etc/passwd' }, dirs).skip).toMatch(/outside/);
  });
  it('provenance names the donor, drive, path and approval', () => {
    const p = provenance(drive(), { name: 'Jane Smith' }, { primary_rel: 'talks/a.mp3', title: 'a', decided_by: 'chad', decided_at: 't0', sample: { rec: { title: 'A Talk', year: 1957 } }, metadata: { catalog: { title: 'Real Talk', author: 'Ali' } } },
      { kind: 'talk', src: '/s' }, 't1');
    expect(p).toMatchObject({ provider: 'donor', label: 'Donated by Jane Smith', donor: 'smith', drive: 'golden-age', original_path: '/s', title: 'Real Talk', creator: 'Ali', catalog: { title: 'Real Talk', author: 'Ali' }, year: 1957, approved_at: 't0', imported_at: 't1' });
  });
  it('the Dewey markdown carries the provenance line', () => {
    expect(toMarkdown({ title: 'T', itemId: 3, provenance: 'Donated by Jane Smith' }, 'body')).toMatch(/provenance: "Donated by Jane Smith"\n/);
  });
});

describe('archiveImportJob', () => {
  it('links each approved file with its sidecar, marks it, queues media-scan + Dewey; reruns reuse the link; fills public links later', async () => {
    repo.getDrive.mockResolvedValue(drive());
    repo.getDonor.mockResolvedValue({ name: 'Jane Smith' });
    repo.itemsToImport.mockResolvedValue([{ id: 1, kind: 'talk', primary_rel: 'talks/a.mp3' }, { id: 2, kind: 'book', primary_rel: 'book.pdf', metadata: { probe: { class: 'born_digital', pages: 5 } } }, { id: 3, kind: 'photo', primary_rel: 'p.jpg' }]);
    repo.itemsImportedUnlinked.mockResolvedValue([{ id: 7, imported_ref: 'media:/m/x.mp3' }, { id: 8, imported_ref: 'dewey:abc' }, { id: 9, imported_ref: 'dewey:notyet' }]);
    const queue = vi.fn();
    const deps = { queue, sha: async () => 'sha-1', now: () => 'T', dirs: { mediaDir: join(out, 'm'), bookDir: join(out, 'b') },
      media: { findMediaBySource: async () => ({ slug: 'x-talk', state: 'done' }) },
      dewey: { findBySha: async (s) => (s === 'abc' ? { doc_id: 42, state: 'ingested' } : { state: 'gate' }) } };
    const r = await archiveImportJob({ drive: 'golden-age' }, deps);
    const talk = join(out, 'm/donors/golden-age/talks/a.mp3'), book = join(out, 'b/_approved/donors/golden-age/book.pdf');
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
  it('PDFs: unprobed wait; chapter files are listed not imported; a scan the library holds is skipped (held) or sent to a person (probably) BEFORE SLP; an image PDF is imported with image_pdf in its sidecar', async () => {
    const root2 = await mkdtemp(join(tmpdir(), 'drive2-'));
    for (const f of ['book.pdf', 'scan1.pdf', 'scan2.pdf', 'img.pdf']) await writeFile(join(root2, f), f);
    await mkdir(join(root2, 'bk')); await writeFile(join(root2, 'bk/27 William Henry Randall chap 26.pdf'), 'c');
    repo.getDrive.mockResolvedValue({ ...drive(), root: root2 }); repo.getDonor.mockResolvedValue({ name: 'Jane Smith' }); repo.itemsImportedUnlinked.mockResolvedValue([]);
    const probe = (cls) => ({ probe: { class: cls, pages: 90, text: `[page 1]\n${'word '.repeat(5)}`, meta_text: '', sampled: [1] } });
    repo.itemsToImport.mockResolvedValue([
      { id: 10, kind: 'scan', primary_rel: 'book.pdf' },
      { id: 11, kind: 'scan', primary_rel: 'bk/27 William Henry Randall chap 26.pdf', metadata: probe('scan') },
      { id: 12, kind: 'scan', primary_rel: 'scan1.pdf', metadata: { probe: { ...probe('scan').probe, text: `[page 1]\n${'sampled sentence '.repeat(40)}` }, catalog: { title: 'Held Book' } } },
      { id: 13, kind: 'scan', primary_rel: 'scan2.pdf', metadata: { ...probe('scan'), catalog: { title: 'Near Book' } } },
      { id: 14, kind: 'scan', primary_rel: 'img.pdf', metadata: { ...probe('image_pdf'), catalog: { title: 'Fresh Book' } } },
    ]);
    const check = async (id) => (id.title === 'Held Book' ? { verdict: 'held', candidates: [{ id: 5, title: 'Held Book', paragraph_count: 300 }] }
      : id.title === 'Near Book' ? { verdict: 'possible', candidates: [{ id: 6, title: 'Near Book (other)', paragraph_count: 300 }] } : { verdict: 'not-held', candidates: [] });
    const queue = vi.fn();
    const r = await archiveImportJob({ drive: 'golden-age' }, { queue, check, byIsbn: async () => [], sha: async () => 'sha-2', now: () => 'T', dirs: { mediaDir: join(out, 'm2'), bookDir: join(out, 'b2') }, media: {}, dewey: {} });
    expect(r.skipped).toEqual([{ id: 10, why: expect.stringMatching(/not probed yet/) }]);
    expect(Object.keys(r.chapter_sets)).toEqual(['bk/# william henry randall chap #']);
    expect(r.held).toEqual([expect.objectContaining({ id: 12, by: 'text', class: 'scan', candidate: '#5 Held Book' })]);
    expect(r.needs_person).toEqual([expect.objectContaining({ id: 13, class: 'scan', candidate: '#6 Near Book (other)' })]);
    expect(r.books).toEqual([expect.objectContaining({ id: 14 })]);
    expect(JSON.parse(await readFile(`${r.books[0].dest}.source.json`, 'utf8'))).toMatchObject({ image_pdf: true, pdf_class: 'image_pdf', pdf_pages: 90 });
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

// detached rsync: adopt a live one across a drain, start only when none is alive, read the exit status it left
describe('runRsync (detached)', () => {
  const setup = async () => { const d = join(await mkdtemp(join(tmpdir(), 'cp-')), 'drv'); await mkdir(`${d}.copy`, { recursive: true }); return { d, ctl: `${d}.copy` }; };
  it('starts a new rsync when none is alive, and returns done on exit 0', async () => {
    const { d, ctl } = await setup();
    const start = vi.fn(async () => { await writeFile(join(ctl, 'status'), '0\n'); return 4242; });
    expect(await runRsync('/src', d, () => false, { start, alive: async () => false, wait: async () => {} })).toBe('done');
    expect(start).toHaveBeenCalledWith('/src', d, ctl);
    await expect(stat(join(ctl, 'status'))).rejects.toThrow();
  });
  it('adopts a live rsync (no new start); a drain yields without killing it; the next run sees it finish', async () => {
    const { d, ctl } = await setup();
    await writeFile(join(ctl, 'pid'), '777');
    const start = vi.fn();
    const alive = async (pid) => pid === 777;
    expect(await runRsync('/src', d, () => true, { start, alive, wait: async () => {} })).toBe('stopped');
    expect(start).not.toHaveBeenCalled();
    expect(await readFile(join(ctl, 'pid'), 'utf8')).toBe('777');
    let polls = 0;
    expect(await runRsync('/src', d, () => false, { start, alive, wait: async () => { if (++polls === 2) await writeFile(join(ctl, 'status'), '0'); } })).toBe('done');
    expect(start).not.toHaveBeenCalled();
  });
  it('reads the status left while the service was down (no restart); nonzero exit throws with the log tail', async () => {
    const { d, ctl } = await setup();
    await writeFile(join(ctl, 'pid'), '5'); await writeFile(join(ctl, 'status'), '23'); await writeFile(join(ctl, 'log'), 'rsync: some files vanished\n');
    const start = vi.fn();
    await expect(runRsync('/src', d, () => false, { start, alive: async () => false })).rejects.toThrow(/rsync exit 23: rsync: some files vanished/);
    expect(start).not.toHaveBeenCalled();
    await expect(stat(join(ctl, 'pid'))).rejects.toThrow();
  });
  it('a stale pid (not alive, no status) is replaced by a new rsync; one that dies mid-watch throws and is forgotten', async () => {
    const { d, ctl } = await setup();
    await writeFile(join(ctl, 'pid'), '9');
    const start = vi.fn(async () => { await writeFile(join(ctl, 'status'), '0'); return 10; });
    expect(await runRsync('/src', d, () => false, { start, alive: async () => false, wait: async () => {} })).toBe('done');
    expect(start).toHaveBeenCalledTimes(1);
    await writeFile(join(ctl, 'pid'), '11');
    let up = true;
    await expect(runRsync('/src', d, () => false, { start, alive: async () => { const u = up; up = false; return u; }, wait: async () => {} })).rejects.toThrow(/died without an exit status/);
    await expect(stat(join(ctl, 'pid'))).rejects.toThrow();
  });
});
