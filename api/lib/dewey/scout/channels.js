// SOURCE CHANNELS — every place a copy of a work might be (Chad 10-18: "scanned copies or pdf or whatever we can find …
// exhaust all possibilities first"). Each channel: (work, deps) → [{ url, kind, site, title, note }], kind ∈ pdf | text |
// epub | html | borrow | view (borrow/view: readable there, not downloadable — still a lead, never a purchase).
// Shadow libraries are never searched or used (SHADOW). Network deps injectable; one request at a time, polite.
import { parallelResearch } from '../../parallel-ai.js';
import { UA } from './ris.js';

/** Sites that distribute copyrighted books without permission — never searched, never fetched. */
export const SHADOW = /(?:^|\.)(?:libgen\.|library\.lol|annas-archive\.|z-lib|zlibrary|1lib\.|b-ok\.|singlelogin|sci-hub\.|pdfdrive\.|ebookee|dokumen\.pub|vdoc\.pub|epdf\.pub|pdfcoffee|ebin\.pub|dlscrib|doku\.pub|idoc\.pub)/i;
export const isShadow = (url) => { try { return SHADOW.test(new URL(url).hostname); } catch { return true; } };

const q = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const words = (s, n = 6) => String(s || '').replace(/[:;(].*$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2).slice(0, n).join(' ');
const surname = (a) => String(a || '').split(/[,;&]| and /)[0].trim().split(/\s+/).pop() || '';
// a channel that could not be asked (down, quota, timeout) THROWS — the scout logs it as not searched. 10-19: Google Books'
// quota and a dead Gutenberg mirror read as "searched, nothing found", and The Rule of Saint Benedict went to "buy"
async function json(fetchImpl, url) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${new URL(url).hostname}: HTTP ${r.status}`);
  return r.json();
}
async function text(fetchImpl, url) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${new URL(url).hostname}: HTTP ${r.status}`);
  return r.text();
}

/** SAME WORK? stricter than titleMatches: the asked title's words are all in the found MAIN title (before ':' ';' '(' or
 *  ' or '), which adds at most a few words of its own. 10-19: "Apostles' Creed" matched "The Plain Man's Guide to the True
 *  Church … the Apostles' Creed …" and was imported; "Septuaginta" matched "Septuaginta-Studien"; a companion to a work is
 *  not the work. Pure. */
