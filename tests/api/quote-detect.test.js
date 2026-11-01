// detectQuotation: deterministic "the user gave us wording to find" rule, independent of Jev.
import { describe, it, expect } from 'vitest';
import { detectQuotation } from '../../api/lib/quote-detect.js';

describe('detectQuotation', () => {
  it('the incident: a find-the-quote request with a quoted span', () => {
    const q = detectQuotation('can you find the quote including  "but it will always be present as a necessary element"');
    expect(q.phrase).toBe('but it will always be present as a necessary element');
    expect(q.via).toBe('quoted');
  });
  it('curly quotes and guillemets count', () => {
    expect(detectQuotation('who said “the earth is but one country”?').phrase).toBe('the earth is but one country');
    expect(detectQuotation('where is «hatred is never ended by more hatred»').phrase).toBe('hatred is never ended by more hatred');
  });
  it('a find/source frame with an unquoted phrase', () => {
    const q = detectQuotation('where is the passage that says the earth is but one country');
    expect(q.phrase).toBe('the earth is but one country');
    expect(q.via).toBe('frame');
    expect(detectQuotation('find the quote: so powerful is the light of unity').phrase).toBe('so powerful is the light of unity');
  });
  it('a short quoted span (under 4 words) is not a quotation', () => {
    expect(detectQuotation('what does "the Greatest Name" mean')).toBe(null);
  });
  it('apostrophes in names are not quotes', () => {
    expect(detectQuotation("what did Bahá'u'lláh and 'Abdu'l-Bahá say about unity of mankind and peace")).toBe(null);
  });
  it('a plain topic question is not a quotation', () => {
    expect(detectQuotation('what is taught about the soul after death')).toBe(null);
    expect(detectQuotation('find the quote')).toBe(null);
    expect(detectQuotation('')).toBe(null);
  });
});
