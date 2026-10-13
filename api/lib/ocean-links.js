// Every OceanLibrary paragraph link we hand out becomes a RANGE link (Chad 2026-10-09: "ensure we do this wherever links
// are generated — it's a much nicer user experience"). Links are built in ~30 places (search, public API, entity/graph
// API, chat, Anís, notes, bios); instead of threading the block id / book id / text through every query, this resolves
// any "https://oceanlibrary.com/<slug>/?paraId=para_N" at the OUTPUT boundary with one batched lookup and rewrites it to
// "?paraId=para_N&selectionString=<ilmid>.0~<ilmid>.<end>" (the whole paragraph highlighted; lib/ocean-range.js). A link
// that already carries a selection, or whose paragraph lacks a stored block id, is left as it is.
// Ocean of Lights (Chad 10-12): "oceanoflights.org/<page>/#~d=<doc>~q=<quote>" → "#(start)(end)" from our stored copy of
// that page (lib/ool-range.js); not placeable → a browser text fragment.
// Deps: db (read), docs-repo, ocean-range, ool-range.
import { queryAll } from './db.js';
import { rangeUrl, quoteUrl } from './ocean-range.js';
import { plainText, oolQuoteUrl, locateQuote, encodeMarker } from './ool-range.js';

// slug is the first path segment; the paragraph id is para_N or a footnote/fn id. A producer that knows the quoted words
// appends the private marker "#~q=<encoded quote>" (source-hunt textFragment) → the range covers just those words.
export const OCEAN_PARA_URL = /https:\/\/(?:www\.)?oceanlibrary\.com\/([^/?#\s"'<>)\]]+)\/?\?paraId=([A-Za-z0-9_.-]+)(?![^\s"'<>)\]]*selectionString=)(?:#~q=([^\s"'<>)\]]+))?/g;
export const oceanQuoteMarker = (url, quote) => (quote ? `${url}#~q=${encodeMarker(quote)}` : url);

const cache = new Map();          // `${slug}|${para}` → { external_id, ilm, text } or null (no anchors)
const CACHE_MAX = 50000;

/** Resolve [slug, para] pairs to their range links (batched; cached). */
async function resolve(pairs) {
  const todo = pairs.filter(([s, p]) => !cache.has(`${s}|${p}`));
  for (let i = 0; i < todo.length; i += 200) {
    const chunk = todo.slice(i, i + 200);
    const rows = await queryAll(
      `SELECT d.source_url, d.external_id, c.external_para_id pid, c.text, c.block_attrs
         FROM content c JOIN docs d ON d.id = c.doc_id
        WHERE c.deleted_at IS NULL AND d.deleted_at IS NULL AND d.source_site = 'oceanlibrary.com'
          AND (${chunk.map(() => '(d.source_url IN (?, ?) AND c.external_para_id = ?)').join(' OR ')})`,
      chunk.flatMap(([s, p]) => [`https://oceanlibrary.com/${s}`, `https://oceanlibrary.com/${s}/`, p]), 'ocean-links:resolve');
    const found = new Map(rows.map((r) => [`${String(r.source_url).replace(/\/$/, '').split('/').pop()}|${r.pid}`, r]));
    for (const [s, p] of chunk) {
      const r = found.get(`${s}|${p}`);
      let ilm = null;
      try { ilm = r ? JSON.parse(r.block_attrs || '{}').ilm_id : null; } catch { /* no anchors */ }
      cache.set(`${s}|${p}`, r && ilm && r.external_id ? { external_id: r.external_id, ilm, text: r.text } : null);
    }
  }
  if (cache.size > CACHE_MAX) for (const k of [...cache.keys()].slice(0, cache.size - CACHE_MAX)) cache.delete(k);
}

// ── Ocean of Lights ──
// Marker "oceanoflights.org/<page>/#~d=<docId>~q=<quote>": the page IS one of our documents (Core Tablets are ingested from
// Ocean of Lights, one doc per page), so the shortest phrases are computed from OUR stored copy — no request to their
// site (Chad 10-12). No doc id / quote not placed → a browser text fragment.
export const OOL_QUOTE_URL = /https:\/\/(?:www\.)?oceanoflights\.org\/([^?#\s"'<>)\]]+?)\/?#(?:~d=(\d+))?~q=([^\s"'<>)\]]+)/g;
const docs = new Map();           // doc id → { at, text|null }
const DOC_TTL_MS = 3600 * 1000, DOCS_MAX = 2000;
async function docText(id, loadParagraphs) {
  const hit = docs.get(id);
  if (hit && Date.now() - hit.at < DOC_TTL_MS) return hit.text;
  let text = null;
  try {
    const rows = await (loadParagraphs || (await import('./docs-repo.js')).getParagraphs)(id, { proseOnly: false });
    text = rows.length ? rows.map((r) => plainText(r.text)).join(' ') : null;
  } catch { /* unreadable: fall back */ }
  docs.set(id, { at: Date.now(), text });
  if (docs.size > DOCS_MAX) docs.delete(docs.keys().next().value);
  return text;
}
/** A browser text fragment for `quote` (first and last four words) — the fallback when the range can't be placed. */
export function textFragmentUrl(url, quote) {
  const words = plainText(quote).split(/\s+/).filter(Boolean);
  if (!words.length) return url;
  const enc = (ws) => encodeURIComponent(ws.join(' ').replace(/^[“"‘'(«]+|[”"’')»,.;:!?]+$/g, '')).replace(/-/g, '%2D').replace(/,/g, '%2C').replace(/&/g, '%26');
  return `${url}#:~:text=${words.length <= 8 ? enc(words) : `${enc(words.slice(0, 4))},${enc(words.slice(-4))}`}`;
}
async function upgradeOolLinks(s, loadParagraphs) {
  const found = [...s.matchAll(OOL_QUOTE_URL)];
  if (!found.length) return s;
  const ids = [...new Set(found.map((m) => m[2]).filter(Boolean))];
  const text = new Map(await Promise.all(ids.map(async (id) => [id, await docText(Number(id), loadParagraphs)])));
  // a time budget per response: past it, the remaining links get text fragments (never block the event loop for long)
  const t0 = Date.now(), BUDGET_MS = 1500;
  return s.replace(OOL_QUOTE_URL, (whole, slug, id, q) => {
    const url = `https://oceanoflights.org/${slug}/`;
    let quote = null;
    try { quote = decodeURIComponent(q); } catch { return url; }
    const ranged = id && Date.now() - t0 < BUDGET_MS ? oolQuoteUrl(url, text.get(id), quote) : null;
    return ranged || textFragmentUrl(url, quote);
  });
}

// ── OceanLibrary book-level link + quote ──
// "oceanlibrary.com/<slug>#~q=<quote>": the passage came from a copy without OceanLibrary paragraph ids (our main-library
// Gleanings), but the quote is known → find it in OUR copy of that OceanLibrary book and range-link that paragraph.
export const OCEAN_BOOK_QUOTE = /https:\/\/(?:www\.)?oceanlibrary\.com\/([^/?#\s"'<>)\]]+)\/?#~q=([^\s"'<>)\]]+)/g;
const books = new Map();          // slug → { at, doc, rows } | { at, doc: null }
async function olBook(slug, repo) {
  const hit = books.get(slug);
  if (hit && Date.now() - hit.at < DOC_TTL_MS) return hit;
  let entry = { at: Date.now(), doc: null, rows: [] };
  try {
    const r = repo || await import('./docs-repo.js');
    const urls = [`https://oceanlibrary.com/${slug}`, `https://oceanlibrary.com/${slug}/`];
    // several docs can share the URL (Core Publications' Gleanings 8312 and the OceanLibrary copy 20783): the one with the
    // OceanLibrary book id is the site copy whose rows carry paraId + block ids
    const { docs: found } = await r.listDocs({ sourceSite: 'oceanlibrary.com', sourceUrls: urls, fields: ['id', 'external_id'], limit: 10 });
    const site = found.find((d) => d.external_id);
    if (site) entry = { at: Date.now(), doc: site, rows: await r.getParagraphs(site.id, { proseOnly: false }) };
  } catch { /* unreadable: book link stays */ }
  books.set(slug, entry);
  if (books.size > DOCS_MAX) books.delete(books.keys().next().value);
  return entry;
}
async function upgradeOlBookLinks(s, repo) {
  const found = [...s.matchAll(OCEAN_BOOK_QUOTE)];
  if (!found.length) return s;
  const slugs = [...new Set(found.map((m) => decodeURIComponent(m[1])))];
  const book = new Map(await Promise.all(slugs.map(async (sl) => [sl, await olBook(sl, repo)])));
  return s.replace(OCEAN_BOOK_QUOTE, (whole, slug, q) => {
    const base = `https://oceanlibrary.com/${slug}`;
    let quote = null;
    try { quote = decodeURIComponent(q); } catch { return base; }
    const b = book.get(decodeURIComponent(slug));
    // the quote's opening words find its paragraph (a quote may run past it); fewer words when the copies differ inside it
    // (10-12: our Divine Philosophy has "knowledge (irfán)84", the site copy prints the note differently)
    const words = plainText(quote).split(/\s+/).filter(Boolean);
    let r = null;
    for (const n of [12, 8, 5]) {
      const head = words.slice(0, n).join(' ');
      r = b?.doc && b.rows.find((x) => x.external_para_id && x.text && locateQuote(x.text, head));
      if (r || words.length <= n) break;
    }
    if (!r) return base;
    let ilm = null;
    try { ilm = JSON.parse(r.block_attrs || '{}').ilm_id; } catch { /* no anchors */ }
    const p = { para_id: r.external_para_id, ilm_id: ilm, text: r.text };
    return (ilm && (quoteUrl(base, b.doc.external_id, p, quote) || rangeUrl(base, b.doc.external_id, p))) || `${base}/?paraId=${r.external_para_id}`;
  });
}

/** Rewrite every plain OceanLibrary paragraph link (and Ocean of Lights quote marker) inside a string. */
export async function upgradeOceanLinks(text, { loadParagraphs, repo } = {}) {
  let s = String(text ?? '');
  if (s.includes('oceanoflights.org') && s.includes('~q=')) s = await upgradeOolLinks(s, loadParagraphs);
  if (!s.includes('oceanlibrary.com')) return dropMarkers(s);
  if (s.includes('~q=')) s = await upgradeOlBookLinks(s, repo);
  const pairs = [...s.matchAll(OCEAN_PARA_URL)].map((m) => [decodeURIComponent(m[1]), m[2]]);
  if (!pairs.length) return dropMarkers(s);
  await resolve(pairs);
  return dropMarkers(s.replace(OCEAN_PARA_URL, (whole, slug, para, q) => {
    const a = cache.get(`${decodeURIComponent(slug)}|${para}`);
    const plain = whole.replace(/#~q=.*$/, '');                       // the private marker never leaves un-upgraded
    if (!a) return plain;
    const base = `https://oceanlibrary.com/${slug}`, p = { para_id: para, ilm_id: a.ilm, text: a.text };
    let quote = null;
    try { quote = q ? decodeURIComponent(q) : null; } catch { /* malformed marker: whole paragraph */ }
    return (quote && quoteUrl(base, a.external_id, p, quote)) || rangeUrl(base, a.external_id, p) || plain;
  }));
}

/** A single link narrowed to the quoted words, when the caller knows them. */
export const oceanQuoteUrl = (url, quote) => upgradeOceanLinks(oceanQuoteMarker(url, quote));

// The last line of defence: a private marker never reaches a reader, whatever shape the link took (10-12: a
// "…selectionString=…#~q=…" link leaked and OceanLibrary's router echoed it into "?~q=").
const dropMarkers = (s) => String(s).replace(/#~(?:d=\d+~)?q=[^\s"'<>)\]]*/g, '');

/** Does this payload carry a link the upgrade rewrites? (cheap gate for every response) */
export const needsUpgrade = (s) => (s.includes('oceanlibrary.com') && (s.includes('paraId=') || s.includes('~q='))) || (s.includes('oceanoflights.org') && s.includes('~q='));

/** An SSE event sender that writes in order and upgrades OceanLibrary links in each event (sources, done, citations).
 *  Streamed answer text needs nothing more: its links come from citation URLs already upgraded before the model ran. */
export function rangeLinkSender(write) {
  let chain = Promise.resolve();
  const send = (data) => {
    const json = JSON.stringify(data);
    chain = chain.then(async () => {
      const out = needsUpgrade(json) ? await upgradeOceanLinks(json).catch(() => json) : json;
      try { write(out); } catch { /* closed */ }
    });
    return chain;
  };
  send.flush = () => chain;   // await before ending the response, or the last events are cut off
  return send;
}
