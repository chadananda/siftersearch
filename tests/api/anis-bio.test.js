// Biographies on the Anís host (worker/anis/people.js): /bio + /bio/<slug>, cited claims only, 301/404, sitemap, edge cache.
import { describe, it, expect } from 'vitest';
import { BIO_PATH, BIOGRAPHY_PATH, bioUrl, bioSlug, sourceRank, bioPage, bioIndexPage, bioResponse, bioSitemapUrls, reportError, capName } from '../../worker/anis/people.js';
import { policyFor } from '../../worker/edge-cache.js';

const API = 'https://api.test';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
// a fake origin: path → body (a number = that status)
const origin = (routes) => async (u) => { const p = u.slice(API.length), v = routes[p]; return v === undefined ? json({ error: 'not found' }, 404) : typeof v === 'number' ? json({}, v) : json(v); };

const OL = 'https://oceanlibrary.com/god-passes-by_shoghi-effendi#p12';
const PERSON = {
  id: 7, name: 'Ṭáhirih', aliases: ['Tahirih', 'Qurratu’l-‘Ayn'], side: 'babi', summary: 'An UNCITED summary sentence.',
  death: { year: 1852, martyr: true }, dates: { birth: { year: 1817, place: 'Qazvín' } },
  timeline: {
    sources: { s1: { source: 'God Passes By', url: OL }, s2: { source: 'The Dawn-Breakers', url: 'https://oceanlibrary.com/dawn-breakers_nabil#p40' }, s3: { source: 'Unlinked note', url: null } },
    events: [
      { year: 1817, title: 'Birth', text: 'Born in Qazvín.', cites: ['s2', 's1'] },
      { year: 1848, title: 'Badasht', text: 'Appeared unveiled at Badasht.', cites: ['s1'] },
      { year: 1850, title: 'Rumour', text: 'A CLAIM WITH NO LINKED SOURCE.', cites: ['s3'] },
      { year: 1852, title: 'Martyrdom', text: 'Martyred in Ṭihrán.', cites: ['s2'] },
    ],
    relationships: [{ who: 'Quddús', note: 'companion', cites: ['s1'] }, { who: 'Nobody', note: 'UNCITED RELATION', cites: [] }],
    journeys: [],
  },
};

