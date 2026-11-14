// anis.oceanlibrary.com/doc: slug → page (301 to canonical, 404 unknown), the copyright ceiling, the side-by-side view, index + sitemap.
import { describe, it, expect } from 'vitest';
import { DOC_PATH, docResponse, docSitemapUrls, PAGE_SIZE, TEXT_PAGE } from '../../worker/anis/doc-pages.js';
import { PREVIEW_PARAGRAPHS } from '../../api/lib/rights/preview.js';
import { THEME_PREP } from '../../worker/anis/content-widget.js';

const noWidget = (h) => h.replace(THEME_PREP, '').replace(/<script>window\.anisPage=[\s\S]*?<\/script><script>[\s\S]*?<\/script>/, '');

const API = 'https://api.test';
const BOOK = { id: '8632', title: 'Gate of the Heart', author: 'Nader Saiedi', collection: "Baha'i Books", language: 'en', encumbered: 1,
  purchase_url: 'https://example.com/buy', metadata: '{"publicationName":"Wilfrid Laurier University Press"}' };
const TABLET = { id: '945614', title: 'Prayer for Ahmad', author: 'The Báb', collection: 'Core Tablets', language: 'ar', encumbered: 0, metadata: '{"bookid":"BAB_AHMAD"}' };
const SBS = { doc: { id: 945614, language: 'ar', direction: 'rtl', translator: 'Shoghi Effendi', source_url: null, paragraphs: 2 }, sections: [], next_offset: null,
  paragraphs: [{ n: 1, kind: 'heading', rows: [{ o: 'هو', t: '' }], aligned: 'none' },
    { n: 2, kind: 'text', rows: [{ o: 'سبحانك اللّهمّ', t: 'Glorified art Thou, O my God!' }, { o: 'لك و لك الحمد', t: 'Thine is the praise.' }], aligned: 'llm' }] };
const CAT = { books: [{ id: 8632, slug: 'gate-of-the-heart-nader-saiedi-8632', title: 'Gate of the Heart', author: 'Nader Saiedi', updated: '2026-11-03' }],
  tablets: Array.from({ length: PAGE_SIZE + 5 }, (_, i) => ({ id: 100 + i, slug: `tablet-${100 + i}`, title: `Tablet ${i}`, language: 'fa' })) };

const paras = (n) => Array.from({ length: n }, (_, i) => ({ id: i, paragraph_index: i, text: `Paragraph number ${i + 1}.`, blocktype: 'paragraph' }));
function fake({ bookParas = 40, sbs = SBS, catalogue = CAT } = {}) {
  const calls = [];
  const fetchFn = async (u) => {
    calls.push(u);
    const p = new URL(u);
    const j = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (p.pathname === '/api/library/doc-pages') return catalogue ? j(catalogue) : j({ error: 'not built' }, 503);
    if (p.pathname === '/api/library/documents/8632') return j({ document: BOOK, paragraphs: paras(bookParas), previewLimit: 40 });
    if (p.pathname === '/api/library/documents/945614') return j({ document: TABLET, paragraphs: paras(3) });
    if (p.pathname === '/api/library/documents/945614/sbs') return j(sbs);
    if (p.pathname === '/api/library/documents/77') {
      const off = Number(p.searchParams.get('paragraphOffset') || 0), lim = Number(p.searchParams.get('paragraphLimit'));
      return j({ document: { id: '77', title: 'Plain Book', language: 'en', encumbered: 0, paragraph_count: 450 }, paragraphs: paras(450).slice(off, off + lim), paragraphTotal: 450 });
    }
    if (p.pathname === '/api/library/documents/78') return j({ document: { id: '78', title: 'Held Elsewhere', language: 'en', encumbered: 0, source_url: 'https://bahai-library.com/held_elsewhere' }, paragraphs: paras(3) });
    if (p.pathname === '/api/library/documents/79') return j({ document: { ...BOOK, id: '79', title: 'Copyright Held', source_url: 'https://bahai-library.com/copyright_held' }, paragraphs: paras(40) });
    if (/^\/api\/library\/documents\/7[78]\/sbs$/.test(p.pathname)) return j({ doc: { language: 'en' }, paragraphs: [{ n: 1, kind: 'text', rows: [{ o: 'x', t: '' }] }] });
    return j({ error: 'not found' }, 404);
  };
  return { calls, fetchFn };
}
const get = async (path, f = fake()) => {
  const r = await docResponse(DOC_PATH.exec(path), { api: API, fetchFn: f.fetchFn });
  return { ...r, status: r.res.status, html: r.res.status === 301 ? '' : await r.res.text(), location: r.res.headers.get('location') };
};

