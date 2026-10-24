// Fault injection for the worker's live feedback controller (Chad 10-24): low VRAM and RAM pressure cut concurrency, calm raises it, failures drain.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';

const run = (body) => JSON.parse(execFileSync('python3', ['-c', `
import sys, json
sys.path.insert(0, 'scripts/media/worker')
from controller import Controller, Leak
t = [0.0]
S = dict(vram_used_gb=2.0, vram_total_gb=24.0, gpu_util=60, temp_c=60, ram_total_gb=64, ram_avail_gb=50, swap_used_gb=0, disk_free_gb=100, load=3, cpus=16, oom=0)
cur = dict(S)
c = Controller(sampler=lambda: dict(cur), now=lambda: t[0], max_jobs=6, stable_s=240)
def calm(seconds):
    for _ in range(int(seconds // 10)):
        t[0] += 10; c.tick()
out = {}
${body}
print(json.dumps(out))`], { encoding: 'utf8' }));

describe('feedback controller', () => {
  it('grows slowly while calm (additive), admits only with live headroom', () => {
    const o = run(`
calm(300); out['l1'] = c.limit
calm(240); out['l2'] = c.limit
out['admit_unipase'] = c.admit('unipase')
cur['vram_used_gb'] = 22.0     # a neighbour took the card
out['admit_low_vram'] = c.admit('unipase'); out['admit_encode'] = c.admit('encode')`);
    expect(o.l1).toBe(2); expect(o.l2).toBe(3); expect(o.admit_unipase).toBe(true); expect(o.admit_low_vram).toBe(false);
  });
  it('simulated low VRAM halves the limit at once, pauses admission and sheds the youngest job; calm then raises it again', () => {
    const o = run(`
calm(1500); out['before'] = c.limit
for i in range(4): c.job_started('j%d' % i, 'unipase'); t[0] += 5
cur['vram_used_gb'] = 23.0
shed = c.tick(); out['after'] = c.limit; out['shed'] = shed; out['admitting'] = c.admitting
cur['vram_used_gb'] = 6.0
calm(30); out['still_low'] = c.limit
calm(1000); out['recovered'] = c.limit`);
    expect(o.before).toBeGreaterThanOrEqual(4); expect(o.after).toBe(Math.floor(o.before / 2)); expect(o.admitting).toBe(false);
    expect(o.shed).toContain('j3'); expect(o.shed).not.toContain('j0');
    expect(o.still_low).toBe(o.after); expect(o.recovered).toBeGreaterThan(o.after);
  });
  it('simulated RAM pressure, swap growth, heat and an OOM event all cut concurrency', () => {
    const o = run(`
calm(1500); b = c.limit; r = {}
cur['ram_avail_gb'] = 4; c.tick(); r['ram'] = c.limit; cur['ram_avail_gb'] = 50; calm(20)
b2 = c.limit; cur['swap_used_gb'] = 2.0; c.tick(); r['swap'] = c.limit; calm(20)
b3 = c.limit; cur['temp_c'] = 90; c.tick(); r['temp'] = c.limit; cur['temp_c'] = 60; calm(20)
b4 = c.limit; cur['oom'] = 1; c.tick(); r['oom'] = c.limit
out.update(r); out['b'] = [b, b2, b3, b4]`);
    expect(o.ram).toBeLessThan(o.b[0]); expect(o.swap).toBeLessThanOrEqual(o.b[1]); expect(o.temp).toBeLessThanOrEqual(o.b[2]); expect(o.oom).toBeLessThanOrEqual(o.b[3]);
    expect(o.oom).toBeGreaterThanOrEqual(1);
  });
  it('repeated failures: limit 1, then drain; no job is dropped (the caller re-queues each failed job)', () => {
    const o = run(`
calm(1500)
for i in range(3): c.job_started('j%d' % i, 'asr'); c.job_failed('j%d' % i, 'CUDA error')
out['unstable'] = [c.state, c.limit]
for i in range(3, 6): c.job_started('j%d' % i, 'asr'); c.job_failed('j%d' % i)
out['drain'] = c.state; out['admit'] = c.admit('asr'); out['hb'] = c.heartbeat()['failures_15m']`);
    expect(o.unstable).toEqual(['unstable', 1]); expect(o.drain).toBe('drain'); expect(o.admit).toBe(false); expect(o.hb).toBe(6);
  });
  it('a process whose memory climbs across jobs is recycled', () => {
    const o = run(`
l = Leak(1.5); out['r'] = [l.check(3.0), l.check(3.4), l.check(4.2), l.check(5.0)]`);
    expect(o.r).toEqual([false, false, false, true]);
  });
});
