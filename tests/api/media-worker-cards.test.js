// /media machine cards: role, RAM, GPU, speed per machine from the lane state; nothing private leaves.
import { describe, it, expect } from 'vitest';
import { workerCards, speeds, readGauges, SPEED_WINDOW_MS } from '../../api/lib/media/worker-cards.js';

const now = 1_800_000_000_000;
describe('workerCards', () => {
  const st = {
    home: { 'aorus': { itemId: 1 }, 'aorus-2': { itemId: 2 } },
    host_down: { boss: now + 60_000 },
    jobs: { a: { pod: 'p1', itemId: 3 } },
    pods: { p1: { id: 'p1', name: 'sifter-unipase-342', status: 'ready', gpu: 'NVIDIA GeForce RTX 4090', costPerHr: 0.34, ip: '1.2.3.4', worker: { vram_total_gb: 23.99, ram_avail_gb: 24.3, temp_c: 31 } },
      p0: { id: 'p0', name: 'sifter-unipase-1', terminated: true } },
    done: [
      { gpu: 'aorus-2', pod: 'aorus-2', audio_s: 1800, at: now - 1000 },
      { gpu: 'aorus', pod: 'aorus', audio_s: 1800, at: now - 2000 },
      { gpu: 'aorus', pod: 'aorus', audio_s: 99999, at: now - SPEED_WINDOW_MS - 1 },   // outside the window
      { gpu: 'NVIDIA GeForce RTX 4090', pod: 'sifter-unipase-342', audio_s: 3600 * 3, at: now - 5000 },
    ],
  };
  const cards = workerCards(st, now);
  const by = Object.fromEntries(cards.map((c) => [c.key, c]));
  it('one card per home machine and per live pod, in that order', () => {
    expect(cards.map((c) => c.key)).toEqual(['tower', 'boss', 'aorus', 'sifter-unipase-342']);
  });
  it('status and jobs: slots folded into their machine, a resting host, a working pod', () => {
    expect(by.aorus).toMatchObject({ status: 'working', jobs: 2, speed: 1 });
    expect(by.boss).toMatchObject({ status: 'resting', jobs: 0, speed: null });
    expect(by.tower).toMatchObject({ status: 'conducting', jobs: 3 });
    expect(Object.fromEntries(by.tower.specs)).toMatchObject({ CPU: expect.any(String), Cores: expect.any(String), Drives: expect.any(String), Store: expect.any(String) });
    expect(by['sifter-unipase-342']).toMatchObject({ name: 'RunPod #342', specs: [['GPU', 'RTX 4090 · 24 GB'], ['RAM', '24 GB free']], status: 'working', jobs: 1, speed: 3 });
  });
  it('a booting pod has no GPU yet; nothing private is exposed', () => {
    const c = workerCards({ pods: { q: { id: 'q', name: 'sifter-unipase-9', status: 'booting', costPerHr: 0.5 } } }, now).at(-1);
    expect(c).toMatchObject({ status: 'starting', specs: [['GPU', 'assigning…'], ['RAM', '—']] });
    expect(workerCards({ pods: { q: { id: 'q', name: 'x', status: 'ready', gpu: null, worker: { vram_total_gb: 23.99 } } } }, now).at(-1).specs[0][1]).toBe('NVIDIA · 24 GB');
    expect(JSON.stringify(cards)).not.toMatch(/1\.2\.3\.4|costPerHr|0\.34|temp/);
  });
  it('a pod younger than the window is timed over its own age, not the whole window (10-30: 9.7x showed as 3.2x)', () => {
    const t = 1e12, done = [{ at: t - 60_000, pod: 'sifter-unipase-349', audio_s: 1800 * 9.7 }];
    expect(speeds(done, t, { 'sifter-unipase-349': t - 1800_000 })['sifter-unipase-349']).toBe(9.7);   // 30 min old
    expect(speeds(done, t)['sifter-unipase-349']).toBe(4.9);   // no start known: the one-hour window
    expect(speeds(done, t, { 'sifter-unipase-349': t - 1000 })['sifter-unipase-349']).toBe(29.1);   // floor of 10 min, never divide by seconds
  });
  it('CPU / GPU dials: cgroup CPU time over the pod\'s quota, GPU power over its limit; only while fresh', () => {
    const a = readGauges('UTIL 100\nGAUGE 1000000000 1360000 100000 128 301.5,450.00\nSTATUS {}', {}, now);
    expect(a).toMatchObject({ usage_us: 1e9, cpu: null, gpu: 67 });   // the first sample has no CPU interval yet; 100 % "util" was 67 % of power
    const b = readGauges('GAUGE 1408000000 1360000 100000 128 450,450', a, now + 60_000);   // 408 CPU-s in 60 s on 13.6 CPUs = 50 %
    expect(b).toMatchObject({ cpu: 50, gpu: 100 });
    expect(readGauges('GAUGE 900 max 100000 4 -', { usage_us: 0, at: now }, now + 1000)).toMatchObject({ cpu: 0, gpu: null });   // no quota: nproc; no nvidia-smi
    expect(readGauges('GAUGE - max 100000 4 -', a, now + 1000)).toMatchObject({ cpu: null, gpu: null });   // cgroup v1: no CPU dial
    expect(readGauges('UTIL 9', {}, now)).toBeNull();
    const pod = (gauge) => workerCards({ pods: { p: { id: 'p', name: 'sifter-unipase-5', status: 'ready', gauge } } }, now).at(-1).gauges;
    expect(pod({ ...b, at: now - 60_000 })).toEqual({ cpu: 50, gpu: 100 });
    expect(pod({ ...b, at: now - 10 * 60_000 })).toBeNull();
    expect(pod(undefined)).toBeNull();
  });
});
