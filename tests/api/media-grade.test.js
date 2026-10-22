// The quality grade (api/lib/media/grade.js) on the pilot's measured values: per dimension, overall, issues, the fix
// chain in processing order with costs, and the repair priority.
import { describe, it, expect } from 'vitest';
import { gradeReport, priorityOf, asrConfidence, chainFor } from '../../api/lib/media/grade.js';

// measured 10-22 on tower (media_tool.py grade)
const martha = { duration_s: 206.2, clip_pct: 0.0002, snr_db: 31.7, dropouts_per_hour: 0, lufs: -17.5, loudness_range_db: 5, bandwidth_khz: 8.3, hum50_db: 0.6, hum60_db: -2.1, f0_median_hz: 115.9,
  dnsmos: { sig: 3.49, bak: 3.67, ovrl: 3.09 }, nisqa: { mos: 3.57, noisiness: 3.27, discontinuity: 4.18, coloration: 3.51, loudness: 3.77 } };
const grossmann = { duration_s: 2763.1, clip_pct: 0.0011, snr_db: 23.6, dropouts_per_hour: 0, lufs: -23.5, loudness_range_db: 11.9, bandwidth_khz: 4.31, hum50_db: 16.6, hum60_db: -6.6, f0_median_hz: 188.2,
  dnsmos: { sig: 3.56, bak: 3.29, ovrl: 2.84 }, nisqa: { mos: 1.7, noisiness: 1.77, discontinuity: 3.3, coloration: 1.92, loudness: 2.04 } };

describe('quality grade', () => {
  it('a clean old recording grades well and needs no fix', () => {
    const r = gradeReport(martha);
    expect(r.dimensions.bandwidth.grade).toBe('A');
    expect(r.dimensions.noise.grade).toBe('B');
    expect(r.primary_issue).toBe('ok');
    expect(r.chain_key).toBe('none');
  });
  it('a muffled, humming low-bitrate lecture: muffled first, hum notch → denoise → bandwidth restoration', () => {
    const r = gradeReport(grossmann, { asr: { logprob: -0.25, low_conf_share: 0.04 } });
    expect(r.dimensions.bandwidth).toMatchObject({ kHz: 4.31, grade: 'E' });
    expect(r.dimensions.noise).toMatchObject({ type: 'hum (50 Hz + harmonics)', grade: 'C' });
    expect(r.primary_issue).toBe('muffled');
    expect(r.secondary_issues).toEqual(['noisy']);
    expect(r.chain.map((c) => c.step)).toEqual(['hum notch', 'denoise', 'bandwidth restoration']);
    expect(r.cost.cpu_minutes).toBeGreaterThan(30);
    expect(['C', 'D']).toContain(r.overall);
  });
  it('the chain is always in processing order', () => {
    const d = { noise: { type: 'broadband hiss', snr_db: 15 } };
    expect(chainFor(d, ['level', 'bandwidth', 'noise', 'clipping']).map((c) => c.step)).toEqual(['declip', 'denoise', 'bandwidth restoration', 'leveling / per-speaker gain']);
  });
  it('priority = (5 − grade) × importance', () => {
    expect(priorityOf('A', { tier: 3 })).toBe(0);
    expect(priorityOf('E', { tier: 3 })).toBe(12);
    expect(priorityOf('C', { tier: 1, unique: false })).toBe(1);
  });
  it('intelligibility from aligned word scores', () => {
    const segs = [{ words: Array.from({ length: 30 }, (_, i) => ({ w: 'x', s: i, e: i + 0.5, p: i < 12 ? 0.2 : 0.9 })) }];
    const a = asrConfidence(segs, -0.3);
    expect(a.low_conf_share).toBe(0.4);
    expect(a.spans[0]).toMatchObject({ t0: 0, t1: 10 });
  });
});
