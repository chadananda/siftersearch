// bahai-library stubs derive metadata from the SOURCE PATH, so a PDF at /pdf/z/zwemer_islam_challenge_faith.pdf
// arrives as author "pdf-z-zwemer", title "zwemer_islam_challenge_faith". That is a filename wearing an
// author's clothes — format, alphabetical bucket, surname — and 58 of the 60 newest documents carried one
// (Chad, 2026-08-13). Once ingested it is indistinguishable from a real person in citations, search facets
// and the entity layer.
//
// The rule, the same one that governs hype questions and disambiguation notes: NEVER WRITE A FABRICATED
// VALUE. Recover what the document itself states; where it states nothing, leave the field null and flag it.
import { describe, it, expect } from 'vitest';
import {
  isLocatorAuthor, isFilenameTitle, locatorSurname, titleFromText, authorFromText, resolveSourceMetadata,
} from '../../api/lib/text/source-metadata.js';

describe('recognising a file locator', () => {
  it.each(['pdf-z-zwemer', 'pdf-s-shams', 'pdf-s-shoghi-effendi', 'docx-a-adams', 'html-b-brown'])(
    '%s is a locator, not an author', (a) => expect(isLocatorAuthor(a)).toBe(true));

  it.each(['Samuel Zwemer', "Bahá'u'lláh", 'Rúḥíyyih Rabbání', 'Lady Blomfield', 'pdfsmith'])(
    '%s is a real author and must survive', (a) => expect(isLocatorAuthor(a)).toBe(false));

  it('recognises a filename slug title', () => {
    expect(isFilenameTitle('zwemer_islam_challenge_faith')).toBe(true);
    expect(isFilenameTitle('shams_spiritual_economic_system')).toBe(true);
  });

  it('does not mistake a real title for a slug', () => {
    expect(isFilenameTitle('The Chosen Highway')).toBe(false);
    expect(isFilenameTitle('A Year Amongst the Persians')).toBe(false);
  });

  it('extracts the surname hint without promoting it', () => {
    expect(locatorSurname('pdf-z-zwemer')).toBe('zwemer');
    expect(locatorSurname('pdf-s-shoghi-effendi')).toBe('shoghi effendi');
  });
});

describe('recovering from the document, or not at all', () => {
  const doc = ['Islam: A Challenge to Faith', '', 'by Samuel M. Zwemer', '', 'New York, 1907', '',
    'The first paragraph begins here and runs on at some length.'].join('\n');

  it('recovers the real title and author from the document itself', () => {
    const r = resolveSourceMetadata({ stubTitle: 'zwemer_islam_challenge_faith', stubAuthor: 'pdf-z-zwemer', text: doc });
    expect(r.title).toBe('Islam: A Challenge to Faith');
    expect(r.author).toBe('Samuel M. Zwemer');
    expect(r.needsReview).toBe(false);
  });

  it('leaves the author NULL when the document has no byline — never a guess', () => {
    const r = resolveSourceMetadata({ stubTitle: 'x_y_z', stubAuthor: 'pdf-x-xavier', text: 'A Title Here\n\nProse with no byline at all.' });
    expect(r.author).toBeNull();
    expect(r.needsReview).toBe(true);
    expect(r.notes.join(' ')).toMatch(/left unknown/);
  });

  it('refuses a byline that does not corroborate the locator surname', () => {
    // Guards against lifting a quoted or cited name out of the front matter as the author.
    const text = 'Some Title\n\nby Winston Churchill\n\nprose';
    expect(authorFromText(text, { expectSurname: 'zwemer' })).toBeNull();
    expect(authorFromText(text, { expectSurname: 'churchill' })).toBe('Winston Churchill');
  });

  it('leaves GOOD stub metadata completely alone', () => {
    const r = resolveSourceMetadata({ stubTitle: 'The Chosen Highway', stubAuthor: 'Lady Blomfield', text: doc });
    expect(r.title).toBe('The Chosen Highway');
    expect(r.author).toBe('Lady Blomfield');
    expect(r.notes).toEqual([]);
  });

  it('skips publication furniture when recovering a title', () => {
    const t = titleFromText('Copyright 1907\nISBN 0-000\n\nIslam: A Challenge to Faith\n\nby Samuel Zwemer');
    expect(t).toBe('Islam: A Challenge to Faith');
  });

  it('does not take a long sentence as a title', () => {
    expect(titleFromText('This is clearly a running sentence of prose that goes on and on and should not be a title.')).toBeNull();
  });
});

// ── Backfill safety (scripts/backfill-source-metadata.mjs) ────────────────────────────────────────────
// The backfill rewrites author/title on ~2,058 live documents, so its selection and its writes both have to
// be conservative: touch only what is genuinely a locator, and never replace real metadata with a guess.
describe('backfill selection and writes', () => {
  const decide = (d, text) => {
    if (!isLocatorAuthor(d.author) && !isFilenameTitle(d.title)) return { action: 'skip' };
    const m = resolveSourceMetadata({ stubTitle: d.title, stubAuthor: d.author, text });
    return { action: 'write', author: m.author, title: m.title ?? d.title };
  };

  it('skips a document that already has real metadata', () => {
    expect(decide({ author: 'Lady Blomfield', title: 'The Chosen Highway' }, 'x').action).toBe('skip');
  });

  it('clears a locator author to NULL when the text offers no byline', () => {
    const r = decide({ author: 'pdf-x-xavier', title: 'x_y_z' }, 'A Title\n\nprose without a byline');
    expect(r.action).toBe('write');
    expect(r.author).toBeNull();          // never 'Xavier', never 'pdf-x-xavier'
  });

  it('keeps the existing title when none can be recovered, rather than nulling a usable one', () => {
    const r = decide({ author: 'pdf-b-brown', title: 'Some Readable Title' }, 'prose only');
    expect(r.title).toBe('Some Readable Title');
  });

  it('recovers both when the document states both', () => {
    const text = 'Islam: A Challenge to Faith\n\nby Samuel M. Zwemer\n\nprose';
    const r = decide({ author: 'pdf-z-zwemer', title: 'zwemer_islam_challenge_faith' }, text);
    expect(r.author).toBe('Samuel M. Zwemer');
    expect(r.title).toBe('Islam: A Challenge to Faith');
  });

  it('a locator author whose surname the text contradicts is cleared, not swapped', () => {
    const text = 'A Title\n\nby Winston Churchill\n\nprose';
    const r = decide({ author: 'pdf-z-zwemer', title: 'zwemer_islam' }, text);
    expect(r.author).toBeNull();
  });
});
