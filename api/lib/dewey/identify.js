// Dewey's IDENTIFY step (Chad 10-17: "search for a document by anything I give it … work with my phone camera"): photos,
// a file, a URL or typed text → the fields a holdings check searches on: title, author, edition, language, kind, and
// printed lines (verbatim text, the strongest evidence — it finds a work under any title). Photos are read by a vision
// model; files through convert.js (any format → Markdown); URLs by oEmbed (video) or the page itself.
import { roleCreate } from '../role-client.js';
import { toMarkdownText } from './convert.js';

const jsonOf = (s) => { const m = String(s || '').match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };

const VISION_PROMPT = `These photos show one book, document or other item (a cover, title page, spine, copyright page, or a page of
its text). Read what is printed. Return ONE JSON object:
{"title":"…","subtitle":null,"author":null,"translator":null,"editor":null,"edition":null,"publisher":null,"year":null,
 "language":"en|fa|ar|…","script":"latin|arabic|…","isbn":null,"kind":"book|article|pamphlet|tablet|letter|periodical|manuscript|other",
 "printed_lines":["up to 6 complete lines of body text exactly as printed, if a page of text is shown"],"notes":"anything else that identifies it"}
Use null for anything not visible. Never guess a title that is not printed.`;

/** Photos (data URLs) → identified fields, via the vision model. */
export async function identifyPhotos(images, { create = roleCreate } = {}) {
  const content = [{ type: 'text', text: VISION_PROMPT }, ...images.slice(0, 6).map((url) => ({ type: 'image_url', image_url: { url } }))];
  const res = await create('dewey-identify', { max_tokens: 4000, temperature: 0, messages: [{ role: 'user', content }] });
  return { ...(jsonOf(res?.choices?.[0]?.message?.content) || {}), from: 'photo' };
}

const VIDEO = /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/|vimeo\.com\/)/i;

