// Titles in the missing-books triage came from scraped metadata pages and rendered as literal
// junk (<u>Kh</u>, %20). These lock the reader-facing normalisation.
import { describe, it, expect } from 'vitest';
import { cleanTitle } from '../../api/lib/text/clean-title.js';

describe('cleanTitle', () => {
  it('turns an underlined transliteration digraph into the real Unicode form', () => {
    expect(cleanTitle('1906, ‘Alí-Kuli <u>Kh</u>án — Pilgrim’s Notes'))
      .toBe('1906, ‘Alí-Kuli K͟hán — Pilgrim’s Notes');
    expect(cleanTitle('<u>Sh</u>ay<u>kh</u> Aḥmad')).toBe('S͟hayk͟h Aḥmad');
  });

  it('strips non-digraph markup without eating the words', () => {
    expect(cleanTitle('<u>Note</u> on <em>Funds</em>')).toBe('Note on Funds');
    expect(cleanTitle('<p>Two</p><p>Parts</p>')).toBe('Two Parts');
  });

  it('decodes %-escapes from filename-derived titles', () => {
    expect(cleanTitle('1914-07-04,%20Frederick%20Douglass%20Center'))
      .toBe('1914-07-04, Frederick Douglass Center');
  });

  it('un-escapes the underscores of a filename-derived title, and only those', () => {
    expect(cleanTitle('1910-02-12,%20Douglass%20Center,%20Lincoln_Celebration'))
      .toBe('1910-02-12, Douglass Center, Lincoln Celebration');
    expect(cleanTitle('snake_case_is_meaningful_here')).toBe('snake_case_is_meaningful_here');
  });

  it('trims a dangling separator left by a truncated filename', () => {
    expect(cleanTitle('1910-02-12,%20Douglass%20Center,%20The_Club_Of_Doug-Lass_'))
      .toBe('1910-02-12, Douglass Center, The Club Of Doug-Lass');
  });

  it('survives a malformed %-escape instead of throwing', () => {
    expect(cleanTitle('100%%20done')).toBe('100% done');
  });

  it('decodes named and numeric entities', () => {
    expect(cleanTitle('Marshal Field &amp; Co. &#8212; Notes')).toBe('Marshal Field & Co. — Notes');
  });

  it('collapses whitespace and tolerates empty input', () => {
    expect(cleanTitle('  A   Persian   Reformer  ')).toBe('A Persian Reformer');
    expect(cleanTitle(null)).toBe('');
    expect(cleanTitle(undefined)).toBe('');
  });

  it('leaves a clean title exactly as it is', () => {
    const t = "Bahá'u'lláh's Kitáb-i-Íqán: 100% original";
    expect(cleanTitle(t)).toBe(t);
  });
});
