// Published discussions on the Anís host (worker/anis/discuss.js): /discuss/<slug> + /discuss, edge-cached, continue in chat.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { DISCUSS_PATH, DISCUSS_API, DIALOGUE_PATH, discussSlug, discussUrl, parseRounds, fromDialog, discussResponse, discussTurns, discussSitemapUrls, when } from '../../worker/anis/discuss.js';
import { policyFor, cacheKey } from '../../worker/edge-cache.js';
import { sitemapXml } from '../../worker/anis-app.js';

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
  it('resolves a slug: a server-rendered page with canonical, OG, JSON-LD, citations kept and a Continue link', async () => {
    const { res, tainted } = await discussResponse(DIALOG.slug, { api: API, fetchFn: tower() });
    expect(res.status).toBe(200);
    expect(tainted).toBe(false);
    const html = await res.text();
    expect(html).toMatch(/<\/html>$/);
    expect(html).toContain(`<link rel="canonical" href="https://anis.oceanlibrary.com/discuss/${DIALOG.slug}">`);
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('"@type":"DiscussionForumPosting"');
    expect(html).toContain('<h1>How Bahá&#39;í texts read &#39;Seal of the Prophets&#39;</h1>');
    expect(html).toContain('href="https://oceanlibrary.com/kitab-i-iqan_bahaullah#p172"');
    expect(html).toContain(`href="/?discuss=${DIALOG.slug}">Continue this conversation with Anís</a>`);
    expect(html).toContain('Comparative religion');
    expect(html).not.toMatch(/siftersearch|jafar/i);
    expect(html).not.toMatch(/<script(?! type="application\/ld\+json")/);
  });
  it('404s an unknown slug (noindex, not cacheable) and taints when tower fails', async () => {
    const miss = await discussResponse('no-such-discussion', { api: API, fetchFn: tower() });
    expect(miss.res.status).toBe(404);
    const t = await miss.res.text();
    expect(t).toContain('noindex');
    expect(t).not.toContain('rel="canonical"');
    const down = await discussResponse(DIALOG.slug, { api: API, fetchFn: tower({ [`/api/v1/dialogs/${DIALOG.slug}`]: () => new Response('x', { status: 502 }) }) });
    expect(down.res.status).toBe(503);
    expect(down.tainted).toBe(true);
    const net = await discussResponse(null, { api: API, fetchFn: async () => { throw new Error('tunnel'); } });
    expect(net.res.status).toBe(503);
  });
  it('the index lists every discussion newest first, with summary and date', async () => {
    const { res } = await discussResponse(undefined, { api: API, fetchFn: tower() });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<link rel="canonical" href="https://anis.oceanlibrary.com/discuss">');
    expect(html.indexOf(`/discuss/${DIALOG.slug}`)).toBeLessThan(html.indexOf('/discuss/older-one-here'));
    expect(html).toContain('<time datetime="2026-05-16">16 May 2026</time>');
    expect(html).toContain('"@type":"CollectionPage"');
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
  it('edge cache: the pages are cached HTML keyed by path', () => {
    for (const p of ['/discuss', `/discuss/${DIALOG.slug}`]) {
      const u = new URL('https://anis.oceanlibrary.com' + p);
      expect(policyFor(u, 'GET', new Headers())).toMatchObject({ mode: 'cache', kind: 'html', l2: true });
      expect(cacheKey(u, 'html', '1.0.0')).toContain(p);
    }
  });
  it('the site Worker routes the Anís host to the discussions before the app; siftersearch.com/discuss 301s there', () => {
    const w = fs.readFileSync(new URL('../../worker/index.js', import.meta.url), 'utf8');
    const host = w.indexOf('if (url.hostname === SHORT_HOST)');
    const disc = w.indexOf('DISCUSS_PATH.exec(url.pathname)');
    expect(disc).toBeGreaterThan(host);
    expect(disc).toBeLessThan(w.indexOf('await anisAppRoute(url, env)'));
    expect(w).toContain("serveCached({ key: cacheKey(url, policy.kind, BUILD_VERSION), policy, env, ctx, produce })");
    expect(w.indexOf('Response.redirect(`https://${SHORT_HOST}${url.pathname}${url.search}`, 301)')).toBeLessThan(w.indexOf('policyFor(url, request.method, policyHeaders(request, test));\n        const st'));
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
    expect(a).toContain('canonical={`https://anis.oceanlibrary.com/discuss/${slug}`}');
  });
});
