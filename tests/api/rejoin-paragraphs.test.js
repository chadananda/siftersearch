// Re-joining paragraphs broken mid-sentence by PDF conversion (api/lib/rejoin-paragraphs.js).
import { describe, it, expect } from 'vitest';
import { rejoin, brokenShare } from '../../api/lib/rejoin-paragraphs.js';

const momen = [
  'The Bahá’í Faith is currently still in the phase of dealing with the consequences of this latest breakthrough that has left the Bahá’í world with a large number of poor, illiterate villagers with whom the Bahá’ís of the West or',
  'Middle East have little in common culturally. And yet somehow, these peoples’ knowledge of the Bahá’í teachings has to be deepened, and they have to be incorporated into the life of the Bahá’í world community. Let us see what',
  'lessons our survey of Bahá’í history has for this enormous task.',
  'Adaptation of the Teachings of the Bahá’í Faith',
  'When ’Abdu’l-Bahá came to the West in 1911–1913, he had a large range of Bahá’u’lláh’s teachings from which he could have chosen.',
].join('\n\n');

describe('rejoin', () => {
  it('joins a sentence broken across blocks, and stops at a heading', () => {
    const r = rejoin(momen);
    const blocks = r.body.split('\n\n');
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatch(/the West or Middle East have little.*Let us see what lessons our survey/);
    expect(blocks[1]).toBe('Adaptation of the Teachings of the Bahá’í Faith');
    expect(r.joins).toBe(2);
  });
  it('turns a page number between the pieces into a page marker', () => {
    const r = rejoin('He travelled to the city of Baghdad where, after many months of hardship and illness, he finally met the');
    expect(r.joins).toBe(0);
    const r2 = rejoin('He travelled to the city of Baghdad where, after many months of hardship and illness, he finally met the\n\n112\n\ngovernor, who received him with unexpected courtesy and kindness.');
    expect(r2.body).toBe('He travelled to the city of Baghdad where, after many months of hardship and illness, he finally met the <pb n="112"/> governor, who received him with unexpected courtesy and kindness.');
    expect(r2.pages).toBe(1);
  });
  it('makes a lone page number between whole paragraphs a marker', () => {
    expect(rejoin('A whole paragraph that ends properly with a full stop here.\n\n57\n\nAnother whole paragraph begins here and ends properly.').body)
      .toBe('A whole paragraph that ends properly with a full stop here.\n\n<pb n="57"/>\n\nAnother whole paragraph begins here and ends properly.');
  });
  it('never touches headings, lists, quotes, footnotes, or finished paragraphs', () => {
    const t = '## A heading without a stop\n\nlowercase line after a heading that is long enough to count as prose text here.\n\n- a list item without a stop\n\nanother lowercase line long enough to count as prose for the test here.\n\n[^1]: a footnote\n\nThis paragraph is finished.\n\nThis one too.';
    expect(rejoin(t).body).toBe(t);
  });
  it('keeps a line-end hyphen and joins without a space', () => {
    expect(rejoin('This is a long enough line of prose that ends with a hyphenated well-\n\nknown word in the next block of the converted file.').body).toMatch(/well-known word/);
  });
  it('flags the broken share', () => {
    expect(brokenShare(momen).broken).toBe(2);
  });
});
