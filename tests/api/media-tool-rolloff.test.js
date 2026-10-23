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

describe.skipIf(!ok || spawnSync('ffmpeg', ['-version']).status !== 0)('media_tool encode', () => {
  it('a fixed recipe encodes; an unknown filter is refused', async () => {
    const { mkdtempSync } = await import('fs');
    const { tmpdir } = await import('os');
    const d = mkdtempSync(join(tmpdir(), 'enc-'));
    spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=2', join(d, 'a.wav')]);
    const tool = join(process.cwd(), 'scripts/media/media_tool.py');
    const good = spawnSync('python3', [tool, 'encode', join(d, 'a.wav'), '--recipe', 'light', '--af', 'highpass=f=70,loudnorm=I=-18:TP=-1.5:LRA=11', '--output', join(d, 'l.flac'), '--threads', '1'], { encoding: 'utf8' });
    expect(good.status, good.stderr).toBe(0);
    expect(JSON.parse(good.stdout.trim()).recipe).toBe('light');
    const bad = spawnSync('python3', [tool, 'encode', join(d, 'a.wav'), '--recipe', 'light', '--af', 'volume=1,amovie=/etc/passwd', '--output', join(d, 'x.flac')], { encoding: 'utf8' });
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toMatch(/filter not allowed/);
  });
});

describe.skipIf(!ok)('media_tool load', () => {
  it('a failed decode names ffmpeg, the file and its error', () => {
    const r = spawnSync('python3', ['-c', `
import importlib.util, sys
spec = importlib.util.spec_from_file_location('mt', sys.argv[1]); mt = importlib.util.module_from_spec(spec); spec.loader.exec_module(mt)
mt.time.sleep = lambda s: None
try:
    mt.load('/nonexistent/x.flac', start=10, dur=5)
except RuntimeError as e:
    print(str(e))
`, join(process.cwd(), 'scripts/media/media_tool.py')], { encoding: 'utf8' });
    expect(r.stdout).toMatch(/ffmpeg exit \d+ on x\.flac \(start 10, dur 5\): .*No such file/);
  });
});

describe.skipIf(spawnSync('ffmpeg', ['-version']).status !== 0)('16 kHz conversion', () => {
  it('-sample_fmt s16 gives one bit depth from a mixed 16/32-bit source (10-23: "switching bps mid-stream")', async () => {
    const { mkdtempSync, writeFileSync } = await import('fs');
    const { tmpdir } = await import('os');
    const d = mkdtempSync(join(tmpdir(), 'bps-'));
    spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=1', '-c:a', 'pcm_s16le', join(d, 'a.wav')]);
    spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=1', '-c:a', 'pcm_s32le', join(d, 'b.wav')]);
    writeFileSync(join(d, 'l.txt'), `file '${join(d, 'a.wav')}'\nfile '${join(d, 'b.wav')}'\n`);
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(d, 'l.txt'), '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', '-c:a', 'flac', join(d, 'o.flac')], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=sample_fmt,bits_per_raw_sample', '-of', 'csv=p=0', join(d, 'o.flac')], { encoding: 'utf8' });
    expect(p.stdout.trim()).toMatch(/^s16,16$/);
    const dec = spawnSync('ffmpeg', ['-v', 'error', '-ss', '1.2', '-t', '0.5', '-i', join(d, 'o.flac'), '-f', 'f32le', '-'], { encoding: 'buffer' });
    expect(dec.status).toBe(0);
  });
});