describe('/bio', () => {
  it('matches the Anís paths and reads slugs from any of our addresses', () => {
    expect(BIO_PATH.exec('/bio/tahirih')[1]).toBe('tahirih');
    expect(BIO_PATH.test('/bio')).toBe(true);
    expect(BIOGRAPHY_PATH.exec('/biography/tahirih')[1]).toBe('tahirih');
    expect(bioUrl('tahirih')).toBe('https://anis.oceanlibrary.com/bio/tahirih');
    expect(bioSlug('https://siftersearch.com/biography/tahirih')).toBe('tahirih');
  });
  it('is edge-cached', () => {
    for (const p of ['/bio', '/bio/tahirih']) expect(policyFor(new URL(`https://anis.oceanlibrary.com${p}`), 'GET', new Headers()).mode).toBe('cache');
  });
  const routes = {
    '/api/v1/people/slug/tahirih': { id: 7, slug: 'tahirih', kind: 'current' },
    '/api/v1/people/slug/qurratul-ayn': { id: 7, slug: 'tahirih', kind: 'alias' },
    '/api/v1/people/7': PERSON,
    '/api/v1/people?limit=2000': { people: [{ id: 7, name: 'Ṭáhirih', side: 'babi' }, { id: 8, name: 'Quddús', side: 'letter of the living' }] },
    '/api/v1/people/sitemap': { people: [{ id: 7, slug: 'tahirih' }, { id: 8, slug: 'quddus' }] },
    '/api/media/index': { items: [], speakers: [] },
  };
  it('renders a current slug: Person JSON-LD, canonical, cited claims only, report link, ask link', async () => {
    const { res, tainted } = await bioResponse('tahirih', { api: API, fetchFn: origin(routes) });
    expect(res.status).toBe(200);
    expect(tainted).toBe(false);
    expect(res.headers.get('cache-control')).toMatch(/public/);
    const h = await res.text();
    expect(h).toContain('<link rel="canonical" href="https://anis.oceanlibrary.com/bio/tahirih"');
    expect(h).toMatch(/"@type":"Person"/);
    expect(h).toContain('Appeared unveiled at Badasht.');
    expect(h).not.toContain('A CLAIM WITH NO LINKED SOURCE');   // no linked source → dropped at render
    expect(h).not.toContain('UNCITED');                          // nor the stored summary or an uncited relation
    expect(h).toContain('href="/bio/quddus"');
    expect(h).toContain('Report an error');
    expect(h).toContain('data-report="bio-tahirih"');
    expect(h).toMatch(/Ask Anís about Ṭáhirih/);
    expect(h).not.toMatch(/siftersearch\.com\/(biography|library)/);
  });
  it('301s an alias to the current slug and 404s an unknown one', async () => {
    const a = await bioResponse('qurratul-ayn', { api: API, fetchFn: origin(routes) });
    expect(a.res.status).toBe(301);
    expect(a.res.headers.get('location')).toBe('/bio/tahirih');
    const u = await bioResponse('no-such-person', { api: API, fetchFn: origin(routes) });
    expect(u.res.status).toBe(404);
    expect(await u.res.text()).toContain('noindex');
  });
  it('renders the index and is unavailable (tainted) when the origin fails', async () => {
    const i = await bioResponse('', { api: API, fetchFn: origin(routes) });
    expect(i.res.status).toBe(200);
    expect(await i.res.text()).toContain('href="/bio/quddus"');
    const d = await bioResponse('tahirih', { api: API, fetchFn: origin({ ...routes, '/api/v1/people/slug/tahirih': 500 }) });
    expect(d.res.status).toBe(503);
    expect(d.tainted).toBe(true);
  });
  it('orders sources Writings / Shoghi Effendi, then Nabíl, then the rest', () => {
    const gpb = sourceRank({ source: 'God Passes By', url: 'https://oceanlibrary.com/god-passes-by_shoghi-effendi' });
    const nabil = sourceRank({ source: 'The Dawn-Breakers', url: 'https://oceanlibrary.com/dawn-breakers_nabil' });
    const other = sourceRank({ source: 'Bahá’u’lláh — The King of Glory', url: 'https://bahai-library.com/balyuzi_king_glory' });
    expect(gpb).toBeGreaterThan(nabil);
    expect(nabil).toBeGreaterThan(other);
  });
  it('shows born/died only beside a cited event', () => {
    const p = { ...PERSON, timeline: { ...PERSON.timeline, events: [PERSON.timeline.events[1]] } };
    expect(bioPage(p)).not.toMatch(/<dt>(Born|Martyred|Died)<\/dt>/);
    expect(bioPage(PERSON)).toMatch(/<dt>Born<\/dt>/);
    expect(reportError('bio', 'x')).toContain('/api/chat/feedback');
  });
  it('gives every error report its own id, so two reports never overwrite each other', () => {
    const h = reportError('bio', 'a'.repeat(80));
    expect(h).toContain('data-report="bio-' + 'a'.repeat(44) + '"');   // ≤ 48 + a 14-char time/random suffix ≤ 64
    expect(h).toMatch(/f\.dataset\.report\+'-'\+Date\.now\(\)\.toString\(36\)\+Math\.random\(\)/);
    expect(h).toContain('round:1,');
  });
  it('capitalises a name that opens a title, heading or entry, never mid-sentence', () => {
    expect(capName('the Báb')).toBe('The Báb');
    expect(capName('‘Abdu’l-Bahá')).toBe('‘Abdu’l-Bahá');
    const p = { ...PERSON, name: 'the Báb', slug: 'the-bab' };
    const h = bioPage(p);
    expect(h).toContain('<title>The Báb — Biography — Anís</title>');
    expect(h).toContain('<h1>The Báb</h1>');
    expect(h).toMatch(/"@type":"Person","@id":"[^"]+","name":"The Báb"/);
    expect(h).toMatch(/og:title" content="The Báb/);
    expect(h).toContain('The life of the Báb');
    expect(bioIndexPage([{ name: 'the Báb', slug: 'the-bab' }])).toContain('>The Báb</a>');
  });
  it('the sitemap lists every biography (the index alone when the origin fails)', async () => {
    const b = await bioSitemapUrls({ api: API, fetchFn: origin({ '/api/v1/people/sitemap': { people: [{ id: 7, slug: 'tahirih' }] } }) });
    expect(b.map((x) => x.loc)).toEqual(['https://anis.oceanlibrary.com/bio', 'https://anis.oceanlibrary.com/bio/tahirih']);
    expect(await bioSitemapUrls({ api: API, fetchFn: origin({}) })).toEqual([{ loc: 'https://anis.oceanlibrary.com/bio', changefreq: 'weekly' }]);
  });
});
