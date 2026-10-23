// The WAL checkpointer off the write path (db-write-path-20261023): a worker thread with its own connection runs PASSIVE
// checkpoints while the main connection keeps committing (autocheckpoint off here, so only the thread copies), and a
// TRUNCATE on request empties the WAL file.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { startCheckpointThread } from '../../api/lib/repos/wal-checkpoint-thread.js';

describe('checkpoint thread', () => {
  it('PASSIVE on a timer copies frames the writer committed; TRUNCATE empties the WAL file', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'ckpt-')), 'w.db');
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('wal_autocheckpoint = 0');   // only the thread checkpoints
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v BLOB)');
    const ins = db.prepare('INSERT INTO t (v) VALUES (?)');
    db.transaction(() => { for (let i = 0; i < 2000; i++) ins.run(Buffer.alloc(512, i % 256)); })();
    expect(statSync(`${path}-wal`).size).toBeGreaterThan(500_000);
    const seen = [];
    const ck = startCheckpointThread({ path, everyMs: 50, onPassive: (r) => seen.push(r) });
    try {
      for (let i = 0; i < 100 && !seen.some((r) => r.checkpointed > 0 && r.checkpointed === r.log); i++) await new Promise((r) => setTimeout(r, 20));
      const done = seen.find((r) => r.checkpointed > 0);
      expect(done).toMatchObject({ mode: 'PASSIVE', busy: 0 });
      expect(db.prepare('SELECT COUNT(*) n FROM t').get().n).toBe(2000);   // the writer is unaffected
      const t = await ck.truncate(1000);
      expect(t).toMatchObject({ mode: 'TRUNCATE', busy: 0 });
      expect(statSync(`${path}-wal`).size).toBe(0);
      expect(ck.stats().passive).toBeGreaterThan(0);
    } finally { ck.stop(); db.close(); }
  });
});
