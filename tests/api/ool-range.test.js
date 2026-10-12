// Ocean of Lights range links: `#(start)(end)[$N]`, shortest fragments by the site's own matching (indexOf, first occurrence).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { oolContentText, locateQuote, oolQuoteHash, oolQuoteUrl } from '../../api/lib/ool-range.js';

const html = readFileSync(new URL('../fixtures/ool-bahaullah-pub02-02-en.html', import.meta.url), 'utf8');
// the site's resolver, reimplemented from its bundle: decode, parse, indexOf occurrence N of both fragments
const resolve = (page, hash) => {
  const m = decodeURIComponent(hash).match(/^\((.+?)\)(?:\((.+?)\))?(?:\$(\d+))?$/);
  const occ = (f) => { const o = []; for (let i = page.indexOf(f); i >= 0; i = page.indexOf(f, i + 1)) o.push(i); return o; };
  const n = m[3] ? Number(m[3]) - 1 : 0, s = occ(m[1])[n], e = occ(m[2])[n] + m[2].length;
  return page.slice(s, e);
};

describe('Ocean of Lights range links', () => {
  const page = oolContentText(html);
  it('reads the text the site searches (.tablet-content, not the page header)', () => {
    expect(page.startsWith('– II – The beginning of all things')).toBe(true);
    expect(page).not.toContain('Translated by Shoghi Effendi');
  });
  it("reproduces Chad's example: (The)(knowledge)", () => {
    const at = locateQuote(page, 'The beginning of all things is the knowledge');
    expect(oolQuoteHash(page, ...at)).toBe('(The)(knowledge)');
  });
  it('grows a fragment until its first occurrence is the right one', () => {
    const q = 'the end of all things is strict observance';
    const hash = oolQuoteHash(page, ...locateQuote(page, q));
    expect(hash).toBe('(the%20end)(observance)');
    expect(resolve(page, hash)).toBe(q);
  });
  it('falls back to $N when no first-occurrence pair exists', () => {
    const p = 'all that is good. all that is good.';
    const s = p.lastIndexOf('all that is good');
    const hash = oolQuoteHash(p, s, s + 'all that is good'.length);
    expect(hash).toBe('(all)(good)$2');
    expect(resolve(p, hash)).toBe('all that is good');
  });
  it('matches our copy loosely (whitespace, curly quotes) and builds the URL', () => {
    expect(oolQuoteUrl('https://oceanoflights.org/bahaullah-pub02-02-en/', page, 'all  that is in the heavens'))
      .toBe('https://oceanoflights.org/bahaullah-pub02-02-en/#(all%20that)(heavens)');
    expect(resolve(page, '(all%20that)(heavens)')).toBe('all that is in the heavens');
    expect(oolQuoteUrl('https://oceanoflights.org/x/', page, 'not on this page')).toBeNull();
  });
});
