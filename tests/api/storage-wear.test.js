import { describe, it, expect } from 'vitest';
import { parseDiskBytes, wearRates, yearsLeft, dominantWriter, wearVerdict } from '../../scripts/lib/storage-wear.mjs';

const line = (name, sectors) => ` 259 0 ${name} 1 0 2 3 4 0 ${sectors} 5 0 6 7`;
describe('storage wear', () => {
  it('parses sectors written to bytes', () => {
    expect(parseDiskBytes(`${line('nvme0n1', 2000)}\n${line('sda', 5)}`)).toEqual({ nvme0n1: 1024000 });
  });
  it('rates are TB/day, skip reboots and short gaps', () => {
    const d = 86400e3, TB = 1e12;
    expect(wearRates({ t: 0, bytes: { nvme0n1: 0 } }, { t: d, bytes: { nvme0n1: 0.5 * TB } })).toEqual({ nvme0n1: 0.5 });
    expect(wearRates({ t: 0, bytes: { nvme0n1: 9 * TB } }, { t: d, bytes: { nvme0n1: 1 * TB } })).toEqual({});
    expect(wearRates({ t: 0, bytes: { nvme0n1: 0 } }, { t: 60e3, bytes: { nvme0n1: TB } })).toEqual({});
  });
  it('EVO at 0.33 TB/day warns (about 2.2 y left); 0.1 TB/day is fine', () => {
    expect(yearsLeft({ ratedTbw: 600, lifeLeftPct: 45 }, 0.33)).toBeCloseTo(2.2, 1);
    expect(wearVerdict({ nvme0n1: 0.33 }).ok).toBe(false);
    expect(wearVerdict({ nvme0n1: 0.1, nvme1n1: 0.2 }).ok).toBe(true);
  });
  it('names the dominant writer and ignores restarted processes', () => {
    const w = dominantWriter({ '1 api': 100, '2 qdrant': 100, '3 old': 500 }, { '1 api': 150, '2 qdrant': 1100, '3 old': 10 });
    expect(w).toMatchObject({ name: 'qdrant', bytes: 1000 });
    expect(wearVerdict({ nvme0n1: 0.4 }, { writer: w }).detail).toMatch(/top writer qdrant/);
  });
});