export function sameWork(asked, found) {
  const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘'ʼ`]/g, '').toLowerCase();
  const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'to', 'de', 'la', 'le', 'des', 'du', 'et', 'st', 'saint', 'vol', 'volume', 'part', 'book', 'books']);
  const main = (t) => fold(t).split(/\s*(?:[:;(\[]|\bor,?\s|\s-\s|—)\s*/)[0];
  const ws = (t) => (main(t).match(/\p{L}[\p{L}\p{N}]*(?:-\p{L}[\p{L}\p{N}]*)*/gu) || []).filter((w) => !STOP.has(w));   // a hyphenated word is one word: Septuaginta-Studien ≠ Septuaginta
  const a = ws(asked), f = ws(found);
  if (!a.length || !f.length) return false;
  // the found title BEGINS with the asked one ("The Cambridge Companion to the Summa Theologiae" is about it, not it)
  return a.every((w, i) => f[i] === w) && f.length - a.length <= 3;
}

export async function archiveOrg(work, { fetchImpl = fetch } = {}) {
  const base = `title:(${words(work.title)})${work.author ? ` AND creator:(${surname(work.author)})` : ''} AND mediatype:texts`;
  const fl = '&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&fl[]=access-restricted-item';
  // DOWNLOADABLE copies first (an 1845 Calvin, a public-domain scan), in their own search — modern borrow-only editions
  // otherwise fill the first page of results (10-19: Institutes, Summa: 8 of 8 borrow-only)
  let free = await json(fetchImpl, `https://archive.org/advancedsearch.php?${q({ q: `${base} AND NOT access-restricted-item:true`, rows: 12, output: 'json' })}${fl}`);
  // an author is catalogued many ways ("Benedict of Nursia" is "Benedict, Saint, Abbot of Monte Cassino") — none by author → by title
  if (!free?.response?.docs?.length && work.author) free = await json(fetchImpl, `https://archive.org/advancedsearch.php?${q({ q: `title:(${words(work.title)}) AND mediatype:texts AND NOT access-restricted-item:true`, rows: 12, output: 'json' })}${fl}`);
  const lend = await json(fetchImpl, `https://archive.org/advancedsearch.php?${q({ q: base, rows: 6, output: 'json' })}${fl}`);
  const seenIds = new Set();
  const docs = [...(free?.response?.docs || []), ...(lend?.response?.docs || [])].filter((d) => !seenIds.has(d.identifier) && seenIds.add(d.identifier));
  const out = [];
  for (const d of docs) {
    if (!sameWork(work.title, d.title)) continue;
    if (String(d['access-restricted-item']) === 'true') { out.push({ url: `https://archive.org/details/${d.identifier}`, kind: 'borrow', site: 'archive.org', title: d.title, note: `${d.year || ''} — borrow only (controlled lending)` }); continue; }
    const m = await json(fetchImpl, `https://archive.org/metadata/${d.identifier}`);
    const files = m?.files || [];
    // the best downloadable file: a PDF with a text layer, then any PDF, then the plain OCR text
    const pick = files.find((f) => /_text\.pdf$/i.test(f.name)) || files.find((f) => /\.pdf$/i.test(f.name) && Number(f.size) < 300e6) || files.find((f) => /_djvu\.txt$/i.test(f.name));
    if (pick) out.push({ url: `https://archive.org/download/${d.identifier}/${encodeURIComponent(pick.name)}`, kind: /\.txt$/i.test(pick.name) ? 'text' : 'pdf', site: 'archive.org', title: d.title,
      note: `${d.year || ''} · ${m?.metadata?.collection ? [].concat(m.metadata.collection).join(', ') : ''}${m?.metadata?.licenseurl ? ` · ${m.metadata.licenseurl}` : ''}`.trim(), bytes: Number(pick.size) || null });
  }
  return out;
}

export async function googleBooks(work, { fetchImpl = fetch } = {}) {
  const d = await json(fetchImpl, `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent([`intitle:${words(work.title)}`, work.author && `inauthor:${surname(work.author)}`].filter(Boolean).join('+'))}&maxResults=8`);
  return (d?.items || []).filter((i) => sameWork(work.title, i.volumeInfo?.title)).flatMap((i) => {
    const a = i.accessInfo || {}, t = i.volumeInfo?.title;
    if (a.pdf?.downloadLink) return [{ url: a.pdf.downloadLink, kind: 'pdf', site: 'books.google.com', title: t, note: 'full view PDF' }];
    if (a.epub?.downloadLink) return [{ url: a.epub.downloadLink, kind: 'epub', site: 'books.google.com', title: t, note: 'full view EPUB' }];
    if (a.viewability === 'ALL_PAGES') return [{ url: a.webReaderLink || i.volumeInfo?.infoLink, kind: 'view', site: 'books.google.com', title: t, note: 'full view online' }];
    return [];
  });
}

export async function hathiTrust(work, { fetchImpl = fetch } = {}) {
  const ids = [...(work.isbns || [])].slice(0, 4);
  const out = [];
  for (const isbn of ids) {
    const d = await json(fetchImpl, `https://catalog.hathitrust.org/api/volumes/brief/isbn/${isbn}.json`);
    for (const it of d?.items || []) if (/full view/i.test(it.usRightsString || '')) out.push({ url: it.itemURL, kind: 'view', site: 'hathitrust.org', title: work.title, note: `full view (${it.rightsCode || ''})` });
  }
  return out;
}

export async function gutenberg(work, { fetchImpl = fetch } = {}) {
  // Gutenberg's own catalogue (OPDS) — gutendex.com, the JSON mirror, was down (10-19)
  const ask = async (query) => [...(await text(fetchImpl, `https://www.gutenberg.org/ebooks/search.opds/?${q({ query })}`)).matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map((m) => ({ id: (m[1].match(/<id>https?:\/\/www\.gutenberg\.org\/ebooks\/(\d+)\.opds<\/id>/) || [])[1], title: (m[1].match(/<title>([^<]*)<\/title>/) || [])[1] }))
    .filter((h) => h.id && sameWork(work.title, String(h.title).replace(/\s*\((?:vol(?:ume)?\.?|part)\s*\w+(?:\s+of\s+\w+)?\)\s*$/i, '')));
  let hits = await ask(`${words(work.title, 5)} ${surname(work.author)}`.trim());
  if (!hits.length && work.author) hits = await ask(words(work.title, 5));   // authors are catalogued many ways
  if (!hits.length) return [];
  // a work in VOLUMES (Calvin's Institutes: Vol. 1 of 2, Vol. 2 of 2) is ONE copy — its volumes in order, never volume 1 alone
  const vol = (t) => Number((String(t).match(/vol(?:ume)?\.?\s*(\d+)/i) || [])[1] || 0);
  const parts = hits.sort((a, b) => vol(a.title) - vol(b.title));
  const url = (h) => `https://www.gutenberg.org/cache/epub/${h.id}/pg${h.id}.txt`;
  return [{ url: url(parts[0]), parts: parts.length > 1 && parts.some((h) => vol(h.title)) ? parts.map(url) : null, kind: 'text', site: 'gutenberg.org', title: parts[0].title, note: `public domain${parts.length > 1 ? ` · ${parts.length} volumes` : ''}` }];
}

export async function wikisource(work, { fetchImpl = fetch } = {}) {
  const d = await json(fetchImpl, `https://en.wikisource.org/w/api.php?${q({ action: 'query', list: 'search', srsearch: work.title, format: 'json', srlimit: 5 })}`);
  return (d?.query?.search || []).filter((r) => sameWork(work.title, r.title)).map((r) => ({ url: `https://en.wikisource.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`, kind: 'view', site: 'wikisource.org', title: r.title, note: 'transcribed (public domain)' }));
}

export async function openLibrary(work, { fetchImpl = fetch } = {}) {
  const d = await json(fetchImpl, `https://openlibrary.org/search.json?${q({ title: work.title, author: work.author, limit: 5, fields: 'key,title,ebook_access,ia,isbn' })}`);
  return (d?.docs || []).filter((x) => sameWork(work.title, x.title) && x.ebook_access && x.ebook_access !== 'no_ebook').map((x) => ({
    url: `https://openlibrary.org${x.key}`, kind: x.ebook_access === 'public' ? 'view' : 'borrow', site: 'openlibrary.org', title: x.title, note: `ebook: ${x.ebook_access}`, isbns: (x.isbn || []).slice(0, 6) }));
}

export async function bahaiWorks(work, { fetchImpl = fetch } = {}) {
  const d = await json(fetchImpl, `https://bahai.works/api.php?${q({ action: 'query', list: 'search', srsearch: words(work.title, 8), format: 'json', srlimit: 5 })}`);
  return (d?.query?.search || []).filter((s) => sameWork(work.title, s.title)).map((s) => ({ url: `https://bahai.works/${encodeURIComponent(s.title.replace(/ /g, '_'))}`, kind: 'html', site: 'bahai.works', title: s.title, note: 'wiki transcription' }));
}

/** The open web: full-text copies anywhere (PDFs, scans, author/publisher pages, repositories) — via cited web research. */
export async function webSearch(work, { research = parallelResearch } = {}) {
  const ask = `Find every place on the internet where the FULL TEXT of the book "${work.title}"${work.author ? ` by ${work.author}` : ''}${work.year ? ` (${work.year})` : ''} can be downloaded or read: PDF files, scanned copies, the author's or publisher's site, academia.edu, university repositories, archive.org, Bahá'í sites (bahai-library.com, bahai.works, h-net), personal sites. Do NOT list LibGen, Anna's Archive, Z-Library, Sci-Hub or other shadow libraries. For each, give the direct URL and say whether it is the complete text, an excerpt, or a catalogue/sales page. If none exists, say so plainly.`;
  const r = await research(ask, { processor: 'base', timeoutS: 120, caller: 'dewey-scout' }).catch(() => null);
  if (!r) return [];
  const urls = [...new Set([...(String(r.text).match(/https?:\/\/[^\s)\]>"']+/g) || []).map((u) => u.replace(/[.,;]+$/, '')), ...r.citations.map((c) => c.url)])];
  return urls.filter((u) => !isShadow(u) && !/amazon\.|abebooks\.|ebay\.|goodreads\.|google\.com\/search|worldcat\.org\/search/i.test(u)).map((u) => ({
    url: u, kind: /\.pdf(\?|$)/i.test(u) ? 'pdf' : 'html', site: new URL(u).hostname.replace(/^www\./, ''), title: work.title, note: 'found by web research', context: String(r.text).slice(0, 1200) }));
}

/** Used copies and who to ask — only when nothing could be found. */
export async function purchaseLeads(work, { research = parallelResearch } = {}) {
  const r = await research(`For the book "${work.title}"${work.author ? ` by ${work.author}` : ''}: (1) the lowest current prices for used or new copies (AbeBooks, Amazon, Bookfinder, the publisher), with URLs; (2) the publisher and whether it is in print; (3) how to contact the author or rights holder to ask permission to digitise it for a non-commercial religious studies library. Be brief.`, { processor: 'base', timeoutS: 90, caller: 'dewey-scout' }).catch(() => null);
  return r ? { text: r.text.slice(0, 2000), citations: r.citations } : null;
}

export const CHANNELS = { 'archive.org': archiveOrg, gutenberg, 'google-books': googleBooks, hathitrust: hathiTrust, 'open-library': openLibrary, wikisource, 'bahai.works': bahaiWorks, web: webSearch };
