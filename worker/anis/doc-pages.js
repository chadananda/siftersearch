// Unique library texts on the Anís host (Chad 11-14): anis.oceanlibrary.com/doc/<slug>. A copyrighted book shows its permitted
// opening only (api/lib/rights/preview.js — the same ceiling the library reader enforces, clamped here again); an original
// tablet shows its Persian/Arabic beside the English, row by row (/api/library/documents/:id/sbs?cached=true: stored
// alignments only, so a crawler never buys one). Index /doc (+ /doc/books, /doc/tablets[/<page>]) from the reports-built
// catalogue (GET /api/library/doc-pages). Look and head: share.js. Edge-cached by the site Worker; producer contract {res, tainted}.
import { esc, plain, head, TOP, titleFrom, ORIGIN } from './share.js';
import { widgetEmbed, askLink } from './content-widget.js';
import { PREVIEW_PARAGRAPHS } from '../../api/lib/rights/preview.js';
import { docPageSlug, docIdFromSlug } from '../../api/lib/library/doc-slug.js';
import { workUrl, oceanoflightsUrl, inventoryUrl } from '../../api/lib/source-links.js';

export { docPageSlug, docPageUrl, docPagePath, docIdFromSlug } from '../../api/lib/library/doc-slug.js';
export const DOC_PATH = /^\/doc(?:\/(books|tablets)(?:\/(\d{1,4}))?|\/([a-z0-9][a-z0-9-]{0,200}))?\/?$/;
export const PAGE_SIZE = 200;
export const SBS_LIMIT = 300;   // paragraphs on one side-by-side page; a longer text links on to its full home
const RTL = new Set(['ar', 'fa', 'he', 'ur']);
const LANG = { ar: 'Arabic', fa: 'Persian', he: 'Hebrew', ur: 'Urdu', en: 'English' };
const SECTION = { books: { title: 'Book openings', kicker: 'Copyrighted books', blurb: 'The opening pages of books still under copyright, with where to find the whole book.' },
  tablets: { title: 'Originals with their translation', kicker: 'Side by side', blurb: 'Persian and Arabic originals beside their English translation, sentence by sentence.' } };
const ask = (d) => `Tell me about “${d.title}”${d.author ? ` by ${d.author}` : ''}: what is it, and what does it teach?`;
const meta = (m) => { try { return typeof m === 'string' ? JSON.parse(m) : (m || {}); } catch { return {}; } };
// the collaborator page that holds this text, by the link policy's order; never this library's own reader
const homeOf = (doc) => { const u = workUrl({ ...doc, id: doc.id }); return u && !/siftersearch\.com/.test(u) ? u : null; };
const SITES = [[/oceanlibrary\.com/, 'The English in the Ocean Library'], [/oceanoflights\.org/, 'On Ocean of Lights'], [/PI_browser|portlandiator/, 'The English in the Partial Inventory'],
  [/bahai-library\.com/, 'On Bahá’í Library Online']];
const siteLabel = (u) => SITES.find(([re]) => re.test(u))?.[1] || 'Its source';
const md = (s) => esc(String(s || '').replace(/<!--[\s\S]*?-->/g, '')).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

const CSS = `main.wide{max-width:72rem}
.crumb{margin:0 0 10px;font:14px/1.4 var(--sans)}.crumb a{display:inline-flex;align-items:center;min-height:48px}
.links{margin:18px 0 0;padding:0;list-style:none;font:15px/1.5 var(--sans)}.links li{margin:6px 0}
.text{margin:8px 0 0}.text p{margin:0 0 1em}.text h2{margin:1.6em 0 .5em;font:600 21px/1.35 var(--serif)}
.ends{margin:28px 0 0;padding:18px 22px;border:1px solid var(--line);border-left:2px solid var(--gold);border-radius:4px 12px 12px 4px;background:var(--card)}
.ends p{margin:0 0 .6em}.ends p:last-child{margin:0}
.sbs{margin:18px 0 0}
.par{margin:0;padding:10px 0;border-top:1px solid var(--line)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:6px 36px;margin:0 -10px;padding:6px 10px;border-radius:8px;outline:0}
.row:hover,.row:focus{background:var(--card);box-shadow:inset 2px 0 0 var(--gold)}
.row p{margin:0}.row .o{order:2}.row .t{order:1}
.o[dir=rtl]{font:21px/1.95 'Noto Naskh Arabic','Amiri','Scheherazade New','Geeza Pro','Traditional Arabic','Times New Roman',serif;text-align:right}
.par h2{margin:.6em 0 .2em;font:600 20px/1.5 var(--serif)}.par h2[dir=rtl]{font-family:'Noto Naskh Arabic','Amiri','Geeza Pro',serif;text-align:right}
.n{font:12px/1 var(--sans);color:var(--muted);margin:0 0 4px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin:24px 0 0;font:600 12px/1.2 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.cols .oh{order:2;text-align:right}
@media (max-width:760px){.row,.cols{grid-template-columns:1fr}.row .o,.row .t{order:0}.cols{display:none}.row .t{color:var(--muted)}}
.list{list-style:none;margin:20px 0 0;padding:0}
.list li{padding:14px 0;border-top:1px solid var(--line)}
.list h3{margin:0;font:600 19px/1.35 var(--serif)}.list h3 a{color:var(--ink);text-decoration:none}.list h3 a:hover{text-decoration:underline}
.list p{margin:4px 0 0;font:14px/1.4 var(--sans);color:var(--muted)}
.sec{margin:44px 0 0}.sec h2{margin:0;font:600 24px/1.3 var(--serif)}.sec .more{display:inline-flex;align-items:center;min-height:48px;font:15px/1 var(--sans)}
.pager{display:flex;gap:18px;margin:24px 0 0;font:15px/1 var(--sans)}.pager a{display:inline-flex;align-items:center;min-height:48px}`;
const FOOT = `<footer><div class="wrap"><p>A text from the Ocean library, presented by Anís, the Ocean AI Research Assistant of Ocean 2.0.</p><p>Books under copyright show their opening pages only. Read more in the <a href="https://oceanlibrary.com/">Ocean Library</a>.</p></div></footer>`;
const og = (o) => `<meta property="og:type" content="${o.type}">
<meta property="og:site_name" content="Ocean 2.0">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${o.url}">
<meta property="og:image" content="${ORIGIN}/anis-app/og-1200x630.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.title)}">
<meta name="twitter:description" content="${esc(o.description)}">
${o.ld ? `<script type="application/ld+json">${JSON.stringify(o.ld).replace(/</g, '\\u003c')}</script>\n` : ''}<style>${CSS}</style>
`;
const page = (o, main) => `${head({ title: o.title, description: o.description, canonical: o.url, extra: og(o) })}
<body>
${TOP}
<main class="wrap${o.wide ? ' wide' : ''}">
${main}
</main>
${FOOT}
${widgetEmbed(o.text)}
</body>
</html>`;
const person = (name) => (name ? { '@type': 'Person', name } : undefined);
const byline = (d) => [d.author, d.collection].filter(Boolean).map(esc).join(' · ');
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
  const body = shown.map((p) => (p.blocktype === 'heading' || (p.heading && !p.text) ? `<h2>${md(p.text || p.heading)}</h2>` : `<p>${md(p.text)}</p>`)).join('\n');
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

