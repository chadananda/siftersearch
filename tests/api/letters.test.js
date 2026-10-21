// Letter lookup (Chad 10-21): an author's letters as books, chapters and dated messages, found by date and/or title.
import { describe, it, expect } from 'vitest';
import { parseDate, buildLetters, matchLetters } from '../../api/lib/letters/letters.js';
import { lettersIndexJob } from '../../api/lib/ops/letters-index-job.js';

describe('parseDate', () => {
  it('reads the forms letters are dated in', () => {
    expect(parseDate('Letter of January 21st, 1922.')).toEqual({ y: 1922, m: 1, d: 21 });
    expect(parseDate('Cablegram, April 25, 1950')).toEqual({ y: 1950, m: 4, d: 25 });
    expect(parseDate('21 January 1922')).toEqual({ y: 1922, m: 1, d: 21 });
    expect(parseDate('April, 1954')).toEqual({ y: 1954, m: 4, d: null });
    expect(parseDate('1/21/22')).toEqual({ y: 1922, m: 1, d: 21 });
    expect(parseDate('10/57')).toEqual({ y: 1957, m: 10, d: null });
    expect(parseDate('1954-07-28')).toEqual({ y: 1954, m: 7, d: 28 });
    expect(parseDate('The Mission of the Cause')).toBeNull();
  });
});

describe('buildLetters', () => {
  it('a compilation of dated letters → one message each (Bahá’í Administration)', () => {
    const L = buildLetters({ id: 1, title: 'BA' }, [
      { title: 'Letter of January 21st, 1922.', level: 3, start_index: 0, end_index: 8 },
      { title: 'Letter of March 5, 1922.', level: 3, start_index: 9, end_index: 28 },
      { title: 'The Mission of the Cause', level: 4, start_index: 12, end_index: 14 }], []);
    expect(L.filter((l) => l.basis === 'section-date').map((l) => [l.start, l.end, l.d])).toEqual([[0, 8, 21], [9, 28, 5]]);
    expect(L.find((l) => l.title === 'The Mission of the Cause')).toMatchObject({ kind: 'section', y: 1922, m: 3, d: 5 });
  });
  it('a book of letters → chapters dated by their date line (The World Order of Bahá’u’lláh)', () => {
    const secs = [{ title: 'The Goal of a New World Order', level: 1, start_index: 0, end_index: 2 }, { title: 'The Dispensation of Bahá’u’lláh', level: 1, start_index: 3, end_index: 5 }];
    const paras = [{ paragraph_index: 0, text: 'x. y.' }, { paragraph_index: 1, text: 'z.' }, { paragraph_index: 2, text: 'Haifa, Palestine, November 28, 1931.' },
      { paragraph_index: 3, text: 'a.' }, { paragraph_index: 4, text: 'b.' }, { paragraph_index: 5, text: 'February 8, 1934' }];
    const ch = buildLetters({ id: 2, title: 'WOB' }, secs, paras).filter((l) => l.kind === 'chapter');
    expect(ch.map((l) => [l.title, l.y, l.m, l.d])).toEqual([['The Goal of a New World Order', 1931, 11, 28], ['The Dispensation of Bahá’u’lláh', 1934, 2, 8]]);
  });
  it('messages that END with their date line, and messages dated by their HEADING', () => {
    const ma = buildLetters({ id: 3, title: 'MA' }, [{ title: 'Nabíl’s Narrative', level: 3, start_index: 0, end_index: 2 }],
      [{ paragraph_index: 0, text: 'Nabíl’s Narrative' }, { paragraph_index: 1, text: 'Unfailing instrument. More.' }, { paragraph_index: 2, text: 'Cablegram June 21, 1932' }]);
    expect(ma.find((l) => l.basis === 'date-line')).toMatchObject({ start: 0, end: 2, y: 1932, m: 6, d: 21, title: 'Nabíl’s Narrative' });
    const cf = buildLetters({ id: 4, title: 'CF' }, [], [
      { paragraph_index: 0, text: 'a', heading: 'November 3, 1948' }, { paragraph_index: 1, text: 'b', heading: 'Scale Nobler Heights' },
      { paragraph_index: 2, text: 'c', heading: 'November 8, 1948' }]);
    expect(cf.filter((l) => l.basis === 'date-heading').map((l) => [l.start, l.end, l.d])).toEqual([[0, 1, 3], [2, 2, 8]]);
  });
});

describe('matchLetters', () => {
  const L = [
    { doc_id: 1, title: 'Letter of January 21st, 1922.', y: 1922, m: 1, d: 21, start: 0, end: 8, kind: 'message' },
    { doc_id: 1, title: 'Reports of Activities', y: 1922, m: 1, d: 21, start: 3, end: 3, kind: 'section' },
    { doc_id: 2, title: 'The Dispensation of Bahá’u’lláh', y: 1934, m: 2, d: 8, start: 188, end: 318, kind: 'chapter' },
    { doc_id: 3, title: 'April, 1955', y: 1955, m: 4, d: null, start: 319, end: 348, kind: 'message' },
    { doc_id: 3, title: 'Cablegram, April 30, 1955', y: 1955, m: 4, d: 30, start: 359, end: 360, kind: 'message' },
  ];
  it('by date: the letter, never a sub-section that only shares its date', () => {
    expect(matchLetters(L, { date: '21 January 1922', title: 'to NSA' })[0]).toMatchObject({ start: 0, kind: 'message' });
  });
  it('by title alone (diacritics folded)', () => {
    expect(matchLetters(L, { title: 'The Dispensation of Bahaullah' })[0]).toMatchObject({ doc_id: 2, start: 188 });
  });
  it('a month-only date prefers the month-only message (Riḍván)', () => {
    expect(matchLetters(L, { date: 'April 1955' })[0]).toMatchObject({ start: 319 });
  });
});

describe('letters-index job', () => {
  it('builds every book of the shelf and stores the author’s letters', async () => {
    const saved = [];
    const r = await lettersIndexJob({}, {
      docs: async () => ({ docs: [{ id: 1, title: 'BA' }] }),
      sections: async () => [{ title: 'Letter of January 21st, 1922.', level: 3, start_index: 0, end_index: 8 }],
      paragraphs: async () => [{ paragraph_index: 0, text: 'x' }],
      save: async (a, rows) => saved.push([a, rows.length]),
    });
    expect(r).toMatchObject({ author: 'Shoghi Effendi', books: 1, written: 2 });
    expect(saved).toEqual([['Shoghi Effendi', 2]]);
  });
});

describe('one letter, one answer', () => {
  it('the same range found as a chapter and as a dated message is listed once', () => {
    const L = [{ doc_id: 2, title: 'The Dispensation of Bahá’u’lláh', y: 1934, m: 2, d: 8, start: 188, end: 318, kind: 'chapter' },
      { doc_id: 2, title: 'The Dispensation of Bahá’u’lláh', y: 1934, m: 2, d: 8, start: 188, end: 318, kind: 'message' }];
    expect(matchLetters(L, { title: 'The Dispensation of Bahaullah' })).toHaveLength(1);
  });
});
