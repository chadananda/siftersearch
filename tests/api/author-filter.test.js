/**
 * AUTHOR FILTER: the post-filter must not contradict the engine filter.
 *
 * THE BUG (2026-09-24). Metadata narrowing is the single best lever on this corpus — the same query
 * unfiltered returns Sutra Collection and Tao Te Ching in 7.4s, and with religion="Baha'i" returns
 * The Dawn-Breakers in 0.95s. But the AUTHOR narrowing was unusable:
 *
 *   author="Abdu"            → 0 results
 *   author="’Abdu’l-Bahá"    → works (curly apostrophes, exact)
 *
 * search.js:666 builds `author CONTAINS "…"` for Meilisearch — correctly partial. Then
 * search.js:1237 post-filtered with `e.paragraph.author !== filters.author`, exact string equality, which
 * discarded everything CONTAINS had matched. Any spelling variant returned nothing, SILENTLY — and a caller
 * reads empty as "he never said it".
 *
 * The post-filter now agrees with the engine: folded substring, so diacritics and apostrophe style don't
 * decide whether ‘Abdu'l-Bahá counts as ‘Abdu'l-Bahá.
 */
import { describe, it, expect } from 'vitest';
import { authorMatches } from '../../api/lib/search.js';

const STORED = '’Abdu’l-Bahá';

describe('authorMatches', () => {
  it('matches the exact stored form', () => {
    expect(authorMatches(STORED, '’Abdu’l-Bahá')).toBe(true);
  });

  it('matches a PARTIAL name — the CONTAINS semantics the engine filter already uses', () => {
    expect(authorMatches(STORED, 'Abdu')).toBe(true);
  });

  it('matches across apostrophe style — straight vs curly must not decide identity', () => {
    expect(authorMatches(STORED, "'Abdu'l-Baha")).toBe(true);
    expect(authorMatches(STORED, "Abdu'l-Bahá")).toBe(true);
  });

  it('matches across diacritics', () => {
    expect(authorMatches(STORED, 'Abdul-Baha')).toBe(true);
    expect(authorMatches('Bahá’u’lláh', "Baha'u'llah")).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(authorMatches(STORED, 'abdu')).toBe(true);
  });

  it('still EXCLUDES a different author — narrowing must actually narrow', () => {
    expect(authorMatches('Shoghi Effendi', 'Abdu')).toBe(false);
    expect(authorMatches('Nabil Zarandi', "Bahá'u'lláh")).toBe(false);
  });

  it('treats a missing filter as no constraint, and a missing author as not matching', () => {
    expect(authorMatches(STORED, '')).toBe(true);
    expect(authorMatches(null, 'Abdu')).toBe(false);
  });
});
