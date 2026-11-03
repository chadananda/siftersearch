import { describe, it, expect, afterEach } from 'vitest';
import { MODEL_ROLES, modelFor } from '../../api/lib/model-roles.js';
import { MODEL_REGISTRY } from '../../api/lib/model-registry.js';
import { reviewRoles, EVALS, summarizeEval, recommend, changeLine, buildSection, measureDue, parseDryEstimate, priceStaleness, NOISE } from '../../api/lib/model-review.js';

afterEach(() => { delete process.env.MODEL_ROLE_ANIS_TERM; });

describe('model roles', () => {
  it('every role names a provider, model, review date and reason; unknown role throws', () => {
    for (const [role, r] of Object.entries(MODEL_ROLES)) expect(r, role).toMatchObject({ provider: expect.any(String), model: expect.any(String), reviewed: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), why: expect.any(String) });
    expect(() => modelFor('no-such-role')).toThrow(/unknown role/);
  });
  it('env override per role', () => {
    process.env.MODEL_ROLE_ANIS_TERM = 'anthropic:claude-haiku-5-5';
    expect(modelFor('assistant-term')).toEqual({ provider: 'anthropic', model: 'claude-haiku-5-5' });
  });
  it('review flags stale reviews, deprecated models and newer cheaper candidates', () => {
    const registry = {
      old: { type: 'chat', pricing: { input: 1, output: 1 }, released: '2025-01-01', deprecated: true },
      a: { type: 'chat', pricing: { input: 1, output: 1 }, released: '2025-01-01' },
      b: { type: 'chat', pricing: { input: 0.1, output: 0.5 }, released: '2026-10-07' },
    };
    const rows = reviewRoles({ x: { provider: 'p', model: 'a', reviewed: '2026-01-01' }, y: { provider: 'p', model: 'old', reviewed: '2026-10-10' } },
      registry, { now: new Date('2026-10-11') });
    expect(rows[0].flags.join('|')).toMatch(/review \d+ days old.*newer & cheaper: b/);
    expect(rows[1].flags).toContain('model deprecated');
  });
  it('a model released before the last review was part of that choice: not flagged again', () => {
    const registry = { a: { type: 'chat', pricing: { input: 1, output: 1 }, released: '2025-01-01' }, b: { type: 'chat', pricing: { input: 0.1, output: 0.5 }, released: '2026-10-07' } };
    expect(reviewRoles({ x: { provider: 'p', model: 'a', reviewed: '2026-10-19' } }, registry, { now: new Date('2026-11-03') })[0].flags).toEqual([]);
  });
  it('the real table reviews without throwing', () => {
    expect(reviewRoles(MODEL_ROLES, MODEL_REGISTRY).length).toBe(Object.keys(MODEL_ROLES).length);
  });
  it('every declared eval exists; the writing roles carry one', () => {
    for (const [role, r] of Object.entries(MODEL_ROLES)) if (r.eval) expect(EVALS[r.eval], role).toBeTruthy();
    expect(MODEL_ROLES['anis-writer'].eval).toBe('anis-writer-ab');
    expect(EVALS['anis-writer-ab'].args('assistant-answer', MODEL_ROLES['assistant-answer'], { sample: 20, tag: 'review-assistant-answer' }))
      .toEqual(['--compare', 'writer', '--role', 'assistant-answer', '--sample', '20', '--mode', 'current', '--tag', 'review-assistant-answer']);
  });
  it('cadence and the harness --dry estimate', () => {
    expect(measureDue(null)).toBe(true);
    expect(measureDue('2026-10-27', new Date('2026-11-03T06:00Z'))).toBe(false);   // a week after → re-flag only
    expect(measureDue('2026-10-20', new Date('2026-11-03T06:00Z'))).toBe(true);    // two weeks after → measure
    expect(parseDryEstimate('estimate: $0.3235/question (shared $0.03 + writers $0.0354 + judge $0.258) → ~$6.47 total')).toBe(6.47);
    expect(parseDryEstimate('boom')).toBeNull();
  });
});

// a report in the anis-writer-ab.mjs shape (summary.variants.base, summary.pairs, summary.ranking)
const report = (cands) => ({ role: 'anis-writer', date: '2026-11-03', baseline: 'anthropic:claude-sonnet-5-5', spend: { anis: 1.2, judge: 4.8 },
  summary: { n: 20, judged: 18, variants: { base: { ms_median: 21000, usd_mean: 0.012 } },
    pairs: cands.map((c) => ({ contender: c.id, n: c.win + c.tie + c.loss, reference_scores: { accuracy: 4.5, completeness: 4.2, brevity: 3.8, format_fit: 4.1 } })),
    ranking: cands.map((c) => ({ writer: c.writer, quality: c.q, quality_vs_base: r2(c.q - 4.15), win: c.win, tie: c.tie, loss: c.loss, brevity: 4, completeness: 4, ms_median: c.ms, usd_mean: c.usd })) } });
const r2 = (x) => Math.round(x * 100) / 100;
const haiku = { id: 'h', writer: 'anthropic:claude-haiku-5-5' }, gem = { id: 'g', writer: 'gemini:gemini-3.5-flash-lite' };