/** A URL → identified fields: video by oEmbed; a page by its title/meta and a sample of its text; a PDF/DOCX by its text. */
export async function identifyUrl(url, { fetchImpl = fetch } = {}) {
  if (VIDEO.test(url)) {
    const oembed = /vimeo/i.test(url) ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}` : `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const r = await fetchImpl(oembed, { signal: AbortSignal.timeout(10000) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    return { title: r?.title || null, author: r?.author_name || null, kind: 'video', url, from: 'url' };
  }
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (!res.ok) throw new Error(`could not fetch the URL (${res.status})`);
  const type = res.headers.get('content-type') || '';
  if (/pdf|officedocument|msword/i.test(type) || /\.(pdf|docx?)(\?|$)/i.test(url)) {
    return { ...(await identifyFile({ name: url.split('/').pop(), bytes: new Uint8Array(await res.arrayBuffer()) })), url, from: 'url' };
  }
  const html = (await res.text()).slice(0, 2_000_000);
  const meta = (name) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)`, 'i'))?.[1] || null;
  const title = meta('og:title') || meta('citation_title') || html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim() || null;
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ');
  return { title, author: meta('citation_author') || meta('author'), kind: 'web page', url, printed_lines: sampleLines(body), from: 'url' };
}

/** A file (any format convert.js reads) → identified fields from its Markdown. A scan with no
 *  text layer says so: it needs OCR before its lines can be checked. */
export async function identifyFile({ name = '', bytes = null, path = null }) {
  // every format through the one converter (convert.js) — a big PDF is SPOT-CHECKED (sampled pages; length from the page
  // count), read in place when it lives on the server
  const { markdown, scan, sample } = await toMarkdownText(bytes, name, { path });
  // The FILE NAME is not the document's title — it is often wrong, or names the archive box or folder it came from ("1921
  // John and Louise Bosch Box 11 John Bosch"; Chad 10-17: "The contents must be examined"). It is kept as file_name only;
  // the title comes from the contents (the appraisal reads them).
  const file_name = name || null;
  const ocrd = sample && sample.engine !== 'text-layer';
  if (ocrd) return withText({ title: null, file_name, kind: 'scan', needs_ocr: true, sample, printed_lines: sampleLines(markdown), from: 'file' }, markdown);
  if (scan && markdown.replace(/\s|\[page \d+\]/g, '').length < 200) return { title: null, file_name, kind: 'scan', needs_ocr: true, from: 'file' };
  const first = markdown.split('\n').map((l) => l.replace(/^#+\s*|\*+/g, '').trim()).filter((l) => l && !/^\[page \d+\]$/i.test(l));
  const { title, author } = await titleFromLines(first);
  return withText({ title, ...(author ? { author } : {}), file_name, kind: 'file', ...(sample ? { sample } : {}), printed_lines: sampleLines(markdown), from: 'file' }, markdown);
}

/** The whole text rides along for the holdings comparison (compare.js) but is NOT enumerable — never sent back in JSON. */
export const withText = (id, text) => Object.defineProperty(id, '_text', { value: String(text || ''), enumerable: false });

/** Up to n complete, distinctive lines from running text (long enough to identify a passage, not headings). */
export function sampleLines(text, n = 6) {
  const lines = String(text || '').split(/\n+/).map((l) => l.replace(/^(#+|>|-)\s+/, '').replace(/\*+/g, '').replace(/\s+/g, ' ').trim()).filter((l) => l.split(' ').length >= 8 && l.split(' ').length <= 60);
  if (lines.length <= n) return lines;
  const step = Math.floor(lines.length / n);
  return Array.from({ length: n }, (_, k) => lines[Math.min(lines.length - 1, 2 + k * step)]);
}

/** Typed text: a few words is a title/author query; a sentence or more is printed lines. */
export function identifyText(text) {
  const t = String(text || '').trim();
  if (/^https?:\/\//i.test(t)) return { url: t };
  if (t.split(/\s+/).length >= 10) return withText({ printed_lines: [t], from: 'text' }, t);
  // "The Chosen Highway by Lady Blomfield": the whole string stays the title (some titles hold "by" — "Prayers Revealed by
  // the Báb"); the part before the last " by " is a second title an exact match may land on, the rest the author
  const m = t.match(/^(.{3,}?)\s+by\s+([^,]{3,})$/i);
  return m ? { title: t, title_alt: m[1].trim(), author: m[2].trim(), from: 'text' } : { title: t, from: 'text' };
}

// A TITLE PAGE's first line is often the AUTHOR ("MOOJAN MOMEN" above "The Family and Early Life of Ṭáhirih", 10-19) or a
// journal header. A first line that is an author the library knows (its own author names, folded) is the author; lines of
// metadata (volume, issue, ISBN, copyright, a URL, a bare date) are skipped; the title is the next title-like line.
const META = /^(?:vol(?:ume)?\.?\s|no\.\s|issue\b|pp?\.\s|page\s\d|copyright|©|isbn|issn|https?:|www\.|\d[\d\s./-]*$|by\s*$)/i;
let authorNames = null;
async function knownAuthors() {
  if (authorNames) return authorNames;
  if (process.env.VITEST) return (authorNames = new Set());
  const { titleIndex, fold } = await import('./title-index.js');
  const idx = await titleIndex().catch(() => null);
  authorNames = new Set();
  for (const d of idx?.docs || []) for (const a of String(d.author || '').split(/\s*(?:;|&|\band\b|,\s*(?:tr|ed)\.)\s*/i)) { const f = fold(a); if (f.split(' ').length >= 2 && f.length >= 6) authorNames.add(f); }
  return authorNames;
}
/** The first lines of a document → { title, author? }. deps.authors: a Set of folded author names (tests). */
export async function titleFromLines(lines, { authors = null } = {}) {
  const { fold } = await import('./title-index.js');
  const known = authors || await knownAuthors();
  let author = null;
  for (const raw of lines.slice(0, 8)) {
    const l = raw.trim();
    if (!l || META.test(l)) continue;
    const by = l.match(/^by\s+(.{3,80})$/i);
    if (by) { author ||= by[1]; continue; }
    if (known.has(fold(l))) { author ||= l.replace(/\b(\p{L})(\p{L}*)/gu, (m, a, b) => a + b.toLowerCase()); continue; }
    return { title: l.slice(0, 200), author };
  }
  return { title: lines[0]?.slice(0, 200) || null, author };
}
