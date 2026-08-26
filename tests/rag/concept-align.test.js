// Sequence alignment between our paragraphs and an aligned original's paragraphs.
//
// Both properties under test were derived from MEASUREMENT on the Kitáb-i-Íqán (2026-08-25), not from
// reasoning about what ought to work — Chad: "we should not assume this but check in advance."
//
//   1. The similarity measure must be LENGTH-AWARE. Scoring by containment (shared ÷ shorter) rated a
//      24-character CTAI fragment a perfect 1.00 against 50+ long Íqán paragraphs, producing an alignment
//      with 55 non-monotonic steps that looked like real reordering. Dice cannot be fooled that way.
//
//   2. The alignment must be MONOTONIC. Our Íqán is 292 paragraphs and CTAI's is 291 pairs, because CTAI
//      folds the opening invocation into its first pair. Index-matching is therefore right for exactly one
//      paragraph and off by one for the other 291 — silently attaching each paragraph's original to its
//      neighbour's doctrine.
//
// Measured result with both properties in place: 290/292 matched, 0 non-monotonic, 0 pairs claimed twice.
import { describe, it, expect } from 'vitest';
import { alignSequences, dice, contentWords, normalizeEn, detectSourceLang } from '../../api/lib/rag/concepts/align.js';

const seq = (texts, prefix = 'a') => texts.map((text, i) => ({ key: `${prefix}${i}`, text }));

describe('normalizeEn', () => {
  it('folds diacritics so the two sources agree on names', () => {
    // The corpus writes Muḥammad; the aligned source writes Muhammad. Same word, and a match depends on it.
    expect(normalizeEn('Muḥammad')).toBe(normalizeEn('Muhammad'));
    expect(normalizeEn('Ṭáhirih')).toBe(normalizeEn('Tahirih'));
    // Apostrophes become separators, so the two spellings of the Name agree on their content words.
    expect(normalizeEn('Bahá’u’lláh')).toBe('baha u llah');
    expect(contentWords('Bahá’u’lláh')).toEqual(contentWords("Baha'u'llah"));
  });

  it('strips our own paragraph marker but not the text', () => {
    expect(normalizeEn('[81] Great God!')).toBe('great god');
  });
});

describe('contentWords', () => {
  it('drops short words that carry no discriminative signal', () => {
    expect(contentWords('the of a and understanding')).toEqual(['understanding']);
  });
});

describe('dice', () => {
  it('is 1 for identical text and 0 for disjoint text', () => {
    expect(dice('ocean of true understanding', 'ocean of true understanding')).toBe(1);
    expect(dice('ocean understanding', 'entirely different vocabulary')).toBe(0);
  });

  it('REFUSES to rate a short fragment a perfect match inside a long passage', () => {
    // The exact failure that corrupted the first measurement: a 3-word pair scored 1.00 against any
    // paragraph containing those words, so 50+ paragraphs all "matched" one 24-character fragment.
    const fragment = 'glorified lord highest';
    const paragraph = 'glorified be our lord the highest among those countless souls who traversed the '
      + 'valleys of search and attained the ocean of true understanding through detachment';
    const containment = 1.0;
    expect(dice(fragment, paragraph)).toBeLessThan(0.5);
    expect(dice(fragment, paragraph)).toBeLessThan(containment);
  });

  it('is symmetric', () => {
    const a = 'the birds of heaven and doves of eternity speak a twofold language';
    const b = 'birds of heaven speak a twofold language unto the people';
    expect(dice(a, b)).toBeCloseTo(dice(b, a), 10);
  });
});

