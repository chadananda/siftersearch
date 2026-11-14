// Unique library texts on the Anís host (Chad 11-14): anis.oceanlibrary.com/doc/<slug>. A copyrighted book shows its permitted
// opening only (api/lib/rights/preview.js — the same ceiling the library reader enforces, clamped here again); an original
// tablet shows its Persian/Arabic beside the English, row by row (/api/library/documents/:id/sbs?cached=true: stored
// alignments only, so a crawler never buys one). Index /doc (+ /doc/books, /doc/tablets[/<page>]) from the reports-built
// catalogue (GET /api/library/doc-pages). Any other text: a collaborator that holds it gets a 301 (link policy, doc-home.js), else
// its public text renders here, TEXT_PAGE paragraphs a page (/doc/<slug>/<n>). This module decides and builds the article;
// the page around it (Anís chrome, head, the library reader's look) is src/pages/doc/[...path].astro, edge-cached like /media.
import { esc, plain, titleFrom, ORIGIN } from './share.js';
import { askLink } from './content-widget.js';
import { PREVIEW_PARAGRAPHS } from '../../api/lib/rights/preview.js';
import { docPageSlug, docIdFromSlug } from '../../api/lib/library/doc-slug.js';
import { oceanoflightsUrl, inventoryUrl } from '../../api/lib/source-links.js';
import { collaboratorUrl } from '../../api/lib/library/doc-home.js';

export { docPageSlug, docPageUrl, docPagePath, docIdFromSlug } from '../../api/lib/library/doc-slug.js';
export const DOC_PATH = /^\/doc(?:\/(books|tablets)(?:\/(\d{1,4}))?|\/([a-z0-9][a-z0-9-]{0,200})(?:\/(\d{1,5}))?)?\/?$/;
export const PAGE_SIZE = 200;
export const TEXT_PAGE = 200;   // paragraphs on one page of a plain text (/doc/<slug>/<n>)
export const SBS_LIMIT = 300;   // paragraphs on one side-by-side page; a longer text links on to its full home
const RTL = new Set(['ar', 'fa', 'he', 'ur']);
const LANG = { ar: 'Arabic', fa: 'Persian', he: 'Hebrew', ur: 'Urdu', en: 'English' };
const SECTION = { books: { title: 'Book openings', kicker: 'Copyrighted books', blurb: 'The opening pages of books still under copyright, with where to find the whole book.' },
  tablets: { title: 'Originals with their translation', kicker: 'Side by side', blurb: 'Persian and Arabic originals beside their English translation, sentence by sentence.' } };
const ask = (d) => `Tell me about “${d.title}”${d.author ? ` by ${d.author}` : ''}: what is it, and what does it teach?`;
const meta = (m) => { try { return typeof m === 'string' ? JSON.parse(m) : (m || {}); } catch { return {}; } };
const SITES = [[/oceanlibrary\.com/, 'The English in the Ocean Library'], [/oceanoflights\.org/, 'On Ocean of Lights'], [/PI_browser|portlandiator/, 'The English in the Partial Inventory'],
  [/bahai-library\.com/, 'On Bahá’í Library Online']];
const siteLabel = (u) => SITES.find(([re]) => re.test(u))?.[1] || 'Its source';
const md = (s) => esc(String(s || '').replace(/<!--[\s\S]*?-->/g, '')).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

// a page's head facts and its article; the Astro page renders the rest
const page = (o, body) => ({ ...o, body });
const person = (name) => (name ? { '@type': 'Person', name } : undefined);
const byline = (d) => [d.author, d.collection].filter(Boolean).map(esc).join(' · ');
const pid = (p) => (Number.isInteger(p.paragraph_index) ? ` id="p${p.paragraph_index}"` : '');
const paraHtml = (ps) => ps.map((p) => (p.blocktype === 'heading' || (p.heading && !p.text) ? `<h2${pid(p)}>${md(p.text || p.heading)}</h2>` : `<p${pid(p)}>${md(p.text)}</p>`)).join('\n');
const cta = (d) => `<aside class="cta" aria-label="Ask"><p>A question about this text?</p>${askLink('Ask Anís about this text', ask(d), 'btn')}</aside>`;

