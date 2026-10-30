// The silencer (scripts/media/worker/quiet.py, Chad 10-29): word-free stretches of a restored copy fade to silence; speech, and voiced audio the transcript missed, is untouched.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';

const py = (body) => JSON.parse(execFileSync('python3', ['-c', `
import sys, json
sys.path.insert(0, 'scripts/media/worker')
import quiet
${body}`], { encoding: 'utf8' }));

describe('quiet.py', () => {
  it('pads words and bridges short gaps into speech spans', () => {
    expect(py(`print(json.dumps(quiet.speech_spans([(1.0, 2.0), (2.5, 3.0), (10.0, 11.0), (None, 4)])))`))
      .toEqual([[0.7, 3.3], [9.7, 11.3]]);
  });
  it('finds the lead, the gaps and the tail at least MIN_S long', () => {
    expect(py(`print(json.dumps(quiet.quiet_spans([(5.0, 8.0), (9.0, 12.0), (20.0, 30.0)], 40.0)))`))
      .toEqual([[0, 5], [12, 20], [30, 40]]);
    expect(py(`print(json.dumps(quiet.quiet_spans([(0.5, 40.0)], 40.0)))`)).toEqual([]);
    expect(py(`print(json.dumps(quiet.quiet_spans([(5.0, 8.0), (50.0, 52.0), (60.0, 61.0)], 40.0)))`)).toEqual([[0, 5], [8, 40]]);   // words past the end
  });
  it('gain is 0 inside, ramps at inner edges only, 1 in speech', () => {
    const g = py(`print(json.dumps([round(float(x), 3) for x in quiet.gain([0.0, 4.0, 4.95, 5.0, 6.0, 12.0, 12.05, 15.0, 39.99], [(0, 5), (12, 20), (30, 40)], 40.0)]))`);
    expect(g[0]).toBe(0); expect(g[1]).toBe(0);           // the lead: silent from the very first sample, no fade-in
    expect(g[2]).toBeGreaterThan(0); expect(g[2]).toBeLessThan(1);   // ramp back up into speech
    expect(g[3]).toBe(1); expect(g[4]).toBe(1);
    expect(g[5]).toBe(1); expect(g[6]).toBeLessThan(1);   // ramp down after speech
    expect(g[7]).toBe(0); expect(g[8]).toBe(0);
  });
  it('a pitched tone counts as voiced, noise does not', () => {
    const [tone, noise] = py(`import numpy as np
t = np.arange(16000 * 2) / 16000; r = np.random.default_rng(1)
print(json.dumps([quiet.voiced_frac(np.sin(2 * np.pi * 150 * t).astype('f4')), quiet.voiced_frac(r.standard_normal(32000).astype('f4'))]))`);
    expect(tone).toBeGreaterThan(0.9); expect(noise).toBeLessThan(0.1);
  });
});