describe('alignSequences', () => {
  it('absorbs a one-paragraph offset without dragging the rest out of register', () => {
    // Exactly the Íqán shape: theirs folds our first paragraph into its first pair, so every later
    // paragraph sits at offset −1. A positional match would mis-bind all of them.
    const ours = seq([
      'In the name of our Lord the Exalted the Most High',
      'No man shall attain the shores of the ocean of true understanding except he be detached',
      'The essence of these words is this that they who tread the path of faith must cleanse',
      'Consider the past how both high and low have ever awaited the advent of the Manifestations',
    ]);
    const theirs = seq([
      'No man shall attain the shores of the ocean of true understanding except he be detached',
      'The essence of these words is this that they who tread the path of faith must cleanse',
      'Consider the past how both high and low have ever awaited the advent of the Manifestations',
    ], 'b');

    const r = alignSequences(ours, theirs);
    expect(r.stats.matched).toBe(3);
    expect(r.matches.map((m) => [m.ourKey, m.theirKey]))
      .toEqual([['a1', 'b0'], ['a2', 'b1'], ['a3', 'b2']]);
    // The unmatched one is the invocation — reported, not silently bound to b0 alongside a1.
    expect(r.unmatchedOurs.map((u) => u.key)).toEqual(['a0']);
  });

  it('never binds one of theirs to two of ours', () => {
    const ours = seq(['detachment from all created things', 'detachment from all created things again now']);
    const theirs = seq(['detachment from all created things'], 'b');
    const r = alignSequences(ours, theirs, { minScore: 0.5 });
    expect(new Set(r.matches.map((m) => m.theirKey)).size).toBe(r.matches.length);
    expect(r.matches.length).toBeLessThanOrEqual(1);
  });

  it('is monotonic — a backwards match is a mis-match, not a discovery', () => {
    const ours = seq([
      'first passage concerning the valleys of search and detachment',
      'second passage concerning the doves of eternity and their language',
      'third passage concerning the sun of truth and its rising place',
    ]);
    const theirs = seq([
      'first passage concerning the valleys of search and detachment',
      'second passage concerning the doves of eternity and their language',
      'third passage concerning the sun of truth and its rising place',
    ], 'b');
    const r = alignSequences(ours, theirs);
    const idx = r.matches.map((m) => m.theirIndex);
    expect(idx).toEqual([...idx].sort((x, y) => x - y));
  });

  it('leaves a paragraph UNMATCHED rather than binding it to the best of a bad lot', () => {
    // A paragraph with no original is a fact we can record and act on. A paragraph bound to the WRONG
    // original is a fact we cannot detect afterwards, so a weak best-candidate must lose to nothing.
    const ours = seq(['[^1]: Quran 36:30 [^2]: Quran 40:5 footnote definitions block']);
    const theirs = seq(['It is evident unto thee that the Birds of Heaven and Doves of Eternity speak'], 'b');
    const r = alignSequences(ours, theirs);
    expect(r.stats.matched).toBe(0);
    expect(r.unmatchedOurs).toHaveLength(1);
  });

  it('reports coverage and score spread so a bad alignment is visible without reading it', () => {
    const ours = seq(['alpha beta gamma delta epsilon', 'zeta eta theta iota kappa']);
    const theirs = seq(['alpha beta gamma delta epsilon', 'utterly unrelated words appearing here'], 'b');
    const r = alignSequences(ours, theirs);
    expect(r.stats).toMatchObject({ ours: 2, theirs: 2, matched: 1, coverage: 0.5 });
    expect(r.stats.medianScore).toBeGreaterThan(0.9);
  });

  it('handles empty input without throwing', () => {
    expect(alignSequences([], []).stats).toMatchObject({ matched: 0, coverage: 0 });
  });
});

describe('detectSourceLang', () => {
  it('reads the Kitáb-i-Íqán as PERSIAN, not Arabic', () => {
    // "A model of Persian prose" (Chad, 2026-08-25). CTAI's own source_lang says 'ar', and trusting that
    // label stamped 290 Persian paragraphs as Arabic. 288 of the Íqán's 291 pairs carry Persian-only letters.
    expect(detectSourceLang('و همچنين کلمات منزله که از غمام قدرت صمدانيّه و سماء عزّت ربّانيّه نازل شده')).toBe('fa');
  });

  it('reads Arabic as Arabic', () => {
    expect(detectSourceLang('الصلاة والدعاء والذكر')).toBe('ar');
  });

  it('decides PER PASSAGE, because one book holds both', () => {
    // The Hidden Words has an Arabic part and a Persian part; Gleanings is compiled from tablets in both.
    // A per-work answer is therefore wrong for one half of the book whichever way it is set.
    expect(detectSourceLang('العدل والإنصاف')).toBe('ar');
    expect(detectSourceLang('ای پسر روح')).toBe('fa');
  });

  it('returns null for text that is not in Arabic script, rather than guessing', () => {
    expect(detectSourceLang('In the name of our Lord, the Exalted')).toBeNull();
    expect(detectSourceLang('')).toBeNull();
  });
});
