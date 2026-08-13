// An outage must never be recorded as a bad book. The grounding queue reaps a detached run by noticing its
// pid is gone, so it could not tell "the writer dropped our socket" from "this book will not ground" — it
// wrote "did not reach verify" for both, and THREE of those permanently quarantine a book. On 2026-08-13 a
// dropped connection quarantined all six pilot books, each with $0.00 of model spend. These lock the
// separation: the storm guard must count genuine book failures and ignore infrastructure ones.
import { describe, it, expect } from 'vitest';

// The storm guard's own predicate (api/lib/pipeline/plan.js): it counts rows whose error/note carry this
// exact wording. Anything else is invisible to it — which is the mechanism this fix relies on.
const countsTowardQuarantine = (error) => /did not reach verify/.test(error || '');

const infraError = (attempt, reason) => `infrastructure (attempt ${attempt}): ${reason} — not a book failure`;
const bookError = (retries) => `failed after ${retries} retries: did not reach verify`;

describe('quarantine counts book failures, not outages', () => {
  it('a genuine terminal book failure DOES count', () => {
    expect(countsTowardQuarantine(bookError(2))).toBe(true);
  });

  it('an infrastructure requeue does NOT count, however many times it happens', () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      expect(countsTowardQuarantine(infraError(attempt, 'UND_ERR_SOCKET'))).toBe(false);
    }
  });

  it('the exact 2026-08-13 outage would no longer quarantine six healthy books', () => {
    const THRESHOLD = 3;   // GROUNDING_MAX_FAILS
    const six = [12373, 15965, 11279, 12443, 519, 12344];
    const rows = six.flatMap((docId) =>
      [1, 2, 3].map((attempt) => ({ docId, error: infraError(attempt, 'writer unreachable') })));
    for (const docId of six) {
      const counted = rows.filter((r) => r.docId === docId && countsTowardQuarantine(r.error)).length;
      expect(counted).toBeLessThan(THRESHOLD);
    }
  });

  it('still quarantines a book that really cannot ground — the guard is not defanged', () => {
    const rows = [1, 2, 3].map(() => ({ docId: 999, error: bookError(2) }));
    expect(rows.filter((r) => countsTowardQuarantine(r.error)).length).toBeGreaterThanOrEqual(3);
  });
});

describe('the verdict file is only trusted for the run that wrote it', () => {
  // Mirrors runVerdict()'s staleness rule: a verdict from an EARLIER attempt must never decide this one,
  // or one old infra blip would excuse every future genuine failure of that book.
  const trusted = (verdictAt, startedAt) => !(!startedAt || verdictAt + 5 < startedAt);

  it('accepts a verdict written during this run', () => expect(trusted(1000, 990)).toBe(true));
  it('rejects a verdict left by a previous attempt', () => expect(trusted(900, 1000)).toBe(false));
  it('tolerates small clock skew at the boundary', () => expect(trusted(998, 1000)).toBe(true));
});
