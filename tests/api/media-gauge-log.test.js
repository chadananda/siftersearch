// Per-host load history (gauge-log.js): rows from lane state, daily jsonl append + prune, read-back by host, starvation summary.
import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { gaugeRows, appendGauges, readGaugeLog, summarizeGauges } from '../../api/lib/media/gauge-log.js';

const now = Date.UTC(2026, 9, 30, 12);
const st = {
  pods: {
    a: { name: 'sifter-unipase-365', status: 'ready', boot_v: 'c28f', gauge: { cpu: 60, gpu: 7, at: now - 1000 },
      worker: { running: 9, cpu_jobs: 8, ready_jobs: 0, gpu_util: 0, vram_used_gb: 0, load: 16.23, jobs: [...Array(8)].map(() => ({ stage: 'encode' })).concat({ stage: 'grade' }) } },
    b: { name: 'sifter-unipase-360', status: 'booting', terminated: now - 5000 },
    c: { name: 'sifter-unipase-364', status: 'ready', gauge: { cpu: 22, gpu: 30, at: now - 20 * 60_000 } },   // stale gauge: skipped
  },
  host_gauge: { boss: { cpu: 44, gpu: 100, at: now - 2000 }, tower: { cpus: [1, 1], at: now } },
  home: { boss: { itemId: 1 } },
};

describe('gauge log', () => {
  it('one row per live host with fresh gauges; pods named, stages counted', () => {
    const rows = gaugeRows(st, now);
    expect(rows.map((r) => r.host)).toEqual(['Podsprocket', 'boss', 'tower']);
    expect(rows[0]).toMatchObject({ id: 'sifter-unipase-365', cpu: 60, gpu: 7, running: 9, cpu_jobs: 8, load: 16.2, stages: { encode: 8, grade: 1 } });
    expect(rows[1]).toMatchObject({ kind: 'home', gpu: 100, running: 1 });
  });

  it('appends per day, prunes old days, reads back one host', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gauges-'));
    await writeFile(join(dir, '2026-10-01.jsonl'), '{}\n');
    await appendGauges(gaugeRows(st, now - 86_400_000), dir, now - 86_400_000);
    await appendGauges(gaugeRows(st, now), dir, now);
    expect((await readdir(dir)).sort()).toEqual(['2026-10-29.jsonl', '2026-10-30.jsonl']);
    const rows = await readGaugeLog(dir, { sinceMs: now - 2 * 86_400_000, host: 'podsprocket', now });
    expect(rows).toHaveLength(2);
    expect((await readGaugeLog(dir, { sinceMs: now - 3600_000, now })).length).toBe(3);
  });

  it('summary flags busy-but-GPU-idle samples and the stages behind them', () => {
    const rows = [gaugeRows(st, now)[0], { ...gaugeRows(st, now)[0], gpu: 80, stages: { unipase: 9 } }];
    const [h] = summarizeGauges(rows);
    expect(h).toMatchObject({ host: 'Podsprocket', samples: 2, gpu_avg: 44, gpu_starved_pct: 50, starved_stages: { encode: 8, grade: 1 } });
  });
});
