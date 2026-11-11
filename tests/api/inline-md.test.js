import { describe, it, expect } from 'vitest';
import { inlineParts } from '../../src/lib/inline-md.js';

describe('inlineParts', () => {
  it('turns _x_ / *x* into em and **x** into strong', () => {
    expect(inlineParts('_Star of the West_ was the first, in His *Tablets of the Divine Plan*, **must** be')).toEqual([
      { t: 'Star of the West', em: true }, { t: ' was the first, in His ' }, { t: 'Tablets of the Divine Plan', em: true },
      { t: ', ' }, { t: 'must', strong: true }, { t: ' be' }]);
  });
  it('keeps snake_case and lone asterisks as text; links keep their label', () => {
    expect(inlineParts('see file_name_here and 5 * 3 in [the book](https://x.org/a)')).toEqual([{ t: 'see file_name_here and 5 * 3 in the book' }]);
  });
  it('empty → []', () => { expect(inlineParts(null)).toEqual([]); });
});
