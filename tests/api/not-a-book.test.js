// The 2026-08-13 conversion run ingested web ERROR PAGES as library documents — 'Error 404' and 'PDF Support'
// have doc rows, paragraph counts, and would in time have had an entity layer built on top of them. A 404
// page is never a book, and the cheapest place to say so is before it is written.
//
// The tests also pin the boundary that matters most: a real book must not be rejected for mentioning any of
// these phrases. Over-rejection loses library material silently, which is worse than a junk row.
import { describe, it, expect } from 'vitest';
import { classifyCandidate, isErrorPageTitle, isErrorPageText, isApparatusTitle } from '../../api/lib/text/not-a-book.js';

describe('web error and support pages are never books', () => {
  it.each(['Error 404', '404 Error', 'Page Not Found', 'Access Denied', 'Forbidden', 'PDF Support', 'Login'])(
    '%s is rejected on title alone', (t) => {
      expect(isErrorPageTitle(t)).toBe(true);
      expect(classifyCandidate({ title: t }).reject).toBe(true);
    });

  it('rejects on BODY when the title looks like a real book but the file 404s', () => {
    const c = classifyCandidate({
      title: 'The Dawn-Breakers',
      text: '404 Not Found. The requested URL /pdf/n/nabil.pdf was not found on this server.',
    });
    expect(c.reject).toBe(true);
    expect(c.reason).toMatch(/error page/);
  });

  it('names WHY in the reason, so a rejection is auditable rather than a silent drop', () => {
    expect(classifyCandidate({ title: 'Error 404' }).reason).toContain('Error 404');
  });
});

describe('real books are not rejected — over-rejection loses material silently', () => {
  it('a long work mentioning "not found" in its prose survives', () => {
    const prose = ('He searched the city and the man was not found, though he sought him many days. ').repeat(30);
    expect(isErrorPageText(prose)).toBe(false);
    expect(classifyCandidate({ title: 'Memories of Nine Years in Akka', text: prose }).reject).toBeFalsy();
  });

  it('a real title containing a rejected word is kept', () => {
    // "Support" alone is a support page; "Divine Support in the Writings" is a book.
    expect(isErrorPageTitle('Divine Support in the Writings')).toBe(false);
    expect(isErrorPageTitle('The Not Found Manuscript of Nayriz')).toBe(false);
  });

  it('a short book excerpt without error phrasing survives', () => {
    expect(isErrorPageText('A brief tablet of some ninety words, revealed in Baghdad.')).toBe(false);
  });
});

describe('apparatus is flagged, never silently dropped', () => {
  it.each(['index_gleanings_writings_bahaullah_198', 'echevarria_life_histories_toc', 'Table of Contents', 'bolhuis_crossreferences_pb_sources'])(
    '%s is marked apparatus, not rejected', (t) => {
      const c = classifyCandidate({ title: t });
      expect(c.reject).toBeFalsy();          // whether the library wants it is a librarian's call
      expect(c.apparatus).toBe(true);
      expect(isApparatusTitle(t)).toBe(true);
    });

  it('does not call an ordinary book apparitional because it contains a common word', () => {
    expect(isApparatusTitle('The Chosen Highway')).toBe(false);
    expect(isApparatusTitle('A Year Amongst the Persians')).toBe(false);
  });
});
