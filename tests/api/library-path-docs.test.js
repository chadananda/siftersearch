// Reader paths → documents (Chad 11-14): the Anís host routes siftersearch /library/ links (bio sources, talk quotes) by doc id.
// Real paths cited by the-bab and quddus biographies; candidate rows as the live by-path API returned them (11-14).
import { describe, it, expect } from 'vitest';
import { parseLibraryPath, matchPathDoc, resolveLibraryPath, resolveLibraryPaths } from '../../api/lib/library/path-docs.js';
import { libraryPaths, resolveLibraryPaths as resolveAtEdge, docOfPath } from '../../src/lib/library-paths.js';
import { anisUrl } from '../../api/lib/anis-links.js';

const BOOKS = [
  { id: 466, slug: 'h-m-balyuzi_the-bab-the-herald-of-the-days', title: 'The Báb - The Herald of the Days', author: 'H.M. Balyuzi', religion: "Baha'i", collection: "Baha'i Books", language: 'en' },
  { id: 15254, slug: 'mirza-asadullah_zuhurul-haqq-vol-3-babi-biographies_fa', title: "Ẓuhúru'l-Ḥaqq Vol 3 (Babi Biographies)", author: 'Mírzá Asadu\'lláh Fáḍil Mázandarání', religion: "Baha'i", collection: "Baha'i Books", language: 'fa' },
  { id: 537, slug: 'william-sears_release-the-sun', title: 'Release the Sun', author: 'William Sears', religion: "Baha'i", collection: "Baha'i Books", language: 'en' },
  { id: 9001, slug: 'william-sears_release-the-sun-2', title: 'Release the Sun', author: 'William Sears', religion: "Baha'i", collection: "Baha'i Books", language: 'en', duplicate_of: 537 },
];
const PAPERS = [{ id: 13392, slug: 'moojan-momen_the-trial-of-mulla-ali-bastami-a-combined-sunni-shii-fatwa-against-the-bab', title: "The Trial of Mullá 'Alí Bastámí", author: 'Moojan Momen', religion: "Baha'i", collection: 'Papers', language: 'en' }];
const candidatesFor = async (r, c) => (r === 'bahai' && c === 'bahai-books' ? BOOKS : r === 'bahai' && c === 'papers' ? PAPERS : []);
const REDIRECTS = { '/library/bahai/bahai-books/mirza-asadullah_zuhurul-haqq-vol-3-babi-biographies_ar': '/library/bahai/bahai-books/mirza-asadullah_zuhurul-haqq-vol-3-babi-biographies_fa' };
const deps = { candidatesFor, redirect: async (p) => REDIRECTS[p] || null, get: async (id) => { let b = BOOKS.find((x) => x.id === id); while (b?.duplicate_of) b = BOOKS.find((x) => x.id === b.duplicate_of); return b || null; } };   // getDoc follows a duplicate to its canonical

const BAB = 'https://siftersearch.com/library/bahai/bahai-books/h-m-balyuzi_the-bab-the-herald-of-the-days#p141';
const QUDDUS_ZH = 'https://siftersearch.com/library/bahai/bahai-books/mirza-asadullah_zuhurul-haqq-vol-3-babi-biographies_ar#p557';
const QUDDUS_SEARS = 'https://siftersearch.com/library/bahai/bahai-books/william-sears_release-the-sun#p36';
const QUDDUS_MOMEN = 'https://siftersearch.com/library/bahai/papers/moojan-momen_the-trial-of-mulla-ali-bastami-a-combined-sunni-shii-fatwa-against-the-bab#p11';

describe('tower: a reader path → its document', () => {
  it('parses the path out of a full reader URL (anchor dropped)', () => {
    expect(parseLibraryPath(BAB)).toEqual({ religion: 'bahai', collection: 'bahai-books', slug: 'h-m-balyuzi_the-bab-the-herald-of-the-days', path: '/library/bahai/bahai-books/h-m-balyuzi_the-bab-the-herald-of-the-days' });
    expect(parseLibraryPath('https://siftersearch.com/library/view?doc=5')).toBeNull();
    expect(parseLibraryPath('https://siftersearch.com/library/bahai')).toBeNull();
  });
  it('the-bab and quddus sources resolve: stored slug, the recorded _ar→_fa rename, a paper', async () => {
    const r = await resolveLibraryPaths([BAB, QUDDUS_ZH, QUDDUS_SEARS, QUDDUS_MOMEN, 'https://siftersearch.com/library/bahai/bahai-books/nobody_no-such-book'], deps);
    expect(r[BAB]).toMatchObject({ id: 466, title: 'The Báb - The Herald of the Days', author: 'H.M. Balyuzi' });
    expect(r[QUDDUS_ZH]).toMatchObject({ id: 15254 });
    expect(r[QUDDUS_SEARS]).toMatchObject({ id: 537 });
    expect(r[QUDDUS_MOMEN]).toMatchObject({ id: 13392 });
    expect(r['https://siftersearch.com/library/bahai/bahai-books/nobody_no-such-book']).toBeNull();
  });
  it('a duplicate copy names its canonical; a slug without its author prefix still finds the book', async () => {
    expect(await resolveLibraryPath('/library/bahai/bahai-books/william-sears_release-the-sun-2', deps)).toMatchObject({ id: 537 });
    expect(matchPathDoc('release-the-sun', BOOKS)?.id).toBe(537);
  });
  it('a redirect loop ends', async () => {
    const loop = { ...deps, redirect: async (p) => (p.endsWith('_x') ? p.replace(/_x$/, '_y') : p.replace(/_y$/, '_x')) };
    expect(await resolveLibraryPath('/library/bahai/bahai-books/gone_x', loop)).toBeNull();
  });
});

describe('edge: links on a page → their /doc pages', () => {
  const html = `<a href="${BAB}">1</a> <a href="/library/bahai/bahai-books/william-sears_release-the-sun#p36">2</a> <a href="https://siftersearch.com/library/view?doc=5">3</a> ${BAB}`;
  it('collects each reader path once (absolute or site-relative)', () => {
    expect(libraryPaths(html)).toEqual(['/library/bahai/bahai-books/h-m-balyuzi_the-bab-the-herald-of-the-days', '/library/bahai/bahai-books/william-sears_release-the-sun']);
  });
  it('one API call resolves them; the link policy then routes each to its /doc page with the paragraph', async () => {
    const asked = [];
    const fetch = async (u) => { asked.push(u); const ps = new URL(u).searchParams.getAll('p'); return new Response(JSON.stringify({ docs: Object.fromEntries(ps.map((p) => [p, p.includes('balyuzi') ? BOOKS[0] : null])) })); };
    const docOf = docOfPath(await resolveAtEdge(libraryPaths(html), { api: 'https://api.test', fetch }));
    expect(asked).toHaveLength(1);
    expect(anisUrl(BAB, { doc: docOf(BAB) })).toMatch(/^https:\/\/anis\.oceanlibrary\.com\/doc\/[^#]*#p141$/);
    expect(docOf(QUDDUS_SEARS)).toBeNull();
    expect(anisUrl(QUDDUS_SEARS, { doc: docOf(QUDDUS_SEARS) })).toBeNull();   // unresolved: unlinked, as before
  });
  it('a failed call resolves nothing and never throws', async () => {
    expect((await resolveAtEdge(['/library/a/b/c'], { fetch: async () => { throw new Error('down'); } })).size).toBe(0);
  });
});
