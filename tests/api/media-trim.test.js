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
  it('quiet music between words (no transcript, sound present) is NOT a dead gap', () => {
    const words = [W(3, 4), W(200, 201), W(291, 292), W(400, 401)];
    const pk = peaks(410, [[3, 201], [291, 401]]).map((x, i) => (i / 20 >= 202 && i / 20 < 290 ? 0.12 : x));   // music at ~20 % of speech
    expect(trimPlan({ words, peaks: pk, duration: 410 }).gaps).toEqual([]);
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

// CONTENT CUTS (Chad 11-14, rules §8): meta.trim.cuts removed from the web copy; times convert both ways; the filter keeps exactly the kept spans.
import { cutSpans, cutFilter, keptSeconds } from '../../api/lib/media/trim.js';
describe('cuts', () => {
  const trim = { start_s: 10, end_s: 100, cuts: [{ from: 30, to: 40 }, { from: 39, to: 50 }, { from: 90, to: 120 }] };
  it('cutSpans merges overlaps and clamps to the window', () => expect(cutSpans(trim)).toEqual([{ from: 30, to: 50 }, { from: 90, to: 100 }]));
  it('webTime: before, inside (the cut\'s web position) and after a cut', () => {
    expect(webTime(20, trim)).toBe(10);
    expect(webTime(35, trim)).toBe(20);
    expect(webTime(50, trim)).toBe(20);
    expect(webTime(60, trim)).toBe(30);
  });
  it('originalTime inverts webTime for every kept time', () => { for (const t of [0, 5, 19.9, 20, 45, 71]) expect(webTime(originalTime(t, trim), trim)).toBeCloseTo(t, 6); });
  it('no cuts: the old behaviour', () => { expect(webTime(15, { start_s: 10 })).toBe(5); expect(originalTime(5, { start_s: 10 })).toBe(15); expect(cutFilter({ start_s: 10 }, 100)).toBe(''); });
  it('keptSeconds = window − cuts; the filter keeps the spans relative to the window start', () => {
    expect(keptSeconds(trim, 200)).toBe(90 - 30);
    const f = cutFilter(trim, 200);
    expect(f).toContain("between(t,0.000,20.000)");
    expect(f).toContain("between(t,40.000,80.000)");
    expect(f).toMatch(/aselect='[^']+',asetpts=N\/SR\/TB$/);
  });
  it('trimArgs puts the cuts before the fades and the final fade at the kept length', () => {
    const { pre, af } = trimArgs(trim, 200);
    expect(pre).toEqual(['-ss', '10.00', '-t', '90.00']);
    expect(af.indexOf('aselect')).toBeLessThan(af.indexOf('afade=t=in'));
    expect(af).toContain('afade=t=out:st=59.50');
  });
});

describe.skipIf(!ff)('the cut itself, with content cuts', () => {
  it('ffmpeg output is exactly the kept length, joins fade (no click), and the window is honoured', () => {
    const d = mkdtempSync(join(tmpdir(), 'trimcut-'));
    spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=60:sample_rate=16000', '-af', 'volume=0.9', '-c:a', 'pcm_s16le', join(d, 'in.wav')]);
    const plan = { start_s: 5, end_s: 55, cuts: [{ from: 15, to: 25 }, { from: 40, to: 45 }] };
    const { pre, af } = trimArgs(plan, 60);
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...pre, '-i', join(d, 'in.wav'), '-af', af, '-f', 's16le', '-ac', '1', join(d, 'out.raw')]);
    expect(r.status).toBe(0);
    const b = readFileSync(join(d, 'out.raw')), s = new Int16Array(b.buffer, b.byteOffset, b.length / 2);
    expect(s.length / 16000).toBeCloseTo(keptSeconds(plan, 60), 0);   // 50 − 15 = 35 s
    expect(Math.abs(s.length / 16000 - 35)).toBeLessThan(0.1);
    // lavfi sine is 1/8 full scale: mid-span level = 0.9 * 0.125 * 32767. The ramp is frame-granular: frames at the join are quieter than the span, mid-span is untouched
    const peakAt = (t, n) => Math.max(...Array.from({ length: n }, (_, i) => Math.abs(s[Math.round(t * 16000) + i])));
    const mid = peakAt(15, 1600), join1 = peakAt(10 - 0.01, 160);   // the last 10 ms before the first join
    expect(mid).toBeGreaterThan(3500);
    expect(join1).toBeLessThan(mid * 0.7);
    expect(Math.abs(s[0])).toBeLessThan(200);
  });
});
