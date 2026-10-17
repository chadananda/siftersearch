// Citations typed as queries → the work and the number its verified scheme wrote.
import { describe, it, expect } from 'vitest';
import { parseCitation } from '../../api/lib/refs/cite.js';

describe('parseCitation', () => {
  it('Gleanings by Roman or Arabic section, with a paragraph inside it', () => {
    expect(parseCitation('Gleanings CXXV')).toMatchObject({ work: 'gleanings', doc: 20783, pn: 'CXXV' });
    expect(parseCitation('gleanings 125')).toMatchObject({ pn: 'CXXV' });
    expect(parseCitation('Gleanings, CXXV.3')).toMatchObject({ pn: 'CXXV.3' });
    expect(parseCitation('Gleanings 125:2')).toMatchObject({ pn: 'CXXV.2' });
    expect(parseCitation('Gleanings from the Writings of Bahá’u’lláh, XLIX')).toMatchObject({ pn: 'XLIX' });
    expect(parseCitation('Gleanings 200')).toBeNull();
  });
  it('the Íqán by paragraph', () => {
    expect(parseCitation('Kitáb-i-Íqán ¶12')).toMatchObject({ work: 'iqan', doc: 20810, pn: '12' });
    expect(parseCitation('Iqan 290')).toMatchObject({ pn: '290' });
    expect(parseCitation('Book of Certitude, p. 7')).toMatchObject({ pn: '7' });
    expect(parseCitation('Iqan 291')).toBeNull();
  });
  it('the Hidden Words, Arabic and Persian', () => {
    expect(parseCitation('Arabic Hidden Words 5')).toMatchObject({ work: 'hidden-words', pn: 'Arabic 5' });
    expect(parseCitation('Hidden Words, Persian 45')).toMatchObject({ pn: 'Persian 45' });
    expect(parseCitation('PHW 82')).toMatchObject({ pn: 'Persian 82' });
    expect(parseCitation('Hidden Words A71')).toMatchObject({ pn: 'Arabic 71' });
    expect(parseCitation('Arabic Hidden Words 72')).toBeNull();
  });
  it('ordinary queries are not citations', () => {
    for (const q of ['gleanings on justice', 'the hidden words about love', 'what does the iqan say about seals']) expect(parseCitation(q)).toBeNull();
  });
});
