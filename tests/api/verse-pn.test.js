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
  it('a <sup> missing in the source shifts nothing: each marked block re-anchors (Romans 3)', () => {
    const h = 'Romans 3';
    const r = versePn([
      { heading: h, text: 'v11 <sup>3:12</sup> v12 v13-unmarked' },               // the source forgot <sup>3:13</sup>
      { heading: h, text: 'v14 <sup>3:15</sup> v15' },                              // starts 3:14 — taken from its own sup
      { heading: h, text: 'v16' },                                                  // 3:16
    ]);
    expect(r.pn).toEqual(['3:11', '3:14', '3:16']);
    expect(r.issues.map((x) => x.kind)).toEqual(['gap']);                        // reported, not propagated
  });
  it('one mistyped <sup> chapter never relabels the chapter (Rodwell IX: a "4:50" among 9:n)', () => {
    const r = versePn([
      { heading: 'Sura IX', text: 'v1 <sup>4:2</sup> v2 <sup>9:3</sup> v3' },        // the FIRST sup is the typo
      { heading: 'Sura IX', text: 'v4 <sup>9:5</sup> v5' },
    ]);
    expect(r.pn).toEqual(['9:1', '9:4']);
    expect(r.issues.map((x) => x.kind)).toContain('chapter');
  });
});
