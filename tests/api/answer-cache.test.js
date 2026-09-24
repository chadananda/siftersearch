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
  // EXACT-STRING TRIPWIRE, same pattern as HYPE_VERSION in tests/rag/hype.test.js.
  //
  // A format-only assertion cannot force a bump: any dated string passes, so a retrieval change ships with
  // the old version and the cache keeps serving pre-change answers. That is not hypothetical — on 2026-09-24
  // the title-ranking fix went live and "What does The Dawn-Breakers say about the Conference of Badasht?"
  // kept returning the old wrong answer ("does not specifically discuss") in 0.31s from cache, with zero
  // tool calls, because SEARCH_VERSION still read 2026-08-10.3.
  //
  // THE RULE: if a change alters what answer a question gets — retrieval, ranking, crafting, tool routing —
  // bump SEARCH_VERSION in the SAME commit and update this assertion. Bumping never drops the cache; it marks
  // entries stale, so they stream instantly and revalidate in the background at the new version.
  it('SEARCH_VERSION is exactly the current answering-engine version', () => {
    expect(SEARCH_VERSION).toBe('2026-09-24.1');
  });

  it('SEARCH_VERSION is a dated string (bump intentionally with quality changes)', () => {
    expect(SEARCH_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});
