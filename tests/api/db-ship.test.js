// db-ship.sh retention on /tank: newest 24 hourly + the first snapshot of each of the 14 newest older days.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';

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
