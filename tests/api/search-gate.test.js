// search-gate pure diff/verdict on tiny synthetic runs.
import { describe, it, expect } from 'vitest';
import { normalize, diffRuns, verdict, parseJson } from '../quality/search-gate.mjs';
const S = (rs) => ({ results: rs.map(([id, ok, rank, category = 'a', latency_ms = 100, errorType]) => ({ id, ok, rank, category, latency_ms, errorType })) });
const run = (rs) => normalize({ search: S(rs) });
describe('search-gate', () => {
  it('finds flips both ways and ignores errored fixtures', () => {
    const d = diffRuns(run([['1', true, 1], ['2', false, null], ['3', true, 2], ['4', true, 1]]), run([['1', false, null], ['2', true, 3], ['3', true, 2], ['4', false, null, 'a', 100, 'timeout']]));
    expect(d.regress.map((f) => f.key)).toEqual(['s:1']);
    expect(d.fixed.map((f) => f.key)).toEqual(['s:2']);
    expect(d.regress[0]).toMatchObject({ before: 1, after: null });
  });
  it('passes within noise, fails on net regressions', () => {
    const b = Array.from({ length: 100 }, (_, i) => [String(i), true, 1]);
    const worse = (n) => b.map(([id, , r], i) => [id, i >= n, i >= n ? r : null]);
    expect(verdict(diffRuns(run(b), run(worse(2)))).pass).toBe(true);
    const v = verdict(diffRuns(run(b), run(worse(10))));
    expect(v.pass).toBe(false); expect(v.reasons[0]).toMatch(/net regressions 10/);
  });
  it('recheck removes flake; fixes offset regressions', () => {
    const b = Array.from({ length: 100 }, (_, i) => [String(i), i < 50, i < 50 ? 1 : null]);
    const a = b.map(([id, ok, r], i) => i < 10 ? [id, false, null] : i >= 50 && i < 54 ? [id, true, 2] : [id, ok, r]);
    const d = diffRuns(run(b), run(a));
    expect(d.regress.length).toBe(10); expect(d.fixed.length).toBe(4);
    expect(verdict(d, { noise: 2 }).pass).toBe(false);
    const flake = new Map(d.regress.slice(0, 8).map((f) => [f.key, true]));
    const v = verdict(d, { noise: 2, recheck: flake, maxCatDrop: 100 });
    expect(v.flakeRegress).toBe(8); expect(v.pass).toBe(true);
  });
  it('fails on category collapse and latency blow-up', () => {
    const b = Array.from({ length: 40 }, (_, i) => [String(i), true, 1, 'c', 100]);
    const a = b.map(([id, , r], i) => [id, i >= 3, i >= 3 ? r : null, 'c', 300]);
    const v = verdict(diffRuns(run(b), run(a)), { noise: 5 });
    expect(v.reasons.join()).toMatch(/p50 latency/);
  });
  it('parses JSON after dotenv banner', () => { expect(parseJson('◇ injected env\n{\n"a":1}')).toEqual({ a: 1 }); });
});