/** A copyrighted book's opening: at most PREVIEW_PARAGRAPHS paragraphs, whatever the API returned, then where to get the book. */
export function openingPage(doc, paragraphs) {
  const slug = docPageSlug(doc), url = `${ORIGIN}/doc/${slug}`, m = meta(doc.metadata);
  const shown = (paragraphs || []).slice(0, PREVIEW_PARAGRAPHS);
  const publisher = doc.publisher || m.publicationName || m.publisher || null;
  const description = doc.description ? titleFrom(plain(doc.description), 160) : `The opening pages of ${doc.title}${doc.author ? ` by ${doc.author}` : ''}.`;
  const ld = { '@context': 'https://schema.org', '@type': 'Book', '@id': url, url, name: doc.title, author: person(doc.author), inLanguage: doc.language || 'en',
    ...(doc.year ? { datePublished: String(doc.year) } : {}), ...(publisher ? { publisher: { '@type': 'Organization', name: publisher } } : {}),
    ...(doc.description ? { description: plain(doc.description) } : {}), ...(doc.purchase_url ? { offers: { '@type': 'Offer', url: doc.purchase_url } } : {}),
    isAccessibleForFree: false, hasPart: { '@type': 'WebPageElement', isAccessibleForFree: true, cssSelector: '.text' } };
  const body = paraHtml(shown);
  const get = doc.purchase_url ? `<p><a href="${esc(doc.purchase_url)}" rel="nofollow noopener">Get the whole book</a>${publisher ? ` (published by ${esc(publisher)})` : ''}.</p>`
    : publisher ? `<p>The whole book is published by ${esc(publisher)}.</p>` : '';
  return page({ type: 'book', title: `${doc.title}${doc.author ? ` — ${doc.author}` : ''} (opening pages)`, description, url, ld, text: { type: 'text', slug, title: doc.title } }, `<article>
<p class="crumb"><a href="/doc/books">Book openings</a></p>
<p class="kicker">The opening pages</p>
<h1>${esc(doc.title)}</h1>
${byline(doc) ? `<p class="meta">${byline(doc)}${doc.year ? ` · ${esc(doc.year)}` : ''}</p>` : ''}
${doc.description ? `<p class="summary">${md(doc.description)}</p>` : ''}
<hr class="rule">
<div class="text" data-preview="${shown.length}">
${body}
</div>
<div class="ends"><p>This book is under copyright, so only its opening pages are shown here.</p>${get}</div>
</article>
${cta(doc)}`);
}

/** A text no collaborator holds: its public text, TEXT_PAGE paragraphs a page. `total` = the doc's paragraph count. */
export function textPage(doc, paragraphs, { n = 1, total = 0 } = {}) {
  const slug = docPageSlug(doc), at = (k) => `/doc/${slug}${k > 1 ? `/${k}` : ''}`, url = ORIGIN + at(n);
  const pages = Math.max(1, Math.ceil(total / TEXT_PAGE)), shown = (paragraphs || []).slice(0, TEXT_PAGE);
  const first = shown.map((p) => p.text).filter(Boolean).join(' ');
  const description = doc.description ? titleFrom(plain(doc.description), 160) : titleFrom(first || doc.title, 160);
  const ld = { '@context': 'https://schema.org', '@type': 'CreativeWork', '@id': ORIGIN + at(1), url, name: doc.title, author: person(doc.author), inLanguage: doc.language || 'en',
    ...(doc.year ? { datePublished: String(doc.year) } : {}), ...(doc.collection ? { isPartOf: { '@type': 'Collection', name: doc.collection } } : {}), isAccessibleForFree: true, description };
  const lang = doc.language || 'en', dir = RTL.has(lang) ? 'rtl' : 'ltr';
  return page({ type: 'article', title: `${doc.title}${doc.author ? ` — ${doc.author}` : ''}${n > 1 ? ` (page ${n})` : ''}`, description, url, ld, text: { type: 'text', slug, title: doc.title } }, `<article>
<p class="crumb"><a href="/doc">All texts</a></p>
<h1>${esc(doc.title)}</h1>
${byline(doc) ? `<p class="meta">${byline(doc)}${doc.year ? ` · ${esc(doc.year)}` : ''}</p>` : ''}
${doc.description && n === 1 ? `<p class="summary">${md(doc.description)}</p>` : ''}
<hr class="rule">
<div class="text" lang="${esc(lang)}" dir="${dir}">
${paraHtml(shown)}
</div>
${pages > 1 ? `<nav class="pager" aria-label="Pages">${n > 1 ? `<a href="${at(n - 1)}" rel="prev">Previous</a>` : ''}<span class="meta">Page ${n} of ${pages}</span>${n < pages ? `<a href="${at(n + 1)}" rel="next">Next</a>` : ''}</nav>` : ''}
</article>
${cta(doc)}`);
}

