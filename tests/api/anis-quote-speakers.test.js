// r6-base class B (14 of 108 defects): a quotation credited to a figure other than the passage's writer — an on-behalf letter
// credited to Shoghi Effendi or to Bahá'u'lláh, the Guardian's words framed as Bahá'u'lláh's. The credit comes from the
// passage's authorship, not from the model's guess.
import { describe, it, expect } from 'vitest';
import { creditOf, fixQuoteSpeakers } from '../../api/lib/assistant/quotes.js';

const BEHALF = { source_author: 'Shoghi Effendi', citation_url: 'u1', source_title: 'Compilation',
  text: 'The advice that Shoghi Effendi gave you regarding the division of your time is that every soul should be occupied in some form of occupation that will benefit society.' };
const ADJ = { source_author: 'Shoghi Effendi', citation_url: 'u2', source_title: 'The Advent of Divine Justice',
  text: 'Such a standard is not to be associated or confused with any form of asceticism, nor does it quote “the earth is but one country, and mankind its citizens” here.' };
const GL = { source_author: 'Bahá’u’lláh', citation_url: 'u3', source_title: 'Gleanings', text: 'Disencumber yourselves of all attachment to this world and the vanities thereof.' };

describe('creditOf', () => {
  it('a Guardian letter that speaks of him in the third person is written on his behalf', () => expect(creditOf(BEHALF)).toBe('a letter written on behalf of Shoghi Effendi'));
  it('his own writing is his', () => expect(creditOf(ADJ)).toBe('Shoghi Effendi'));
});

describe('fixQuoteSpeakers', () => {
  it('re-credits a quotation to the writer of the passage that holds it', () => {
    const r = fixQuoteSpeakers('Bahá’u’lláh states that “every soul should be occupied in some form of occupation that will benefit society.”', [BEHALF]);
    expect(r.text).toBe('A letter written on behalf of Shoghi Effendi states that “every soul should be occupied in some form of occupation that will benefit society.”');
    expect(r.fixed).toBe(1);
  });
  it('Shoghi Effendi named for an on-behalf letter becomes the letter', () => {
    const r = fixQuoteSpeakers('As Shoghi Effendi writes, “every soul should be occupied in some form of occupation.”', [BEHALF]);
    expect(r.text).toBe('As a letter written on behalf of Shoghi Effendi writes, “every soul should be occupied in some form of occupation.”');
  });
  it('the right speaker is left alone', () => {
    const t = 'Bahá’u’lláh writes: “Disencumber yourselves of all attachment to this world.”';
    expect(fixQuoteSpeakers(t, [GL]).text).toBe(t);
  });
  it('words the passage itself quotes may belong to someone else', () => {
    const t = 'Bahá’u’lláh declares, “the earth is but one country, and mankind its citizens.”';
    expect(fixQuoteSpeakers(t, [ADJ]).text).toBe(t);
  });
  it('a possessive is not a speaker', () => {
    const t = 'Bahá’u’lláh’s standard “is not to be associated or confused with any form of asceticism.”';
    expect(fixQuoteSpeakers(t, [ADJ]).text).toBe(t);
  });
  it('a scholar’s passage is not re-credited (a quoted Writing may be laid out without quotation marks)', () => {
    const t = 'Bahá’u’lláh writes: “Disencumber yourselves of all attachment to this world.”';
    expect(fixQuoteSpeakers(t, [{ ...GL, source_author: 'John Walbridge' }]).text).toBe(t);
  });
});
