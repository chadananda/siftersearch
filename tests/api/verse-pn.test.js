// pn for verse-grouped scripture (Chad 10-11): the chapter:verse a block STARTS at; <sup> verses inside are checksums.
import { describe, it, expect } from 'vitest';
import { versePn } from '../../api/lib/library/verse-pn.js';

describe('versePn', () => {
  it('Bible: chapter from the heading, grouped verses advance the count', () => {
    const h = 'The Book of Genesis - Chapter 1';
    const r = versePn([
      { heading: h, text: 'In the beginning…' },                                  // 1:1
      { heading: h, text: 'And the earth… <sup>1:3</sup> And God said…' },         // 1:2 (+1:3)
      { heading: h, text: 'And God saw the light…' },                             // 1:4
      { heading: 'Genesis 2', text: 'Thus the heavens… <sup>2:2</sup> And on the seventh day…' }, // 2:1
      { heading: 'Genesis 2', text: 'And God blessed…' },                         // 2:3
    ]);
    expect(r.pn).toEqual(['1:1', '1:2', '1:4', '2:1', '2:3']);
    expect(r.checksum_failures).toBe(0);
  });
  it('Qur\'an: chapter from the sups, the invocation before verse 1 gets no pn', () => {
    const r = versePn([
      { heading: '', text: 'In the Name of God, the Compassionate, the Merciful' },
      { heading: '', text: 'THE BLOW! <sup>101:2</sup> what is the Blow? <sup>101:3</sup> Who shall teach thee…' },
      { heading: '', text: 'The Day when men… <sup>101:5</sup> And the mountains…' },
    ]);
    expect(r.pn).toEqual([null, '101:1', '101:4']);
    expect(r.checksum_failures).toBe(0);
  });
  it('a sup that breaks the sequence is counted as a checksum failure', () => {
    const r = versePn([{ heading: 'X 3', text: 'a <sup>3:2</sup> b' }, { heading: 'X 3', text: 'c <sup>3:9</sup> d' }]);
    expect(r.checksum_failures).toBe(1);
  });
});
