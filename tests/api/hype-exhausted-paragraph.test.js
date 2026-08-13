// DONE MEANS THE WORK WAS DONE, NEVER THAT IT PRODUCED OUTPUT.
//
// We cannot know in advance whether a paragraph has a hypothetical question worth asking — a heading
// fragment, a publisher line and a list of dates legitimately yield none — and fabricating one to satisfy
// a counter would poison the retrieval index the questions exist to serve. So completion is the stage's
// VERSION STAMP (content.hyp_model), and the question column is free to be empty.
//
// Measuring output instead cost a permanent re-grounding loop on 2026-08-13: books 519 and 12443 ran every
// stage, verified ok:true / missing:[], printed "COMPLETE + SEARCHABLE", and were re-queued forever,
// because a paragraph the generator could not handle was left NULL — indistinguishable from "not tried".
import { describe, it, expect } from 'vitest';
import { isHyped, meetsHypeBar, HYPE_DONE_SQL, HYPE_THRESHOLD } from '../../api/lib/pipeline/processed.js';

const V = 'hype-v3-adaptive';

describe('processed is the stamp, not the yield', () => {
  it('a stamped paragraph with NO questions is done — that is a real result, not a failure', () => {
    expect(isHyped({ hypModel: V, hyp: '[]' }, V)).toBe(true);
  });

  it('a stamped paragraph with questions is done', () => {
    expect(isHyped({ hypModel: V, hyp: '["q1","q2"]' }, V)).toBe(true);
  });

  it('an unprocessed paragraph is not done, however it looks', () => {
    expect(isHyped({ hypModel: null, hyp: null }, V)).toBe(false);
  });

  it('an OLDER stamp is not done — an upgrade is real remaining work', () => {
    expect(isHyped({ hypModel: 'hype-v2', hyp: '["q"]' }, V)).toBe(false);
  });

  it('a legacy row predating the stamp counts on its questions, so millions are not redone', () => {
    // hyp_model arrived in migration 98; rows hyped before it are processed and must not be re-run.
    expect(isHyped({ hypModel: null, hyp: '["q1"]' }, V)).toBe(true);
    expect(isHyped({ hypModel: null, hyp: '[]' }, V)).toBe(false);
  });

  it('the SQL measure counts the stamp, with the legacy arm — never the question count alone', () => {
    expect(HYPE_DONE_SQL).toContain('hyp_model IS NOT NULL');
    expect(HYPE_DONE_SQL).toContain('OR');                       // the documented legacy clause
  });
});

describe('the loop those two books were stuck in', () => {
  // 519: ~10 hypeable, 1 unprocessable. 12443: ~20 hypeable, 3 unprocessable.
  it('519 clears once the unprocessable paragraph counts as processed', () => {
    expect(meetsHypeBar(8, 10)).toBe(false);     // left NULL → 80% → "did not reach verify", forever
    expect(meetsHypeBar(9, 10)).toBe(true);      // stamped   → 90% → done
  });

  it('12443, with three of them, was further under the bar', () => {
    expect(meetsHypeBar(17, 20)).toBe(false);
    expect(meetsHypeBar(20, 20)).toBe(true);
  });

  it('a genuinely un-hyped book still fails the bar — the gate is not defanged', () => {
    expect(meetsHypeBar(2, 20)).toBe(false);
  });

  it('a book with nothing hypeable is not held back forever', () => {
    expect(meetsHypeBar(0, 0)).toBe(true);
  });

  it('the bar is a named constant, not a number sprinkled through the pipeline', () => {
    expect(HYPE_THRESHOLD).toBe(0.9);
  });
});