describe('routing and slugs', () => {
  it('DOC_PATH: index, lists, pages, slugs', () => {
    expect(DOC_PATH.exec('/doc').slice(1)).toEqual([undefined, undefined, undefined, undefined]);
    expect(DOC_PATH.exec('/doc/plain-book-77/3').slice(3)).toEqual(['plain-book-77', '3']);
    expect(DOC_PATH.exec('/doc/tablets/2').slice(1, 3)).toEqual(['tablets', '2']);
    expect(DOC_PATH.exec('/doc/books-of-light-12')[3]).toBe('books-of-light-12');
    expect(DOC_PATH.exec('/doc/Bad Slug')).toBeNull();
    expect(DOC_PATH.exec('/docs')).toBeNull();
  });
  it('the canonical slug renders; a stale slug or a bare id 301s to it', async () => {
    expect((await get('/doc/gate-of-the-heart-nader-saiedi-8632')).status).toBe(200);
    for (const p of ['/doc/8632', '/doc/old-title-8632']) {
      const r = await get(p);
      expect(r.status).toBe(301);
      expect(r.location).toBe('https://anis.oceanlibrary.com/doc/gate-of-the-heart-nader-saiedi-8632');
    }
  });
  it('unknown slug or no id → 404 noindex', async () => {
    for (const p of ['/doc/no-such-text-999', '/doc/no-id-here', '/doc/plain-book-77/4']) {
      const r = await get(p);
      expect(r.status, p).toBe(404);
      expect(r.html).toContain('<meta name="robots" content="noindex">');
      expect(r.html).not.toContain('rel="canonical"');
    }
  });
});

describe('copyrighted book: the opening only', () => {
  it(`never more than PREVIEW_PARAGRAPHS (${PREVIEW_PARAGRAPHS}), even when the origin sends more`, async () => {
    const r = await get('/doc/gate-of-the-heart-nader-saiedi-8632', fake({ bookParas: 120 }));
    const body = r.html.slice(r.html.indexOf('<div class="text"'), r.html.indexOf('<div class="ends"'));
    expect((body.match(/<p id="p\d+">/g) || []).length).toBe(PREVIEW_PARAGRAPHS);
    expect(body).toContain(`Paragraph number ${PREVIEW_PARAGRAPHS}.`);
    expect(body).not.toContain(`Paragraph number ${PREVIEW_PARAGRAPHS + 1}.`);
  });
  it('asks the origin anonymously for the preview window, then where to get the book', async () => {
    const f = fake();
    const r = await get('/doc/gate-of-the-heart-nader-saiedi-8632', f);
    expect(f.calls.find((u) => u.includes('/documents/8632'))).toMatch(/paragraphOffset=0/);
    expect(f.calls.some((u) => u.includes('/sbs'))).toBe(false);
    expect(r.html).toContain('href="https://example.com/buy"');
    expect(r.html).toContain('Wilfrid Laurier University Press');
    expect(r.html).toContain('<link rel="canonical" href="https://anis.oceanlibrary.com/doc/gate-of-the-heart-nader-saiedi-8632">');
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(r.html)[1]);
    expect(ld).toMatchObject({ '@type': 'Book', name: 'Gate of the Heart', author: { name: 'Nader Saiedi' }, isAccessibleForFree: false });
    expect(r.html).toMatch(/href="\/\?ask=[^"]*Gate%20of%20the%20Heart[^"]*" data-anis-ask=/);
    expect(r.html).toMatch(/window\.anisPage=\{"type":"text","slug":"gate-of-the-heart[^"]*-8632","title":"Gate of the Heart/);
    expect(noWidget(r.html)).not.toMatch(/siftersearch/i);
  });
});

describe('link policy: collaborators first, else the text here', () => {
  it('a collaborator holds it → 301 there, straight from any slug or the bare id (a copyrighted book too)', async () => {
    for (const [p, to] of [['/doc/78', 'https://bahai-library.com/held_elsewhere'], ['/doc/old-79', 'https://bahai-library.com/copyright_held']]) {
      const r = await get(p);
      expect(r.status, p).toBe(301);
      expect(r.location).toBe(to);
    }
  });
  it('the original beside its English stays here even when a collaborator holds the tablet', async () => {
    expect((await get('/doc/prayer-for-ahmad-the-bab-945614')).status).toBe(200);
  });
  it('a text no collaborator holds renders here, TEXT_PAGE paragraphs a page, anchors kept', async () => {
    const r1 = await get('/doc/plain-book-77'), r3 = await get('/doc/plain-book-77/3');
    expect(r1.status).toBe(200);
    expect((r1.html.match(/<p id="p\d+">/g) || []).length).toBe(TEXT_PAGE);
    expect(r1.html).toContain('<p id="p0">Paragraph number 1.</p>');
    expect(r1.html).toContain('href="/doc/plain-book-77/2" rel="next"');
    expect(r3.html).toContain('<link rel="canonical" href="https://anis.oceanlibrary.com/doc/plain-book-77/3">');
    expect(r3.html).toContain('<p id="p400">Paragraph number 401.</p>');
    expect(r3.html).not.toContain('rel="next"');
    expect((await get('/doc/plain-book-77/1')).location).toBe('https://anis.oceanlibrary.com/doc/plain-book-77');
    expect((await get('/doc/77/2')).location).toBe('https://anis.oceanlibrary.com/doc/plain-book-77/2');
    expect(noWidget(r1.html)).not.toMatch(/siftersearch/i);
  });
  it('a copyrighted book has no page 2', async () => {
    expect((await get('/doc/gate-of-the-heart-nader-saiedi-8632/2')).status).toBe(404);
  });
});

