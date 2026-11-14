// assessSpend (pure): failing / loop / spike / cap-pace fire on burn, stay silent on healthy 11-14-like data.
import { describe, it, expect } from 'vitest';
import { assessSpend } from '../../api/lib/ops/spend-watch.js';

const row = (o) => ({ caller: 'segmenter', calls: 10, usd: 0.1, failures: 0, docs: 5, max_doc_calls: 2, max_doc_id: 1, max_doc_usd: 0.01, ...o });
const now = Date.parse('2026-11-14T12:00:00Z');
const kinds = (f) => f.map((x) => x.kind).sort();

describe('assessSpend', () => {
  it('failing: paying for errors', () => {
    const f = assessSpend({ window: { w2: [row({ usd: 1.2, calls: 20, failures: 10 })], w1: [] }, now });
    expect(kinds(f)).toEqual(['failing']);
    expect(f[0].action).toMatch(/SPEND_CAP_OTHER_USD=0/);
  });
  it('loop: one document redone', () => {
    const f = assessSpend({ window: { w2: [row({ usd: 0.9, calls: 40, max_doc_calls: 30, max_doc_id: 77, max_doc_usd: 0.8 })], w1: [] }, now });
    expect(kinds(f)).toEqual(['loop']);
    expect(f[0].evidence).toMatch(/77/);
  });
  it('spike: last hour 4x baseline and over $2', () => {
    const f = assessSpend({ window: { w2: [], w1: [row({ caller: 'media-asr', usd: 3, calls: 50 })] }, baseline: { 'media-asr': { median_usd_h: 0.5 } }, now });
    expect(kinds(f)).toEqual(['spike']);
  });
  it('no spike when the caller is normally that busy', () => {
    const f = assessSpend({ window: { w2: [], w1: [row({ usd: 3 })] }, baseline: { segmenter: { median_usd_h: 2.5 } }, capOf: () => Infinity, now });
    expect(f).toEqual([]);
  });
  it('healthy 11-14 data: anis-agent-edge $14/24h, 0 failures -> nothing', () => {
    const w1 = [row({ caller: 'anis-agent-edge', usd: 0.9, calls: 8 }), row({ usd: 0.15, calls: 65 })];
    const w2 = [row({ caller: 'anis-agent-edge', usd: 1.6, calls: 15 }), row({ usd: 0.3, calls: 130 })];
    expect(assessSpend({ window: { w2, w1 }, baseline: { 'anis-agent-edge': { median_usd_h: 0.6 }, segmenter: { median_usd_h: 0.1 } }, spentToday: { anis: 7, other: 1 }, now })).toEqual([]);
  });
  it('small spend under thresholds -> nothing, even with failures', () => {
    expect(assessSpend({ window: { w2: [row({ usd: 0.2, calls: 4, failures: 4 })], w1: [row({ usd: 0.2 })] }, now })).toEqual([]);
  });
  it('cap-pace: projects past the group cap, informational', () => {
    const f = assessSpend({ window: { w2: [], w1: [row({ caller: 'anis-agent-edge', usd: 1.5 })] }, spentToday: { anis: 10 }, capOf: () => 20, now });
    expect(kinds(f)).toEqual(['cap-pace']);
  });
  it('cap-pace: exempt caller and already-capped group are skipped', () => {
    const w1 = [row({ caller: 'search-query', usd: 1.5 })];
    expect(assessSpend({ window: { w2: [], w1 }, spentToday: {}, capOf: () => 5, now })).toEqual([]);
    expect(assessSpend({ window: { w2: [], w1: [row({ usd: 1.5 })] }, spentToday: { other: 6 }, capOf: () => 5, now })).toEqual([]);
  });
});
