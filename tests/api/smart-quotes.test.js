/**
 * Smart Quotes (toCurlyQuotes) Tests
 *
 * Tests for context-aware conversion of straight quotes to typographic curly quotes.
 * Covers double quotes, single quotes, apostrophes, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { toCurlyQuotes } from '../../src/lib/text-utils.js';

describe('toCurlyQuotes', () => {
  // Null/empty handling
  it('returns null/undefined as-is', () => {
    expect(toCurlyQuotes(null)).toBe(null);
    expect(toCurlyQuotes(undefined)).toBe(undefined);
    expect(toCurlyQuotes('')).toBe('');
  });

  // Double quotes — the primary regression case
  describe('double quotes', () => {
    it('wraps a quoted phrase mid-sentence', () => {
      expect(toCurlyQuotes('"The Book of Names" Mentioned in the Tablet of Carmel'))
        .toBe('\u201CThe Book of Names\u201D Mentioned in the Tablet of Carmel');
    });

    it('wraps a quoted phrase at the start of a string', () => {
      expect(toCurlyQuotes('"Hello world"')).toBe('\u201CHello world\u201D');
    });

    it('wraps a quoted phrase at the end of a sentence', () => {
      expect(toCurlyQuotes('He called it "the world".')).toBe('He called it \u201Cthe world\u201D.');
    });

    it('handles multiple quoted phrases in one string', () => {
      expect(toCurlyQuotes('"First" and "Second"'))
        .toBe('\u201CFirst\u201D and \u201CSecond\u201D');
    });

    it('handles quote after a dash', () => {
      expect(toCurlyQuotes('—"Indeed"')).toBe('\u2014\u201CIndeed\u201D');
    });

    it('handles quote after an opening parenthesis', () => {
      expect(toCurlyQuotes('("quoted")')).toBe('(\u201Cquoted\u201D)');
    });
  });

  // Single quotes and apostrophes
  describe('single quotes and apostrophes', () => {
    it('converts apostrophes in contractions to right single quote', () => {
      expect(toCurlyQuotes("don't")).toBe('don\u2019t');
      expect(toCurlyQuotes("it's")).toBe('it\u2019s');
      expect(toCurlyQuotes("they're")).toBe('they\u2019re');
    });

    it('converts possessives to right single quote', () => {
      expect(toCurlyQuotes("God's")).toBe('God\u2019s');
    });

    it('handles opening single quote at start of string', () => {
      expect(toCurlyQuotes("'Hello world'")).toBe('\u2018Hello world\u2019');
    });

    it('handles opening single quote after space', () => {
      expect(toCurlyQuotes("He said 'hello' to me")).toBe('He said \u2018hello\u2019 to me');
    });

    it('preserves Bahá\'í proper name apostrophes as right single quote', () => {
      // In "Bahá'u'lláh" both apostrophes are mid-word → right single quote
      expect(toCurlyQuotes("Bahá'u'lláh")).toBe('Bah\u00E1\u2019u\u2019ll\u00E1h');
    });

    it("handles 'Abdu'l-Bahá — leading apostrophe is opening, mid-word is apostrophe", () => {
      // Leading ' before A at start = opening quote; 'l is mid-word = right quote
      const result = toCurlyQuotes("'Abdu'l-Bahá");
      expect(result).toBe('\u2018Abdu\u2019l-Bah\u00E1');
    });

    it("handles 'Abdu'l-Bahá after space — same pattern", () => {
      const result = toCurlyQuotes("The teachings of 'Abdu'l-Bahá");
      expect(result).toContain('\u2018Abdu\u2019l');
    });
  });

  // Nested quotes
  describe('nested quotes', () => {
    it('handles double quotes containing single quotes', () => {
      expect(toCurlyQuotes(`He said, "She said 'hello'"`))
        .toBe('He said, \u201CShe said \u2018hello\u2019\u201D');
    });
  });

  // Idempotency — already-smart quotes should not be double-converted
  describe('idempotency', () => {
    it('does not double-convert already-curly double quotes', () => {
      const already = '\u201CThe Book of Names\u201D Mentioned in the Tablet of Carmel';
      expect(toCurlyQuotes(already)).toBe(already);
    });

    it('does not double-convert already-curly single quotes', () => {
      const already = 'don\u2019t';
      expect(toCurlyQuotes(already)).toBe(already);
    });
  });
});
