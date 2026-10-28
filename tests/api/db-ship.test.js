// db-ship.sh retention on /tank: newest 24 hourly + the first snapshot of each of the 14 newest older days.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const keepOut = (names, ...args) => spawnSync('bash', ['scripts/ops/db-ship.sh', 'keep', ...args], { input: names.join('\n') + '\n', encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
const hourly = (days) => { const out = []; for (let d = 1; d <= days; d++) for (let h = 0; h < 24; h++) out.push(`t/db@ship-202610${String(d).padStart(2, '0')}-${String(h).padStart(2, '0')}17`); return out; };

describe('db-ship keep', () => {
  it('keeps everything while there are fewer than 24', () => {
    expect(keepOut(hourly(1).slice(0, 20))).toEqual([]);
  });
  it('past the newest 24, keeps the first of each day for 14 days and destroys the rest', () => {
    const all = hourly(20);   // 480 snapshots, oldest first
    const gone = new Set(keepOut(all));
    const kept = all.filter((n) => !gone.has(n));
    expect(kept.slice(-24)).toEqual(all.slice(-24));
    const older = kept.slice(0, -24);
    expect(older).toHaveLength(14);
    expect(older.every((n) => n.endsWith('-0017'))).toBe(true);   // first of its day
    expect(older[0]).toBe('t/db@ship-20261006-0017');   // days 6–19 kept, 1–5 gone (day 20 is inside the newest 24)
  });
  it('never touches snapshots it did not make', () => {
    expect(keepOut(['t/db@zfs-auto-snap_daily-2026-10-01-1437', ...hourly(3)], '1', '1')).not.toContain('t/db@zfs-auto-snap_daily-2026-10-01-1437');
  });
});

describe('db-ship ssd-drop', () => {
  it('drops older ships and auto-snapshots, never the 03:00 backup snapshot it is copying from', () => {
    const out = spawnSync('bash', ['scripts/ops/db-ship.sh', 'ssd-drop', 'ship-20261021-2234'], { encoding: 'utf8',
      input: ['f/db@zfs-auto-snap_daily-2026-10-20-1436', 'f/db@siftersearch-backup-1792634400000', 'f/db@ship-20261021-2227', 'f/db@ship-20261021-2234'].join('\n') + '\n' }).stdout.trim().split('\n');
    expect(out).toEqual(['f/db@zfs-auto-snap_daily-2026-10-20-1436', 'f/db@ship-20261021-2227']);
  });
});

describe('db-ship default datasets', () => {
  const runDefault = ({ vectors = true, failDatabase = false, busy = false } = {}) => {
    const directory = mkdtempSync(join(tmpdir(), 'db-ship-'));
    const calls = join(directory, 'calls');
    try {
      writeFileSync(join(directory, 'bash'), '#!/bin/bash\nprintf "%s %s\\n" "$2" "$3" >> "$SHIP_TEST_CALLS"\nif [ "$2" = fast/siftersearch-db ] && [ "$SHIP_TEST_FAIL_DATABASE" = 1 ]; then exit 1; fi\n', { mode: 0o755 });
      writeFileSync(join(directory, 'sudo'), '#!/bin/bash\nexit "$SHIP_TEST_VECTORS_STATUS"\n', { mode: 0o755 });
      writeFileSync(join(directory, 'flock'), '#!/bin/bash\nexit "$SHIP_TEST_LOCK_STATUS"\n', { mode: 0o755 });
      const result = spawnSync('/bin/bash', ['scripts/ops/db-ship.sh'], { encoding: 'utf8', env: { ...process.env,
        PATH: `${directory}:${process.env.PATH}`, SHIP_TEST_CALLS: calls,
        SIFTER_SHIP_LOCK: join(directory, 'lock'), SHIP_TEST_LOCK_STATUS: busy ? '1' : '0',
        SHIP_TEST_VECTORS_STATUS: vectors ? '0' : '1', SHIP_TEST_FAIL_DATABASE: failDatabase ? '1' : '0' } });
      return { status: result.status, calls: existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : [] };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };
  it('ships both the content database and the new vector dataset', () => {
    expect(runDefault()).toEqual({ status: 0, calls: ['fast/siftersearch-db tank/backups/siftersearch-db', 'faster/vectors tank/backups/vectors'] });
  });
  it('keeps working before the new pool exists', () => {
    expect(runDefault({ vectors: false })).toEqual({ status: 0, calls: ['fast/siftersearch-db tank/backups/siftersearch-db'] });
  });
  it('still attempts vector backup after a database backup failure and returns failure', () => {
    expect(runDefault({ failDatabase: true })).toEqual({ status: 1, calls: ['fast/siftersearch-db tank/backups/siftersearch-db', 'faster/vectors tank/backups/vectors'] });
  });
  it('skips an overlapping scheduled run without starting either backup', () => {
    expect(runDefault({ busy: true })).toEqual({ status: 0, calls: [] });
  });
});

describe('db-ship stream failures', () => {
  it('fails when zfs send fails even if the receiver exits successfully', () => {
    const directory = mkdtempSync(join(tmpdir(), 'db-ship-stream-'));
    try {
      writeFileSync(join(directory, 'sudo'), '#!/bin/bash\ncase "$*" in\n  "-n zfs list target") exit 1;;\n  *"zfs send "*) exit 1;;\n  *"zfs recv "*) cat >/dev/null; exit 0;;\n  *) exit 0;;\nesac\n', { mode: 0o755 });
      const result = spawnSync('/bin/bash', ['scripts/ops/db-ship.sh', 'source', 'target'], {
        encoding: 'utf8', env: { ...process.env, PATH: `${directory}:${process.env.PATH}` }
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('FAIL full send');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
