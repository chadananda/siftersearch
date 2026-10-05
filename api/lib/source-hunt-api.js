// SourceHunt for the public API (/api/v1/source-hunt, /api/v1/source-hunt/page): the engine's result shaped for API clients —
// the published source and the original tablet each with their links and the quoted words, plus the citing publications —
// and an article reader that finds the quotations on a page and hunts each. Range links come later (Chad 10-05); every
// link here is a page or paragraph link. Deps: source-hunt.js (engine), node:dns (refuses private addresses).
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeEntities } from './source-hunt.js';

const AUDIT = process.env.SOURCE_HUNT_LOG || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'logs', 'source-hunt.jsonl');
/** One JSONL line per hunt — the same complete audit log the page writes (Chad 10-04: "log results completely"). */
export const audit = (entry) => appendFile(AUDIT, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n').catch(() => {});

const SITE = { 'oceanlibrary.com': 'OceanLibrary', 'oceanoflights.org': 'Ocean of Lights', phelps: 'Phelps', 'bahai-library.com': "Bahá'í Library Online", library: 'SifterSearch' };
const quoted = (text, ranges) => (ranges || []).map(([a, b]) => text.slice(a, b));
/** A passage cut to its quoted part with a little context (a search result, not a reader). */
function excerpt(text = '', ranges = [], before = 200, after = 260) {
  if (!ranges?.length || text.length <= 900) return text;
  const a = Math.max(0, ranges[0][0] - before), b = Math.min(text.length, ranges[ranges.length - 1][1] + after);
  return `${a > 0 ? '… ' : ''}${text.slice(a, b).trim()}${b < text.length ? ' …' : ''}`;
}

/** The engine's result → the API shape. */
export function toApi(r) {
  if (!r || r.error || r.failed) return { error: r?.error || r?.failed || 'no result' };
  const o = r.origin, t = r.tablet;
  const original = (x, certain) => x && {
    certain, basis: x.basis || null, title: x.meta?.title || x.title || null, pin: x.meta?.pin || null,
    firstLineEnglish: x.meta?.first_line_en || null, excerpt: excerpt(x.text, x.highlight), quotedText: quoted(x.text, x.highlight),
    matchedBy: x.highlightBy || null, url: x.url || null, rangeUrl: x.rangeUrl || null,
    links: { oceanOfLights: x.meta?.links?.oceanoflights || null, oceanOfLightsRange: x.meta?.links?.oceanoflightsRange || null, phelpsInventory: x.meta?.links?.inventory || null },
    ...(x.score != null ? { similarity: x.score } : {}),
  };
  return {
    quote: r.quote, writer: r.quoteAuthor || null,
    source: o ? { title: o.title, author: o.author, bookAuthor: o.bookAuthor || null, site: SITE[o.site] || o.site, url: o.url, rangeUrl: o.rangeUrl || null,
      documentId: o.documentId, paragraphId: o.id, excerpt: excerpt(o.text, o.highlight), quotedText: quoted(o.text, o.highlight), matchedBy: o.highlightBy || null } : null,
    original: t?.certain ? original(t, true) : null,
    possibleOriginals: !t?.certain ? (t?.candidates || []).map((c) => original(c, false)) : [],
    citedBy: (r.citedBy || []).map((c) => ({ title: c.title, author: c.author || null, site: SITE[c.site] || c.site, url: c.url, rangeUrl: c.rangeUrl || null, passages: c.paragraphs })),
    processingTimeMs: r.ms,
  };
}

// ── the article reader ─────────────────────────────────────────────────────────────────────────────────────────────────
const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::ffff:(127|10|192\.168)\./i];
/** Fetch a public page (http/https only; private, loopback and Tailscale addresses refused; ≤ 3 MB, 15 s, ≤ 3 redirects). */
export async function fetchArticle(url, { maxBytes = 3_000_000, timeoutMs = 15000 } = {}) {
  let u = new URL(url);
  for (let hop = 0; hop <= 3; hop++) {
    if (!/^https?:$/.test(u.protocol)) throw new Error('only http(s) URLs');
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    if (!addrs.length || addrs.some((a) => PRIVATE.some((re) => re.test(a))) || /^(localhost|tower-nas|boss)$/i.test(host)) throw new Error('that address is not public');
    const res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'SifterSearch SourceHunt (+https://siftersearch.com/sourcehunt)' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { u = new URL(res.headers.get('location'), u); continue; }
    if (!res.ok) throw new Error(`page returned ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > maxBytes) throw new Error('page too large');
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) throw new Error('page too large');
    return { url: u.toString(), html: new TextDecoder('utf-8').decode(buf) };
  }
  throw new Error('too many redirects');
}

/** Visible text of an HTML page; each <blockquote> kept as its own marked block. */
export function pageText(html = '') {
  const s = String(html).replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, inner) => `\n⟦BQ⟧${inner.replace(/<[^>]+>/g, ' ')}⟦/BQ⟧\n`)
    .replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ');
  return decodeEntities(s).replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

/** The quotations in an article: blockquotes and text in quotation marks, 8–150 words, de-duplicated, in page order. */
export function extractQuotes(text = '', { max = 20 } = {}) {
  const out = [], seen = new Set();
  const add = (q) => {
    const t = q.replace(/\s+/g, ' ').replace(/^[“"'‘\s]+|[”"'’\s]+$/g, '').trim();
    const words = t.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
    const k = t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (words < 8 || words > 150 || seen.has(k)) return;
    seen.add(k); out.push(t);
  };
  const bq = [...text.matchAll(/⟦BQ⟧([\s\S]*?)⟦\/BQ⟧/g)].map((m) => ({ at: m.index, q: m[1] }));
  const marks = [...text.matchAll(/“([^”]{30,1200})”|"([^"\n]{30,1200})"/g)].map((m) => ({ at: m.index, q: m[1] || m[2] }));
  for (const { q } of [...bq, ...marks].sort((a, b) => a.at - b.at)) { add(q); if (out.length >= max) break; }
  return out;
}

/** Hunt each quotation of a page (`concurrency` at a time). */
export async function huntPage({ url, text, html }, { hunt, max = 20, concurrency = 3 } = {}) {
  let source = null, body = text;
  if (!body && html) body = pageText(html);
  if (!body && url) { const page = await fetchArticle(url); source = page.url; body = pageText(page.html); }
  if (!body) throw new Error('send url, html or text');
  const quotes = extractQuotes(body, { max });
  const results = new Array(quotes.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, quotes.length) }, async () => {
    while (next < quotes.length) {
      const k = next++;
      try { results[k] = toApi(await hunt(quotes[k])); } catch (e) { results[k] = { quote: quotes[k], error: e.message }; }
    }
  }));
  return { page: source || url || null, quotesFound: quotes.length, results };
}
