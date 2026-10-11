import { describe, it, expect } from 'vitest';
import { normLang, normLangOrNull } from '../../api/lib/language-codes.js';

describe('language codes', () => {
  it('every variant found in the corpus maps to ISO 639-1', () => {
    for (const [raw, want] of [['En', 'en'], ['Eng', 'en'], ['FR', 'fr'], ['Fr', 'fr'], ['ES', 'es'], ['Es', 'es'], ['Ger', 'de'], ['ger', 'de'],
      ['De', 'de'], ['IT', 'it'], ['It', 'it'], ['NO', 'no'], ['fa', 'fa'], ['en-US', 'en'], ['Persian', 'fa']]) expect(normLang(raw), raw).toBe(want);
  });
  it('empty → und; OrNull keeps "not given"', () => {
    expect(normLang('')).toBe('und');
    expect(normLangOrNull(undefined)).toBeNull();
    expect(normLangOrNull(' Eng ')).toBe('en');
  });
});
