// Unit tests for the quote_request fast-path helpers (pure functions).
import { describe, it, expect } from 'vitest';
import { extractQuotedSpan, phraseQueryVariants } from '../../api/lib/quote-lookup.js';

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
    expect(v).toContain('"The earth is but one country,"');               // 6 words
  });
  it('adds curly-apostrophe variants (corpus stores U+2019)', () => {
    const v = phraseQueryVariants("God's purpose in revealing His word");
    expect(v.some((q) => q.includes('God’s'))).toBe(true);
  });
  it('does not duplicate variants for short spans', () => {
    const v = phraseQueryVariants('one country mankind citizens');
    expect(new Set(v).size).toBe(v.length);
  });
});
