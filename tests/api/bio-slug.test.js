// Biography slugs: generation, namesakes, stability, aliases, the 301 routing, canonical + JSON-LD, sitemap rows.
import { describe, it, expect } from 'vitest';
import { slugify, birthYear, slugService } from '../../api/lib/bio-slug.js';
import { bioRoute, bioJsonLd } from '../../src/lib/bio-route.js';
import { urlsetXml } from '../../src/lib/sitemap-xml.js';

// an in-memory store with the repo's semantics (unique slug, claim only while empty)
function memStore(rows) {
  const ents = new Map(rows.map((r) => [r.id, { slug: null, born: null, ...r }])), aliases = new Map();
  const cur = (s) => [...ents.values()].find((e) => e.slug === s)?.id ?? null;
  return { ents, aliases,
    entity: async (id) => (ents.has(id) ? { ...ents.get(id) } : null),
    ownerCurrent: async (s) => cur(s), aliasOf: async (s) => aliases.get(s) ?? null,
    owner: async (s) => cur(s) ?? aliases.get(s) ?? null,
    claim: async (id, s) => { const e = ents.get(id); if (e.slug || cur(s)) return false; e.slug = s; return true; },
    swap: async (id, s) => { if (cur(s)) return false; ents.get(id).slug = s; return true; },
    addAlias: async (s, id) => { aliases.set(s, id); } };
}

describe('slugify', () => {
  it('folds diacritics and drops ʻ ’ marks without breaking words', () => {
    expect(slugify("ʻAbdu’l-Bahá ʻAbbás Effendi")).toBe('abdul-baha-abbas-effendi');
    expect(slugify('Mírzá Ḥusayn-ʻAlí Núrí')).toBe('mirza-husayn-ali-nuri');
    expect(slugify('S̱hayḵh Aḥmad-i-Aḥsá’í')).toBe('shaykh-ahmad-i-ahsai');
    expect(slugify('Bahá’u’lláh')).toBe('bahaullah');
  });
  it('keeps titles in the canonical name, drops parentheticals, never empty or numeric', () => {
    expect(slugify('Dr. Luṭfu’lláh Ḥakím')).toBe('dr-lutfullah-hakim');
    expect(slugify('Shaykh ʻAlí (son of Shaykh Aḥmad)')).toBe('shaykh-ali');
    expect(slugify('???')).toBe('person');
    expect(slugify('12345')).toBe('person-12345');
    expect(slugify('Łukasz Østergård').length).toBeGreaterThan(5);
    expect(slugify('x '.repeat(100)).length).toBeLessThanOrEqual(80);
  });
  it('birthYear reads a born entry only', () => {
    expect(birthYear('["born 1817 in Tehran","died 1892"]')).toBe(1817);
    expect(birthYear('["died 1892"]')).toBeNull();
    expect(birthYear('nope')).toBeNull();
  });
});

describe('slugService', () => {
  it('namesakes: first keeps the plain slug, then birth year, then a counter', async () => {
    const st = memStore([{ id: 1, name: 'Mírzá Aḥmad' }, { id: 2, name: 'Mirza Ahmad', born: 1850 }, { id: 3, name: 'Mírzá Aḥmad' }, { id: 4, name: 'Mírzá Aḥmad' }]);
    const sv = slugService(st);
    expect(await sv.ensureSlug(1)).toBe('mirza-ahmad');
    expect(await sv.ensureSlug(2)).toBe('mirza-ahmad-1850');
    expect(await sv.ensureSlug(3)).toBe('mirza-ahmad-2');
    expect(await sv.ensureSlug(4)).toBe('mirza-ahmad-3');
    expect(await sv.ensureSlug(3)).toBe('mirza-ahmad-2');   // idempotent
  });
  it('stable on a name change; renameSlug keeps the old slug as an alias that resolves to the new one', async () => {
    const st = memStore([{ id: 7, name: 'Quddús' }]); const sv = slugService(st);
    expect(await sv.ensureSlug(7)).toBe('quddus');
    st.ents.get(7).name = 'Mullá Muḥammad-ʻAlí Bárfurúshí';
    expect(await sv.ensureSlug(7)).toBe('quddus');
    expect(await sv.renameSlug(7, 'Mullá Muḥammad-ʻAlí Bárfurúshí (Quddús)')).toBe('mulla-muhammad-ali-barfurushi');
    expect(await sv.resolve('quddus')).toEqual({ kind: 'alias', id: 7, slug: 'mulla-muhammad-ali-barfurushi' });
    expect(await sv.resolve('mulla-muhammad-ali-barfurushi')).toMatchObject({ kind: 'current', id: 7 });
    // the retired slug can never be handed to a newcomer
    st.ents.set(8, { id: 8, name: 'Quddús', slug: null, born: null });
    expect(await sv.ensureSlug(8)).toBe('quddus-2');
  });
  it('resolve: numeric id mints lazily, unknown slug and non-live id are null', async () => {
    const st = memStore([{ id: 5, name: 'Táhirih' }]); const sv = slugService(st);
    expect(await sv.resolve('5')).toEqual({ kind: 'id', id: 5, slug: 'tahirih' });
    expect(await sv.resolve('nobody-here')).toBeNull();
    expect(await sv.resolve('99')).toBeNull();
    expect(await sv.resolve('Bad Slug!')).toBeNull();
  });
});

describe('routing', () => {
  it('id and alias 301 to the slug URL, current renders with the slug canonical, unknown is 404', () => {
    expect(bioRoute({ kind: 'id', id: 5, slug: 'tahirih' })).toEqual({ action: 'redirect', status: 301, location: '/biography/tahirih' });
    expect(bioRoute({ kind: 'alias', id: 7, slug: 'new' })).toMatchObject({ status: 301, location: '/biography/new' });
    expect(bioRoute({ kind: 'current', id: 5, slug: 'tahirih' })).toEqual({ action: 'render', id: 5, slug: 'tahirih', canonical: 'https://siftersearch.com/biography/tahirih' });
    expect(bioRoute(null)).toEqual({ action: 'notfound' });
  });
  it('JSON-LD carries the slug URL; sitemap lists slugs', () => {
    const ld = bioJsonLd({ name: 'Táhirih', summary: 'Poet', aliases: ['Qurratu’l-ʻAyn', 'Táhirih'] }, 'https://siftersearch.com/biography/tahirih');
    expect(ld).toMatchObject({ '@type': 'Person', url: 'https://siftersearch.com/biography/tahirih', alternateName: ['Qurratu’l-ʻAyn'] });
    const xml = urlsetXml([['/biography/tahirih'], ['/biography/quddus']]);
    expect(xml).toContain('<loc>https://siftersearch.com/biography/tahirih</loc>');
    expect(xml).not.toMatch(/biography\/\d+</);
  });
});
