// stripUngroundedLinks must stay linear: an unclosed markdown link with a long URL (a streamed sentence cut before its ")")
// backtracked exponentially and froze the API (2026-10-06).
import { describe, it, expect } from 'vitest';
import { stripUngroundedLinks } from '../../api/lib/jafar-pipeline.js';

const LONG = 'https://oceanoflights.org/abdul-baha-bkw03-fa/#:~:text=' + '%D8%A7%DA%AF%D8%B1%20'.repeat(30);
describe('stripUngroundedLinks', () => {
  it('an unclosed link with a long URL returns at once', () => {
    const t0 = Date.now();
    stripUngroundedLinks(`The original tablet, [*Alvah-i-Visaya*](${LONG} and more words (with a paren) after it`, [{ citation_url: 'https://x/y' }]);
    expect(Date.now() - t0).toBeLessThan(200);
  });
  it('still keeps grounded links, unlinks fabricated ones, and allows one level of parens', () => {
    const q = [{ citation_url: 'https://a.org/b (en)#p10' }, { citation_url: LONG }];
    expect(stripUngroundedLinks('[ok](https://a.org/b (en)#p10) and [bad](https://evil.example/x) and [long](' + LONG + ')', q))
      .toBe('[ok](https://a.org/b (en)#p10) and bad and [long](' + LONG + ')');
    // a fabricated URL with a space and a paren group is still recognised as a link — and unlinked
    expect(stripUngroundedLinks('[x](https://evil.example/c (fr)#p2)', q)).toBe('x');
  });
});
