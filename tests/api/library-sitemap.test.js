// The library sitemap: the reports-built snapshot (api/lib/library/library-sitemap.js), its XML (src/lib/sitemap-xml.js),
// the site endpoints (/sitemap-library.xml index + /sitemap-library-<part>.xml) and their edge-cache policy. Until 10-23
// the endpoint asked the API for limit=10000 (max 200 → 400) and shipped an EMPTY <urlset> — 0 library URLs indexed.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { shapeLibrarySitemap, readLibrarySitemap } from '../../api/lib/library/library-sitemap.js';
import { urlsetXml, sitemapIndexXml } from '../../src/lib/sitemap-xml.js';
import { policyFor, storable, cacheKey } from '../../worker/edge-cache.js';

const row = (religion, collection, slug, updated_at = '2026-10-01 12:00:00') => ({ religion, collection, slug, updated_at });
const ROWS = [
  row("Bahá'í", 'Core Tablets', 'bahaullah_kitab-i-iqan', '2026-10-13 13:33:44'),
  row("Bahá'í", 'Core Tablets', 'bahaullah_hidden-words', '2026-09-01 00:00:00'),
  row("Bahá'í", 'Pilgrim Notes', 'some-notes'),
  row('Jain', 'Agamas', 'tr-hermann-jacobi_akaranga-sutra-book-1', '2026-10-13 13:33:44'),
  row('Other', 'Misc', 'hidden-doc'),           // hidden tradition
  row('Jain', '.drafts', 'dot-collection'),     // dot-collection
  row('Jain', 'Agamas', ''),                    // no slug
];

describe('shapeLibrarySitemap', () => {
  const snap = shapeLibrarySitemap(ROWS, { hidden: new Set(['Other']), now: Date.parse('2026-10-23T00:00:00Z') });
  it('lists every live reader URL at its canonical path, per tradition, with lastmod from updated_at', () => {
    expect(snap.parts['bahai-1']).toEqual([
      ['/library/bahai/core-tablets/bahaullah_hidden-words', '2026-09-01'],
      ['/library/bahai/core-tablets/bahaullah_kitab-i-iqan', '2026-10-13'],
      ['/library/bahai/pilgrim-notes/some-notes', '2026-10-01'],
    ]);
    expect(snap.parts['jain-1']).toEqual([['/library/jain/agamas/tr-hermann-jacobi_akaranga-sutra-book-1', '2026-10-13']]);
  });
  it('lists tradition + collection pages in "collections", with the latest lastmod beneath them', () => {
    expect(Object.fromEntries(snap.parts.collections)).toEqual({
      '/library/bahai': '2026-10-13', '/library/bahai/core-tablets': '2026-10-13', '/library/bahai/pilgrim-notes': '2026-10-01',
      '/library/jain': '2026-10-13', '/library/jain/agamas': '2026-10-13',
    });
  });
  it('leaves out hidden traditions, dot-collections and slugless rows', () => {
    const all = Object.values(snap.parts).flat().map(([p]) => p).join(' ');
    expect(all).not.toMatch(/hidden-doc|dot-collection|\/library\/other/);
    expect(snap.total).toBe(4 + 5);
  });
  it('splits a tradition into parts of at most `chunk` URLs (protocol max 50k)', () => {
    const many = Array.from({ length: 7 }, (_, i) => row('Islam', 'Hadith', `h-${i}`));
    const s = shapeLibrarySitemap(many, { chunk: 3 });
    expect(s.index.map((p) => [p.part, p.count])).toEqual([['collections', 2], ['islam-1', 3], ['islam-2', 3], ['islam-3', 1]]);
    expect(shapeLibrarySitemap([], {}).index).toEqual([]);
  });
  it('a path listed twice keeps its latest lastmod', () => {
    const s = shapeLibrarySitemap([row('Jain', 'Agamas', 'x', '2026-01-01 00:00:00'), row('Jain', 'Agamas', 'x', '2026-05-05 00:00:00')]);
    expect(s.parts['jain-1']).toEqual([['/library/jain/agamas/x', '2026-05-05']]);
  });
  it('readLibrarySitemap reads the snapshot file (null before the first one exists)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sitemap-'));
    expect(readLibrarySitemap(join(dir, 'missing.json'))).toBeNull();
    writeFileSync(join(dir, 's.json'), JSON.stringify(snap));
    expect(readLibrarySitemap(join(dir, 's.json')).total).toBe(9);
  });
});

