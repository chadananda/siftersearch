// Any document Dewey is given → Markdown (Chad 10-17: "extend Dewey to be able to convert other formats to MD"). ONE
// converter for the holdings check (identify.js) and intake (intake.js), so a work reads the same at both steps. Headings
// survive as #-lines (the structure stage reads them). PDF: its text layer — a scan has none and waits for OCR
// (SearchLayerPDF, later). DOCX: read directly (jszip + word/document.xml) — mammoth broke when the 09-09 security
// override forced @xmldom/xmldom 0.9 (it needs 0.8: every .docx threw "mimeType undefined"). DOC/RTF/ODT/WPD/WPS/PAGES-less word files: LibreOffice headless → HTML
// (tower has soffice). HTML, Safari .webarchive (the page's HTML is stored verbatim in the plist), EPUB (spine order).
// Audio/video: not text — refused with a reason. A SCAN gets a PRELIMINARY OCR of sampled pages — tesseract for printed
// Latin text (8 pages), the vision model for handwriting and other scripts (4 pages) — enough to tell whether the library
// holds it before SearchLayerPDF's full extraction (Chad 10-17).
// Deps injectable for tests (run, ocr).
import { execFile } from 'child_process';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export const FORMATS = ['pdf', 'docx', 'doc', 'rtf', 'odt', 'wpd', 'wps', 'html', 'htm', 'xhtml', 'webarchive', 'epub', 'txt', 'md', 'markdown'];
const OFFICE = new Set(['doc', 'rtf', 'odt', 'wpd', 'wps']);
const MEDIA = /^(mp3|m4a|aiff?|wav|ogg|flac|mp4|mov|m4v|webm)$/;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', shy: '' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#'
  ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);

/** HTML → Markdown: headings, paragraphs, lists, quotes, bold/italic; everything else becomes its text. */
export function htmlToMarkdown(html) {
  let s = String(html || '');
  s = (s.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? s)
    .replace(/<(script|style|head|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const inline = (t) => t.replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, _, x) => (x.trim() ? `**${x.trim()}**` : x))
    .replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, _, x) => (x.trim() ? `*${x.trim()}*` : x))
    .replace(/<br\s*\/?>/gi, '\n');
  s = inline(s)
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (m, n, x) => `\n\n${'#'.repeat(+n)} ${x.replace(/<[^>]+>/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()}\n\n`)
    .replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '')
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, x) => `\n\n${x.replace(/<[^>]+>/g, ' ').trim().split(/\n+/).map((l) => `> ${l.trim()}`).join('\n')}\n\n`)
    .replace(/<\/(p|div|section|article|tr|table|ul|ol|dd|dt|figure|header)>/gi, '\n\n')
    .replace(/<(p|div|tr|ul|ol|table)\b[^>]*>/gi, '\n\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, '');
  return decode(s).replace(/\r/g, '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Safari .webarchive: a binary plist whose main resource is the page's HTML, stored as raw bytes. */
export function webarchiveHtml(bytes) {
  const s = Buffer.from(bytes).toString('utf8');
  const start = s.search(/<!doctype html|<html[\s>]/i), end = s.lastIndexOf('</html>');
  if (start < 0) throw new Error('no HTML inside this webarchive');
  return s.slice(start, end > start ? end + 7 : undefined);
}

/** EPUB: the chapters' XHTML in spine order. */
export async function epubHtml(bytes) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);
  const container = await zip.file('META-INF/container.xml')?.async('string');
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error('not an EPUB (no container.xml)');
  const opf = await zip.file(opfPath).async('string');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const manifest = Object.fromEntries([...opf.matchAll(/<item\b[^>]*>/g)].map(([t]) => [t.match(/id="([^"]+)"/)?.[1], t.match(/href="([^"]+)"/)?.[1]]));
  const spine = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((m) => manifest[m[1]]).filter(Boolean);
  const parts = [];
  for (const href of spine) { const f = zip.file(base + decodeURIComponent(href)); if (f) parts.push(await f.async('string')); }
  return parts.join('\n');
}

