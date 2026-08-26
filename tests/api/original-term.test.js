// "What is the original word for X in this passage?"
//
// Chad, 2026-08-25: the chat should answer this easily — "what is the original word for 'justice' in the
// passage 'the best beloved of all things...'".
//
// The canonical case is doctrinally sharp: in Hidden Words Arabic #2 "Justice" renders الإنْصاف (inṣáf,
// equity), NOT العدل (ʿadl, rectitude). Different roots, different obligations, one English word. The whole
// point of storing word alignment is that a reader can tell which is meant.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { paragraph: null, byQuote: [] };

vi.mock('../../api/lib/db.js', () => ({
  queryOne: vi.fn(async () => state.paragraph),
  queryAll: vi.fn(async () => state.byQuote),
}));

const { findAlignedTerm, originalTermForParagraph, originalTermForQuote } =
  await import('../../api/lib/original-term.js');

// The real CTAI alignment for Hidden Words Arabic #2.
const HW2 = JSON.stringify([
  { source: 'أَحَبُّ', translation: 'best beloved', source_span: [27, 34], target_span: [25, 37] },
  { source: 'الأَشْيَاءِ', translation: 'all things', source_span: [35, 46], target_span: [41, 51] },
  { source: 'عِنْدِي', translation: 'in My sight', source_span: [47, 54], target_span: [52, 63] },
  { source: 'الإنْصافُ.', translation: 'Justice', source_span: [55, 65], target_span: [67, 74] },
]);

const para = (o = {}) => ({
  id: 7, doc_id: 20809, text: 'The best beloved of all things in My sight is Justice; turn not away therefrom',
  original_text: 'أَحَبُّ الأَشْيَاءِ عِنْدِي الإنْصافُ', original_lang: 'ar',
  word_alignment: HW2, translation_authority: 'shoghi-effendi', ...o,
});

beforeEach(() => { state.paragraph = para(); state.byQuote = [{ id: 7 }]; });

describe('findAlignedTerm', () => {
  it("answers Chad's question: justice → الإنْصاف, not العدل", () => {
    const m = findAlignedTerm(HW2, 'justice');
    expect(m).toHaveLength(1);
    expect(m[0].original).toContain('إنْصاف');
    expect(m[0].original).not.toContain('عدل');
  });

  it('is case- and punctuation-insensitive, as a reader\'s question will be', () => {
    expect(findAlignedTerm(HW2, 'Justice;')).toHaveLength(1);
    expect(findAlignedTerm(HW2, 'JUSTICE')).toHaveLength(1);
  });

  it('matches a word inside a multi-word rendering', () => {
    expect(findAlignedTerm(HW2, 'beloved')[0].original).toBe('أَحَبُّ');
  });

  it('returns EVERY match, never just the first', () => {
    // One English word can render two different originals in one passage — collapsing that to a single
    // answer hides exactly the distinction this feature exists to surface.
    const two = JSON.stringify([
      { source: 'الصلاة', translation: 'prayer', source_span: [0, 6], target_span: [0, 6] },
      { source: 'الدعاء', translation: 'prayer', source_span: [7, 13], target_span: [7, 13] },
    ]);
    const m = findAlignedTerm(two, 'prayer');
    expect(m).toHaveLength(2);
    expect(m.map((x) => x.original)).toEqual(['الصلاة', 'الدعاء']);
  });

  it('returns nothing for a term not in the passage, and survives malformed JSON', () => {
    expect(findAlignedTerm(HW2, 'covenant')).toEqual([]);
    expect(findAlignedTerm('not json', 'justice')).toEqual([]);
    expect(findAlignedTerm(HW2, '')).toEqual([]);
  });
});

describe('originalTermForParagraph', () => {
  it('returns the original term with its language and the rendering\'s authority', async () => {
    const r = await originalTermForParagraph(7, 'justice');
    expect(r.found).toBe(true);
    expect(r.matches[0].original).toContain('إنْصاف');
    expect(r.originalLang).toBe('ar');
    // Which sense is operative is fixed by WHO rendered it, so the answer must carry that.
    expect(r.translationAuthority).toBe('shoghi-effendi');
  });

  it('DISTINGUISHES "not aligned yet" from "no such word" — they are different facts', async () => {
    // Telling a reader there is no original word, when we simply never aligned the paragraph, misinforms them.
    state.paragraph = para({ original_text: null, word_alignment: null });
    const unaligned = await originalTermForParagraph(7, 'justice');
    expect(unaligned.found).toBe(false);
    expect(unaligned.reason).toMatch(/no aligned original yet/i);

    state.paragraph = para();
    const absent = await originalTermForParagraph(7, 'covenant');
    expect(absent.found).toBe(false);
    expect(absent.reason).toMatch(/no aligned original found for "covenant"/i);
  });

  it('reports passage-level-only when the original is stored without a word map', async () => {
    state.paragraph = para({ word_alignment: null });
    const r = await originalTermForParagraph(7, 'justice');
    expect(r.found).toBe(false);
    expect(r.reason).toMatch(/no word-level alignment/i);
    expect(r.originalText).toBeTruthy();      // still gives what it does have
  });

  it('says so plainly when the paragraph does not exist', async () => {
    state.paragraph = null;
    expect((await originalTermForParagraph(999, 'justice')).reason).toMatch(/not found/i);
  });
});

describe('originalTermForQuote', () => {
  it('answers from a quoted passage, the shape the question actually arrives in', async () => {
    const r = await originalTermForQuote('the best beloved of all things', 'justice');
    expect(r.found).toBe(true);
    expect(r.matches[0].original).toContain('إنْصاف');
  });

  it('refuses a quote too short to identify a passage', async () => {
    const r = await originalTermForQuote('justice', 'justice');
    expect(r.found).toBe(false);
    expect(r.reason).toMatch(/too short/i);
  });

  it('says the quote matched no aligned paragraph rather than guessing at a similar one', async () => {
    // Semantic search drifts badly on doctrinal terms; a near-miss would confidently answer about a
    // DIFFERENT passage, which is worse than no answer.
    state.byQuote = [];
    const r = await originalTermForQuote('a passage we have never aligned at all', 'justice');
    expect(r.found).toBe(false);
    expect(r.reason).toMatch(/no aligned paragraph contains that quote/i);
  });
});
