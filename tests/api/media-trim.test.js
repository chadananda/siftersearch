// Silence trim (Chad 10-23): non-destructive; times stay original; old links map; fades never clip; inner gaps marked, not cut.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { trimPlan, trimArgs, webTime, originalTime, energySpan, skipTo, peaksOf } from '../../api/lib/media/trim.js';

const W = (s, e, w = 'x') => ({ w, s, e });
const peaks = (dur, speech, pps = 20) => Array.from({ length: dur * pps }, (_, i) => (speech.some(([a, b]) => i / pps >= a && i / pps < b) ? 0.6 : 0.01));

describe('the plan', () => {
  it('cuts a 42 s leading silence at onset − 1 s, and the long tail at last word + 2 s', () => {
    const words = [W(42.3, 42.8), W(43, 43.5), W(600, 600.4)];
    const p = trimPlan({ words, peaks: peaks(700, [[42.2, 601]]), duration: 700 });
    expect(p).toMatchObject({ start_s: 41.2, end_s: 603, gaps: [] });   // sound to 601 s outlasts the last word
  });
  it('a short lead (< 5 s) is left alone', () => {
    expect(trimPlan({ words: [W(3, 4), W(100, 101)], peaks: peaks(110, [[3, 101]]), duration: 110 }).start_s).toBe(0);
  });
  it('an untranscribed spoken announcement before the first word is never cut (energy onset wins)', () => {
    const p = trimPlan({ words: [W(60, 61), W(300, 301)], peaks: peaks(320, [[20, 30], [60, 301]]), duration: 320 });
    expect(p.start_s).toBe(19);
  });
  it('a 90 s tape flip between words is marked to skip, not cut', () => {
    const words = [W(3, 4), W(200, 201), W(291, 292), W(400, 401)];
    const p = trimPlan({ words, peaks: peaks(410, [[3, 201], [291, 401]]), duration: 410 });
    expect(p.gaps).toEqual([{ from: 202, to: 290 }]);
    expect(p.start_s).toBe(0);   // nothing at the start to cut
    expect(skipTo(250, p.gaps)).toBe(290);
    expect(skipTo(150, p.gaps)).toBeNull();
  });
  it('hiss alone is not speech', () => {
    expect(energySpan(Array(400).fill(0.02))).toBeNull();
  });
});

describe('times', () => {
  it('an old link in recording time lands on the same words in the trimmed copy, and back', () => {
    const trim = { start_s: 41.2 };
    expect(webTime(100, trim)).toBeCloseTo(58.8);
    expect(originalTime(webTime(100, trim), trim)).toBeCloseTo(100);
    expect(webTime(30, trim)).toBe(0);   // a link into the cut silence starts at the first sound
    expect(webTime(100, null)).toBe(100);
  });
});

const ff = spawnSync('ffmpeg', ['-version']).status === 0;
describe.skipIf(!ff)('the cut itself', () => {
  it('fades in and out with no clipping: the first and last samples are near silent, the peak is not raised', () => {
    const d = mkdtempSync(join(tmpdir(), 'trim-'));
    spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=12:sample_rate=16000', '-af', 'volume=0.9', '-c:a', 'pcm_s16le', join(d, 'in.wav')]);
    const { pre, af } = trimArgs({ start_s: 2, end_s: 10 }, 12);
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...pre, '-i', join(d, 'in.wav'), '-af', af, '-f', 's16le', '-ac', '1', join(d, 'out.raw')]);
    expect(r.status).toBe(0);
    const b = readFileSync(join(d, 'out.raw'));
    const s = new Int16Array(b.buffer, b.byteOffset, b.length / 2);
    expect(s.length / 16000).toBeCloseTo(8, 1);
    const peak = s.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    expect(peak).toBeLessThanOrEqual(Math.round(0.9 * 32767) + 2);
    expect(Math.abs(s[0])).toBeLessThan(200);
    expect(Math.abs(s[s.length - 1])).toBeLessThan(200);
  });
});

describe('waveform', () => {
  it('peaksOf reads audiowaveform v2 min/max pairs', () => {
    const p = peaksOf({ sample_rate: 8000, samples_per_pixel: 400, data: [-64, 64, -1, 2] });
    expect(p.pps).toBe(20);
    expect(p.peaks[0]).toBeCloseTo(0.5);
  });
});
