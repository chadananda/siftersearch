// zfs-replicate.sh (vault copy of the backups): which snapshot is the daily anchor, and the incremental base.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const run = (args, names) => spawnSync('bash', ['scripts/ops/zfs-replicate.sh', ...args], { input: names.join('\n') + '\n', encoding: 'utf8' }).stdout.trim();

describe('zfs-replicate anchor', () => {
  it('ship sources: the FIRST ship of the newest day (the one db-ship keeps 14 days)', () => {
    expect(run(['anchor'], ['t/v@ship-20261108-0040', 't/v@ship-20261108-1340', 't/v@ship-20261109-0040', 't/v@ship-20261109-0140'])).toBe('t/v@ship-20261109-0040');
  });
  it('auto-snap sources: the newest daily, never a frequent/hourly', () => {
    expect(run(['anchor'], ['t/d@zfs-auto-snap_daily-2026-11-08-0725', 't/d@zfs-auto-snap_daily-2026-11-09-0725', 't/d@zfs-auto-snap_hourly-2026-11-09-1617'])).toBe('t/d@zfs-auto-snap_daily-2026-11-09-0725');
  });
  it('nothing to anchor → empty (the run logs FAIL for that source)', () => {
    expect(run(['anchor'], ['t/d@zfs-auto-snap_frequent-2026-11-09-1645'])).toBe('');
  });
});

describe('zfs-replicate base', () => {
  it('the newest destination snapshot the source still holds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zr-'));
    try {
      const f = join(dir, 'dst'); writeFileSync(f, ['v/r@ship-20261101-0040', 'v/r@ship-20261102-0040', 'v/r@ship-20261103-0040'].join('\n') + '\n');
      expect(run(['base', f], ['t/v@ship-20261102-0040', 't/v@ship-20261109-0040'])).toBe('v/r@ship-20261102-0040');
      expect(run(['base', f], ['t/v@ship-20261109-0040'])).toBe('');
    } finally { rmSync(dir, { recursive: true }); }
  });
});