describe('original beside the English', () => {
  it('RTL original with lang/dir, English with lang=en, rows focusable for tap highlight', async () => {
    const f = fake();
    const r = await get('/doc/prayer-for-ahmad-the-bab-945614', f);
    expect(r.status).toBe(200);
    expect(f.calls.find((u) => u.includes('/sbs'))).toContain('cached=true');   // crawlers never buy an alignment
    expect(r.html).toContain('<p class="o" lang="ar" dir="rtl">سبحانك اللّهمّ</p><p class="t" lang="en">Glorified art Thou, O my God!</p>');
    expect((r.html.match(/class="row" tabindex="0"/g) || []).length).toBe(2);
    expect(r.html).toContain('<h2 lang="ar" dir="rtl">هو</h2>');
    expect(r.html).toMatch(/\.row:hover,\.row:focus\{/);
    expect(r.html).toMatch(/@media \(max-width:760px\)\{\.row,\.cols\{grid-template-columns:1fr\}/);
    expect(r.html).toContain('href="https://oceanoflights.org/bab-ahmad/"');
    expect(JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(r.html)[1])).toMatchObject({ '@type': 'CreativeWork', inLanguage: ['ar', 'en'], translator: { name: 'Shoghi Effendi' } });
    expect(noWidget(r.html)).not.toMatch(/siftersearch/i);
  });
});

describe('index, lists, sitemap', () => {
  it('/doc lists both kinds; /doc/tablets pages by PAGE_SIZE; past the end 404', async () => {
    const idx = await get('/doc');
    expect(idx.status).toBe(200);
    expect(idx.html).toContain('href="/doc/gate-of-the-heart-nader-saiedi-8632"');
    expect(idx.html).toContain(`All ${PAGE_SIZE + 5} texts`);
    const p1 = await get('/doc/tablets'), p2 = await get('/doc/tablets/2');
    expect((p1.html.match(/<li><h3>/g) || []).length).toBe(PAGE_SIZE);
    expect((p2.html.match(/<li><h3>/g) || []).length).toBe(5);
    expect(p2.html).toContain('rel="prev"');
    expect((await get('/doc/tablets/3')).status).toBe(404);
  });
  it('no catalogue yet → 503 tainted (never cached as an empty index)', async () => {
    const r = await get('/doc', fake({ catalogue: null }));
    expect(r.status).toBe(503); expect(r.tainted).toBe(true);
  });
  it('sitemap: index, list pages, every text', async () => {
    const urls = await docSitemapUrls({ api: API, fetchFn: fake().fetchFn });
    const locs = urls.map((u) => u.loc);
    expect(locs).toContain('https://anis.oceanlibrary.com/doc');
    expect(locs).toContain('https://anis.oceanlibrary.com/doc/tablets/2');
    expect(locs).toContain('https://anis.oceanlibrary.com/doc/gate-of-the-heart-nader-saiedi-8632');
    expect(urls.find((u) => u.loc.endsWith('8632')).lastmod).toBe('2026-11-03');
    expect(locs).toHaveLength(1 + 1 + 2 + 1 + PAGE_SIZE + 5);
    expect(await docSitemapUrls({ api: API, fetchFn: fake({ catalogue: null }).fetchFn })).toEqual([]);
  });
});

describe('edge cache', async () => {
  const { policyFor, cacheKey } = await import('../../worker/edge-cache.js');
  const U = (p) => new URL('https://anis.oceanlibrary.com' + p);
  it('/doc pages are cached HTML (L2); the catalogue API too', () => {
    for (const p of ['/doc', '/doc/tablets/2', '/doc/gate-of-the-heart-nader-saiedi-8632']) {
      expect(policyFor(U(p), 'GET', new Headers()), p).toMatchObject({ mode: 'cache', kind: 'html', l2: true });
    }
    expect(policyFor(new URL('https://siftersearch.com/api/library/doc-pages'), 'GET', new Headers())).toMatchObject({ mode: 'cache', kind: 'api', fresh: 3600, l2: true });
    expect(cacheKey(U('/doc/x-1'), 'html', 'v9')).toBe('/__edge/h-v9/doc/x-1');
  });
  it('the site Worker routes /doc on the Anís host, lists it in the sitemap, and sends the old host there', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const src = readFileSync(join(import.meta.dirname, '../../worker/index.js'), 'utf8');
    expect(src).toMatch(/DOC_PATH\.exec\(url\.pathname\)/);
    expect(src).toMatch(/docSitemapUrls[,\]]/);
    expect(src).toMatch(/DOC_PATH\.test\(url\.pathname\)\) return Response\.redirect/);
    expect(readFileSync(join(import.meta.dirname, '../../worker/anis-app.js'), 'utf8')).toContain('(api|widget|d|discuss|doc|bio|media)');
  });
});