/** DOCX → HTML: paragraphs by style (Title/Heading N → h1–h6, numbered → li), runs with bold/italic, tabs and breaks. */
export async function docxHtml(bytes) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('not a Word .docx (no word/document.xml)');
  const styles = (await zip.file('word/styles.xml')?.async('string')) || '';
  // custom style ids ("berschrift1", "Heading1Char", a translator's "Chapter") → their outline level, when they declare one
  const level = {};
  for (const m of styles.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const name = m[2].match(/<w:name w:val="([^"]+)"/)?.[1] || '';
    const ol = m[2].match(/<w:outlineLvl w:val="(\d)"/)?.[1];
    const h = /^title$/i.test(name) ? 1 : name.match(/^heading\s*(\d)$/i)?.[1] ?? (ol != null ? +ol + 1 : null);
    if (h) level[m[1]] = Math.min(6, +h);
  }
  const esc = (t) => t.replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '&amp;').replace(/</g, '&lt;');
  const on = (rpr, tag) => new RegExp(`<w:${tag}(?: w:val="(?:1|true|on)")?\\s*/>`).test(rpr);
  const out = [];
  for (const [, p] of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] || '';
    const h = level[style] ?? (/^title$/i.test(style) ? 1 : +(style.match(/^heading\s*(\d)$/i)?.[1] || 0));
    let text = '';
    for (const [, r] of p.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
      const rpr = r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] || '';
      let t = '';
      for (const [, tag, body] of r.matchAll(/<w:(t|tab|br|cr)\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:t>)/g)) t += tag === 't' ? esc(body || '') : tag === 'tab' ? ' ' : '<br>';
      if (!t) continue;
      if (on(rpr, 'b') && !h) t = `<b>${t}</b>`;
      if (on(rpr, 'i')) t = `<i>${t}</i>`;
      text += t;
    }
    if (!text.replace(/<[^>]+>/g, '').trim()) continue;
    out.push(h ? `<h${h}>${text}</h${h}>` : /<w:numPr>/.test(p) ? `<ul><li>${text}</li></ul>` : `<p>${text}</p>`);
  }
  return out.join('\n');
}

