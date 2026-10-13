// Ocean of Lights range links: `#(start)(end)[$N]`, shortest fragments by the site's own matching (indexOf, first occurrence).
import { describe, it, expect } from 'vitest';
import { locateQuote, oolQuoteHash, oolQuoteUrl } from '../../api/lib/ool-range.js';

// the text the site searches on oceanoflights.org/bahaullah-pub02-02-en (.tablet-content textContent, read 10-12)
const PAGE = '– II – The beginning of all things is the knowledge of God, and the end of all things is strict observance of whatsoever hath been sent down from the empyrean of the Divine Will that pervadeth all that is in the heavens and all that is on the earth. ';
// the site's resolver, reimplemented from its bundle: decode, parse, indexOf occurrence N of both fragments
const resolve = (page, hash) => {
  const m = decodeURIComponent(hash).match(/^\((.+?)\)(?:\((.+?)\))?(?:\$(\d+))?$/);
  const occ = (f) => { const o = []; for (let i = page.indexOf(f); i >= 0; i = page.indexOf(f, i + 1)) o.push(i); return o; };
  const n = m[3] ? Number(m[3]) - 1 : 0, s = occ(m[1])[n], e = occ(m[2])[n] + m[2].length;
  return page.slice(s, e);
};

describe('Ocean of Lights range links', () => {
  const page = PAGE;
  it('ignores markup our copy keeps (footnote refs, emphasis)', () => {
    expect(locateQuote(page, 'the _knowledge_ of God[^1]')).toEqual(locateQuote(page, 'the knowledge of God'));
  });
  it("reproduces Chad's examples: one word when it is the first occurrence (ignoring case), more when it is not", () => {
    expect(oolQuoteHash(page, ...locateQuote(page, 'The beginning of all things is the knowledge'))).toBe('(The)(knowledge)');
    const hash = oolQuoteHash(page, ...locateQuote(page, 'the knowledge of God, and the'));
    expect(hash).toBe('(the%20knowledge)(and%20the)');
    expect(resolve(page, hash)).toBe('the knowledge of God, and the');
  });
  it('a one-word quote is its own start and end', () => {
    expect(oolQuoteHash(page, ...locateQuote(page, 'empyrean'))).toBe('(empyrean)(empyrean)');
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

describe('quote markers', () => {
  it("escape ( ) ' so a link inside text or JSON is not cut at them", async () => {
    const { encodeMarker } = await import('../../api/lib/ool-range.js');
    expect(encodeMarker("God's (true) word!")).toBe('God%27s%20%28true%29%20word%21');
    expect(decodeURIComponent(encodeMarker("a (b) 'c' ~d"))).toBe("a (b) 'c' ~d");
  });
});

describe('bounded work (10-12: whole-book pages froze the API)', () => {
  it('a 1 MB page and a 350-word quote place a range in well under a second', async () => {
    const { oolQuoteUrl } = await import('../../api/lib/ool-range.js');
    const filler = 'and the light of God shineth upon all things '.repeat(20000);   // ~900 KB of repeats
    const quote = Array.from({ length: 350 }, (_, i) => `word${i}`).join(' ');
    const page = `${filler} ${quote} ${filler}`;
    const t0 = Date.now();
    const u = oolQuoteUrl('https://oceanoflights.org/x/', page, quote);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(u).toMatch(/^https:\/\/oceanoflights\.org\/x\/#\(word0\)\(word349\)$/);
  });
  it('a page past the size cap gets no range (the caller falls back to a text fragment)', async () => {
    const { oolQuoteUrl, OOL_PAGE_MAX } = await import('../../api/lib/ool-range.js');
    expect(oolQuoteUrl('https://oceanoflights.org/x/', 'a '.repeat(OOL_PAGE_MAX), 'a a')).toBeNull();
  });
});
