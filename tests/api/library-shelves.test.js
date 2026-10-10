// Library shelves: OceanLibrary shelves first (lead order for Bahá'í), a multi-part work is ONE card, author shelves
// carry "N more" from the rest of the library, and each tradition's other collections follow as counted shelves.
import { describe, it, expect } from 'vitest';
import { buildShelves } from '../../api/lib/library/shelves.js';

const ol = (id, religion, path, author, title, extra = {}) => ({ id, religion, author, title, file_path: `-sites/oceanlibrary.com/${path}`,
  collection: path.split('/').length > 2 ? path.split('/')[1] : null, slug: `s${id}`, paragraph_count: 10, ...extra });
const olDocs = [
  ol(1, "Baha'i", "Bahá'í/Research Department Compilations/Prayer.md", 'Compilation', 'Prayer'),
  ol(2, "Baha'i", "Bahá'í/Bahá’u’lláh/The Kitáb-i-Íqán.md", 'Bahá’u’lláh', 'The Kitáb-i-Íqán', { cover_url: '/img/covers/2?v=a' }),
  ol(3, "Baha'i", "Bahá'í/Bahá’u’lláh/Gleanings.md", 'Bahá’u’lláh', 'Gleanings'),
  ol(4, "Baha'i", "Bahá'í/Rúḥíyyih Rabbání, The Priceless Pearl.md", 'Rúḥíyyih Rabbání', 'The Priceless Pearl'),
  ol(5, "Baha'i", "Bahá'í/Bahá’u’lláh/Lights of Guidance.md", 'Helen Hornby (compiler)', 'Lights of Guidance'),
  { id: 6, religion: "Baha'i", author: 'Bahá’u’lláh', title: 'Gleanings', file_path: "Baha'i/Core Publications/Gleanings.md", collection: 'Core Publications' },
  { id: 7, religion: "Baha'i", author: 'X', title: 'A News Item', file_path: "Baha'i/News/x.md", collection: 'News' },
  ol(10, 'Islam', 'Islam/The Quran (Rodwell)/Sura I.md', 'Muhammad', 'Sura I'),
  ol(11, 'Islam', 'Islam/The Quran (Rodwell)/Sura II.md', 'Muhammad', 'Sura II'),
];
const authorCounts = [{ religion: "Baha'i", author: 'Bahá’u’lláh', n: 2 }, { religion: "Baha'i", author: "Baha'u'llah", n: 40 }];
const collectionCounts = [{ religion: "Baha'i", collection: 'Books', source_site: null, n: 2348 },
  { religion: "Baha'i", collection: null, source_site: 'bahai-library.com', n: 15013 },
  { religion: "Baha'i", collection: 'x', source_site: 'oceanlibrary.com', n: 607 }];

describe('buildShelves', () => {
  const s = buildShelves({ olDocs, authorCounts, collectionCounts, now: new Date('2026-10-10T00:00:00Z') });
  const bahai = s.traditions[0];
  it("Bahá'í first; its lead shelves in order, 'More works' last", () => {
    expect(bahai.name).toBe("Baha'i");
    expect(bahai.shelves.map((x) => x.name)).toEqual(['Bahá’u’lláh', 'Research Department Compilations', 'More works']);
    expect(bahai.shelves[2].items.map((i) => i.title)).toEqual(['A News Item', 'The Priceless Pearl']);   // outside-folder file → More works
  });
  it('author shelf: books as cards, cover kept, "N more" from the folded author spellings', () => {
    const b = bahai.shelves[0];
    expect(b.items.map((i) => i.title)).toEqual(['Gleanings', 'Lights of Guidance', 'The Kitáb-i-Íqán']);   // compiler-credited book stays; Core Publications copy dropped
    expect(b.items[2].cover).toBe('/img/covers/2?v=a');
    expect(b.more).toEqual({ count: 39, authors: ['Bahá’u’lláh', "Baha'u'llah"] });
  });
  it('a multi-part work is one card with its part count', () => {
    const q = s.traditions.find((t) => t.name === 'Islam').shelves[0];
    expect(q.items).toHaveLength(1);
    expect(q.items[0]).toMatchObject({ kind: 'work', title: 'The Quran (Rodwell)', parts: 2, id: 10 });
  });
  it("the tradition's other collections follow, OceanLibrary excluded, largest first", () => {
    expect(bahai.library.map((l) => [l.name, l.count])).toEqual([['Bahá’í Library Online', 15013], ['Books', 2348]]);
  });
});
