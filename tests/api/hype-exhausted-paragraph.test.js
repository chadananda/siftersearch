// A book that RUNS every stage, verifies ok:true / missing:[] and prints "COMPLETE + SEARCHABLE" was still
// recorded "did not reach verify" and re-queued — forever, re-spending on finished work (books 519 and
// 12443, 2026-08-13). Cause: the completion gate is `hyped >= 0.9 * hypeable` counting
// `hyp_questions IS NOT NULL`, and a paragraph the generator could not handle was left NULL —
// indistinguishable from "not tried yet". On a small book a couple of those sit permanently under the bar.
//
// This is the SAME error the disambiguation measure made and that was fixed earlier the same day: counting
// OUTPUT instead of PROCESSING. See api/lib/pipeline/disambiguation.js.
import { describe, it, expect } from 'vitest';
import { HYPE_EXHAUSTED } from '../../api/lib/rag/enrich/retrieval.js';
import { meetsDisambBar } from '../../api/lib/pipeline/disambiguation.js';

// The stage's resume predicate (retrieval.js isDone).
const isDone = (p) => {
  if (p.hypThesis === HYPE_EXHAUSTED) return true;
  if (!p.hypThesis) return false;
  try { const a = JSON.parse(p.hyp); return Array.isArray(a) && a.length >= 1; } catch { return false; }
};
// The queue's completion gate (queue.js isDoneFromArtifacts).
const hypeGateOk = (hyped, hypeable) => hyped >= 0.9 * hypeable;

describe('an exhausted paragraph counts as PROCESSED', () => {
  it('resume skips it instead of paying for it every run', () => {
    expect(isDone({ hypThesis: HYPE_EXHAUSTED, hyp: '[]' })).toBe(true);
  });

  it('a paragraph never attempted is still attempted', () => {
    expect(isDone({ hypThesis: null, hyp: null })).toBe(false);
  });

  it('a normally generated paragraph is unaffected', () => {
    expect(isDone({ hypThesis: 'A thesis.', hyp: '["q1","q2"]' })).toBe(true);
  });

  it('an empty set WITHOUT the marker is not treated as done — no accidental amnesty', () => {
    expect(isDone({ hypThesis: 'A thesis.', hyp: '[]' })).toBe(false);
  });
});

describe('the books that looped', () => {
  // 519: 42 prose paragraphs, ~10 hypeable, 1 permanently unprocessable.
  // 12443: 55 prose, ~20 hypeable, 3 permanently unprocessable.
  it('519 was stuck below the bar while every stage had in fact run', () => {
    expect(hypeGateOk(9, 10)).toBe(true);           // counting the exhausted one as processed → clears
    expect(hypeGateOk(9, 10) && !hypeGateOk(8, 10)).toBe(true);
    expect(hypeGateOk(8, 10)).toBe(false);          // leaving it NULL → 80% → fails forever
  });

  it('12443, with three unprocessable paragraphs, was further under', () => {
    expect(hypeGateOk(17, 20)).toBe(false);         // 85% — the loop
    expect(hypeGateOk(20, 20)).toBe(true);          // all processed (3 of them exhausted) — done
  });

  it('the gate still fails a book that genuinely has not been hyped', () => {
    expect(hypeGateOk(2, 20)).toBe(false);
  });
});

describe('consistency with the disambiguation measure', () => {
  it('both count PROCESSED, not yield — an examined-but-empty item is complete', () => {
    expect(meetsDisambBar(98, 100)).toBe(true);     // empty notes count, same doctrine
    expect(hypeGateOk(18, 20)).toBe(true);
  });
});
