// Host admission (Chad 10-28): a worker host needs a proven GPU (either vendor), plenty of VRAM + RAM, usable CPU — else it refuses to claim orders.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';

const decide = (info) => {
  const r = spawnSync('python3', ['scripts/media/worker/capabilities.py', '--decide'], { input: JSON.stringify(info), encoding: 'utf8' });
  return { code: r.status, ...JSON.parse(r.stdout) };
};
const ok = { backend: 'amd', gpu_proof_ok: true, vram_gb: 96, ram_gb: 31, cpus: 32, cpu_ok: true };

describe('host admission', () => {
  it('admits a proven AMD host and a proven NVIDIA host alike (vendor-blind)', () => {
    expect(decide(ok)).toMatchObject({ ok: true, code: 0 });
    expect(decide({ ...ok, backend: 'nvidia', vram_gb: 24, ram_gb: 64 })).toMatchObject({ ok: true, code: 0 });
  });
  it('refuses a host with no GPU backend (no CPU fallback for GPU stages)', () => {
    const r = decide({ ...ok, backend: null, gpu_proof_ok: false });
    expect(r.ok).toBe(false); expect(r.code).toBe(3); expect(r.reasons.join()).toMatch(/no GPU backend/);
  });
  it('refuses a GPU that failed its tiny run, naming why', () => {
    const r = decide({ ...ok, gpu_proof_ok: false, gpu_proof_error: 'whisper.cpp did not run on the GPU' });
    expect(r.code).toBe(3); expect(r.reasons.join()).toMatch(/self-test failed: whisper.cpp did not run on the GPU/);
  });
  it('refuses weak hosts: little VRAM, little RAM, few CPUs, a broken CPU', () => {
    expect(decide({ ...ok, vram_gb: 4 }).reasons.join()).toMatch(/VRAM 4.0 GB < 8/);
    expect(decide({ ...ok, ram_gb: 8 }).reasons.join()).toMatch(/system RAM 8.0 GB < 16/);
    expect(decide({ ...ok, cpus: 2 }).reasons.join()).toMatch(/2 CPUs < 4/);
    expect(decide({ ...ok, cpu_ok: false, cpu_error: 'ffmpeg' }).code).toBe(3);
  });
  it('the worker entry refuses to start (exit 3, pod self-terminates) when admission fails', () => {
    const src = spawnSync('python3', ['-c', `
import re
s = open('scripts/media/runpod_worker.py').read()
i = s.index('capabilities.assess()')
print('manifest' in s[i:i+300], 'terminate_self(why)' in s[i:i+700], 'sys.exit(3)' in s[i:i+800])`], { encoding: 'utf8' }).stdout.trim();
    expect(src).toBe('True True True');
  });
});
