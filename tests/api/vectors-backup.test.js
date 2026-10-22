// vectors-backup (storage plan R1): a real online backup of a temp SQLite store through the worker thread, its verification,
// and the job's rotate / refuse-while-writing / unknown-store behaviour.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { backupVectorStore, checkFor, restarted, verdict, adoptable, readHeader } from '../../api/lib/repos/vector-backup-repo.js';
import { vectorsBackupJob, storesToDo, backupPaths, abortCopy } from '../../api/lib/ops/vectors-backup-job.js';
import { INDEX_LANES, INDEX_REPORTS } from '../../api/lib/ops/index-reports.js';

function store(dir, rows = 3000) {
  const f = join(dir, 'vectors.db');
  const db = new Database(f);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE units (point_id INTEGER PRIMARY KEY, v BLOB)');
  const ins = db.prepare('INSERT INTO units VALUES (?, ?)');
  db.transaction(() => { for (let i = 0; i < rows; i++) ins.run(i, Buffer.alloc(512, i % 251)); })();
  db.close();
  return f;
}

describe('vector-backup-repo', () => {
  it('copies a WAL store page for page, as one self-contained file, and verifies it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vb-'));
    const src = store(dir);
    const r = await backupVectorStore({ src, dest: join(dir, 'copy.db'), pagesPerStep: 50, pauseMs: 1, check: 'integrity_check' });
    expect(r.verdict).toEqual({ ok: true, problems: [] });
    expect(r.pageCount).toBe(r.copiedPages);
    expect(r.check).toEqual(['ok']);
    const copy = new Database(join(dir, 'copy.db'), { readonly: true });
    expect(copy.prepare('SELECT COUNT(*) n FROM units').get().n).toBe(3000);
    expect(copy.pragma('journal_mode', { simple: true })).toBe('delete');
    copy.close();
  });
  it('fails (does not finish) when told to abort', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vb-'));
    const src = store(dir, 20000);
    await expect(backupVectorStore({ src, dest: join(dir, 'copy.db'), pagesPerStep: 1, pauseMs: 50 }, { shouldAbort: () => true }))
      .rejects.toThrow(/aborted/);
  });
  it('restart detection, check choice and verdict', () => {
    expect(restarted(null, { totalPages: 10, remainingPages: 9 })).toBe(false);
    expect(restarted({ totalPages: 10, remainingPages: 5 }, { totalPages: 10, remainingPages: 9 })).toBe(true);
    expect(restarted({ totalPages: 10, remainingPages: 5 }, { totalPages: 11, remainingPages: 4 })).toBe(true);
    expect(restarted({ totalPages: 10, remainingPages: 5 }, { totalPages: 10, remainingPages: 4 })).toBe(false);
    expect(checkFor(1e9)).toBe('integrity_check');
    expect(checkFor(240e9)).toBe('sample');
    expect(checkFor(240e9, { check: 'integrity' })).toBe('integrity_check');
    expect(verdict({ copiedPages: 4, pageCount: 4, pageSize: 4096, fileBytes: 16384, check: ['ok'] }).ok).toBe(true);
    expect(verdict({ copiedPages: 4, pageCount: 3, pageSize: 4096, fileBytes: 12288, check: ['ok'] }).ok).toBe(false);
    expect(verdict({ copiedPages: 4, pageCount: 4, pageSize: 4096, fileBytes: 16384, check: ['row 3 missing'] }).ok).toBe(false);
  });
});

