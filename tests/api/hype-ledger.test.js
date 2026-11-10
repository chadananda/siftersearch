// pipeline/hype-ledger — per-batch metrics (measureDoc/rates), grade summary, baseline comparison (auto-pause rule), file store.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { measureDoc, sumAcc, rates, gradeSummary, compare, createStore } from '../../api/lib/pipeline/hype-ledger.js';

const V = 'hype-v15-seeker';
const row = (id, qs, text = 'The soul of man is a sign of God and returns to Him after the passing of the body.') => ({ id, text, hyp_model: V, hyp_questions: JSON.stringify(qs) });
const outcome = (id, parts = 1) => ({ id, replies: Array.from({ length: parts }, () => '{}') });

describe('measureDoc', () => {
  it('counts sent/written/failed/exhausted, truncation and splits, faults by reason', () => {
    const a = measureDoc({ outcomes: [outcome(1), outcome(2), outcome(3, 2), outcome(4)], truncated: new Set([3]), version: V,
      result: { written: 2, failed: [4], exhausted: 1, alreadyDone: 0, gone: 0, stats: { yesNo: 3, nonLatin: 1, unverified: 2, version: V, partnerMerged: 9 } },
      rows: [row(1, ['What is the soul?', 'Where does the soul go after death?']), row(2, ['How does one pray?'])] });
    expect(a).toMatchObject({ sent: 4, written: 2, failed: 1, exhausted: 1, truncated: 1, split: 1, qCount: 3, qParas: 2, unverified: 2, faults: { yesNo: 3, nonLatin: 1 } });
  });
  it('flags near-duplicate questions within one set (Jaccard >= 0.8), not different ones', () => {
    const a = measureDoc({ outcomes: [outcome(1)], version: V, result: { written: 1, failed: [] },
      rows: [row(1, ['What is the purpose of life?', 'what is the purpose of life', 'Why must the body die?'])] });
    expect(a.dupQ).toBe(1);
    expect(a.qCount).toBe(3);
  });
  it('ignores rows of failed ids or another version, and samples a share of the written paragraphs', () => {
    const rows = [row(1, ['q one here?']), { ...row(2, ['q two here?']), hyp_model: 'hype-v14' }, row(3, ['q three here?'])];
    const a = measureDoc({ outcomes: [outcome(1), outcome(2), outcome(3)], version: V, result: { written: 2, failed: [3] }, rows, sampleRate: 1 });
    expect(a.qParas).toBe(1);
    expect(a.sampleIds).toEqual([1]);
    expect(measureDoc({ outcomes: [outcome(1)], version: V, result: { written: 1, failed: [] }, rows: [row(1, ['q one here?'])], sampleRate: 0 }).sampleIds).toEqual([]);
  });
  it('question language vs paragraph language: English questions on a French passage are a mismatch', () => {
    const fr = 'Le monde est une illusion et les hommes sont dans le sommeil, mais la vérité est dans le cœur de ceux qui sont purs, et la lumière de Dieu est avec eux dans tout ce qu\'ils font pour les autres, comme il est écrit dans les livres.'.repeat(2);
    const en = ['What does the passage say about the world being an illusion and why people are asleep to it?', 'Where is the truth found according to those who are pure in heart and with the light of God?', 'How do the pure act toward other people according to the books and the light that is with them?'];
    const bad = measureDoc({ outcomes: [outcome(1)], version: V, result: { written: 1, failed: [] }, rows: [row(1, en, fr)] });
    expect(bad.langChecked).toBe(1);
    expect(bad.langBad).toBe(1);
    const good = measureDoc({ outcomes: [outcome(1)], version: V, result: { written: 1, failed: [] }, rows: [row(1, en)] });
    expect(good.langBad).toBe(0);
  });
});

describe('rates / sumAcc', () => {
  it('turns totals into per-batch rates', () => {
    const a = measureDoc({ outcomes: [outcome(1), outcome(2), outcome(3, 2), outcome(4)], truncated: new Set([3]), version: V,
      result: { written: 2, failed: [4], exhausted: 1, stats: { yesNo: 3, nonLatin: 1 } }, rows: [row(1, ['What is the soul?', 'Where does the soul go after death?']), row(2, ['How does one pray?'])] });
    const r = rates(sumAcc([a, a]));
    expect(r).toMatchObject({ sent: 8, questionsPerPara: 1.5, faultRate: 0.5714, truncationRate: 0.25, splitRate: 0.25, failedRate: 0.25, exhaustedRate: 0.25, emptyRate: 0.25 });   // 8 sent - 2 failed - 4 with questions = 2 empty
    expect(r.faultByReason).toEqual({ yesNo: 0.4286, nonLatin: 0.1429 });   // dropped / (dropped + kept) = 8 / 14
  });
});

