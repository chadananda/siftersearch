// The answer-path decision battery, run in CI so a regression cannot ship.
//
// Phase 1 (offline half) of planning/search-quality-plan.md. Validated against history rather than asserted:
// replaying the PRE-FIX rules over these same fixtures fails `justice-paraphrase` (the bug Chad reported) and
// `justice-paraphrase-likely` (my own too-timid first fix), while `genuine-absence` and `weak-collision` pass
// under every version — so the battery discriminates real regressions from the protections we want kept.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isQuoteMiss, buildWebQuestion } from '../../api/lib/jafar-pipeline.js';

const CASES = JSON.parse(readFileSync(join(process.cwd(), 'tests/quality/answer-decisions.json'), 'utf8'));

describe('answer-path decisions (fixture battery)', () => {
  for (const c of CASES) {
    it(`${c.id}: quote_miss=${c.expect.quote_miss} — ${c.expect.reason}`, () => {
      const candidates = (c.candidates || []).map((text) => ({ text }));
      expect(isQuoteMiss({ span: c.span, confidence: c.confidence }, candidates)).toBe(c.expect.quote_miss);
    });
  }

  it('when we DO consult the web, the question keeps the user\'s wording and none of the old steering', () => {
    for (const c of CASES.filter((x) => x.expect.quote_miss)) {
      const q = buildWebQuestion(c.question, { span: c.span, confidence: c.confidence });
      expect(q.startsWith(c.question)).toBe(true);
      expect(q).not.toMatch(/authoritative compilation|earlier book it cites/i);
    }
  });
});
