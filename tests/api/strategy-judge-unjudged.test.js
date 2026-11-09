// An unreadable judge verdict is unjudged (null), never a silent 4; too many unjudged rows fail the gate.
import { describe, it, expect } from 'vitest';
import { scoreOf, decidePromotion, liveJudge } from '../../api/lib/assistant/strategy-promote.js';

const row = (c, u) => ({ set: 'fresh', question: 'q', cand: { score: c, ms: 1, usd: 0, jev_pick: 's' }, cur: { score: u, ms: 1, usd: 0 } });

describe('unjudged verdicts', () => {
  it('scoreOf: verdict null → null; pass → 10; weak sev 2 → 4', () => {
    expect(scoreOf({ verdict: null, score: null })).toBeNull();
    expect(scoreOf({ verdict: 'pass' })).toBe(10);
    expect(scoreOf({ verdict: 'weak', severity: 2 })).toBe(4);
  });
  it('more than half unjudged → the gate fails and says so', () => {
    const d = decidePromotion([row(9, 8), row(null, 8), row(null, null)], { name: 's', cfg: { margin: 0.5, max_regress: 2, ms_ratio: 9, usd_ratio: 9, jev_class_share: 0, jev_guard_max: 9 } });
    expect(d.numbers.unjudged).toBe(2);
    expect(d.failed.some((f) => f.startsWith('judge unreadable on 2/3'))).toBe(true);
  });
  it('liveJudge retries once, then returns unjudged with the raw head', async () => {
    let n = 0;
    const j = await liveJudge(async () => { n++; return { text: 'not json', usd: 0.01 }; })({ question: 'q', reply: 'r', path: {} });
    expect(n).toBe(2);
    expect(j.score).toBeNull();
    expect(j.why).toMatch(/^unjudged: not json/);
    expect(scoreOf(j)).toBeNull();
  });
});
