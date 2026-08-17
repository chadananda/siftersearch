// The reconcile bar catches "reconcile never ran" (0 decisions against 500 clusters — the Vols 6/7/9 bug).
// As a bare 0.85 ratio it was unachievable on SMALL books: with 5 clusters it demands 5/5, so a tiny book
// must reconcile PERFECTLY while a 500-cluster book may leave 75 undecided. Two books sat quarantined on
// exactly that arithmetic — 9065 at 4/5, 1193 at 3/4 — each one decision short of a bar it could not reach.
// One undecided cluster is also not a failure by our own doctrine: a bare name with no evidence is HELD.
import { describe, it, expect } from 'vitest';
import { meetsReconcileBar, RECONCILE_THRESHOLD } from '../../api/lib/pipeline/processed.js';
import { isDoneFromArtifacts, blockingGate } from '../../api/lib/pipeline/queue.js';

describe('meetsReconcileBar', () => {
  it('still catches the bug it was built for: reconcile never ran', () => {
    expect(meetsReconcileBar(0, 500)).toBe(false);
    expect(meetsReconcileBar(0, 5)).toBe(false);
  });

  it('the two quarantined books now pass — they were one decision short of an unreachable bar', () => {
    expect(meetsReconcileBar(4, 5)).toBe(true);    // doc 9065
    expect(meetsReconcileBar(3, 4)).toBe(true);    // doc 1193
  });

  it('nothing to reconcile is not a failure', () => {
    expect(meetsReconcileBar(0, 0)).toBe(true);
  });

  it('the ratio still governs a large book — slack must not become a loophole', () => {
    expect(meetsReconcileBar(425, 500)).toBe(true);    // exactly 0.85
    expect(meetsReconcileBar(424, 500)).toBe(false);   // below it, and 76 outstanding is not "one"
    expect(meetsReconcileBar(100, 500)).toBe(false);
  });

  it('tolerates AT MOST one outstanding cluster', () => {
    expect(meetsReconcileBar(3, 5)).toBe(false);   // two short of five → still blocked
    expect(RECONCILE_THRESHOLD).toBe(0.85);
  });
});

describe('the bar is the SAME one everywhere it is applied', () => {
  // It lived in three places (isDoneFromArtifacts, blockingGate, resumeStageFor). Three copies of "done" is
  // how a book gets called finished by one measure and unfinished by another, which cost a night in August.
  const artifacts = { prose: 10, disamb: 10, extracted: 10, hyped: 10, hypeable: 10, clusters: 5, decisions: 4 };

  it('completion and the blocking-gate explanation agree', () => {
    expect(isDoneFromArtifacts(artifacts, {})).toBe(true);
    expect(blockingGate(artifacts, {})).toBeNull();
  });

  it('and they agree when it genuinely has not run', () => {
    const never = { ...artifacts, decisions: 0 };
    expect(isDoneFromArtifacts(never, {})).toBe(false);
    expect(blockingGate(never, {})?.gate).toBe('reconcile');
  });
});
