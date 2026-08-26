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
import { alignSequences, dice, contentWords, normalizeEn, detectSourceLang, largestCluster, matchedRegion, heaviestIncreasingRun } from '../../api/lib/rag/concepts/align.js';

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

describe('translationAuthorityFor', () => {
  it("attributes a CTAI-aligned work to Shoghi Effendi even when the roster omits it", async () => {
    // CTAI is a concordance OF HIS RENDERINGS, so presence there settles authorship of the English.
    // Prayers and Meditations is not in the 14-work core roster: 692 paragraphs aligned and every one was
    // stamped with NO authority. Chad: "always note a Shoghi Effendi translation when available."
    const { translationAuthorityFor } = await import('../../api/lib/rag/concepts/backfill-original.js');
    expect(translationAuthorityFor(20805, { viaCtai: true })).toBe('shoghi-effendi');
    expect(translationAuthorityFor(20805)).toBeNull();          // not via CTAI → no claim made
  });

  it('keeps a committee rendering distinct from his — it fixes no sense', async () => {
    const { translationAuthorityFor } = await import('../../api/lib/rag/concepts/backfill-original.js');
    expect(translationAuthorityFor(21307, { viaCtai: true })).toBe('committee');   // the Kitáb-i-Aqdas
  });

  it('claims no rendering for a work he WROTE in English', async () => {
    const { translationAuthorityFor } = await import('../../api/lib/rag/concepts/backfill-original.js');
    expect(translationAuthorityFor(21310, { viaCtai: true })).toBeNull();          // God Passes By
  });
});

describe('largestCluster — where a WORK sits inside a document', () => {
  it('ignores a coincidental match far from the rest', () => {
    // Doc 20811 holds both Valleys. A few Four Valleys phrases also match the Seven Valleys, and taking the
    // outer range bound it to [90, 209] — re-offering 32 paragraphs already aligned to a different original.
    expect(largestCluster([90, 95, ...Array.from({ length: 88 }, (_, i) => 122 + i)])).toEqual([122, 209]);
  });

  it('continues a run across a short unmatched stretch — a poem, a heading, a differently-broken passage', () => {
    expect(largestCluster([1, 2, 3, 14, 15, 16])).toEqual([1, 16]);
  });

  it('breaks at a real discontinuity and keeps the bigger side', () => {
    expect(largestCluster([1, 2, 3, 200, 201, 202, 203, 204])).toEqual([200, 204]);
  });

  it('handles a single match and an empty list without inventing a range', () => {
    expect(largestCluster([7])).toEqual([7, 7]);
    expect(largestCluster([])).toEqual([0, -1]);          // an empty slice, not a whole-document slice
  });
});

describe('matchedRegion — locating a work, where monotonicity is a liability', () => {
  const theirs = [{ key: 0, text: 'the first duty prescribed by God for his servants' },
    { key: 1, text: 'they that are endued with sincerity and faithfulness' },
    { key: 2, text: 'o ye peoples of the world know verily that mine ordinances' }];

  it('finds our paragraphs wherever they sit, in any order', () => {
    const ours = [{ key: 'a', text: 'o ye peoples of the world know verily that mine ordinances' },
      { key: 'b', text: 'nothing whatever to do with this book' },
      { key: 'c', text: 'the first duty prescribed by God for his servants' }];
    // 'c' matches their ¶0 while 'a' already matched their ¶2 — a monotonic aligner would have to drop one.
    expect(matchedRegion(ours, theirs)).toEqual([0, 2]);
  });

  it('is why one coincidental early match can no longer hide 25 real paragraphs', () => {
    // Doc 20811: our ¶90 matched their ¶29 by coincidence, and the monotonic chain then forbade their ¶0-28
    // to every later paragraph — so the Four Valleys' opening read as text the site had not published.
    const ours = [{ key: 'x', text: 'they that are endued with sincerity and faithfulness' },
      ...Array.from({ length: 5 }, (_, i) => ({ key: i, text: 'unrelated filler text number ' + i })),
      { key: 'y', text: 'the first duty prescribed by God for his servants' }];
    expect(matchedRegion(ours, theirs)).toEqual([0, 6]);
  });
});

describe('alignSequences resilience — one spurious match must not erase its neighbours', () => {
  // Chad, 2026-08-26: "spurious matches are going to happen. we need to make our approach resilient to
  // occasional spurious matches."
  const t = (k, text) => ({ key: k, text });

  it('drops the outlier, not the stretch the outlier skipped over', () => {
    // ¶1 pairs coincidentally with a far-off paragraph. Under a hard cursor that jump made their ¶1-2
    // unreachable and the rest of the book went unmatched; now the anomaly is the one discarded.
    const theirs = [t(0, 'alpha bravo charlie delta echo foxtrot'), t(1, 'golf hotel india juliet kilo lima'),
      t(2, 'mike november oscar papa quebec romeo'), t(3, 'sierra tango uniform victor whisky xray')];
    const ours = [t('a', 'alpha bravo charlie delta echo foxtrot'), t('b', 'sierra tango uniform victor whisky xray'),
      t('c', 'golf hotel india juliet kilo lima'), t('d', 'mike november oscar papa quebec romeo')];
    const { matches } = alignSequences(ours, theirs, { minScore: 0.7, window: 8 });
    expect(matches.map((m) => m.ourKey)).toEqual(['a', 'c', 'd']);
  });

  it('still refuses to reorder — the output is strictly monotonic on both sides', () => {
    const theirs = Array.from({ length: 8 }, (_, i) => t(i, `word${i} common shared phrase text here now`));
    const ours = theirs.map((x) => ({ ...x, key: `o${x.key}` }));
    const { matches } = alignSequences(ours, theirs, { minScore: 0.5, window: 8 });
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].theirIndex).toBeGreaterThan(matches[i - 1].theirIndex);
      expect(matches[i].ourIndex).toBeGreaterThan(matches[i - 1].ourIndex);
    }
  });

  it('prefers one strong pairing over two weak ones that contradict it', () => {
    expect(heaviestIncreasingRun([5, 1, 2], [0.99, 0.55, 0.55])).toEqual([1, 2]);   // 1.10 > 0.99
    expect(heaviestIncreasingRun([5, 1, 2], [0.99, 0.4, 0.4])).toEqual([0]);        // 0.99 > 0.80
  });

  it('never binds a paragraph below threshold — an unmatched paragraph is a recordable fact', () => {
    const { matches } = alignSequences([t('a', 'entirely unrelated wording')], [t(0, 'nothing alike whatsoever')],
      { minScore: 0.7 });
    expect(matches).toEqual([]);
  });
});
