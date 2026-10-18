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
  const res = await create('dewey-identify', { max_tokens: 1200, temperature: 0, messages: [{ role: 'user', content }] });
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
export async function identifyFile({ name = '', bytes }) {
  // every format through the one converter (convert.js) — the same Markdown intake will write
  const { markdown, scan, ocr } = await toMarkdownText(bytes, name);
  // a scan read by the PRELIMINARY OCR (sampled pages): compared as a sample; still needs full OCR to be imported
  if (ocr) return withText({ title: name.replace(/\.[^.]+$/, ''), kind: 'scan', needs_ocr: true, ocr, printed_lines: sampleLines(markdown), from: 'file' }, markdown);
  if (scan && markdown.replace(/\s/g, '').length < 200) return { title: name.replace(/\.[^.]+$/, ''), kind: 'scan', needs_ocr: true, from: 'file' };
  const first = markdown.split('\n').map((l) => l.replace(/^#+\s*|\*+/g, '').trim()).filter(Boolean);
  return withText({ title: first[0]?.slice(0, 200) || name, kind: 'file', printed_lines: sampleLines(markdown), from: 'file' }, markdown);
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
