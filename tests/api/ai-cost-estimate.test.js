// The budget gate stops real work based on estimated_cost_usd, so the estimate has to resemble the invoice.
// It did not: $1,854 estimated all-time against an invoice of a few hundred (Chad, 2026-08-13). The pipeline
// PAUSES through DeepSeek's full-price hours specifically to buy the off-peak discount (pipeline/peak.js) —
// and the estimator billed every one of those calls at list price. These pin the correction.
import { describe, it, expect } from 'vitest';
import { nowInPeak, inOffPeak, DEFAULT_PEAK_WINDOWS } from '../../api/lib/pipeline/peak.js';

// The cost math from logAIUsage, isolated.
const cost = ({ fresh = 0, cached = 0, cacheWrite = 0, completion = 0, pricing, offPeak = null, at, cal = 1 }) => {
  const off = offPeak && inOffPeak(DEFAULT_PEAK_WINDOWS, at);
  const inMult = off ? offPeak.input : 1;
  const outMult = off ? offPeak.output : 1;
  return cal * ((fresh * pricing.input + cached * pricing.input * 0.1 + cacheWrite * pricing.input * 1.25) * inMult
    + completion * pricing.output * outMult) / 1000;
};

const DEEPSEEK = { input: 0.00027, output: 0.0011 };
const OFFPEAK = { input: 0.5, output: 0.5 };
// 10:00 UTC is inside the full-price window (00:30-16:30); 20:00 UTC is inside the discounted one.
const PEAK_TIME = new Date('2026-08-13T10:00:00Z');
const OFF_TIME = new Date('2026-08-13T20:00:00Z');

describe('the discount the scheduler pauses for is the one we bill', () => {
  it('the two questions are exact inverses — one window, one owner', () => {
    expect(nowInPeak(DEFAULT_PEAK_WINDOWS, PEAK_TIME)).toBe(true);
    expect(inOffPeak(DEFAULT_PEAK_WINDOWS, PEAK_TIME)).toBe(false);
    expect(inOffPeak(DEFAULT_PEAK_WINDOWS, OFF_TIME)).toBe(true);
  });

  it('an off-peak call costs less than the same call at peak', () => {
    const args = { fresh: 10000, completion: 2000, pricing: DEEPSEEK, offPeak: OFFPEAK };
    const peak = cost({ ...args, at: PEAK_TIME });
    const off = cost({ ...args, at: OFF_TIME });
    expect(off).toBeCloseTo(peak * 0.5, 10);
  });

  it('grounding runs off-peak, so the all-time figure halves at the documented chat rate', () => {
    // Not a claim about the true invoice — a claim that the correction moves the estimate the right way and
    // by the documented amount. AI_COST_CALIBRATION closes any residual gap against the real bill.
    expect(1854.7 * 0.5).toBeCloseTo(927.35, 2);
  });

  it('a model with no off-peak block is billed unchanged, whenever it runs', () => {
    const args = { fresh: 10000, completion: 2000, pricing: DEEPSEEK, offPeak: null };
    expect(cost({ ...args, at: OFF_TIME })).toBeCloseTo(cost({ ...args, at: PEAK_TIME }), 12);
  });
});

describe('cache accounting stays intact under the discount', () => {
  it('cache reads bill at a tenth of input, and the discount applies on top', () => {
    const base = { fresh: 0, cached: 10000, completion: 0, pricing: DEEPSEEK, offPeak: OFFPEAK };
    expect(cost({ ...base, at: PEAK_TIME })).toBeCloseTo(10000 * DEEPSEEK.input * 0.1 / 1000, 12);
    expect(cost({ ...base, at: OFF_TIME })).toBeCloseTo(10000 * DEEPSEEK.input * 0.1 * 0.5 / 1000, 12);
  });

  it('a cache WRITE costs more than fresh input — it is paid once, then amortised', () => {
    const w = cost({ cacheWrite: 10000, pricing: DEEPSEEK, at: PEAK_TIME });
    const f = cost({ fresh: 10000, pricing: DEEPSEEK, at: PEAK_TIME });
    expect(w).toBeGreaterThan(f);
  });
});

describe('calibration is a dial, not a rewrite of history', () => {
  it('scales the estimate linearly so it can be matched to an invoice', () => {
    const args = { fresh: 10000, completion: 2000, pricing: DEEPSEEK, offPeak: OFFPEAK, at: OFF_TIME };
    expect(cost({ ...args, cal: 0.5 })).toBeCloseTo(cost(args) * 0.5, 12);
  });

  it('defaults to 1 — no silent correction factor in the numbers', () => {
    const args = { fresh: 1000, pricing: DEEPSEEK, at: PEAK_TIME };
    expect(cost({ ...args, cal: 1 })).toBe(cost(args));
  });
});