describe('sitemap XML', () => {
  it('urlset carries one <url> per entry with escaped absolute <loc> and <lastmod>', () => {
    const x = urlsetXml([['/library/a/b/c', '2026-10-13'], ['/library/a/b/d&e', null]]);
    expect(x).toMatch(/^<\?xml/);
    expect(x.match(/<url>/g)).toHaveLength(2);
    expect(x).toContain('<loc>https://siftersearch.com/library/a/b/c</loc><lastmod>2026-10-13</lastmod>');
    expect(x).toContain('<loc>https://siftersearch.com/library/a/b/d&amp;e</loc></url>');
    expect(x.trim()).toMatch(/<\/urlset>$/);
  });
  it('the index points at /sitemap-library-<part>.xml', () => {
    const x = sitemapIndexXml([{ part: 'bahai-1', count: 3, lastmod: '2026-10-13' }]);
    expect(x).toContain('<sitemap><loc>https://siftersearch.com/sitemap-library-bahai-1.xml</loc><lastmod>2026-10-13</lastmod></sitemap>');
    expect(x.trim()).toMatch(/<\/sitemapindex>$/);
  });
});

describe('site endpoints (src/pages/sitemap-library*.xml.js)', () => {
  const snap = shapeLibrarySitemap(ROWS, { hidden: new Set(['Other']) });
  const api = (fn) => vi.stubGlobal('fetch', vi.fn(async (url) => fn(String(url))));
  afterEach(() => vi.unstubAllGlobals());

  it('/sitemap-library.xml is an index of every part', async () => {
    api((u) => (u.endsWith('/api/library/sitemap') ? Response.json({ parts: snap.index }) : new Response('', { status: 404 })));
    const { GET } = await import('../../src/pages/sitemap-library.xml.js');
    const res = await GET();
    const x = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/xml/);
    expect(x.match(/<sitemap>/g)).toHaveLength(snap.index.length);
    expect(x).toContain('/sitemap-library-bahai-1.xml');
  });
  it('a part contains its URLs', async () => {
    api((u) => (u.endsWith('/api/library/sitemap/bahai-1') ? Response.json({ urls: snap.parts['bahai-1'] }) : new Response('', { status: 404 })));
    const { GET } = await import('../../src/pages/sitemap-library-[part].xml.js');
    const res = await GET({ params: { part: 'bahai-1' } });
    const x = await res.text();
    expect(res.status).toBe(200);
    expect(x.match(/<url>/g)).toHaveLength(3);
    expect(x).toContain('<loc>https://siftersearch.com/library/bahai/core-tablets/bahaullah_kitab-i-iqan</loc>');
    expect((await GET({ params: { part: 'nope-9' } })).status).toBe(404);
    expect((await GET({ params: { part: '../x' } })).status).toBe(404);
  });
  it('an API failure is a 503, never an empty sitemap', async () => {
    api(() => new Response('{"statusCode":400}', { status: 400 }));
    const idx = (await import('../../src/pages/sitemap-library.xml.js')).GET;
    const part = (await import('../../src/pages/sitemap-library-[part].xml.js')).GET;
    expect((await idx()).status).toBe(503);
    expect((await part({ params: { part: 'bahai-1' } })).status).toBe(503);
  });
});

describe('edge cache for the sitemap', () => {
  const U = (p) => new URL('https://siftersearch.com' + p);
  it('the index, its parts and their API data are cached (L2)', () => {
    for (const p of ['/sitemap-library.xml', '/sitemap-library-bahai-1.xml', '/sitemap-library-collections.xml']) {
      expect(policyFor(U(p), 'GET', new Headers())).toMatchObject({ mode: 'cache', kind: 'xml', l2: true });
    }
    expect(policyFor(U('/api/library/sitemap'), 'GET', new Headers())).toMatchObject({ mode: 'cache', kind: 'api', l2: true });
    expect(policyFor(U('/api/library/sitemap/bahai-1'), 'GET', new Headers())).toMatchObject({ mode: 'cache', kind: 'api' });
    expect(cacheKey(U('/sitemap-library.xml'), 'xml', 'v9')).toBe('/__edge/xml-v9/sitemap-library.xml');
  });
  it('only a whole, non-empty sitemap is stored', () => {
    const h = new Headers({ 'content-type': 'application/xml; charset=utf-8' });
    const full = urlsetXml([['/library/a/b/c', '2026-10-13']]);
    expect(storable({ status: 200, headers: h, text: full, kind: 'xml' }).ok).toBe(true);
    expect(storable({ status: 200, headers: h, text: urlsetXml([]), kind: 'xml' })).toMatchObject({ ok: false, why: 'empty sitemap' });
    expect(storable({ status: 200, headers: h, text: full.slice(0, 80), kind: 'xml' })).toMatchObject({ ok: false, why: 'truncated' });
    expect(storable({ status: 200, headers: h, text: full, kind: 'xml', tainted: true }).ok).toBe(false);
    expect(storable({ status: 503, headers: h, text: full, kind: 'xml' }).ok).toBe(false);
  });
});