/** An original beside its English, sentence row by sentence row; rows highlight on hover and on tap (focus). */
export function sbsPage(doc, sbs) {
  const slug = docPageSlug(doc), url = `${ORIGIN}/doc/${slug}`, m = meta(doc.metadata);
  const lang = sbs.doc?.language || 'ar', dir = RTL.has(lang) ? 'rtl' : 'ltr', langName = LANG[lang] || lang;
  const paras = (sbs.paragraphs || []).slice(0, SBS_LIMIT);
  const english = paras.flatMap((p) => p.rows.map((r) => r.t)).filter(Boolean).join(' ');
  const description = doc.description ? titleFrom(plain(doc.description), 160) : titleFrom(`${langName} original beside the English: ${english}`, 160);
  const home = collaboratorUrl({ ...doc, source_url: doc.source_url || sbs.doc?.source_url || null });
  const links = [
    m.bookid && [oceanoflightsUrl(m.bookid), `The ${langName} original on Ocean of Lights`],
    home && [home, siteLabel(home)],
    m.pin && [inventoryUrl(m.pin), 'This tablet in the Partial Inventory'],
  ].filter(Boolean).filter(([u], i, a) => a.findIndex(([v]) => v === u) === i);
  const ld = { '@context': 'https://schema.org', '@type': 'CreativeWork', '@id': url, url, name: doc.title, author: person(doc.author), inLanguage: [lang, 'en'],
    ...(sbs.doc?.translator ? { translator: person(sbs.doc.translator) } : {}), ...(doc.collection ? { isPartOf: { '@type': 'Collection', name: doc.collection } } : {}),
    ...(links.length ? { sameAs: links.map(([u]) => u) } : {}), description };
  const row = (r) => `<div class="row" tabindex="0"><p class="o" lang="${esc(lang)}" dir="${dir}">${esc(r.o)}</p><p class="t" lang="en">${esc(r.t)}</p></div>`;
  const body = paras.map((p) => (p.kind === 'heading'
    ? `<section class="par" id="p${p.n}"><h2 lang="${esc(lang)}" dir="${dir}">${esc(p.rows[0]?.o || '')}</h2></section>`
    : `<section class="par" id="p${p.n}"><p class="n">${p.n}</p>${p.rows.map(row).join('')}</section>`)).join('\n');
  const more = sbs.next_offset != null || (sbs.paragraphs || []).length > SBS_LIMIT;
  return page({ type: 'article', wide: true, title: `${doc.title}${doc.author ? ` — ${doc.author}` : ''} (${langName} and English)`, description, url, ld, text: { type: 'text', slug, title: doc.title } }, `<article>
<p class="crumb"><a href="/doc/tablets">Originals with their translation</a></p>
<p class="kicker">${esc(langName)} original · English translation</p>
<h1>${esc(doc.title)}</h1>
<p class="meta">${[doc.author && esc(doc.author), sbs.doc?.translator && `translated by ${esc(sbs.doc.translator)}`, doc.collection && esc(doc.collection)].filter(Boolean).join(' · ')}</p>
${links.length ? `<ul class="links">${links.map(([u, t]) => `<li><a href="${esc(u)}">${esc(t)}</a></li>`).join('')}</ul>` : ''}
<hr class="rule">
<div class="cols" aria-hidden="true"><span class="th">English</span><span class="oh">${esc(langName)}</span></div>
<div class="sbs">
${body}
</div>
${more ? `<div class="ends"><p>The text continues beyond these ${paras.length} paragraphs.</p>${links[0] ? `<p><a href="${esc(links[0][0])}">${esc(links[0][1])}</a></p>` : ''}</div>` : ''}
</article>
${cta(doc)}`);
}

