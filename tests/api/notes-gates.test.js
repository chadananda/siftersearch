// Chad's "Important Rules" for instructor notes, as executable checks. Each test names the rule it defends,
// because the prompt states them and these exist for the times a model does not obey — and to record WHY a
// note was dropped, so a review is auditable rather than mysterious.
import { describe, it, expect } from 'vitest';
import { judgeNote, judgeParagraph, summaryOverlap, SUMMARY_MAX_OVERLAP } from '../../api/lib/notes/gates.js';

const PARA = 'Mullá Ḥusayn arrived in Shíráz at nightfall and was directed to the house of the Báb, where he '
  + 'was received with courtesy and offered tea, and there recognised in his Host the One he had been sent to seek.';
const note = (over = {}) => ({ category: 'person', subjectKey: 'entity:1247564', body: 'A note that adds something.', ...over });

describe('rule 2 — do not summarize the paragraph', () => {
  it('drops a note that restates the passage', () => {
    const j = judgeNote(note({ body: 'Mullá Ḥusayn arrived in Shíráz at nightfall and was directed to the house of the Báb, where he was received with courtesy.' }), { paragraph: PARA });
    expect(j.verdict).toBe('drop');
    expect(j.reason).toMatch(/restates the paragraph/);
  });

  it('keeps a note that quotes a phrase but teaches something new', () => {
    const j = judgeNote(note({ body: 'The courtesy described here is a convention of Persian hospitality: tea offered before business signalled that the guest was received as an equal.' }), { paragraph: PARA });
    expect(j.verdict).toBe('keep');
  });

  it('folds diacritics, so Tahirih and Ṭáhirih compare equal', () => {
    expect(summaryOverlap('Tahirih arrived in Shiraz at nightfall and was directed', 'Ṭáhirih arrived in Shíráz at nightfall and was directed')).toBeGreaterThan(0.5);
  });

  it('has a threshold that permits quotation but not construction', () => {
    expect(SUMMARY_MAX_OVERLAP).toBeGreaterThan(0.2);
    expect(SUMMARY_MAX_OVERLAP).toBeLessThan(0.6);
  });
});

describe('rule 4 — avoid repetition unless a new dimension', () => {
  const taught = [{ id: 7, paragraph_index: 41, note: 'Mullá Ḥusayn: first to recognise the Báb.' }];

  it('drops a second note on a subject already covered', () => {
    const j = judgeNote(note(), { paragraph: PARA, taught });
    expect(j.verdict).toBe('drop');
    expect(j.reason).toMatch(/already covered at ¶41/);
    expect(j.priorNoteId).toBe(7);
  });

  it('keeps it when a NEW DIMENSION is declared', () => {
    const j = judgeNote(note({ newDimension: 'his role as the Bábu\'l-Báb, not yet mentioned' }), { paragraph: PARA, taught });
    expect(j.verdict).toBe('keep');
  });

  it('a first mention needs no new dimension', () => {
    expect(judgeNote(note(), { paragraph: PARA, taught: [] }).verdict).toBe('keep');
  });
});

describe('rule 5 — teaching vs parallel vs interpretation must not blur', () => {
  it('HOLDS an unlabelled connection note — an unlabelled parallel reads as doctrine', () => {
    const j = judgeNote(note({ category: 'connection', body: "Bahá'u'lláh treats recognition similarly in the Íqán." }), { paragraph: PARA });
    expect(j.verdict).toBe('hold');
    expect(j.reason).toMatch(/explicit_teaching \| strong_parallel \| interpretive/);
  });

  it('keeps a properly labelled connection', () => {
    const j = judgeNote(note({ category: 'connection', claimKind: 'strong_parallel', body: 'Compare the Íqán on recognition.' }), { paragraph: PARA });
    expect(j.verdict).toBe('keep');
  });

  it('does not demand a label on a plain historical note', () => {
    expect(judgeNote(note({ category: 'place', body: 'Shíráz was then a provincial capital of some 30,000.' }), { paragraph: PARA }).verdict).toBe('keep');
  });
});

describe('rule 6 — factual claims and quotations carry sources', () => {
  it('HOLDS rather than drops an unsourced fact — right but unsourced is worth chasing', () => {
    const j = judgeNote(note({ claimKind: 'fact', body: 'The house was demolished in 1979.' }), { paragraph: PARA });
    expect(j.verdict).toBe('hold');
    expect(j.reason).toMatch(/held for sourcing, not discarded/);
  });

  it('detects an unsourced QUOTATION even when the note is not marked as fact', () => {
    const j = judgeNote(note({ body: 'Shoghi Effendi calls him “the first to believe in the Báb and the first to suffer”.' }), { paragraph: PARA });
    expect(j.verdict).toBe('hold');
  });

  it('keeps a sourced fact', () => {
    const j = judgeNote(note({ claimKind: 'fact', body: 'The house was demolished in 1979.', sources: [{ docId: 21308, paraId: 'para_9' }] }), { paragraph: PARA });
    expect(j.verdict).toBe('keep');
  });
});

describe('rules 1 and 3 — be selective, do not be comprehensive', () => {
  it('caps a paragraph and keeps the STRONGEST, not the first emitted', () => {
    const notes = [
      note({ subjectKey: 'a', body: 'a bare aside about nightfall' }),
      note({ subjectKey: 'b', body: 'another passing remark', claimKind: 'explicit_teaching' }),
      note({ subjectKey: 'c', body: 'a third remark', newDimension: 'adds his title' }),
      note({ subjectKey: 'd', body: 'a fourth remark', sources: [{ docId: 1 }] }),
    ];
    const r = judgeParagraph(notes, { paragraph: PARA, profile: { maxNotesPerParagraph: 2 } });
    expect(r.kept).toHaveLength(2);
    expect(r.kept.map((n) => n.subjectKey).sort()).toEqual(['b', 'c']);   // labelled + new-dimension win
    expect(r.dropped.some((n) => /over the 2-note cap/.test(n._judge.reason))).toBe(true);
  });

  it('a paragraph warranting NOTHING yields nothing, and that is not a failure', () => {
    const r = judgeParagraph([], { paragraph: PARA });
    expect(r.kept).toEqual([]);
    expect(r.held).toEqual([]);
    expect(r.dropped).toEqual([]);
  });

  it('every rejection carries a reason — nothing is dropped silently', () => {
    const r = judgeParagraph([note({ body: PARA }), note({ subjectKey: 'z', claimKind: 'fact', body: 'A fact.' })], { paragraph: PARA });
    for (const n of [...r.dropped, ...r.held]) expect(n._judge.reason).toBeTruthy();
  });
});
