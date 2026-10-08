// Recovering compilation section authors from the official edition: labels, trailers, text keys.
import { describe, it, expect } from 'vitest';
import { sectionLabel, textKey, officialAuthors, blocks, workAuthor, isCitation } from '../../scripts/authorship/official-sections.mjs';

describe('section labels', () => {
  it('reads the official labels', () => {
    expect(sectionLabel('1. From the Writings of Bahá’u’lláh')).toEqual({ name: 'Bahá’u’lláh', on_behalf: undefined });
    expect(sectionLabel('2. From the Writings of ‘Abdu’l-Bahá')).toMatchObject({ name: '‘Abdu’l-Bahá' });
    expect(sectionLabel('Extracts from Letters Written on Behalf of Shoghi Effendi')).toEqual({ name: 'Shoghi Effendi', on_behalf: true });
    expect(sectionLabel('From Letters of the Universal House of Justice')).toMatchObject({ name: 'Universal House of Justice' });
    expect(sectionLabel('From the Writings of the Báb')).toMatchObject({ name: 'The Báb' });
  });
  it('a sentence that only mentions a writer is not a label', () => {
    expect(sectionLabel('From the earliest days of His ministry, Bahá’u’lláh summoned the kings of the earth to justice and to peace, and He warned them repeatedly of the consequences of their neglect.')).toBeNull();
    expect(sectionLabel('Bahá’u’lláh says that prayer is a ladder.')).toBeNull();
  });
});

describe('official authors by text', () => {
  const html = `<p>This compilation was prepared by the Research Department.</p>
    <p>1. From the Writings of Bahá’u’lláh</p><p>I. We, verily, have set forth all things in Our Book, as a token of grace unto those who have believed.</p>
    <p>2. From Letters Written on Behalf of Shoghi Effendi</p><p>The obligatory prayers are binding on all believers and should be said daily.</p>
    <p>(From a letter written on behalf of Shoghi Effendi to an individual believer, 1 January 1940)</p>
    <p>A third passage, which a trailer below claims for ‘Abdu’l-Bahá instead.</p><p>(‘Abdu’l-Bahá, Selections, p. 12)</p>`;
  const m = officialAuthors(blocks(html));
  it('labels open sections; the preface has no writer; a trailer claims what is above it', () => {
    expect(m.get(textKey('This compilation was prepared by the Research Department.'))).toMatchObject({ name: null, basis: 'official-preface' });
    expect(m.get(textKey('I. We, verily, have set forth all things in Our Book, as a token of grace unto those who have believed.'))).toMatchObject({ name: 'Bahá’u’lláh', basis: 'official-section' });
    expect(m.get(textKey('The obligatory prayers are binding on all believers and should be said daily.'))).toMatchObject({ name: 'Shoghi Effendi', on_behalf: true, basis: 'official-trailer' });
    expect(m.get(textKey('A third passage, which a trailer below claims for ‘Abdu’l-Bahá instead.'))).toMatchObject({ name: '‘Abdu’l-Bahá', basis: 'official-trailer' });
  });
  it('an attribution line ending in a note number is still an attribution line', () => {
    const m2 = officialAuthors(blocks('<p>And then the voice of the Divine Lote-Tree sounded, calling aloud and saying praise be unto God.</p><p>(Bahá’u’lláh, from a Tablet—translated from the Arabic) <a href="#n1">[1]</a></p>'));
    expect(m2.get(textKey('And then the voice of the Divine Lote-Tree sounded, calling aloud and saying praise be unto God.'))).toMatchObject({ name: 'Bahá’u’lláh', basis: 'official-trailer' });
  });
  it('our copy matches the official one despite markers, footnotes and punctuation', () => {
    expect(textKey('⁅s1⁆I. We, verily, have set forth[^3] all things in Our Book (12, 13), as a token of grace'))
      .toBe(textKey('I. We, verily, have set forth all things in Our Book, as a token of grace'));
  });
});

describe('citations that name only a work', () => {
  it('close the extracts above them, and the work names its writer', () => {
    const m = officialAuthors(blocks(`<p>3. From Letters of the Universal House of Justice</p>
      <p>Endowments dedicated to charity revert to God, the Revealer of Signs, and none hath the right to dispose of them.</p>
      <p>(The Kitáb-i-Aqdas, par. 42) [7]</p>
      <p>The Universal House of Justice wishes you to know that the matter has been considered with care and attention.</p>
      <p>(From a letter dated 1 May 1990 written by the Universal House of Justice to an individual)</p>`));
    expect(m.get(textKey('Endowments dedicated to charity revert to God, the Revealer of Signs, and none hath the right to dispose of them.'))).toMatchObject({ name: 'Bahá’u’lláh', basis: 'official-work' });
    expect(m.get(textKey('The Universal House of Justice wishes you to know that the matter has been considered with care and attention.'))).toMatchObject({ name: 'Universal House of Justice' });
  });
  it('maps works to writers; an unknown work falls back to the section', () => {
    expect(workAuthor('(Some Answered Questions, no. 12)')).toBe('‘Abdu’l-Bahá');
    expect(workAuthor('(The Advent of Divine Justice, p. 30)')).toBe('Shoghi Effendi');
    expect(workAuthor('(Selections from the Writings of the Báb, 3:2)')).toBe('The Báb');
    expect(workAuthor('(Compilation of Compilations, vol. I)')).toBeNull();
    expect(workAuthor('(Bahá’u’lláh, quoted in The Advent of Divine Justice, p. 23)')).toBeNull();
    expect(isCitation('(Compilation of Compilations, vol. I)')).toBe(true);
    expect(isCitation('A whole paragraph of ordinary prose (with an aside) that runs on.')).toBe(false);
  });
});
