// SOURCE CHANNELS — every place a copy of a work might be (Chad 10-18: "scanned copies or pdf or whatever we can find …
// exhaust all possibilities first"). Each channel: (work, deps) → [{ url, kind, site, title, note }], kind ∈ pdf | text |
// epub | html | borrow | view (borrow/view: readable there, not downloadable — still a lead, never a purchase).
// Shadow libraries are never searched or used (SHADOW). Network deps injectable; one request at a time, polite.
import { titleMatches } from '../research.js';
import { parallelResearch } from '../../parallel-ai.js';
import { UA } from './ris.js';

/** Sites that distribute copyrighted books without permission — never searched, never fetched. */
export const SHADOW = /(?:^|\.)(?:libgen\.|library\.lol|annas-archive\.|z-lib|zlibrary|1lib\.|b-ok\.|singlelogin|sci-hub\.|pdfdrive\.|ebookee|dokumen\.pub|vdoc\.pub|epdf\.pub|pdfcoffee|ebin\.pub|dlscrib|doku\.pub|idoc\.pub)/i;
export const isShadow = (url) => { try { return SHADOW.test(new URL(url).hostname); } catch { return true; } };

const q = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const words = (s, n = 6) => String(s || '').replace(/[:;(].*$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2).slice(0, n).join(' ');
const surname = (a) => String(a || '').split(/[,;&]| and /)[0].trim().split(/\s+/).pop() || '';
async function json(fetchImpl, url) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': UA } }).catch(() => null);
  return r?.ok ? r.json().catch(() => null) : null;
}

export async function archiveOrg(work, { fetchImpl = fetch } = {}) {
  const query = `title:(${words(work.title)})${work.author ? ` AND creator:(${surname(work.author)})` : ''} AND mediatype:texts`;
  const s = await json(fetchImpl, `https://archive.org/advancedsearch.php?${q({ q: query, rows: 8, output: 'json' })}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&fl[]=access-restricted-item`);
  const out = [];
  for (const d of s?.response?.docs || []) {
    if (!titleMatches(work.title, d.title)) continue;
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
  return (d?.items || []).filter((i) => titleMatches(work.title, [i.volumeInfo?.title, i.volumeInfo?.subtitle].filter(Boolean).join(' '))).flatMap((i) => {
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
  const d = await json(fetchImpl, `https://gutendex.com/books?${q({ search: `${words(work.title, 5)} ${surname(work.author)}`.trim() })}`);
  return (d?.results || []).filter((b) => titleMatches(work.title, b.title)).map((b) => {
    const f = b.formats || {};
    const url = f['text/plain; charset=utf-8'] || f['text/plain; charset=us-ascii'] || f['text/plain'] || f['application/epub+zip'] || f['text/html'];
    return url ? { url, kind: /epub/.test(url) ? 'epub' : /\.html?/.test(url) ? 'html' : 'text', site: 'gutenberg.org', title: b.title, note: 'public domain' } : null;
  }).filter(Boolean);
}

export async function openLibrary(work, { fetchImpl = fetch } = {}) {
  const d = await json(fetchImpl, `https://openlibrary.org/search.json?${q({ title: work.title, author: work.author, limit: 5, fields: 'key,title,ebook_access,ia,isbn' })}`);
  return (d?.docs || []).filter((x) => titleMatches(work.title, x.title) && x.ebook_access && x.ebook_access !== 'no_ebook').map((x) => ({
    url: `https://openlibrary.org${x.key}`, kind: x.ebook_access === 'public' ? 'view' : 'borrow', site: 'openlibrary.org', title: x.title, note: `ebook: ${x.ebook_access}`, isbns: (x.isbn || []).slice(0, 6) }));
}

export async function bahaiWorks(work, { fetchImpl = fetch } = {}) {
  const d = await json(fetchImpl, `https://bahai.works/api.php?${q({ action: 'query', list: 'search', srsearch: words(work.title, 8), format: 'json', srlimit: 5 })}`);
  return (d?.query?.search || []).filter((s) => titleMatches(work.title, s.title)).map((s) => ({ url: `https://bahai.works/${encodeURIComponent(s.title.replace(/ /g, '_'))}`, kind: 'html', site: 'bahai.works', title: s.title, note: 'wiki transcription' }));
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

export const CHANNELS = { 'archive.org': archiveOrg, 'google-books': googleBooks, hathitrust: hathiTrust, gutenberg, 'open-library': openLibrary, 'bahai.works': bahaiWorks, web: webSearch };
