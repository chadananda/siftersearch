// Worker quality verdict (rules §3): no proven gain is "same" and publishes; only a measured regression holds. Runs quality.py's verdict_of via python3.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

const dir = new URL('../../scripts/media/worker/', import.meta.url).pathname;
const verdict = (checks, gain) => JSON.parse(execFileSync('python3', ['-c', `import json,sys;sys.path.insert(0,${JSON.stringify(dir)});from quality import verdict_of;print(json.dumps(verdict_of(json.loads(sys.argv[1]),float(sys.argv[2]))))`, JSON.stringify(checks), String(gain)], { encoding: 'utf8' }));
const ok = { finite_scores: true, quality_gain: true, overall_no_regression: true, speech_no_material_regression: true, consistent_gain: true, no_bad_excerpt: true, no_material_clipping: true, duration_preserved: true };

describe('quality.py verdict_of — same or better publishes', () => {
  it('no proven gain (both gain checks false, NISQA flat) still passes', () => {
    const v = verdict({ ...ok, quality_gain: false, consistent_gain: false }, 0.02);
    expect(v).toEqual({ regressions: [], proven_gain: false, passed: true });
  });
  it('a measured regression holds and is named', () => {
    expect(verdict({ ...ok, overall_no_regression: false }, 0.3)).toMatchObject({ passed: false, regressions: ['overall_no_regression'] });
    expect(verdict({ ...ok, duration_preserved: false }, 0.3)).toMatchObject({ passed: false, regressions: ['duration_preserved'] });
    expect(verdict(ok, -0.2)).toMatchObject({ passed: false, regressions: ['nisqa_down'] });
  });
  it('a real gain passes with proven_gain', () => expect(verdict(ok, 0.4)).toEqual({ regressions: [], proven_gain: true, passed: true }));
});
