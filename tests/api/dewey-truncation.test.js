// Truncated books (Chad 10-19 via the SearchLayerPDF session) — the SLP reference tests, ported (vitest), plus the readers.
import { describe, it, expect } from 'vitest';
import { assessCompleteness, slpPages } from '../../api/lib/dewey/truncation.js';
const toc = `Contents
Foreword by the Translator . . . . . . . . vii
Chronology ......................... xv
Voyage to England 1
England 23
Scotland 112
France 160
Germany 410
Hungary 480
Egypt 590
Holy Land 652
Bibliography ...................... 681`;
const index = `Index
Abdu'l-Bahá, talks of, 12, 45, 233–6, 690
London, 23, 31, 54, 101
Paris, 160, 172, 199, 301–5
Stuttgart, 410, 418, 455`;

describe('assessCompleteness', () => {
  it('flags a contents+index extract: TOC and index point far past the PDF', () => {
    const pages = [toc, 'Selected biographical notes ...', index];
    const r = assessCompleteness({ pages, pdfPages: 19 });
    expect(r.suspect).toBe(true);
    expect(r.expected_pages).toBe(690);
    expect(r.pdf_pages).toBe(19);
    expect(r.evidence.some((e) => /contents/i.test(e)) && r.evidence.some((e) => /index/i.test(e))).toBe(true);
  });
  it('a whole book (PDF covers the TOC + front matter) is not flagged', () => {
    expect(assessCompleteness({ pages: [toc, index], pdfPages: 720 }).suspect).toBe(false);
  });
  it('front matter offset is allowed (printed p.681 in a 700-page PDF is fine)', () => {
    expect(assessCompleteness({ pages: [toc], pdfPages: 700 }).suspect).toBe(false);
  });
  it('printed page labels beyond the PDF length are evidence too', () => {
    const r = assessCompleteness({ pages: ['text'], pdfPages: 40, pageLabels: ['301', '302', '303', '304'] });
    expect(r.suspect).toBe(true);
    expect(r.expected_pages).toBe(304);
  });
  it('ordinary documents (no TOC, years and figures in prose) are not flagged', () => {
    const prose = 'In 1912 the Master travelled 4000 miles. On 23 May 1913 He spoke to 300 people at 7 pm.';
    expect(assessCompleteness({ pages: [prose, prose], pdfPages: 2 }).suspect).toBe(false);
  });
  it('a lone big number is not a TOC (needs several ascending entries)', () => {
    expect(assessCompleteness({ pages: ['See page 500 for details'], pdfPages: 3 }).suspect).toBe(false);
  });
});

describe('slpPages', () => {
  it('reads printed page labels from SLP markers', () => {
    const r = slpPages('<!-- pdf:1, pg:301 -->\nText one\n\n<!-- pdf:2, pg:302 -->\nText two\n\n<!-- pdf:3 -->\nThree');
    expect(r.pages.map((p) => p.trim())).toEqual(['Text one', 'Text two', 'Three']);
    expect(r.pageLabels).toEqual(['301', '302']);
  });
});
