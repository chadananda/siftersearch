// Biographies on the Anís host: the designed Astro pages (src/pages/biography*) render at /bio[/<slug>] with Anís chrome,
// cited claims only (src/lib/bio-route.js bioView), edge cache; worker/anis/people.js keeps only the URL helpers + sitemap.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as people from '../../worker/anis/people.js';
import { astroPath, anisHref, capName, ASTRO_SECTIONS } from '../../src/lib/anis-host.js';
import { bioView, bioJsonLd } from '../../src/lib/bio-route.js';
import { policyFor, anisCacheKey } from '../../worker/edge-cache.js';

const { BIO_PATH, BIOGRAPHY_PATH, bioUrl, bioSlug, bioSitemapUrls } = people;
const API = 'https://api.test';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const origin = (routes) => async (u) => { const v = routes[u.slice(API.length)]; return v === undefined ? json({ error: 'not found' }, 404) : json(v); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

const OL = 'https://oceanlibrary.com/god-passes-by_shoghi-effendi#p12';
const PERSON = {
  id: 7, name: 'Ṭáhirih', aliases: ['Tahirih'], summary: 'An UNCITED summary sentence.', death: { year: 1852, martyr: true },
  timeline: {
    sources: { s1: { source: 'God Passes By', url: OL }, s2: { source: 'The Dawn-Breakers', url: 'https://oceanlibrary.com/dawn-breakers_nabil#p40' }, s3: { source: 'Unlinked note', url: null } },
    events: [
      { year: 1817, title: 'Birth', text: 'Born in Qazvín.', cites: ['s2', 's1'] },
      { year: 1848, title: 'Badasht', text: 'Appeared unveiled at Badasht.', cites: ['s1'] },
      { year: 1850, title: 'Rumour', text: 'A CLAIM WITH NO LINKED SOURCE.', cites: ['s3'] },
      { year: 1852, title: 'Martyrdom', text: 'Martyred in Ṭihrán.', cites: ['s2'] },
    ],
    relationships: [{ type: 'companion', who: 'Quddús', cites: ['s1'] }, { type: 'other', who: 'Nobody', note: 'UNCITED RELATION', cites: [] }],
    journeys: [{ place: 'Karbilá', year: 1843, cites: [] }],
  },
};

describe('/bio on the Anís host', () => {
  it('matches the Anís paths and routes them to the designed Astro pages', () => {
    expect(ASTRO_SECTIONS).toContain('bio');
    expect(astroPath('/bio')).toBe('/biography');
    expect(astroPath('/bio/tahirih')).toBe('/biography/tahirih');
    expect(BIO_PATH.exec('/bio/tahirih')[1]).toBe('tahirih');
    expect(BIOGRAPHY_PATH.exec('/biography/tahirih')[1]).toBe('tahirih');
    expect(bioUrl('tahirih')).toBe('https://anis.oceanlibrary.com/bio/tahirih');
    expect(bioSlug('https://siftersearch.com/biography/tahirih')).toBe('tahirih');
    expect(anisHref('/biography')).toBe('/bio');   // the page's kicker link
  });
  it('the generic renderer is gone: people.js exports helpers only', () => {
    expect(Object.keys(people).sort()).toEqual(['BIOGRAPHY_PATH', 'BIO_PATH', 'bioSitemapUrls', 'bioSlug', 'bioUrl', 'read']);
    expect(src('worker/index.js')).not.toMatch(/bioResponse|bioPage/);
  });
  it('the designed pages carry the Anís chrome: SiteNav, the widget (person context), Report an error', () => {
    for (const f of ['src/pages/biography.astro', 'src/pages/biography/[slug].astro']) {
      expect(src(f), f).toMatch(/<SiteNav currentPage="biography"/);
      expect(src(f), f).not.toMatch(/<NavBar\b/);
    }
    const page = src('src/pages/biography/[slug].astro');
    expect(page).toMatch(/anisPage=\{p \? \{ type: 'person'/);
    expect(page).toMatch(/<ReportError kind="bio"/);
    expect(page).toMatch(/p\.summary && !anis &&/);   // the stored summary is uncited prose
    expect(page).toMatch(/bioView\(p, anis \? \{ linkable: \(u\) => anisHref\(u, \{ docOf \}\) \}/);   // reader-link sources resolve first (library-paths.js)
  });
  it('cited claims only on the Anís host: a claim with no linkable source is dropped; elsewhere all render', () => {
    const v = bioView(PERSON, { linkable: anisHref });
    expect(v.events.map((e) => e.title)).toEqual(['Birth', 'Badasht', 'Martyrdom']);
    expect(v.relGroups.map(([t]) => t)).toEqual(['companion']);
    expect(v.journeys).toEqual([]);
    expect(v.footnotes.map((f) => f.source)).toEqual(['The Dawn-Breakers', 'God Passes By']);
    expect(v.life).toBe('1817–1852');
    const all = bioView(PERSON);
    expect(all.events).toHaveLength(4);
    expect(all.journeys).toHaveLength(1);
  });
  it('shows the death year only beside a cited death event', () => {
    const p = { ...PERSON, timeline: { ...PERSON.timeline, events: [PERSON.timeline.events[1]] } };
    expect(bioView(p, { linkable: anisHref }).life).toBe('1848–1848');
    expect(bioView(p).life).toBe('1848–1852');
  });
  it('capitalises a name that opens a title, heading or entry', () => {
    expect(capName('the Báb')).toBe('The Báb');
    expect(capName('‘Abdu’l-Bahá')).toBe('‘Abdu’l-Bahá');
    expect(bioJsonLd({ name: 'The Báb' }, 'https://anis.oceanlibrary.com/bio/the-bab').name).toBe('The Báb');
  });
  it('is edge-cached under the Anís key', () => {
    for (const p of ['/bio', '/bio/tahirih']) expect(policyFor(new URL(`https://anis.oceanlibrary.com${p}`), 'GET', new Headers()).mode).toBe('cache');
    expect(anisCacheKey(new URL('https://anis.oceanlibrary.com/bio/x'), 'html', '1.0.0')).toContain('/@anis/bio/x');
    expect(src('worker/index.js')).toMatch(/WARM_ANIS = \[[^\]]*'\/bio'/);
  });
  it('the sitemap lists every biography (the index alone when the origin fails)', async () => {
    const b = await bioSitemapUrls({ api: API, fetchFn: origin({ '/api/v1/people/sitemap': { people: [{ id: 7, slug: 'tahirih' }] } }) });
    expect(b.map((x) => x.loc)).toEqual(['https://anis.oceanlibrary.com/bio', 'https://anis.oceanlibrary.com/bio/tahirih']);
    expect(await bioSitemapUrls({ api: API, fetchFn: origin({}) })).toEqual([{ loc: 'https://anis.oceanlibrary.com/bio', changefreq: 'weekly' }]);
  });
});
