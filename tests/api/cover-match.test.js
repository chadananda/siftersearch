// Bindery cover map → docs by title (api/lib/library/cover-match.js). The Sikh covers never attached because the old
// importer matched md5(OceanLibrary bookid) only, and those books live in the main library under subtitled titles.
import { describe, it, expect } from 'vitest';
import { foldTitle, titleKeys, authorsAgree, matchCovers, coverVersion } from '../../api/lib/library/cover-match.js';

const doc = (id, title, author, extra = {}) => ({ id, title, author, language: 'en', cover_url: null, ...extra });

describe('foldTitle / titleKeys', () => {
  it('folds diacritics, quotes and volume numbers', () => {
    expect(foldTitle('The Kitáb-i-Íqán')).toBe('the kitab i iqan');
    expect(foldTitle('The Sikh Religion, Volume VI')).toBe('the sikh religion volume 6');
    expect(foldTitle('The Sikh Religion Vol. 6')).toBe('the sikh religion volume 6');
    expect(foldTitle('Bahá’u’lláh & the New Era')).toBe('bahaullah and the new era');
  });
  it('a doc subtitle after " - " or ": " is ignored', () => {
    expect(titleKeys('The Sikh Religion Vol. 1 - Life of Guru Nanak').has('the sikh religion volume 1')).toBe(true);
    expect(titleKeys('The Sikh Religion Vol. 1 - Life of Guru Nanak').has('sikh religion volume 1')).toBe(true);
  });
});

describe('authorsAgree', () => {
  it('matches spellings, tolerates unknown, rejects strangers', () => {
    expect(authorsAgree('Bahá’u’lláh', "Baha'u'llah")).toBe(true);
    expect(authorsAgree('', 'Anyone')).toBe(true);
    expect(authorsAgree('Max Arthur Macauliffe', 'M. A. Macauliffe')).toBe(true);
    expect(authorsAgree('Dorothy Field', 'Max Arthur Macauliffe')).toBe(false);
  });
});

describe('matchCovers', () => {
  const sikh = [
    { id: 'sikh_religion_volume_1_en', title: 'The Sikh Religion, Volume I', author: 'Max Arthur Macauliffe' },
    { id: 'sikh_religion_volume_6_en', title: 'The Sikh Religion, Volume VI', author: 'Max Arthur Macauliffe' },
    { id: 'religion_of_the_sikhs_en', title: 'The Religion of the Sikhs', author: 'Dorothy Field' },
    { id: 'shri_guru_granth_sahib_volume_1_en', title: 'Sri Guru Granth Sahib', author: '' },
    { id: 'shri_guru_granth_sahib_volume_2_en', title: 'Sri Guru Granth Sahib', author: '' },
    { id: 'col-sikh-religion', title: 'The Sikh Religion', author: 'Max Arthur Macauliffe' },
  ];
  const library = [
    doc(20211, 'The Religion of the Sikhs', 'Dorothy Field'),
    doc(20212, 'The Sikh Religion Vol. 1 - Life of Guru Nanak', 'Max Arthur Macauliffe'),
    doc(20214, 'The Sikh Religion Vol. 6 - The Bhagats of the Granth Sahib', 'Max Arthur Macauliffe'),
    doc(20185, 'Guru Granth Sahib - Japji Sahib', 'Guru Nanak'),
    doc(99, 'Sri Guru Granth Sahib', 'Guru Nanak'),
  ];
  const r = Object.fromEntries(matchCovers(sikh, () => library).map((x) => [x.book.id, x]));

  it('attaches the Sikh covers by title, volume by volume (the 10-22 miss)', () => {
    expect(r.sikh_religion_volume_1_en.docs.map((d) => d.id)).toEqual([20212]);
    expect(r.sikh_religion_volume_6_en.docs.map((d) => d.id)).toEqual([20214]);
    expect(r.religion_of_the_sikhs_en).toMatchObject({ status: 'matched' });
    expect(r.religion_of_the_sikhs_en.docs.map((d) => d.id)).toEqual([20211]);   // not "The Sikh Religion"
  });
  it('two covers under one title are ambiguous, not guessed; collection covers are not doc covers', () => {
    expect(r.shri_guru_granth_sahib_volume_1_en.status).toBe('ambiguous');
    expect(r['col-sikh-religion'].status).toBe('collection');
  });
  it('every copy of one book gets its cover; another author or another language does not', () => {
    const iqan = [{ id: 'kitab-i-iqan-prod-version_en', title: 'The Kitáb-i-Íqán', author: 'Bahá’u’lláh' }];
    const copies = [doc(20810, 'The Kitáb-i-Íqán', 'Bahá’u’lláh'), doc(5, 'Kitab-i-Iqan', "Baha'u'llah"), doc(6, 'The Kitáb-i-Íqán', 'Bahá’u’lláh', { language: 'fr' })];
    expect(matchCovers(iqan, () => copies)[0].docs.map((d) => d.id)).toEqual([20810, 5]);
    const other = matchCovers(iqan, () => [doc(7, 'The Kitáb-i-Íqán', 'Hooper Dunbar')])[0];
    expect(other.status).toBe('ambiguous');
    expect(matchCovers(iqan, () => [])[0].status).toBe('unmatched');
    // dropping a subtitle needs a named, agreeing author
    expect(matchCovers(iqan, () => [doc(8, 'Kitáb-i-Íqán: Introduction to the 1950 Edition', '')])[0].status).toBe('unmatched');
  });
  it('coverVersion reads the content hash from an image-service URL', () => {
    expect(coverVersion('/img/covers/20810?v=9aa93b118f18')).toBe('9aa93b118f18');
    expect(coverVersion(null)).toBeNull();
  });
});
