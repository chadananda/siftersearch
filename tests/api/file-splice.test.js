import { describe, it, expect } from 'vitest';
import { spliceBlocks } from '../../api/lib/segment/file-splice.js';

describe('spliceBlocks — new paragraph breaks into a source file', () => {
  it('keeps an inline footnote comment after the same word and leaves the rest of the block alone', () => {
    const file = 'before\n\n⁅s1⁆alpha beta <!-- fn: (1) note --> gamma.⁅/s1⁆ ⁅s2⁆delta epsilon.⁅/s2⁆\n## heading\n\nafter';
    const r = spliceBlocks(file, 0, ['⁅s1⁆alpha beta gamma.⁅/s1⁆', '⁅s1⁆delta epsilon.⁅/s1⁆']);
    expect(r.file).toBe('before\n\n⁅s1⁆alpha beta <!-- fn: (1) note --> gamma.⁅/s1⁆\n\n⁅s1⁆delta epsilon.⁅/s1⁆\n## heading\n\nafter');
  });
  it('page-break tags survive; a word that differs means no change', () => {
    const file = 'one two <pb n="5"/> three four';
    expect(spliceBlocks(file, 0, ['one two', 'three four']).file).toBe('one two <pb n="5"/>\n\nthree four');
    expect(spliceBlocks(file, 0, ['one two', 'three five'])).toBeNull();
  });
  it('never matches inside a longer word, and never spans a blank line', () => {
    expect(spliceBlocks('xone two', 0, ['one', 'two'])).toBeNull();
    expect(spliceBlocks('one\n\ntwo', 0, ['one', 'two'])).toBeNull();
  });
  it('acrossBlocks: a row the ingester joined from short file blocks can be re-split', () => {
    expect(spliceBlocks('one\n\ntwo three', 0, ['one two', 'three'], { acrossBlocks: true }).file).toBe('one two\n\nthree');
  });
});
