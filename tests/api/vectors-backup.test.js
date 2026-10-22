// vectors-backup (storage plan R1): a real online backup of a temp SQLite store through the worker thread, its verification,
// and the job's rotate / refuse-while-writing / unknown-store behaviour.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { backupVectorStore, checkFor, restarted, verdict } from '../../api/lib/repos/vector-backup-repo.js';
import { vectorsBackupJob, storesToDo, backupPaths } from '../../api/lib/ops/vectors-backup-job.js';
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
    expect(checkFor(240e9)).toBe('quick_check');
    expect(checkFor(240e9, { check: 'integrity' })).toBe('integrity_check');
    expect(verdict({ copiedPages: 4, pageCount: 4, pageSize: 4096, fileBytes: 16384, check: ['ok'] }).ok).toBe(true);
    expect(verdict({ copiedPages: 4, pageCount: 3, pageSize: 4096, fileBytes: 12288, check: ['ok'] }).ok).toBe(false);
    expect(verdict({ copiedPages: 4, pageCount: 4, pageSize: 4096, fileBytes: 16384, check: ['row 3 missing'] }).ok).toBe(false);
  });
});

describe('vectors-backup job', () => {
  it('is an indexer job in the index lane (never beside a phrase build)', () => {
    expect(INDEX_REPORTS['vectors-backup']).toBeTypeOf('function');
    expect(INDEX_LANES.index).toContain('vectors-backup');
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
  it('refuses while the store\'s writer job is running', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vb-'));
    const deps = { storeMap: { t: { src: store(dir, 10), writers: ['phrase-index'] } }, running: async () => [{ id: 7, status: 'running' }], log: () => {} };
    await expect(vectorsBackupJob({ destDir: join(dir, 'out') }, deps)).rejects.toThrow(/phrase-index #7 is running/);
  });
  it('a copy that fails verification is never promoted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vb-'));
    const deps = { storeMap: { t: { src: store(dir, 10), writers: [] } }, running: async () => [], log: () => {},
      backup: async () => ({ verdict: { ok: false, problems: ['check: corrupt'] } }) };
    await expect(vectorsBackupJob({ destDir: join(dir, 'out') }, deps)).rejects.toThrow(/FAILED verification/);
    expect(existsSync(backupPaths(join(dir, 'out'), 't').current)).toBe(false);
  });
});
