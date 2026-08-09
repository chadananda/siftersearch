// Unit tests for answer-cache pure helpers (normalization/hash stability — the
// cache key contract: trivially-variant phrasings of the same question collide).
import { describe, it, expect } from 'vitest';
import { normalizeQuestion, questionHash, SEARCH_VERSION } from '../../api/lib/answer-cache.js';

describe('answer-cache question keying', () => {
  it('normalizes case, whitespace, diacritics and curly apostrophes', () => {
    expect(normalizeQuestion("  What do Bahá’ís   believe? "))
      .toBe(normalizeQuestion("what do baha'is believe?"));
  });
  it('hash is stable across variant forms', () => {
    expect(questionHash("Who was Táhirih?")).toBe(questionHash("who was tahirih?"));
  });
  it('different questions hash differently', () => {
    expect(questionHash('Who was Tahirih?')).not.toBe(questionHash('Who was Quddus?'));
  });
  it('SEARCH_VERSION is a dated string (bump intentionally with quality changes)', () => {
    expect(SEARCH_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});
