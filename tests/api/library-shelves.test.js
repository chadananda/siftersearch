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
  it('a work card carries the collection cover and every part in OceanLibrary order (weight)', async () => {
    const { buildShelves } = await import('../../api/lib/library/shelves.js');
    const kjv = (id, title, weight) => ({ id, title, weight, author: 'Various', religion: 'Christian', collection: 'The Bible (KJV)', cover_url: `c-${id}`, file_path: `-sites/oceanlibrary.com/Christian/The Bible (KJV)/${title}.md` });
    const r = buildShelves({ olDocs: [kjv(5, '1 Chronicles', 1.13), kjv(9, 'Genesis', 1.01), kjv(3, 'Romans', 1.45)] });
    const w = r.traditions[0].shelves[0].items[0];
    expect(w).toMatchObject({ kind: 'work', parts: 3, id: 9, cover: '/img/cdn/siftersearch.com/collections/col-bible.png' });
    expect(w.list.map((p) => p.title)).toEqual(['Genesis', '1 Chronicles', 'Romans']);
  });
  it('a collection (whole shelf, or a title group in a shelf) closes into one boxed card; an author shelf does not', async () => {
    const { buildShelves } = await import('../../api/lib/library/shelves.js');
    const r = buildShelves({ olDocs: [
      ol(31, 'Christian', 'Christian/Mormon Texts/The Book of Mormon.md', 'Joseph Smith', 'The Book of Mormon'),
      ol(32, 'Christian', 'Christian/Mormon Texts/Doctrine and Covenants.md', 'Joseph Smith', 'Doctrine and Covenants'),
      ol(33, 'Christian', 'Christian/Emanuel Swedenborg/Heaven and Hell.md', 'Emanuel Swedenborg', 'Heaven and Hell'),
      ol(34, 'Christian', 'Christian/Emanuel Swedenborg/Divine Love and Wisdom.md', 'Emanuel Swedenborg', 'Divine Love and Wisdom'),
      ol(41, 'Islam', 'Islam/Al-Ghazzali/Revival of Religious Learnings Vol-II.md', 'Al-Ghazzali', 'Revival of Religious Learnings Vol-II'),
      ol(42, 'Islam', 'Islam/Al-Ghazzali/Revival of Religious Learnings Vol-I.md', 'Al-Ghazzali', 'Revival of Religious Learnings Vol-I'),
      ol(43, 'Islam', 'Islam/Al-Ghazzali/The Alchemy of Happiness.md', 'Al-Ghazzali', 'The Alchemy of Happiness'),
    ], authorCounts: [{ religion: 'Christian', author: 'Emanuel Swedenborg', n: 8 }] });
    const shelf = (n) => r.traditions.flatMap((t) => t.shelves).find((x) => x.name === n);
    expect(shelf('Mormon Texts')).toBeUndefined();                       // no row of its own: inline in "Collections"
    expect(shelf('Collections').items).toHaveLength(1);
    expect(shelf('Collections').items[0]).toMatchObject({ kind: 'work', collection: true, title: 'Mormon Texts', parts: 2, id: 32,
      cover: '/img/cdn/siftersearch.com/collections/col-mormon-texts.png' });
    expect(shelf('Emanuel Swedenborg').items.map((i) => [i.kind, i.title])).toEqual([[undefined, 'Divine Love and Wisdom'], [undefined, 'Heaven and Hell']]);
    expect(shelf('Emanuel Swedenborg').more).toEqual({ count: 6, authors: ['Emanuel Swedenborg'] });
    const g = shelf('Al-Ghazzali').items;
    expect(g.map((i) => i.title)).toEqual(['Revival of Religious Learnings', 'The Alchemy of Happiness']);
    expect(g[0]).toMatchObject({ kind: 'work', parts: 2, id: 42, cover: '/img/cdn/siftersearch.com/collections/col-revival-of-religious-learnings.png' });
    expect(g[0].list.map((b) => b.title)).toEqual(['Revival of Religious Learnings Vol-I', 'Revival of Religious Learnings Vol-II']);
  });
  it('a shelf holding only a collection card folds inline into the general row, collections first, in its place', async () => {
    const { buildShelves } = await import('../../api/lib/library/shelves.js');
    const kjv = (id, title) => ({ id, title, author: 'Various', religion: 'Christian', collection: 'The Bible (KJV)', file_path: `-sites/oceanlibrary.com/Christian/The Bible (KJV)/${title}.md` });
    const r = buildShelves({ olDocs: [kjv(1, 'Genesis'), kjv(2, 'Exodus'),
      ol(31, 'Christian', 'Christian/Mormon Texts/The Book of Mormon.md', 'Joseph Smith', 'The Book of Mormon'),
      ol(32, 'Christian', 'Christian/Mormon Texts/Doctrine and Covenants.md', 'Joseph Smith', 'Doctrine and Covenants'),
      ol(33, 'Christian', 'Christian/Emanuel Swedenborg/Heaven and Hell.md', 'Emanuel Swedenborg', 'Heaven and Hell'),
      ol(34, 'Christian', 'Christian/Emanuel Swedenborg/Divine Love.md', 'Emanuel Swedenborg', 'Divine Love'),
      { id: 50, religion: 'Christian', author: 'X', title: 'Religious Affections', file_path: 'Christian/Books/x.md', collection: 'Books', source_site: 'oceanlibrary.com' },
    ] });
    const rows = r.traditions[0].shelves;
    expect(rows.map((x) => x.name)).toEqual(['More works', 'Emanuel Swedenborg']);
    expect(rows[0].items.map((i) => [i.kind ?? 'book', i.title])).toEqual([['work', 'The Bible (KJV)'], ['work', 'Mormon Texts'], ['book', 'Religious Affections']]);
    expect(rows[0].count).toBe(3);
  });
  it('a small author shelf lists the rest of the author\'s works inline (no "+N more")', async () => {
    const { buildShelves, smallMoreShelves, inlineAuthorWorks } = await import('../../api/lib/library/shelves.js');
    const r = buildShelves({ olDocs: [ol(33, 'Christian', 'Christian/Emanuel Swedenborg/Heaven and Hell.md', 'Emanuel Swedenborg', 'Heaven and Hell')],
      authorCounts: [{ religion: 'Christian', author: 'Emanuel Swedenborg', n: 4 }] });
    expect(smallMoreShelves(r)).toEqual([{ religion: 'Christian', key: 'Emanuel Swedenborg', authors: ['Emanuel Swedenborg'] }]);
    inlineAuthorWorks(r, new Map([['Christian|Emanuel Swedenborg', [
      { id: 33, title: 'Heaven and Hell', author: 'Emanuel Swedenborg', source_site: 'oceanlibrary.com' },
      { id: 90, title: 'True Christian Religion', author: 'Emanuel Swedenborg' }, { id: 91, title: 'Arcana Coelestia', author: 'Emanuel Swedenborg' },
      { id: 92, title: 'Heaven & Hell', author: 'Emanuel Swedenborg' }]]]));
    const s = r.traditions[0].shelves[0];
    expect(s.items.map((i) => i.title)).toEqual(['Heaven and Hell', 'Arcana Coelestia', 'True Christian Religion']);   // OL first; a same-title copy folded
    expect(s.more).toBeNull();
    expect(s.count).toBe(3);
  });
  it('a huge collection (Core Tablets) splits into one row per author; spelling variants fold; small authors pool', async () => {
    const { buildShelves } = await import('../../api/lib/library/shelves.js');
    const B = "Baha'i";
    const r = buildShelves({
      collectionCounts: [{ religion: B, collection: 'Core Tablets', source_site: null, n: 19100 }],
      splitCounts: [
        { religion: B, collection: 'Core Tablets', author: "Bahá'u'lláh", n: 9434 }, { religion: B, collection: 'Core Tablets', author: 'Bahá’u’lláh', n: 2 },
        { religion: B, collection: 'Core Tablets', author: "'Abdu'l-Bahá", n: 9000 }, { religion: B, collection: 'Core Tablets', author: 'Shoghi Effendi', n: 30 },
        { religion: B, collection: 'Core Tablets', author: 'oceanoflights (notes)', n: 10 },
      ] });
    expect(r.traditions[0].library.map((l) => [l.name, l.count, l.authors])).toEqual([
      ["Core Tablets · Bahá'u'lláh", 9436, ["Bahá'u'lláh", 'Bahá’u’lláh']],
      ["Core Tablets · 'Abdu'l-Bahá", 9000, ["'Abdu'l-Bahá"]],
      ['Core Tablets · other', 40, ['Shoghi Effendi', 'oceanoflights (notes)']],
    ]);
  });
  it("the tradition's other collections follow, OceanLibrary excluded, largest first", () => {
    expect(bahai.library.map((l) => [l.name, l.count])).toEqual([['Bahá’í Library Online', 15013], ['Books', 2348]]);
  });
});

