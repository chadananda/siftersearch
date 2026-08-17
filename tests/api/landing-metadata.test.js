// Recovering real title/author for 1,605 junk-metadata docs. Parsed off the markup, not the visible text:
// "Ahmad Batebi Ahang Rabbani , translator 2008-09-02" cannot be split reliably by eye, and a wrong split
// writes one person's name onto another's book.
import { describe, it, expect } from 'vitest';
import { parseLandingMetadata, titleOf, contributorsOf, isDeadLandingPage } from '../../api/lib/text/landing-metadata.js';

// The real shape, taken verbatim from bahai-library.com/batebi_bahais_higher_education.
const REAL = `<meta property="og:title" content="The Baha'is and Higher Education in Iran">
<h1 style="margin-top:1.5em;">The Baha'is and Higher Education in Iran</h1>
<h3 style="margin-top:.3em;"><i></i></h3>
<h3><a href="https://bahai-library.com/author/Ahmad_Batebi&type=exact">Ahmad Batebi</a></h3>
<h3><a href="https://bahai-library.com/author/Ahang_Rabbani&type=exact">Ahang Rabbani</a><span style="font-weight:normal;">, translator</span></h3>
<h4 style="font-weight:normal;">2008-09-02</h4>`;

describe('parseLandingMetadata', () => {
  it('recovers the real title (the junk was the slug)', () => {
    expect(parseLandingMetadata(REAL).title).toBe("The Baha'is and Higher Education in Iran");
  });

  it('the AUTHOR is the contributor with no role — never the translator', () => {
    const md = parseLandingMetadata(REAL);
    expect(md.author).toBe('Ahmad Batebi');            // pdf-b-batebi → Ahmad Batebi
    expect(md.author).not.toBe('Ahang Rabbani');       // attributing a work to its translator corrupts the corpus
  });

  it('keeps every contributor with its role, so the translator is not simply discarded', () => {
    expect(contributorsOf(REAL)).toEqual([
      { name: 'Ahmad Batebi', role: null },
      { name: 'Ahang Rabbani', role: 'translator' },
    ]);
  });

  it('detects a DEAD slug — bahai-library serves 200 with an Error 404 title, so status cannot tell you', () => {
    const dead = '<meta property="og:title" content="Error 404"><h1>Error 404</h1>';
    expect(isDeadLandingPage(dead)).toBe(true);
    const md = parseLandingMetadata(dead);
    expect(md.dead).toBe(true);
    expect(md.title).toBeNull();                       // never write "Error 404" back as a title
    expect(md.author).toBeNull();
  });

  it('decodes entities rather than writing them into the corpus', () => {
    expect(titleOf('<h1>Baha&#39;u&#39;ll&amp;aacute;h &amp; the Covenant</h1>')).toBe("Baha'u'll&aacute;h & the Covenant");
  });

  it('a page with no author links yields a title and a null author, not a guess', () => {
    const md = parseLandingMetadata('<h1>Some Compilation</h1>');
    expect(md.title).toBe('Some Compilation');
    expect(md.author).toBeNull();
  });

  it('ignores non-author links in the same heading region', () => {
    const html = '<h1>T</h1><h3><a href="/tags/Biographies">Biographies</a></h3>';
    expect(contributorsOf(html)).toEqual([]);
  });
});