const item = (d, kind) => `<li><h3><a href="/doc/${esc(d.slug)}">${esc(d.title)}</a></h3><p>${[d.author && esc(d.author), kind === 'tablets' && d.language && esc(LANG[d.language] || d.language), d.collection && esc(d.collection)].filter(Boolean).join(' · ')}</p></li>`;
const listLd = (url, name, description, rows) => ({ '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': url, url, name, description,
  mainEntity: { '@type': 'ItemList', itemListElement: rows.map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/doc/${d.slug}`, name: d.title })) } });

/** /doc: both kinds, the first few of each, with links to the full lists. */
export function docIndexPage(cat) {
  const url = `${ORIGIN}/doc`, books = cat?.books || [], tablets = cat?.tablets || [];
  const description = 'Texts found nowhere else: the opening pages of books under copyright, and Persian and Arabic originals beside their English translation, sentence by sentence.';
  const sec = (kind, rows) => `<section class="sec" aria-labelledby="h-${kind}"><p class="kicker">${SECTION[kind].kicker}</p><h2 id="h-${kind}">${SECTION[kind].title}</h2>
<p class="meta">${esc(SECTION[kind].blurb)}</p>
${rows.length ? `<ul class="list">${rows.slice(0, 12).map((d) => item(d, kind)).join('')}</ul><a class="more" href="/doc/${kind}">All ${rows.length.toLocaleString('en-US')} ${kind === 'books' ? 'books' : 'texts'}</a>` : '<p class="meta">None yet.</p>'}</section>`;
  return page({ type: 'website', title: 'Texts from the Ocean library — Anís', description, url, ld: listLd(url, 'Texts from the Ocean library', description, [...books.slice(0, 12), ...tablets.slice(0, 12)]) }, `<p class="kicker">The library</p>
<h1>Texts from the Ocean library</h1>
<p class="summary">${esc(description)}</p>
${sec('tablets', tablets)}
${sec('books', books)}
<aside class="cta" aria-label="Ask"><p>Looking for something else?</p><a class="btn" href="/">Ask Anís</a></aside>`);
}

/** /doc/books, /doc/tablets[/<n>]: one kind, PAGE_SIZE per page (null past the end). */
export function docListPage(cat, kind, n = 1) {
  const rows = cat?.[kind] || [], pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (!Number.isInteger(n) || n < 1 || n > pages) return null;
  const path = `/doc/${kind}${n > 1 ? `/${n}` : ''}`, url = ORIGIN + path, s = SECTION[kind], part = rows.slice((n - 1) * PAGE_SIZE, n * PAGE_SIZE);
  const at = (k) => `/doc/${kind}${k > 1 ? `/${k}` : ''}`;
  return page({ type: 'website', title: `${s.title}${n > 1 ? ` (page ${n})` : ''} — Anís`, description: s.blurb, url, ld: listLd(url, s.title, s.blurb, part) }, `<p class="crumb"><a href="/doc">All texts</a></p>
<p class="kicker">${s.kicker}</p>
<h1>${s.title}</h1>
<p class="summary">${esc(s.blurb)}</p>
<ul class="list">${part.map((d) => item(d, kind)).join('')}</ul>
${pages > 1 ? `<nav class="pager" aria-label="Pages">${n > 1 ? `<a href="${at(n - 1)}" rel="prev">Previous</a>` : ''}<span class="meta">Page ${n} of ${pages}</span>${n < pages ? `<a href="${at(n + 1)}" rel="next">Next</a>` : ''}</nav>` : ''}`);
}

export const docNotFound = () => page({ type: 'website', title: 'Text not found — Anís', description: 'This text is not available.', url: `${ORIGIN}/doc`, noindex: true },
  `<p class="kicker">Not found</p><h1>This text is not available</h1><p class="summary">It may have been moved or withdrawn.</p>
<aside class="cta" aria-label="Browse"><a class="btn" href="/doc">See all texts</a></aside>`);

const ok = (view) => ({ status: 200, view });
const notFound = () => ({ status: 404, view: docNotFound() });
const movedTo = (location) => ({ status: 301, location });
const moved = (path) => movedTo(ORIGIN + path);
const read = async (fetchFn, path) => {
  const r = await fetchFn(path, { headers: { accept: 'application/json' } });   // anonymous: the public window, never a staff read
  if ([400, 403, 404].includes(r.status)) return { missing: true, status: r.status };
  if (!r.ok) throw new Error(`origin ${r.status}`);
  return { data: await r.json() };
};
const catalogue = async (api, fetchFn) => { const { data } = await read(fetchFn, `${api}/api/library/doc-pages`); if (!data) throw new Error("no catalogue"); return data; };
const hasEnglish = (sbs) => (sbs?.paragraphs || []).some((p) => p.rows?.some((r) => r.t && r.o));

/** GET /doc[/books|/tablets[/<n>]|/<slug>] → { status: 200|404, view } | { status: 301, location } | { status: 503 }.
 *  `m` = DOC_PATH's match; `api` = the tower origin. A view = { type, title, description, url, ld, text, wide, noindex, body }. */
export async function docView(m, { api, fetchFn = fetch }) {
  try {
    const [, kind, n, slug, pn] = m;
    if (kind) { const v = docListPage(await catalogue(api, fetchFn), kind, n ? Number(n) : 1); return v ? ok(v) : notFound(); }
    if (!slug) return ok(docIndexPage(await catalogue(api, fetchFn)));
    const id = docIdFromSlug(slug), at = pn ? Number(pn) : 1;
    if (!id || at < 1) return notFound();
    const { data, missing } = await read(fetchFn, `${api}/api/library/documents/${id}?paragraphLimit=${TEXT_PAGE}&paragraphOffset=${(at - 1) * TEXT_PAGE}`);
    const doc = missing ? null : data?.document;
    if (!doc?.title) return notFound();
    const d = { ...doc, id }, canonical = docPageSlug(d), path = `/doc/${canonical}${at > 1 ? `/${at}` : ''}`;
    const here = (v) => (slug !== canonical || (pn && at === 1) ? moved(path) : ok(v));
    // 1. an original beside its English: found nowhere else, so it stays here even when a collaborator holds the text
    if (Number(doc.encumbered) !== 1) {
      const s = await read(fetchFn, `${api}/api/library/documents/${id}/sbs?cached=true&limit=${SBS_LIMIT}`);
      if (hasEnglish(s.data)) return at > 1 ? notFound() : here(sbsPage(d, s.data));
    }
    // 2. a collaborator holds it → there (Chad 11-14: collaborator sites first)
    const away = collaboratorUrl(d);
    if (away) return movedTo(away);
    // 3. a copyrighted book: its permitted opening; 4. anything else: its public text, page by page
    if (Number(doc.encumbered) === 1) return at > 1 ? notFound() : here(openingPage(d, data.paragraphs));
    if (at > 1 && !(data.paragraphs || []).length) return notFound();
    return here(textPage(d, data.paragraphs, { n: at, total: data.paragraphTotal ?? doc.paragraph_count ?? 0 }));
  } catch {
    return { status: 503 };
  }
}

/** The host's sitemap entries for /doc (index, list pages, every text); [] when the catalogue cannot be read. */
export async function docSitemapUrls({ api, fetchFn = fetch }) {
  try {
    const cat = await catalogue(api, fetchFn);
    if (!cat) return [];
    const lists = ['books', 'tablets'].flatMap((k) => Array.from({ length: Math.max(1, Math.ceil((cat[k] || []).length / PAGE_SIZE)) }, (_, i) => ({ loc: `${ORIGIN}/doc/${k}${i ? `/${i + 1}` : ''}`, changefreq: 'weekly' })));
    const docs = [...(cat.books || []), ...(cat.tablets || [])].filter((d) => d?.slug).map((d) => ({ loc: `${ORIGIN}/doc/${d.slug}`, ...(d.updated ? { lastmod: d.updated } : {}) }));
    return [{ loc: `${ORIGIN}/doc`, changefreq: 'weekly' }, ...lists, ...docs];
  } catch { return []; }
}
