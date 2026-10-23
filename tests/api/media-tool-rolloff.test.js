// media_tool.py rolloff_hz: silent audio, NaN and a pure tone must not index past the spectrum (run 2574 died on it).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { join } from 'path';

const PY = `
import importlib.util, json, sys, numpy as np
spec = importlib.util.spec_from_file_location('mt', sys.argv[1]); mt = importlib.util.module_from_spec(spec); spec.loader.exec_module(mt)
n = 44100 * 30
freqs = np.fft.rfftfreq(n, 1 / 44100)
t = np.arange(n) / 44100
tone = np.abs(np.fft.rfft(np.sin(2 * np.pi * 1000 * t) * np.hanning(n))) ** 2
top = np.zeros(len(freqs)); top[-1] = 1.0
print(json.dumps({
  'silent': mt.rolloff_hz(np.zeros(len(freqs)), freqs),
  'nan': mt.rolloff_hz(np.full(len(freqs), np.nan), freqs),
  'tone': mt.rolloff_hz(tone, freqs),
  'top': mt.rolloff_hz(top, freqs),
  'nyq': float(freqs[-1]),
}))
`;
const ok = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' }).status === 0;

describe.skipIf(!ok)('rolloff_hz', () => {
  it('silence and NaN → 0; a 1 kHz tone ≈ 1 kHz; energy at the top bin stays in range', () => {
    const r = spawnSync('python3', ['-c', PY, join(process.cwd(), 'scripts/media/media_tool.py')], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const o = JSON.parse(r.stdout.trim());
    expect(o.silent).toBe(0);
    expect(o.nan).toBe(0);
    expect(Math.abs(o.tone - 1000)).toBeLessThan(5);
    expect(o.top).toBe(o.nyq);
  });
});