/** LibreOffice headless: an office file → HTML. Own profile dir per call, so parallel conversions never share a lock. */
export async function officeHtml(bytes, ext, { run = execFile } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dewey-conv-'));
  try {
    const src = join(dir, `in.${ext}`);
    await writeFile(src, bytes);
    await new Promise((res, rej) => run('soffice', [`-env:UserInstallation=file://${dir}/profile`, '--headless', '--convert-to', 'html:HTML (StarWriter)', '--outdir', dir, src],
      { timeout: 180000 }, (err, _o, stderr) => (err ? rej(new Error(`LibreOffice could not convert the ${ext.toUpperCase()}: ${String(stderr || err.message).slice(0, 160)}`)) : res())));
    return await readFile(join(dir, 'in.html'), 'utf8');
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

const sh = (run, cmd, args, timeout = 120000) => new Promise((res, rej) => run(cmd, args, { timeout, maxBuffer: 1 << 28 }, (err, out, stderr) => (err ? rej(new Error(String(stderr || err.message).slice(0, 200))) : res(String(out)))));

/** Pages to sample from a scan of n pages: the title page region and an even spread through the body (≤ k). */
export function samplePages(n, k = 8) {
  if (n <= k) return Array.from({ length: n }, (_, i) => i + 1);
  // PAGE 1 always: it is the title page — skipped, a document's title was never read and a body sentence (or the author's
  // name) became its title (10-19, Momen's Ṭáhirih); then the start of the text and pages spread through the rest
  const picks = new Set([1, Math.min(2, n), Math.min(3, n)]);
  const rest = k - picks.size;   // the rest spread evenly from page 4 to the LAST page (the end of the book is checked too)
  for (let i = 0; i < rest; i++) picks.add(Math.max(1, Math.min(n, Math.round(4 + i * (n - 4) / Math.max(1, rest - 1)))));
  for (let p = 4; picks.size < k && p <= n; p++) picks.add(p);
  return [...picks].sort((a, b) => a - b);
}

/** A page image → its text, read by the vision model (handwriting, any script). 'UNREADABLE' when it cannot. */
export async function visionRead(png) {
  const { roleCreate } = await import('../role-client.js');
  const res = await roleCreate('dewey-identify', { max_tokens: 4000, temperature: 0, messages: [{ role: 'user', content: [
    { type: 'text', text: 'Transcribe the text on this page exactly as written, line by line, in its own language and script. Output only the text — no commentary. If nothing on it can be read, output UNREADABLE.' },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from(png).toString('base64')}` } }] }] });
  return res?.choices?.[0]?.message?.content || '';
}

/** A real word: Unicode letters, transliteration marks and apostrophes, parts joined by hyphens ("Kitáb-i-Íqán"), or an
 *  ALL-CAPS heading word; trailing punctuation allowed. */
export const REAL_WORD = /^[(“"‘'ʻ]?(?:\p{Lu}{2,}|\p{L}[\p{Ll}\p{M}'’ʻʼ]*\p{Ll}[\p{Ll}\p{M}'’ʻʼ]*|\p{L}[\p{Ll}\p{M}'’ʻʼ]*)(?:[-'’ʻʼ]\p{L}[\p{Ll}\p{M}'’ʻʼ]*)*[.,;:!?)"’”]*$/u;

/** Share of tokens that look like real Latin-script words (2+ letters, a vowel, clean shape) — 0..1; null if too few. */
export function wordRatio(text) {
  // only tokens with 3+ letters are judged — numbers, page refs ("p. 12."), dot leaders and initials are neither words nor noise
  const toks = String(text || '').split(/\s+/).filter((t) => (t.match(/\p{L}/gu) || []).length >= 3);
  if (toks.length < 20) return null;
  // Unicode letters (10-18: ASCII-only counted "Bahá'u'lláh", "Kitáb-i-Íqán", "ʻAbdu'l-Bahá" as noise — clean Bahá'í text
  // scored as garbled); vowels checked on the diacritic-stripped form
  return toks.filter((t) => REAL_WORD.test(t) && /[aeiouy]/i.test(t.normalize('NFD').replace(/\p{M}/gu, ''))).length / toks.length;
}

/** Does an OCR read look like real Latin-script words? (≥ 60% of tokens are) */
export const looksLikeWords = (text) => (wordRatio(text) ?? 0) >= 0.6;

/** A garbled old-OCR text layer: mostly Latin letters but under 85% real-word shapes. Not fit to import as the text. */
// thresholds on the Unicode measure (10-18): clean layers 0.98–0.99, garbled 0.79–0.84 (Remey, Kelsey)
export const garbledLayer = (t) => mostlyLatin(t) && (wordRatio(t) ?? 1) < 0.9;

/** Is this text mostly Latin letters? (a word-shape ratio means nothing for Arabic or Hebrew) */
const mostlyLatin = (t) => { const l = (String(t).match(/\p{L}/gu) || []).length; return l > 0 && (String(t).match(/[A-Za-z]/g) || []).length / l > 0.8; };

/** A PDF ON DISK for poppler: the server file itself when Dewey reads in place, else the bytes in a temp file. */
async function onDisk({ bytes = null, path = null }, fn) {
  if (path) return fn(path, null);
  const dir = await mkdtemp(join(tmpdir(), 'dewey-pdf-'));
  try { const f = join(dir, 'in.pdf'); await writeFile(f, bytes); return await fn(f, dir); } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

/** PRELIMINARY OCR of a scan: render sampled pages (pdftoppm, 200 dpi gray); tesseract for printed Latin, vision otherwise. */
export async function ocrSample(src, totalPages, { run = execFile, k = 8, vision = null } = {}) {
  const work = await mkdtemp(join(tmpdir(), 'dewey-ocr-'));
  try {
    // src: { bytes } or { path } (a bare Buffer still works)
    return await onDisk(src.bytes || src.path ? src : { bytes: src }, async (pdf) => {
      const dir = work;
      const pages = samplePages(totalPages, k);
      await Promise.all(pages.map((p) => sh(run, 'pdftoppm', ['-r', '200', '-gray', '-f', String(p), '-l', String(p), '-singlefile', '-png', pdf, join(dir, `p${p}`)])));
      // English first: OSD called a typewritten English scan "Japanese" (10-17) and the OCR came out as noise. When the English
      // read of a middle page is not mostly real words, the pages are HANDWRITTEN or in another script — tesseract cannot be
      // trusted there, so the vision model transcribes up to 4 sampled pages instead (handwriting and any script).
      const mid = pages[Math.floor(pages.length / 2)];
      const probe = await sh(run, 'tesseract', [join(dir, `p${mid}.png`), '-', '-l', 'eng', '--psm', '1']).catch(() => '');
      if (!looksLikeWords(probe)) {
        const few = pages.length <= 4 ? pages : [pages[0], pages[1], mid, pages.at(-1)].filter((p, i, a) => a.indexOf(p) === i);
        const reads = await Promise.all(few.map(async (p) => (vision || visionRead)(await readFile(join(dir, `p${p}.png`))).catch(() => '')));
        const ok = reads.map((t) => (/^\s*UNREADABLE\s*$/i.test(t) ? '' : t));
        if (ok.join('').replace(/\s/g, '').length < 200) return { text: '', pages: few, script: 'unreadable', langs: 'vision' };
        return { text: ok.map((t, i) => `[page ${few[i]}]\n${t.trim()}`).join('\n\n'), pages: few, script: 'handwriting or non-Latin', langs: 'vision' };
      }
      // a FRENCH, SPANISH, GERMAN… scan read as English loses its accents and many words (10-18 benchmark: a degraded French
      // scan came back "not held" with no candidates): the language is guessed from the English probe's function words and
      // every page is read in it (tesseract has fra spa deu ita por nld on tower)
      const script = 'Latin', lang = guessLatinLang(probe), langs = lang === 'eng' ? 'eng' : `${lang}+eng`;
      const texts = await Promise.all(pages.map((p) => (p === mid && lang === 'eng' ? Promise.resolve(probe) : sh(run, 'tesseract', [join(dir, `p${p}.png`), '-', '-l', langs, '--psm', '1']).catch(() => ''))));
      return { text: texts.map((t, i) => `[page ${pages[i]}]\n${t.trim()}`).join('\n\n'), pages, script, langs };
    });
  } finally { await rm(work, { recursive: true, force: true }).catch(() => {}); }
}

// function words that only one language uses often — a page of OCR text names its language by them
const FUNCTION_WORDS = {
  fra: ['le', 'la', 'les', 'des', 'du', 'et', 'est', 'dans', 'une', 'pour', 'qui', 'que', 'sur', 'pas', 'avec', 'au', 'aux', 'ce', 'il', 'elle'],
  spa: ['el', 'los', 'las', 'del', 'y', 'es', 'en', 'una', 'para', 'que', 'por', 'con', 'se', 'su', 'lo', 'como', 'más', 'pero'],
  deu: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'den', 'dem', 'ein', 'eine', 'zu', 'auf', 'sich', 'von', 'auch', 'ich'],
  ita: ['il', 'della', 'che', 'e', 'di', 'non', 'per', 'una', 'gli', 'nel', 'sono', 'alla', 'dei', 'come', 'anche'],
  por: ['o', 'os', 'da', 'do', 'das', 'dos', 'e', 'que', 'não', 'uma', 'para', 'com', 'em', 'por', 'ao'],
  nld: ['de', 'het', 'een', 'en', 'van', 'is', 'niet', 'dat', 'op', 'zijn', 'met', 'voor', 'ook', 'maar'],
  eng: ['the', 'and', 'of', 'to', 'is', 'in', 'that', 'it', 'was', 'for', 'with', 'as', 'his', 'he', 'be', 'by', 'not', 'which'],
};
/** The language of a page of Latin-script OCR text, by function words → a tesseract code (eng when unsure). Pure. */
export function guessLatinLang(text) {
  const words = String(text || '').toLowerCase().normalize('NFC').match(/\p{L}+/gu) || [];
  if (words.length < 30) return 'eng';
  const score = Object.fromEntries(Object.entries(FUNCTION_WORDS).map(([l, ws]) => { const set = new Set(ws); return [l, words.filter((w) => set.has(w)).length / words.length]; }));
  const [best, val] = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return best !== 'eng' && val > 0.08 && val > score.eng * 1.5 ? best : 'eng';
}

// SPOT-CHECK, not a full read (Chad 10-18: "we should be able to tell by spot-checking and size comparison … It is wasteful
// to read the whole thing"): a PDF over SAMPLE_OVER pages is read on SAMPLE_PAGES sampled pages; its length comes from the
// page count. Intake (the import itself) still reads every page (full: true).
export const SAMPLE_OVER = 12, SAMPLE_PAGES = 10;

/**
 * A PDF's text layer → { text, pages, sampled } (sampled = the page numbers read, or null for a full read). poppler's
 * pdftotext — a separate native program (unpdf parsed a 270 MB book inside the API and pushed it past pm2's 3 GB, 10-18);
 * unpdf only where poppler is absent.
 */
export async function readPdf(src, { run = execFile, full = false } = {}) {
  try {
    return await onDisk(src, async (f) => {
      const pages = Number((await sh(run, 'pdfinfo', [f], 60000)).match(/^Pages:\s+(\d+)/m)?.[1]) || 1;
      if (!full && pages > SAMPLE_OVER) {
        const picks = samplePages(pages, SAMPLE_PAGES);
        const texts = await Promise.all(picks.map((p) => sh(run, 'pdftotext', ['-f', String(p), '-l', String(p), '-enc', 'UTF-8', f, '-'], 120000).catch(() => '')));
        return { text: picks.map((p, i) => `[page ${p}]\n${texts[i].trim()}`).join('\n\n'), pages, sampled: picks };
      }
      return { text: await sh(run, 'pdftotext', ['-enc', 'UTF-8', f, '-'], 600000), pages, sampled: null };
    });
  } catch (err) {
    if (!/ENOENT|not found/i.test(err.message)) throw err;
    const { extractText, getDocumentProxy } = await import('unpdf');
    const bytes = src.bytes || await readFile(src.path);
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return { text: Array.isArray(text) ? text.join('\n') : text || '', pages: totalPages || 1, sampled: null };
  }
}

/** A PDF → Markdown text: the text layer (sampled pages unless full), a fresh OCR of sampled pages when the layer is
 *  missing (a scan) or garbled (an old OCR). */
async function pdfToMarkdown(src, deps) {
  const { text: t, pages, sampled } = await (deps.readPdf || readPdf)(src, { full: !!deps.full });
  const per = sampled ? sampled.length : pages;
  const body = t.replace(/\[page \d+\]/g, '');
  const scan = body.replace(/\s/g, '').length < 200 || body.split(/\s+/).length / per < 25;
  const ocrOf = (o, extra = {}) => ({ markdown: o.text, pages, format: 'pdf', scan: true, sample: { sampled: o.pages, of: pages, engine: o.langs === 'vision' ? 'vision' : 'tesseract', script: o.script, ...extra } });
  // a GARBLED text layer (an old OCR: "uld ooo;o aiM1 r thea ~lk") reads worse than a fresh tesseract pass — Kelsey's
  // layer scored 0.80 real words, a fresh read 0.95, and the garble hid that the library holds it (10-17)
  const layer = !scan && mostlyLatin(body) ? wordRatio(body) : null;
  if (layer != null && layer < 0.88 && deps.ocr !== false) {
    const o = await (deps.ocrSample || ocrSample)(src, pages).catch(() => null);
    const fresh = o?.text ? wordRatio(o.text) : null;
    if (fresh != null && fresh >= layer + 0.08) return ocrOf(o, { replaced_layer: +layer.toFixed(2) });
  }
  // a scan: a preliminary OCR of sampled pages, so the holdings check can still compare TEXT (deps.ocr: false skips it)
  if (scan && deps.ocr !== false) {
    const o = await (deps.ocrSample || ocrSample)(src, pages).catch(() => null);
    if (o?.text && o.text.replace(/\s|\[page \d+\]/g, '').length > 200) return ocrOf(o);
  }
  return { markdown: t, pages, format: 'pdf', scan, ...(sampled ? { sample: { sampled, of: pages, engine: 'text-layer' } } : {}) };
}

/** Plain text in an unknown encoding: UTF-8 if it decodes cleanly, else Windows-1252 (old .txt files). */
function plain(bytes) {
  const u = Buffer.from(bytes).toString('utf8');
  return (u.match(/�/g) || []).length > 3 ? new TextDecoder('windows-1252').decode(bytes) : u;
}

/**
 * Any file → { markdown, pages, format, scan, sample? }. `name` gives the extension; content sniffing covers missing ones.
 * deps.path = the file on the server (read in place; bytes may then be null for a PDF); deps.full = read every page (intake);
 * deps.ocr === false = no preliminary OCR (intake). sample = { sampled, of, engine: text-layer|tesseract|vision } when only
 * some pages were read — the comparison then judges length from the page count.
 */
export async function toMarkdownText(bytes, name = '', deps = {}) {
  let ext = (String(name).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  if (ext === 'pdf' && deps.path && !bytes) return pdfToMarkdown({ path: deps.path }, deps);   // never loaded into memory
  const b = Buffer.from(bytes || await readFile(deps.path));
  if (!ext) ext = b.subarray(0, 4).toString() === '%PDF' ? 'pdf' : b.subarray(0, 8).toString() === 'bplist00' ? 'webarchive'
    : b[0] === 0x50 && b[1] === 0x4b ? (b.includes('mimetypeapplication/epub+zip') ? 'epub' : 'docx') : b.subarray(0, 5).toString() === '{\\rtf' ? 'rtf' : 'txt';
  if (MEDIA.test(ext)) throw Object.assign(new Error(`${ext.toUpperCase()} is audio/video — Dewey cannot transcribe it yet`), { unsupported: true });
  if (ext === 'pdf') return pdfToMarkdown({ bytes: b, path: deps.path || null }, deps);
  let html;
  if (ext === 'docx') html = await docxHtml(b);
  else if (OFFICE.has(ext)) html = await (deps.office || officeHtml)(b, ext);
  else if (ext === 'webarchive') html = webarchiveHtml(b);
  else if (ext === 'epub') html = await epubHtml(b);
  else if (['html', 'htm', 'xhtml'].includes(ext)) html = plain(b);
  else {
    const t = plain(b);
    if (/^\s*<(!doctype html|html)/i.test(t)) html = t;
    else return { markdown: t.replace(/\r/g, ''), pages: 1, format: ext || 'txt', scan: false };
  }
  return { markdown: htmlToMarkdown(html), pages: 1, format: ext, scan: false };
}