describe('model review: measure → recommend', () => {
  it('summarizes the current model on the same axes as the candidates', () => {
    const ev = summarizeEval(report([{ ...haiku, q: 4.1, win: 6, tie: 8, loss: 4, ms: 6000, usd: 0.001 }]));
    expect(ev.current).toMatchObject({ writer: 'anthropic:claude-sonnet-5-5', quality: 4.15, brevity: 3.8, completeness: 4.2, ms_median: 21000, usd_mean: 0.012 });
    expect(ev).toMatchObject({ judged: 18, spend_usd: 6 });
    expect(ev.candidates[0]).toMatchObject({ n: 18, quality_vs_base: -0.05 });
  });
  it('switch: quality within judge noise, not losing more than it wins/ties, and cheaper or faster — cheapest such candidate', () => {
    const rec = recommend(summarizeEval(report([{ ...gem, q: 4.2, win: 7, tie: 7, loss: 4, ms: 5000, usd: 0.004 }, { ...haiku, q: 4.05, win: 5, tie: 8, loss: 5, ms: 6000, usd: 0.001 }])));
    expect(rec.verdict).toBe('switch');
    expect(rec.candidate.writer).toBe('anthropic:claude-haiku-5-5');
    expect(rec.reason).toMatch(/92% cheaper and 71% faster/);
  });
  it('keep: every candidate loses more than the noise', () => {
    const rec = recommend(summarizeEval(report([{ ...haiku, q: 4.15 - NOISE - 0.6, win: 2, tie: 3, loss: 13, ms: 6000, usd: 0.001 }])));
    expect(rec.verdict).toBe('keep');
    expect(rec.reason).toMatch(/every candidate loses quality/);
  });
  it('keep: holds quality but is neither cheaper nor faster', () => {
    expect(recommend(summarizeEval(report([{ ...gem, q: 4.2, win: 8, tie: 6, loss: 4, ms: 20000, usd: 0.0115 }]))).verdict).toBe('keep');
  });
  it('inconclusive below the minimum judged count', () => {
    expect(recommend(summarizeEval(report([{ ...haiku, q: 4.3, win: 3, tie: 2, loss: 1, ms: 6000, usd: 0.001 }]))).verdict).toBe('inconclusive');
  });
  it('the change line is exact; a keep only re-dates the review', () => {
    expect(changeLine('anis-writer', 'switch', 'anthropic:claude-haiku-5-5', '2026-11-03'))
      .toBe("api/lib/model-roles.js 'anis-writer': provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-11-03' (try it first without a deploy: MODEL_ROLE_ANIS_WRITER=anthropic:claude-haiku-5-5)");
    expect(changeLine('anis-writer', 'keep', null, '2026-11-03')).toBe("api/lib/model-roles.js 'anis-writer': reviewed: '2026-11-03'");
    expect(changeLine('anis-writer', 'inconclusive', null, '2026-11-03')).toBeNull();
  });
});

describe('model review: the maintenance section', () => {
  const registry = { a: { type: 'chat', pricing: { input: 1, output: 1 }, released: '2025-01-01' }, b: { type: 'chat', pricing: { input: 0.1, output: 0.5 }, released: '2026-10-07', priceChecked: '2026-10-07' } };
  const now = new Date('2026-11-03T06:00Z');
  it('nothing flagged → no items, no html (the weekly email leaves it out)', () => {
    const roles = { x: { provider: 'p', model: 'b', reviewed: '2026-11-01' } };
    const s = buildSection({ rows: reviewRoles(roles, registry, { now }), roles, registry, now });
    expect(s).toMatchObject({ source: 'model-review', items: [], html: '', summary: 'nothing to report' });
    expect(s.generated).toBe(now.toISOString());
  });
  it('a measured choice, an unmeasurable flagged role, budget skips, stale reviews and unverified prices', () => {
    const roles = { w: { provider: 'p', model: 'a', reviewed: '2026-10-05', eval: 'anis-writer-ab', why: 'writes' }, u: { provider: 'p', model: 'a', reviewed: '2026-10-05' },
      s: { provider: 'p', model: 'b', reviewed: '2026-09-01' }, k: { provider: 'p', model: 'a', reviewed: '2026-10-05', eval: 'anis-writer-ab' }, d: { provider: 'p', model: 'a', reviewed: '2026-10-20' } };
    const ev = { ...summarizeEval(report([{ ...haiku, q: 4.1, win: 6, tie: 8, loss: 4, ms: 6000, usd: 0.001 }])), role: 'w' };
    const s = buildSection({ rows: reviewRoles(roles, registry, { now }), evals: [{ ev, measured_at: '2026-11-03' }], skipped: [{ role: 'k', reason: 'estimate $9 exceeds the $4.00 left' }], roles, registry, now, lastMeasured: '2026-11-03' });
    expect(s.title).toBe('Model review: 1 change(s) to choose');
    expect(s.items.map((i) => [i.kind, i.role])).toEqual([['choice', 'w'], ['backlog', 'k'], ['backlog', 'u'], ['note', null], ['note', null]]);
    expect(s.items[0]).toMatchObject({ recommendation: 'switch', change: expect.stringContaining("model: 'claude-haiku-5-5'") });
    expect(s.items[2].text).toMatch(/newer & cheaper: b — flagged, no eval yet, can't be measured/);
    expect(s.items[3].text).toMatch(/not re-measured in over a month.*s \(63 d\)/);
    expect(s.items[4].text).toMatch(/Prices never verified.*: a — /);   // b carries priceChecked
    expect(s.html).toContain('<table');
    expect(s.html).not.toMatch(/<script/);
    expect(priceStaleness({ q: { provider: 'systemone', model: 'jev' } }, registry)).toEqual([]);
  });
});