// Ẓuhúru'l-Ḥaqq (Chad 10-22: "why only vol. 3?"): the nine volumes are library books, shown as ONE work card in order;
// the collection of tablets printed in vol. 3 reads as the Báb's writings, with the volume as provenance.
import { LIBRARY_WORKS, volumeTitle, collectionLabel } from '../../api/lib/library/shelves.js';
describe('library works and labels', () => {
  const ids = LIBRARY_WORKS[0].ids;
  const vols = ids.map((id, i) => ({ id, religion: "Baha'i", collection: "Baha'i Books", author: 'Mírzá Asadu’lláh Fáḍil Mázandarání', slug: `z${i + 1}`,
    title: `Ẓuhúru'l-Ḥaqq Vol ${i + 1} (Part ${i + 1})`, paragraph_count: 100 }));
  const s = buildShelves({ olDocs, authorCounts, collectionCounts: [...collectionCounts,
    { religion: "Baha'i", collection: 'Ẓuhúru’l-Ḥaqq, vol. 3 (writings of the Báb)', source_site: null, n: 48 }], workDocs: [...vols].reverse() });
  const bahai = s.traditions[0];
  it('the volumes stand as one work card, in the listed order, with display titles', () => {
    const z = bahai.shelves.flatMap((x) => x.items).find((i) => i.title === 'Ẓuhúru’l-Ḥaqq');
    expect(z).toMatchObject({ kind: 'work', parts: 9, paras: 900, id: 15228 });
    expect(z.list.map((p) => p.title)).toEqual(ids.map((_, i) => `Ẓuhúru'l-Ḥaqq, vol. ${i + 1} (Part ${i + 1})`));
    expect(bahai.shelves.find((x) => x.name === 'Ẓuhúru’l-Ḥaqq')).toBeUndefined();   // a lone work stands inline, not as its own row
  });
  it('a hidden tradition never gets the work; missing volumes are skipped, none → no card', () => {
    expect(buildShelves({ olDocs, workDocs: vols, hidden: new Set(["Baha'i"]) }).traditions.find((t) => t.name === "Baha'i")).toBeUndefined();
    const none = buildShelves({ olDocs, workDocs: [] }).traditions[0].shelves.flatMap((x) => x.items);
    expect(none.some((i) => i.title === 'Ẓuhúru’l-Ḥaqq')).toBe(false);
  });
  it('volume titles and printed-in collections read for people', () => {
    expect(volumeTitle("Ẓuhúru'l-Ḥaqq Vol 9 (Shoghi Effendi)")).toBe("Ẓuhúru'l-Ḥaqq, vol. 9 (Shoghi Effendi)");
    expect(volumeTitle('Amr va Khalq, vol. 2')).toBe('Amr va Khalq, vol. 2');
    expect(collectionLabel('Ẓuhúru’l-Ḥaqq, vol. 3 (writings of the Báb)')).toBe('Writings of the Báb · from Ẓuhúru’l-Ḥaqq, vol. 3');
    expect(collectionLabel('Tablet Translations')).toBe('Tablet Translations');
    const row = bahai.library.find((l) => l.collection === 'Ẓuhúru’l-Ḥaqq, vol. 3 (writings of the Báb)');
    expect(row.name).toBe('Writings of the Báb · from Ẓuhúru’l-Ḥaqq, vol. 3');
  });
});
