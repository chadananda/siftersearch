// Published discussions on the Anís host: siftersearch's designed dialogue pages (src/pages/dialogue/) render at /discuss[/<slug>]
// with Anís chrome; worker/anis/discuss.js keeps the URL helpers, the chat's Continue turns and the sitemap.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as discuss from '../../worker/anis/discuss.js';
import { policyFor, anisCacheKey } from '../../worker/edge-cache.js';
import { sitemapXml } from '../../worker/anis-app.js';
import { astroPath, ASTRO_SECTIONS } from '../../src/lib/anis-host.js';
const { DISCUSS_PATH, DISCUSS_API, DIALOGUE_PATH, discussSlug, discussUrl, parseRounds, fromDialog, discussTurns, discussSitemapUrls, when } = discuss;
const src = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

const MD = `### How do Bahá'í texts interpret 'Seal of the Prophets'?

<div class="user-turn" id="round-1">

Islam teaches that Muhammad is the Seal of the Prophets. How do Bahá'í texts engage this claim?

</div>

#### Bahá'í texts reinterpret 'Seal' as continuity.

<div class="jafar-turn">

Bahá'u'lláh notes that many misunderstood the term, letting it ["obscure their understanding"](https://oceanlibrary.com/kitab-i-iqan_bahaullah#p172).

</div>

### Where is the passage?

<div class="user-turn" id="round-2">

Where in the *Kitáb-i-Íqán*?

</div>

#### In the Íqán.

<div class="jafar-turn">

In paragraph 172.

</div>`;
const DIALOG = { slug: 'bahai-texts-reinterpret-seal-prophets', title: "How Bahá'í texts read 'Seal of the Prophets'", description: 'Continuity, not closure.',
  topic: 'comparative-religion', tags_json: '["seal","prophethood"]', published_at: '2026-05-16 00:36:05', updated_at: '2026-05-17 10:00:00', body_md: MD };
const LIST = [{ slug: 'older-one-here', title: 'Older', topic: 'theology', excerpt: 'old', published_at: '2026-05-12 16:06:19', rounds_count: 5 },
  { slug: DIALOG.slug, title: DIALOG.title, topic: 'comparative-religion', excerpt: 'new', published_at: DIALOG.published_at, rounds_count: 2 }];
const API = 'https://api.example';
const tower = (over = {}) => async (u) => {
  const p = new URL(u).pathname;
  if (over[p]) return over[p]();
  if (p === '/api/v1/dialogs') return Response.json({ dialogs: LIST });
  if (p === `/api/v1/dialogs/${DIALOG.slug}`) return Response.json({ dialog: DIALOG });
  return Response.json({ error: 'not_found' }, { status: 404 });
};

