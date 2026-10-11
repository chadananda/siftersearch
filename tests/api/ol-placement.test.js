// OceanLibrary shelves vs multi-part works: author/grouping folders are shelves of separate books; any other folder is
// one work whose parts cite as "<work>, <part>".
import { describe, it, expect } from 'vitest';
import { olPlacement, olCiteTitle } from '../../api/services/site-adapters/oceanlibrary.js';

const P = (p) => `-sites/oceanlibrary.com/${p}`;
describe('olPlacement', () => {
  it('author folders and named groupings are shelves of separate books', () => {
    expect(olPlacement(P('Bahá\'í/Bahá’u’lláh/The Kitáb-i-Íqán.md'), 'Bahá’u’lláh')).toEqual({ shelf: 'Bahá’u’lláh', work: null });
    expect(olPlacement(P('Islam/Hadith Collections/Sahih Muslim.md'), 'Muslim ibn al-Hajjaj')).toEqual({ shelf: 'Hadith Collections', work: null });
    expect(olPlacement(P('Hindu/Unknown/Some Text.md'), 'Unknown').work).toBe(null);
  });
  it('any other folder is one multi-part work', () => {
    expect(olPlacement(P('Islam/The Quran (Rodwell)/Sura C. The Chargers.md'), 'Muhammad')).toEqual({ shelf: 'The Quran (Rodwell)', work: 'The Quran (Rodwell)' });
    expect(olPlacement(P('Christian/The Bible (KJV)/Romans.md'), 'Paul').work).toBe('The Bible (KJV)');
    expect(olPlacement(P('Hindu/Rig Veda/Book 1.md'), 'Unknown').work).toBe('Rig Veda');
  });
  it('a book directly under its tradition has no shelf', () => {
    expect(olPlacement(P('Tao/Tao Te Ching.md'), 'Laozi')).toEqual({ shelf: null, work: null });
  });
});

describe('olCiteTitle', () => {
  it('cites a part with its work; leaves books and other sites alone', () => {
    expect(olCiteTitle({ source_site: 'oceanlibrary.com', file_path: P('Christian/The Bible (KJV)/Genesis.md'), author: 'Moses', title: 'Genesis' })).toBe('The Bible (KJV), Genesis');
    expect(olCiteTitle({ source_site: 'oceanlibrary.com', file_path: P('Bahá\'í/Shoghi Effendi/God Passes By.md'), author: 'Shoghi Effendi', title: 'God Passes By' })).toBe('God Passes By');
    expect(olCiteTitle({ source_site: null, file_path: 'Baha\'i/Books/x.md', title: 'X' })).toBe('X');
  });
});

describe('olCiteTitle from a doc row without a path (search hydration)', () => {
  it('uses the collection (folder) to find the work; ignores the old hash', async () => {
    const { olCiteTitle } = await import('../../api/lib/library/ol-works.js');
    expect(olCiteTitle({ source_site: 'oceanlibrary.com', collection: 'The Quran (Rodwell)', author: 'Muhammad', title: 'Sura C. The Chargers' })).toBe('The Quran (Rodwell), Sura C. The Chargers');
    expect(olCiteTitle({ source_site: 'oceanlibrary.com', collection: 'Shoghi Effendi', author: 'Shoghi Effendi', title: 'God Passes By' })).toBe('God Passes By');
    expect(olCiteTitle({ source_site: 'oceanlibrary.com', collection: 'f113b356e0100619b4261dfd6d9d9116', author: 'Muhammad', title: 'Sura C' })).toBe('Sura C');
  });
});

describe('a work split across traditions is one work in one tradition', () => {
  it('KJV Old Testament books belong to Christianity with the New; other files keep the site religion', async () => {
    const { olReligion } = await import('../../api/lib/library/ol-works.js');
    expect(olReligion(P('Judaism/The Bible (KJV)/Genesis.md'), 'Judaism')).toBe('Christian');
    expect(olReligion(P('Judaism/The Tanakh (JPS 1917)/Genesis.md'), 'Judaism')).toBe('Judaism');
    expect(olReligion(P('Judaism/Talmud.md'), 'Judaism')).toBe('Judaism');
  });
});

describe('olWeight', () => {
  it("reads OceanLibrary's order from stored frontmatter; null when absent or unreadable", async () => {
    const { olWeight } = await import('../../api/lib/library/ol-works.js');
    expect(olWeight('{"weight":1.01}')).toBe(1.01);
    expect(olWeight({ weight: '2' })).toBe(2);
    expect(olWeight(null)).toBe(null);
    expect(olWeight('not json')).toBe(null);
  });
});
