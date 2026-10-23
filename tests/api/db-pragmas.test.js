// PRAGMAs applied at open (db-write-path-20261023): the writer's content connection runs with the RAM-leaning settings —
// big cache, temp in RAM, synchronous from SQLITE_SYNCHRONOUS (OFF on tower's ZFS), a raised autocheckpoint (the checkpoint
// thread does the copying) and a WAL size limit. A non-writer gets temp_store only.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const dir = mkdtempSync(join(tmpdir(), 'prag-'));
Object.assign(process.env, { TURSO_DATABASE_URL: `file:${join(dir, 'c.db')}`, SIFTER_IS_WRITER: '1', SQLITE_SYNCHRONOUS: 'OFF', SQLITE_CACHE_MB: '96',
  SQLITE_WAL_AUTOCHECKPOINT: '20000', SQLITE_JOURNAL_LIMIT_MB: '256' });
const db = await import('../../api/lib/db.js');

describe('content connection PRAGMAs', () => {
  it('the writer opens with cache, temp_store, synchronous, autocheckpoint and journal limit applied', async () => {
    const snap = db.pragmaSnapshot(await db.getDb());
    expect(snap).toMatchObject({ journal_mode: 'wal', synchronous: 0, cache_size: -96 * 1024, temp_store: 2, wal_autocheckpoint: 20000, journal_size_limit: 256 * 1048576 });
  });
  it('a non-writer connection gets temp_store only (it never commits, so never checkpoints)', () => {
    const d = new Database(':memory:');
    db.applyRamPragmas(d, { writer: false });
    expect(db.pragmaSnapshot(d)).toMatchObject({ temp_store: 2, wal_autocheckpoint: 1000 });
  });
});
