// Talks on the Anís host: the designed Astro media pages render there (worker/index.js → src/lib/anis-host.js), Anís chrome,
// anis canonical, edge cache; worker/anis/talks.js keeps only the URL helpers and the sitemap.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as talks from '../../worker/anis/talks.js';
import { astroPath } from '../../src/lib/anis-host.js';
import { policyFor, cacheKey, anisCacheKey } from '../../worker/edge-cache.js';

const { MEDIA_PATH, mediaUrl, mediaSlug, mediaSitemapUrls } = talks;
const API = 'https://api.test';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const origin = (routes) => async (u) => { const v = routes[u.slice(API.length)]; return v === undefined ? json({ error: 'not found' }, 404) : json(v); };
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

describe('/media on the Anís host', () => {
  it('matches the Anís paths and routes them to the designed Astro pages', () => {
    expect(MEDIA_PATH.exec('/media/some-talk-1')[1]).toBe('some-talk-1');
    expect(mediaUrl('a-talk')).toBe('https://anis.oceanlibrary.com/media/a-talk');
    expect(mediaSlug('/media/a-talk')).toBe('a-talk');
    expect(astroPath('/media')).toBe('/media');
    expect(astroPath('/media/a-talk')).toBe('/media/a-talk');
    expect(astroPath('/media/a-talk/m/abc')).toBe('/media/a-talk/m/abc');   // moments render too
    expect(astroPath('/media/remaster')).toBe('/media/remaster');           // the before/after demo, linked from /media
  });
  it('the generic renderer is gone: talks.js exports helpers only', () => {
    expect(Object.keys(talks).sort()).toEqual(['MEDIA_PATH', 'mediaSitemapUrls', 'mediaSlug', 'mediaUrl']);
    const w = src('worker/index.js');
    expect(w).not.toMatch(/mediaResponse|talkPage/);
    expect(w).toMatch(/astroPath\(url\.pathname\)/);
  });
  it('the designed media pages carry the Anís chrome: SiteNav, the widget (talk context), Report an error', () => {
    for (const f of ['src/pages/media/index.astro', 'src/pages/media/[slug].astro', 'src/pages/media/[slug]/clip/[range].astro', 'src/pages/media/[slug]/m/[key].astro', 'src/pages/media/remaster.astro']) {
      expect(src(f), f).toMatch(/<SiteNav\b/);
      expect(src(f), f).not.toMatch(/<NavBar\b/);
    }
    const page = src('src/pages/media/[slug].astro');
    expect(page).toMatch(/anisPage=\{item \? \{ type: 'talk'/);
    expect(page).toMatch(/<ReportError kind="media"/);
    const layout = src('src/layouts/Layout.astro');
    expect(layout).toMatch(/<AnisWidget\b/);
    expect(layout).toMatch(/if \(anisHost\) return ANIS_ORIGIN \+ anisPath\(u\.pathname\)/);
  });
  it('is edge-cached under its own key, apart from the siftersearch.com page at the same path', () => {
    expect(policyFor(new URL('https://anis.oceanlibrary.com/media/x'), 'GET', new Headers()).mode).toBe('cache');
    const a = anisCacheKey(new URL('https://anis.oceanlibrary.com/media/x'), 'html', '1.0.0');
    expect(a).not.toBe(cacheKey(new URL('https://siftersearch.com/media/x'), 'html', '1.0.0'));
    expect(a).toContain('/@anis/media/x');
  });
  it('the sitemap lists every published talk', async () => {
    const routes = { '/api/media/index': { items: [{ s: 'dunbar-a-talk', pb: 'full', at: '2026-11-01T00:00:00' }, { s: 'hidden', pb: 'none' }] } };
    const t = await mediaSitemapUrls({ api: API, fetchFn: origin(routes) });
    expect(t.map((x) => x.loc)).toEqual(['https://anis.oceanlibrary.com/media', 'https://anis.oceanlibrary.com/media/dunbar-a-talk']);
    expect(t[1].lastmod).toBe('2026-11-01');
  });
});