describe('gradeSummary', () => {
  it('percentages over graded questions and missed per paragraph', () => {
    const g = gradeSummary([{ questions: [{ searchable: true, answered: true, distinct: true }, { searchable: false, answered: true, distinct: true }], missed: ['a'] }, { questions: [{ searchable: true, answered: false, distinct: true }], missed: [] }]);
    expect(g).toMatchObject({ paragraphs: 2, questions: 3, searchablePct: 66.7, answeredPct: 66.7, distinctPct: 100, missedPerParagraph: 0.5 });
  });
});

describe('compare (auto-pause rule)', () => {
  const base = { questionsPerPara: 3, faultRate: 0.1, emptyRate: 0.02, exhaustedRate: 0.01, truncationRate: 0.02, failedRate: 0.02, dupRate: 0.03, langMismatchRate: 0, searchablePct: 90, answeredPct: 92, distinctPct: 95 };
  const same = { ...base, sent: 5000 };
  it('no baseline → never judges (never guessed)', () => { expect(compare({ ...same, faultRate: 0.9 }, null)).toEqual([]); });
  it('equal to the baseline is fine, and a small sample is not judged', () => {
    expect(compare(same, base)).toEqual([]);
    expect(compare({ ...same, sent: 50, faultRate: 0.9 }, base)).toEqual([]);
  });
  it('rates beyond max(base*(1+rel), base+abs) violate; inside the margin do not', () => {
    expect(compare({ ...same, faultRate: 0.12 }, base)).toEqual([]);          // limit 0.125
    const v = compare({ ...same, faultRate: 0.2, truncationRate: 0.2 }, base);
    expect(v.map((x) => x.metric).sort()).toEqual(['faultRate', 'truncationRate']);
    expect(v.find((x) => x.metric === 'faultRate')).toMatchObject({ value: 0.2, baseline: 0.1, limit: 0.125 });
  });
  it('a zero baseline still allows the absolute margin', () => {
    expect(compare({ ...same, langMismatchRate: 0.01 }, base)).toEqual([]);
    expect(compare({ ...same, langMismatchRate: 0.05 }, base).map((x) => x.metric)).toEqual(['langMismatchRate']);
  });
  it('questions per paragraph may not fall more than the relative margin', () => {
    expect(compare({ ...same, questionsPerPara: 2.5 }, base)).toEqual([]);
    expect(compare({ ...same, questionsPerPara: 2 }, base).map((x) => x.metric)).toEqual(['questionsPerPara']);
  });
  it('grades gate only on enough graded questions, and by percentage points', () => {
    expect(compare(same, base, { grade: { questions: 10, searchablePct: 10, answeredPct: 10, distinctPct: 10 } })).toEqual([]);
    const v = compare(same, base, { grade: { questions: 40, searchablePct: 70, answeredPct: 90, distinctPct: 95 } });
    expect(v.map((x) => x.metric)).toEqual(['searchablePct']);
  });
  it('margin and minSample are configurable', () => {
    expect(compare({ ...same, faultRate: 0.12 }, base, { margin: { rel: 0.05, abs: 0.005 } }).map((x) => x.metric)).toEqual(['faultRate']);
    expect(compare({ ...same, sent: 50, faultRate: 0.9 }, base, { minSample: 10 }).map((x) => x.metric)).toEqual(['faultRate']);
  });
});

describe('store', () => {
  let dir; beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hype-ledger-')); });
  it('appends batches once by id, in order', () => {
    const s = createStore(dir);
    expect(s.appendLedger({ id: 'b1', tier: 'core' })).toBe(true);
    expect(s.appendLedger({ id: 'b1', tier: 'core' })).toBe(false);
    s.appendLedger({ id: 'b2', tier: 'gray' });
    expect(s.ledger().map((e) => e.id)).toEqual(['b1', 'b2']);
  });
  it('baseline per tier with a * fallback; pause set/clear; cursors', () => {
    const s = createStore(dir);
    expect(s.baselineFor('core')).toBeNull();
    s.setBaseline('*', { faultRate: 0.1 }); s.setBaseline('core', { faultRate: 0.05 });
    expect(s.baselineFor('core')).toEqual({ faultRate: 0.05 });
    expect(s.baselineFor('gray')).toEqual({ faultRate: 0.1 });
    expect(s.pause()).toBeNull();
    s.setPause({ reason: 'x' }); expect(s.pause()).toEqual({ reason: 'x' });
    s.clearPause(); expect(s.pause()).toBeNull();
    s.setCursor('core:primary', { after: 5, skip: [1] }); expect(s.cursors()['core:primary']).toEqual({ after: 5, skip: [1] });
  });
});
