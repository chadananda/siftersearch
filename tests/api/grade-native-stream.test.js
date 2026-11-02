// Grade's native-rate pass streams (11-02: a 5 h 48 kHz talk asked 15.2 GB and never fit aorus): same clip/peak/energies as the whole-array way.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';

const has = (c, a) => spawnSync(c, a, { encoding: 'utf8' }).status === 0;
const ready = has('ffmpeg', ['-version']) && has('python3', ['-c', 'import numpy']);

describe.skipIf(!ready)('media_tool native_stats', () => {
  it('matches the whole-array clip %, peak and per-frame energy, and keeps an evenly spread bounded sample', () => {
    const py = `
import sys, os, json, tempfile, subprocess, numpy as np
sys.path.insert(0, 'scripts/media'); import media_tool as M
d = tempfile.mkdtemp(); f = os.path.join(d, 'x.wav'); sr = 48000
t = np.arange(sr * 37) / sr; x = (0.5 * np.sin(2 * np.pi * 220 * t) * (1 + (t % 5 < 2))).astype(np.float32); x[sr * 3: sr * 3 + 480] = 1.0
x.tofile(os.path.join(d, 'x.f32')); subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', os.path.join(d, 'x.f32'), '-c:a', 'pcm_f32le', f], check=True)
M.GRADE_KEEP_FRAMES = 100
s = M.native_stats(f, sr, block_frames=7)
nf = M.GRADE_NF; fr = x[: len(x) // nf * nf].reshape(-1, nf); en = 10 * np.log10(np.mean(fr.astype(np.float64) ** 2, axis=1) + 1e-12)
print(json.dumps({'clip': [s['clip_pct'], round(float(np.mean(np.abs(x) >= 0.999)) * 100, 4)], 'peak': [s['peak_dbfs'], round(float(20 * np.log10(np.max(np.abs(x)) + 1e-12)), 2)],
  'en': float(np.max(np.abs(s['en'] - en))), 'n_en': [len(s['en']), len(en)], 'kept': len(s['frames']), 'kept_en': float(np.max(np.abs(s['frames_en'] - 10 * np.log10(np.mean(s['frames'].astype(np.float64) ** 2, axis=1) + 1e-12))))}))`;
    const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const o = JSON.parse(r.stdout.trim().split('\n').at(-1));
    expect(o.clip[0]).toBe(o.clip[1]); expect(o.peak[0]).toBe(o.peak[1]);
    expect(o.n_en[0]).toBe(o.n_en[1]); expect(o.en).toBeLessThan(1e-6);
    expect(o.kept).toBeGreaterThan(50); expect(o.kept).toBeLessThanOrEqual(100); expect(o.kept_en).toBeLessThan(1e-6);
  });
});
