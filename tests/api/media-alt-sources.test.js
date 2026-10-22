// The alternate-source finder's matching (scripts/media/alt-sources.mjs): the same talk elsewhere needs most of the
// title's content words; generic words (talk, Bahá'í, the speaker's own name) do not count.
import { describe, it, expect } from 'vitest';
import { titleSimilarity, words } from '../../scripts/media/alt-sources.mjs';

describe('alternate sources', () => {
  it('content words only', () => expect(words("About The Báb - Hooper Dunbar - San Diego, CA - April 2019")).toEqual(['bab', 'san', 'diego', 'april']));
  it('the same talk scores high, a different one low', () => {
    expect(titleSimilarity('Understanding Death and Immortality - Hooper Dunbar - Austin, TX - 2011', 'Hooper Dunbar: Understanding Death and Immortality (Austin 2011)')).toBeGreaterThan(0.6);
    expect(titleSimilarity('Understanding Death and Immortality', 'The Covenant of Bahá’u’lláh')).toBe(0);
  });
});
