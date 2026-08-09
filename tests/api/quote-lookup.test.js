// Unit tests for the quote-hunt needle-engine helpers (pure functions).
import { describe, it, expect } from 'vitest';
import { extractQuotedSpan, phraseQueryVariants, distinctiveTerms, scoreCandidate } from '../../api/lib/quote-lookup.js';

describe('extractQuotedSpan', () => {
  it('extracts a straight-double-quoted span', () => {
    expect(extractQuotedSpan('Where is this quote from: "The earth is but one country, and mankind its citizens"?'))
      .toBe('The earth is but one country, and mankind its citizens');
  });
  it('extracts a curly-double-quoted span', () => {
    expect(extractQuotedSpan('Who said “the fair and spotless emblem of chastity”?'))
      .toBe('the fair and spotless emblem of chastity');
  });
  it('extracts a curly-single-quoted span', () => {
    expect(extractQuotedSpan("Where does 'Abdu'l-Bahá say ‘the gift of God to this enlightened age’?"))
      .toBe('the gift of God to this enlightened age');
  });
  it('takes the longest span when several are quoted', () => {
    expect(extractQuotedSpan('Is "one country" from "The earth is but one country and mankind its citizens"?'))
      .toBe('The earth is but one country and mankind its citizens');
  });
  it('accepts an unquoted span after a source-identification lead-in', () => {
    expect(extractQuotedSpan('Where is this quote from: the earth is but one country and mankind its citizens?'))
      .toBe('the earth is but one country and mankind its citizens');
    expect(extractQuotedSpan('Who said work performed in the spirit of service is worship?'))
      .toBe('work performed in the spirit of service is worship');
  });
  it('returns null for passage REQUESTS (no quotation to source)', () => {
    expect(extractQuotedSpan('Show me a quote about love')).toBeNull();
    expect(extractQuotedSpan('Give me a passage on detachment from the Hidden Words')).toBeNull();
    expect(extractQuotedSpan('quote me something beautiful')).toBeNull();
  });
  it('ignores tiny quoted fragments (under 3 words)', () => {
    expect(extractQuotedSpan('What does "detachment" mean?')).toBeNull();
  });
});

describe('phraseQueryVariants', () => {
  it('emits the full phrase first, wrapped for Meili phrase search', () => {
    const v = phraseQueryVariants('The earth is but one country, and mankind its citizens');
    expect(v[0]).toBe('"The earth is but one country, and mankind its citizens"');
  });
  it('adds shorter leading-word fallbacks for long spans', () => {
    const v = phraseQueryVariants('The earth is but one country, and mankind its citizens');
    expect(v).toContain('"The earth is but one country, and mankind"');   // 8 words
    expect(v).toContain('"The earth is but one country"');                // 6 words, trailing punctuation stripped
  });
  it('adds curly-apostrophe variants (corpus stores U+2019)', () => {
    const v = phraseQueryVariants("God's purpose in revealing His word");
    expect(v.some((q) => q.includes('God’s'))).toBe(true);
  });
  it('does not duplicate variants for short spans', () => {
    const v = phraseQueryVariants('one country mankind citizens');
    expect(new Set(v).size).toBe(v.length);
  });
  it('includes a 3-word leading window (memory diverges early: "Sorrow not if…")', () => {
    const v = phraseQueryVariants('Sorrow not if things');
    expect(v).toContain('"Sorrow not if"');
  });
});

describe('distinctiveTerms + scoreCandidate (fuzzy memory matching)', () => {
  const memory = 'a quote by Abdul-Baha about man being the weakest in creation, even compared to a blade of grass or a mosquito, but through the power of his spirit man has conquered the world';
  const realPassage = 'The human body is in reality very weak; there is no physical body more delicately constituted. One mosquito will distress it; the smallest quantity of poison will destroy it. A blade of grass severed from the root may live an hour, whereas a human body deprived of its forces may die in one minute. But in the proportion that the human body is weak, the spirit of man is strong.';
  const wrongPassage = 'The readjustment of the economic laws for the livelihood of man must be effected in order that all humanity may live in the greatest happiness according to their respective degrees.';

  it('keeps the memorable imagery words, drops glue', () => {
    const t = distinctiveTerms(memory);
    expect(t).toContain('mosquito');
    expect(t).toContain('grass');
    expect(t).toContain('spirit');
    expect(t).not.toContain('the');
    expect(t).not.toContain('quote');
  });
  it('scores the real passage far above an unrelated one from the same book', () => {
    const real = scoreCandidate(memory, realPassage);
    const wrong = scoreCandidate(memory, wrongPassage);
    expect(real).toBeGreaterThan(0.32);      // "likely" tier (description memories carry attribution noise)
    expect(wrong).toBeLessThan(0.2);
    expect(real).toBeGreaterThan(wrong * 2);
  });
  it('near-verbatim memory scores in the high tier', () => {
    const s = scoreCandidate('The earth is but one country and mankind its citizens',
      'It is not for him to pride himself who loveth his own country, but rather for him who loveth the whole world. The earth is but one country, and mankind its citizens.');
    expect(s).toBeGreaterThanOrEqual(0.75);
  });
  it('empty/glue-only memory scores zero', () => {
    expect(scoreCandidate('the and of', 'anything at all here')).toBe(0);
  });
});
