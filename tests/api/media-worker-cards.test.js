// /media machine cards: role, RAM, GPU, speed per machine from the lane state; nothing private leaves.
import { describe, it, expect } from 'vitest';
import { workerCards, SPEED_WINDOW_MS } from '../../api/lib/media/worker-cards.js';

const now = 1_800_000_000_000;
describe('workerCards', () => {
  const st = {
    home: { 'aorus': { itemId: 1 }, 'aorus-2': { itemId: 2 } },
    host_down: { boss: now + 60_000 },
    jobs: { a: { pod: 'p1', itemId: 3 } },
    pods: { p1: { id: 'p1', name: 'sifter-unipase-342', status: 'ready', gpu: 'NVIDIA GeForce RTX 4090', costPerHr: 0.34, ip: '1.2.3.4', worker: { vram_total_gb: 23.99, ram_avail_gb: 24.3, temp_c: 31 } },
      p0: { id: 'p0', name: 'sifter-unipase-1', terminated: true } },
    done: [
      { gpu: 'aorus-2', pod: 'aorus-2', audio_s: 5400, at: now - 1000 },
      { gpu: 'aorus', pod: 'aorus', audio_s: 5400, at: now - 2000 },
      { gpu: 'aorus', pod: 'aorus', audio_s: 99999, at: now - SPEED_WINDOW_MS - 1 },   // outside the window
      { gpu: 'NVIDIA GeForce RTX 4090', pod: 'sifter-unipase-342', audio_s: 10800 * 3, at: now - 5000 },
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
    expect(by['sifter-unipase-342']).toMatchObject({ name: 'RunPod #342', gpu: 'RTX 4090 · 24 GB', ram: '24 GB free', status: 'working', jobs: 1, speed: 3 });
  });
  it('a booting pod has no GPU yet; nothing private is exposed', () => {
    const c = workerCards({ pods: { q: { id: 'q', name: 'sifter-unipase-9', status: 'booting', costPerHr: 0.5 } } }, now).at(-1);
    expect(c).toMatchObject({ status: 'starting', gpu: 'assigning…', ram: '—' });
    expect(workerCards({ pods: { q: { id: 'q', name: 'x', status: 'ready', gpu: null, worker: { vram_total_gb: 23.99 } } } }, now).at(-1).gpu).toBe('NVIDIA · 24 GB');
    expect(JSON.stringify(cards)).not.toMatch(/1\.2\.3\.4|costPerHr|0\.34|temp/);
  });
});