describe('Anís published discussions', () => {
  it('paths: /discuss and /discuss/<slug> only; the continue API by slug', () => {
    expect(DISCUSS_PATH.exec('/discuss')[1]).toBeUndefined();
    expect(DISCUSS_PATH.exec('/discuss/')[1]).toBeUndefined();
    expect(DISCUSS_PATH.exec('/discuss/008-why-does-god-allow-suffering')[1]).toBe('008-why-does-god-allow-suffering');
    for (const p of ['/discussion', '/discuss/a/b', '/discuss/Bad_Slug', '/d/some-slug']) expect(DISCUSS_PATH.test(p), p).toBe(false);
    expect(DISCUSS_API.exec('/api/chat/discuss/some-slug')[1]).toBe('some-slug');
  });
  it('splits the body into rounds: title, question, gist, answer', () => {
    const r = parseRounds(MD);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ title: "How do Bahá'í texts interpret 'Seal of the Prophets'?", gist: "Bahá'í texts reinterpret 'Seal' as continuity." });
    expect(r[0].question).toMatch(/^Islam teaches/);
    expect(r[0].answer).toContain('(https://oceanlibrary.com/kitab-i-iqan_bahaullah#p172)');
    expect(fromDialog({ slug: 'x-y', body_md: 'no rounds' })).toBeNull();
    expect(when('2026-05-16 00:36:05')).toBe(Date.UTC(2026, 4, 16, 0, 36, 5));
  });
  it('routes /discuss[/<slug>] to the designed dialogue pages (assessment stays on siftersearch)', () => {
    expect(ASTRO_SECTIONS).toContain('discuss');
    expect(astroPath('/discuss')).toBe('/dialogue');
    expect(astroPath(`/discuss/${DIALOG.slug}`)).toBe(`/dialogue/${DIALOG.slug}`);
    expect(astroPath('/discuss/assessment')).toBeNull();
    expect(astroPath('/discuss/a/b')).toBeNull();
  });
  it('the generic renderer is gone: discuss.js exports helpers only', () => {
    expect(Object.keys(discuss).sort()).toEqual(['DIALOGUE_PATH', 'DISCUSS_API', 'DISCUSS_PATH', 'discussSitemapUrls', 'discussSlug', 'discussTurns', 'discussUrl', 'fromDialog', 'parseRounds', 'turnsOf', 'when']);
    expect(src('worker/index.js')).not.toMatch(/discussResponse|discussPage/);
  });
  it('the designed pages carry the Anís chrome: SiteNav, Anís canonical, the widget (discussion context), Anís JSON-LD', () => {
    for (const f of ['src/pages/dialogue/index.astro', 'src/pages/dialogue/[slug].astro']) {
      expect(src(f), f).toMatch(/<SiteNav currentPage="dialogue"/);
      expect(src(f), f).not.toMatch(/<NavBar\b/);
    }
    const page = src('src/pages/dialogue/[slug].astro');
    expect(page).toContain("anisPage={{ type: 'discussion', slug, title: sq(data.title) }}");
    expect(page).toContain('const canonical = `${ANIS_ORIGIN}/discuss/${slug}`;');
    expect(page).toMatch(/publisher": anis\s*\? \{ "@type": "Organization", "name": "Ocean 2.0"/);
    expect(page).toContain('Continue this conversation with Anís');
    expect(page).toMatch(/\{!anis && <link rel="alternate" type="application\/rss\+xml"/);
    // category/tag/assessment pages exist only on siftersearch: plain labels on the Anís host
    expect(page).not.toMatch(/(?<!!anis && )<a [^>]*href=\{`\/dialogue\/(tag|category)\//);
    expect(src('src/pages/dialogue/index.astro')).not.toMatch(/(?<!!anis && )<a [^>]*href=\{`\/dialogue\/(tag|category)\//);
  });
  it('continue: the discussion as chat turns (the widget fromShared shape)', async () => {
    const r = await discussTurns(DIALOG.slug, { api: API, fetchFn: tower() });
    const d = await r.json();
    expect(d.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(d.title).toBe(DIALOG.title);
    expect((await discussTurns('no-such-thing', { api: API, fetchFn: tower() })).status).toBe(404);
  });
  it('sitemap: the app root, the index and each discussion', async () => {
    const xml = sitemapXml(await discussSitemapUrls({ api: API, fetchFn: tower() }));
    expect(xml).toContain('<loc>https://anis.oceanlibrary.com/</loc>');
    expect(xml).toContain('<loc>https://anis.oceanlibrary.com/discuss</loc>');
    expect(xml).toContain(`<loc>https://anis.oceanlibrary.com/discuss/${DIALOG.slug}</loc><lastmod>2026-05-16</lastmod>`);
    expect(await discussSitemapUrls({ api: API, fetchFn: async () => { throw new Error('x'); } })).toEqual([]);
  });
  it('edge cache: the pages are cached HTML under the Anís key and warmed', () => {
    for (const p of ['/discuss', `/discuss/${DIALOG.slug}`]) {
      const u = new URL('https://anis.oceanlibrary.com' + p);
      expect(policyFor(u, 'GET', new Headers())).toMatchObject({ mode: 'cache', kind: 'html', l2: true });
      expect(anisCacheKey(u, 'html', '1.0.0')).toContain(`/@anis${p}`);
    }
    expect(src('worker/index.js')).toMatch(/WARM_ANIS = \[[^\]]*'\/discuss'/);
  });
  it('siftersearch.com/discuss 301s to the Anís host', () => {
    const w = src('worker/index.js');
    expect(w).toContain('if (DISCUSS_PATH.test(url.pathname) || DOC_PATH.test(url.pathname)) return Response.redirect(`https://${SHORT_HOST}${url.pathname}${url.search}`, 301)');
  });
  it('siftersearch.com/dialogue[/<slug>] 301s to the Anís discussion (assessment, tags, categories, rss stay)', () => {
    expect(DIALOGUE_PATH.exec('/dialogue/what-happened-badasht')?.[1]).toBe('what-happened-badasht');
    expect(DIALOGUE_PATH.exec('/dialogue/')?.[1]).toBeUndefined();
    for (const p of ['/dialogue/assessment', '/dialogue/tag/x', '/dialogue/category/x', '/dialogue/rss.xml']) expect(DIALOGUE_PATH.test(p)).toBe(false);
    expect(discussUrl('x-y')).toBe('https://anis.oceanlibrary.com/discuss/x-y');
    expect(discussUrl('')).toBe('https://anis.oceanlibrary.com/discuss');
    expect(discussSlug('https://siftersearch.com/dialogue/x-y')).toBe('x-y');
    expect(discussSlug('/discuss/x-y?a=1')).toBe('x-y');
    expect(discussSlug('https://siftersearch.com/dialogue')).toBe('');
    expect(discussSlug('/library/x')).toBe(null);
    const w = fs.readFileSync(new URL('../../worker/index.js', import.meta.url), 'utf8');
    const r = w.indexOf('DIALOGUE_PATH.exec(url.pathname)');
    expect(r).toBeGreaterThan(w.indexOf('if (url.hostname === SHORT_HOST)'));
    expect(r).toBeLessThan(w.indexOf('policyFor(url, request.method, policyHeaders(request, test));\n        const st'));
    expect(w).toContain('Response.redirect(`${discussUrl(m[1])}${url.search}`, 301)');
  });
  it('siftersearch.com/dialogue/<slug> names the Anís page as canonical', () => {
    const a = fs.readFileSync(new URL('../../src/pages/dialogue/[slug].astro', import.meta.url), 'utf8');
    expect(a).toContain('const canonical = `${ANIS_ORIGIN}/discuss/${slug}`;');
    expect(a).toContain('  canonical={canonical}');
  });
});
