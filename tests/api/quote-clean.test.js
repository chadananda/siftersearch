// What a library's "copy" appends to a quotation (reference line, short link, page URL) is stripped before the hunt.
import { describe, it, expect } from 'vitest';
import { stripAppendedReference as strip } from '../../api/lib/quote-clean.js';
import { prepareQuote } from '../../api/lib/source-hunt.js';

describe('stripAppendedReference', () => {
  it('drops the OceanLibrary reference line and short link', () => {
    expect(strip('My captivity cannot harm Me.\n    \nBahá’u’lláh, ‘Abdu’l-Bahá, "Bahá’í Sacred Writings", 5.47.1\n    \nhttps://oceanlibrary.com/link/AsfMp/bahai-sacred-writings/'))
      .toBe('My captivity cannot harm Me.');
  });
  it('drops an Ocean of Lights page URL', () => {
    expect(strip('هر طيری را نظر بر آشيان است\nhttps://oceanoflights.org/bahaullah-pub01-48-fa/')).toBe('هر طيری را نظر بر آشيان است');
  });
  it('drops a link glued to a one-line paste', () => {
    expect(strip('The earth is but one country. https://oceanlibrary.com/link/abc')).toBe('The earth is but one country.');
  });
  it('keeps a quotation that merely contains quotation marks and numbers', () => {
    expect(strip('He said "the earth is one country", 12 times.')).toBe('He said "the earth is one country", 12 times.');
  });
  it('prepareQuote searches only the quotation', () => {
    expect(prepareQuote('When the time set for this Revelation was fulfilled, He bade His followers observe.\n\nBahá’u’lláh, "Gleanings from the Writings of Bahá’u’lláh", 60.2\n\nhttps://oceanlibrary.com/link/x/y/').text)
      .toBe('When the time set for this Revelation was fulfilled, He bade His followers observe.');
  });
});