/** An original beside its English, sentence row by sentence row; rows highlight on hover and on tap (focus). */
export function sbsPage(doc, sbs) {
  const slug = docPageSlug(doc), url = `${ORIGIN}/doc/${slug}`, m = meta(doc.metadata);
  const lang = sbs.doc?.language || 'ar', dir = RTL.has(lang) ? 'rtl' : 'ltr', langName = LANG[lang] || lang;
  const paras = (sbs.paragraphs || []).slice(0, SBS_LIMIT);
  const english = paras.flatMap((p) => p.rows.map((r) => r.t)).filter(Boolean).join(' ');
  const description = doc.description ? titleFrom(plain(doc.description), 160) : titleFrom(`${langName} original beside the English: ${english}`, 160);
  const home = homeOf({ ...doc, source_url: doc.source_url || sbs.doc?.source_url || null });
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

export const docNotFound = () => page({ type: 'website', title: 'Text not found — Anís', description: 'This text is not available.', url: `${ORIGIN}/doc` },
  `<p class="kicker">Not found</p><h1>This text is not available</h1><p class="summary">It may have been moved or withdrawn.</p>
<aside class="cta" aria-label="Browse"><a class="btn" href="/doc">See all texts</a></aside>`).replace(/<link rel="canonical"[^>]*>/, '<meta name="robots" content="noindex">');

const HTML = { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' };
const ok = (html) => ({ res: new Response(html, { status: 200, headers: { ...HTML, 'cache-control': 'public, max-age=300' } }), tainted: false });
const notFound = () => ({ res: new Response(docNotFound(), { status: 404, headers: { ...HTML, 'cache-control': 'no-store' } }), tainted: false });
const moved = (path) => ({ res: new Response(null, { status: 301, headers: { location: ORIGIN + path, 'cache-control': 'public, max-age=3600' } }), tainted: false });
const read = async (fetchFn, path) => {
  const r = await fetchFn(path, { headers: { accept: 'application/json' } });   // anonymous: the public window, never a staff read
  if ([400, 403, 404].includes(r.status)) return { missing: true, status: r.status };
  if (!r.ok) throw new Error(`origin ${r.status}`);
  return { data: await r.json() };
};
const catalogue = async (api, fetchFn) => { const { data } = await read(fetchFn, `${api}/api/library/doc-pages`); if (!data) throw new Error("no catalogue"); return data; };
const hasEnglish = (sbs) => (sbs?.paragraphs || []).some((p) => p.rows?.some((r) => r.t && r.o));

/** GET /doc[/books|/tablets[/<n>]|/<slug>] → { res, tainted }. `m` = DOC_PATH's match; `api` = the tower origin. */
export async function docResponse(m, { api, fetchFn = fetch }) {
  try {
    const [, kind, n, slug] = m;
    if (kind) { const html = docListPage(await catalogue(api, fetchFn), kind, n ? Number(n) : 1); return html ? ok(html) : notFound(); }
    if (!slug) return ok(docIndexPage(await catalogue(api, fetchFn)));
    const id = docIdFromSlug(slug);
    if (!id) return notFound();
    const { data, missing } = await read(fetchFn, `${api}/api/library/documents/${id}?paragraphLimit=${PREVIEW_PARAGRAPHS}`);
    const doc = missing ? null : data?.document;
    if (!doc?.title) return notFound();
    const canonical = docPageSlug({ ...doc, id });
    if (slug !== canonical) return moved(`/doc/${canonical}`);
    const d = { ...doc, id };
    if (Number(doc.encumbered) === 1) return ok(openingPage(d, data.paragraphs));
    const s = await read(fetchFn, `${api}/api/library/documents/${id}/sbs?cached=true&limit=${SBS_LIMIT}`);
    return hasEnglish(s.data) ? ok(sbsPage(d, s.data)) : notFound();
  } catch {
    return { res: new Response('This text is briefly unavailable. Please try again in a moment.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '30' } }), tainted: true };
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
