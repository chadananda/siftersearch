import { expect, it } from 'vitest';
import { DEVICES, STORAGE, storage, ioBetween } from '../../api/lib/system-health.js';
it('shows all six physical drives and RAM, with both NVMe filesystems separately addressable', () => {
  const seen = [];
  const rows = storage({ statfs: mount => { seen.push(mount); return { blocks: 100, bsize: 1000000000, bavail: 40 }; } });
  expect(seen[0]).toBe('/srv/qram');
  expect(seen).toContain('/faster');
  expect(seen).toContain('/faster/vectors');
  expect(new Set(rows.map(r => r.mount)).size).toBe(rows.length);
  expect(new Set(rows.filter(r => r.kind !== 'ram').map(r => r.dev)).size).toBe(6);
  expect(rows[0]).toMatchObject({ kind: 'ram', used_pct: 60 });
  expect(DEVICES.sdd.mount).toBe('/tank');
  expect(DEVICES.sdc.mount).toBe('/crutch');
});
it('does not invent physical I/O counters for RAM storage', () => {
  const row = '259 0 nvme1n1 0 0 100 0 0 0 200 0 0 10 0';
  const next = '259 0 nvme1n1 0 0 200 0 0 0 400 0 0 510 0';
  const io = ioBetween(row, next, 1000);
  expect(io.nvme1n1.busy_pct).toBe(50);
  expect(io.ram).toBeUndefined();
});