describe('vectors-backup job', () => {
  it('is an indexer job in its OWN lane — it never blocks phrase indexing', () => {
    expect(INDEX_REPORTS['vectors-backup']).toBeTypeOf('function');
    expect(INDEX_LANES.backup).toEqual(['vectors-backup']);
    expect(INDEX_LANES.index).not.toContain('vectors-backup');
  });
  it('an update drain (SIGHUP) lets the store in progress finish; a stop aborts it', () => {
    expect(abortCopy(false, null)).toBe(false);
    expect(abortCopy(true, 'SIGHUP')).toBe(false);
    expect(abortCopy(true, 'SIGTERM')).toBe(true);
    expect(abortCopy(true, 'SIGINT')).toBe(true);
  });
  it('unknown stores are refused', () => expect(() => storesToDo({ stores: ['phrases'] })).toThrow(/unknown store/));
  it('backs up, rotates the previous copy to vectors.prev.db and writes a manifest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vb-'));
    const src = store(dir, 500);
    const dest = join(dir, 'out');
    const deps = { storeMap: { t: { src, writers: ['phrase-index'] } }, running: async () => [], log: () => {} };
    const a = await vectorsBackupJob({ destDir: dest }, deps);
    const p = backupPaths(dest, 't');
    expect(a.done[0]).toMatchObject({ store: 't', check: 'integrity_check', check_result: ['ok'] });
    expect(existsSync(p.current) && !existsSync(p.prev) && !existsSync(p.partial)).toBe(true);
    writeFileSync(p.partial, 'stale partial from a killed run');
    await vectorsBackupJob({ destDir: dest }, deps);
    expect(existsSync(p.prev) && existsSync(p.current) && !existsSync(p.partial)).toBe(true);
    expect(JSON.parse(readFileSync(p.manifest, 'utf8')).pages).toBeGreaterThan(0);
  });
  it('skips (never waits for or fails on) a store whose writer is running; backs up the others', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vb-'));
    const deps = { storeMap: { t: { src: store(dir, 10), writers: ['phrase-index'] }, u: { src: store(mkdtempSync(join(tmpdir(), 'vb-')), 10), writers: ['hype-index'] } },
      running: async (w) => (w === 'phrase-index' ? [{ id: 7, status: 'running' }] : []), log: () => {} };
    const r = await vectorsBackupJob({ destDir: join(dir, 'out') }, deps);
    expect(r.skipped).toEqual([{ store: 't', reason: 'phrase-index #7 writing it' }]);
    expect(r.done.map((d) => d.store)).toEqual(['u']);
  });
  it('a writer starting mid-copy skips the store', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vb-'));
    const deps = { storeMap: { t: { src: store(dir, 10), writers: [] } }, running: async () => [], log: () => {},
      backup: async () => { throw new Error('source changed during the backup (2 restarts): a writer is running'); } };
    expect((await vectorsBackupJob({ destDir: join(dir, 'out') }, deps)).skipped).toEqual([{ store: 't', reason: 'a writer started mid-copy' }]);
  });
  it('big stores get the sample check (seconds), small ones a full scan; explicit params win', () => {
    expect(checkFor(240e9)).toBe('sample');
    expect(checkFor(20e9)).toBe('quick_check');
    expect(checkFor(1e9)).toBe('integrity_check');
    expect(checkFor(240e9, { check: 'quick' })).toBe('quick_check');
  });
  it('a complete partial left by an interrupted run is ADOPTED and verified, never copied again', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vb-'));
    const src = store(dir, 800);
    const dest = join(dir, 'out');
    const p = backupPaths(dest, 't');
    mkdirSync(p.dir, { recursive: true });
    // the copy finished, then the verification was killed: the .partial and its completion marker remain
    const first = await backupVectorStore({ src, dest: p.partial, check: 'sample', pauseMs: 0 });
    expect(first.verdict.ok).toBe(true);
    expect(existsSync(`${p.partial}.copied`)).toBe(true);
    let mode;
    const deps = { storeMap: { t: { src, writers: [] } }, running: async () => [], log: () => {},
      backup: (o, cb) => { mode = o.mode; return backupVectorStore(o, cb); } };
    const r = await vectorsBackupJob({ destDir: dest, check: 'sample' }, deps);
    expect(mode).toBe('verify');
    expect(r.done[0]).toMatchObject({ store: 't', adopted: true, check: 'sample', check_result: ['ok'] });
    expect(existsSync(p.current) && !existsSync(p.partial) && !existsSync(`${p.partial}.copied`)).toBe(true);
  });
  it('adoptable: marker must match the source; without one, size + header + source unchanged since the copy began', () => {
    const header = { ok: true, wal: false, pages: 10, pageSize: 4096 };
    const destStat = { size: 40960, birthtimeMs: 2000 };
    expect(adoptable({ srcStat: { size: 40960, mtimeMs: 1000 }, destStat, header })).toBe(true);
    expect(adoptable({ srcStat: { size: 40960, mtimeMs: 3000 }, destStat, header })).toBe(false);   // source changed after
    expect(adoptable({ srcStat: { size: 40960, mtimeMs: 1000 }, walStat: { size: 99, mtimeMs: 2500 }, destStat, header })).toBe(false);
    expect(adoptable({ srcStat: { size: 40960, mtimeMs: 1000 }, destStat, header: { ...header, wal: true } })).toBe(false);   // copy unfinished
    expect(adoptable({ srcStat: { size: 40960, mtimeMs: 1000 }, destStat: { size: 4096, birthtimeMs: 2000 }, header })).toBe(false);
    expect(adoptable({ srcStat: { size: 40960, mtimeMs: 5 }, destStat, header, marker: { srcSize: 40960, srcMtimeMs: 5 } })).toBe(true);
    expect(adoptable({ srcStat: { size: 40960, mtimeMs: 6 }, destStat, header, marker: { srcSize: 40960, srcMtimeMs: 5 } })).toBe(false);
  });
  it('the sample check catches a corrupted row', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vb-'));
    const src = store(dir, 300);
    const dest = join(dir, 'copy.db');
    await backupVectorStore({ src, dest, check: 'sample', pauseMs: 0 });
    const db = new Database(dest);
    db.prepare('UPDATE units SET v = ?').run(Buffer.alloc(512, 7));
    db.close();
    const r = await backupVectorStore({ src, dest, check: 'sample', mode: 'verify', samples: 50 });
    expect(r.verdict.ok).toBe(false);
    expect(readHeader(dest)).toMatchObject({ ok: true, wal: false, pageSize: 4096 });
  });
  it('a copy that fails verification is never promoted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vb-'));
    const deps = { storeMap: { t: { src: store(dir, 10), writers: [] } }, running: async () => [], log: () => {},
      backup: async () => ({ verdict: { ok: false, problems: ['check: corrupt'] } }) };
    await expect(vectorsBackupJob({ destDir: join(dir, 'out') }, deps)).rejects.toThrow(/FAILED verification/);
    expect(existsSync(backupPaths(join(dir, 'out'), 't').current)).toBe(false);
    expect(existsSync(`${backupPaths(join(dir, 'out'), 't').partial}.copied`)).toBe(false);   // never re-adopted
  });
});
