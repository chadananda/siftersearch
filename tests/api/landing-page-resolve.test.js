// 2,789 books are blocked because docs.source_url holds a bahai-library.com LANDING page instead of the
// file it links to. The converter already accepts /docs/ links, so this is link resolution, not document
// conversion — and these lock the two judgements that matter: which urls are landing pages, and which link
// to take once we are on one.
import { describe, it, expect } from 'vitest';
import { isLandingPage, fileLinkOnLandingPage, fileUrlOf, classifySource } from '../../api/lib/text/source-file-url.js';

describe('isLandingPage', () => {
  it('recognises the blocked shape', () => {
    expect(isLandingPage('https://bahai-library.com/khanum_horace_hotchkiss_holley')).toBe(true);
    expect(isLandingPage('https://bahai-library.com/khianra_immortals')).toBe(true);
  });

  it('does NOT re-handle urls the matcher already accepts', () => {
    expect(isLandingPage('https://bahai-library.com/docs/k/khianra_immortals.docx')).toBe(false);
    expect(isLandingPage('https://bahai-library.com/pdf/k/khianra_immortals.pdf')).toBe(false);
  });

  it('ignores other hosts and direct files', () => {
    expect(isLandingPage('https://example.com/some_page')).toBe(false);
    expect(isLandingPage('https://bahai-library.com/thing.pdf')).toBe(false);
    expect(isLandingPage(null)).toBe(false);
    expect(isLandingPage('not a url')).toBe(false);
  });
});

describe('fileLinkOnLandingPage', () => {
  const page = (...hrefs) => hrefs.map((h) => `<a href="${h}">x</a>`).join('');
  const base = 'https://bahai-library.com/khianra_immortals';

  it('absolutises a relative link', () => {
    expect(fileLinkOnLandingPage(page('/docs/k/khianra_immortals.docx'), base))
      .toBe('https://bahai-library.com/docs/k/khianra_immortals.docx');
  });

  it('PREFERS a word-processor format over the PDF', () => {
    // ~250 items in this corpus are already rejected for a bad PDF text layer ("low letter ratio").
    // Taking the rtf/docx when one is offered avoids walking into that failure on purpose.
    const html = page('/pdf/k/x.pdf', '/docs/k/x.rtf');
    expect(fileLinkOnLandingPage(html, base)).toMatch(/\.rtf$/);
  });

  it('falls back to the PDF when that is all there is', () => {
    expect(fileLinkOnLandingPage(page('/pdf/k/x.pdf'), base)).toMatch(/\.pdf$/);
  });

  it('returns null when the page links to no file at all', () => {
    expect(fileLinkOnLandingPage(page('/about', '/search?q=1'), base)).toBeNull();
    expect(fileLinkOnLandingPage('', base)).toBeNull();
  });

  it('what it returns is something the EXISTING matcher accepts — the whole point', () => {
    const resolved = fileLinkOnLandingPage(page('/docs/k/khianra_immortals.docx'), base);
    expect(fileUrlOf(resolved)).toBe(resolved);
    expect(classifySource(resolved)).toBe('matchable');
  });
});
