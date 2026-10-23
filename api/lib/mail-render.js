// THE email renderer — every mailer (tower sendEmail: alerts, digests, Dewey, audits; the Worker's Anís letters and
// digests) sends { text, html } from here: Markdown → safe inline-styled HTML (raw HTML escaped except a few inline tags,
// only http/https/mailto links) + a plain-text alternative with the Markdown syntax removed and URLs kept.
// Pure (marked only) — imported by the Cloudflare Worker too. Chad 10-22: "Anís digests of unrendered markdown".
// Right-to-left (Chad 10-23, a Persian prayer "line by line" arrived scrambled): an original beside its translation —
// a ```bilingual fence, or detected `RTL : LTR` lines / list items — becomes a two-column table (original right,
// English left; stacked on phones), never one mixed bidi run; a block with Arabic/Persian/Hebrew gets an explicit dir;
// a stray RTL word inside an English sentence is isolated (<span dir="rtl">). Text part: original line, translation line.
import { Marked, Lexer } from 'marked';

export const PALETTE = Object.freeze({ ink: '#2b2621', sea: '#1f6f8b', mist: '#8fa3ab', rule: '#a9cbd6' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SAFE_URL = /^(https?:|mailto:|#)/i;
// inline tags a writer may use on purpose (the reading guide's <mark>, superscript note numbers); everything else is shown as text
const SAFE_TAG = /^<\/?(mark|sup|sub|br|b|i|em|strong|u|small)\s*\/?>$/i;

let bilSlots = null;   // set for the length of one (synchronous) markdownHtml parse
const marked = new Marked({ gfm: true, async: false });
const markedBreaks = new Marked({ gfm: true, breaks: true, async: false });
for (const m of [marked, markedBreaks]) {
  m.use({ renderer: {
    html({ text }) { return String(text).split(/(<[^>]*>)/).map((p) => (SAFE_TAG.test(p.trim()) ? p : esc(p))).join(''); },
    link({ href, title, tokens }) {
      const inner = this.parser.parseInline(tokens);
      return SAFE_URL.test(String(href || '').trim()) ? `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}>${inner}</a>` : inner;
    },
    code({ text, lang }) {   // ```bilingual → a slot filled after styling (its table carries its own styles)
      if (String(lang || '').trim() !== 'bilingual' || !bilSlots) return false;
      bilSlots.push(parseBilingual(text));
      return `@@BIL${bilSlots.length - 1}@@\n`;
    },
    image({ href, text }) {   // no remote images (blocked by default, and a tracking risk): the alt text, linked
      return SAFE_URL.test(String(href || '').trim()) ? `<a href="${esc(href)}">${esc(text || href)}</a>` : esc(text || '');
    },
  } });
}

/** Markdown → email HTML, styled inline (mail clients ignore stylesheets). `breaks`: single newlines are line breaks
 *  (for plain-text reports passed as Markdown). Pure. */
export function markdownHtml(md, { breaks = false, palette = PALETTE } = {}) {
  const { ink, sea, rule } = palette;
  const slots = [];
  let html;
  bilSlots = slots;
  try { html = (breaks ? markedBreaks : marked).parse(normalizeBilingual(md)); } finally { bilSlots = null; }
  html = html
    .replace(/<h[1-3](\s[^>]*)?>/g, `<h3 dir="auto" style="margin:22px 0 8px;font-size:18px;line-height:1.35;color:${sea}">`).replace(/<\/h[1-3]>/g, '</h3>')
    .replace(/<h[4-6](\s[^>]*)?>/g, `<h4 dir="auto" style="margin:16px 0 6px;font-size:16.5px;color:${sea}">`).replace(/<\/h[4-6]>/g, '</h4>')
    .replace(/<strong>/g, `<strong style="color:${ink}">`)
    .replace(/<ul>/g, '<ul style="margin:6px 0 14px;padding-left:22px">').replace(/<ol(\s[^>]*)?>/g, (m, a = '') => `<ol${a} style="margin:6px 0 14px;padding-left:24px">`)
    .replace(/<hr\s*\/?>/g, `<hr style="border:0;border-top:1px solid ${rule};margin:18px 0">`)
    .replace(/<p>/g, '<p dir="auto" style="margin:0 0 14px">')
    .replace(/<mark>/g, '<mark style="background:#f7e9b9;color:inherit;padding:0 2px;border-radius:2px">')
    .replace(/<blockquote>/g, `<blockquote style="margin:16px 0;padding:2px 0 2px 18px;border-left:2px solid ${rule};color:#3f3a34">`)
    .replace(/<a href=/g, `<a style="color:${sea};text-decoration:none;border-bottom:1px solid ${sea}66" href=`)
    .replace(/<li>/g, '<li dir="auto" style="margin:0 0 6px">')
    .replace(/<pre>/g, '<pre style="font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;background:#f4f6f7;padding:10px 12px;border-radius:6px;overflow-x:auto">')
    .replace(/<code>/g, '<code style="font:0.92em ui-monospace,Menlo,Consolas,monospace">')
    .replace(/<table>/g, '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:15px">')
    .replace(/<th(\s[^>]*)?>/g, (m, a = '') => `<th${a} dir="auto" style="text-align:left;padding:6px 14px 6px 0;border-bottom:1px solid ${rule};color:${sea};vertical-align:bottom">`)
    .replace(/<td(\s[^>]*)?>/g, (m, a = '') => `<td${a} dir="auto" style="padding:6px 14px 6px 0;border-bottom:1px solid #e3ebee;vertical-align:top">`);
  return isolateRtl(directionalize(html))
    .replace(/(?:<p[^>]*>)?@@BIL(\d+)@@\s*(?:<\/p>)?/g, (m, i) => bilingualHtml(slots[Number(i)] || [], palette));
}

/** Preformatted text (aligned ops reports) → an escaped, wrapped <pre> with its URLs linked. Pure. */
export function preHtml(text) {
  return `<pre style="font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;margin:0">${esc(text)
    .replace(/https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/g, (u) => `<a href="${u}" style="color:${PALETTE.sea}">${u}</a>`)}</pre>`;
}

// ── plain text: walk marked's tokens, keep the words and the URLs, drop the syntax ──
const decode = (s) => String(s ?? '').replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]));
const stripTags = (s) => String(s ?? '').replace(/<[^>]*>/g, '');
function inline(tokens = []) {
  return tokens.map((t) => {
    switch (t.type) {
      case 'strong': case 'em': case 'del': return inline(t.tokens);
      case 'codespan': return decode(t.text);
      case 'br': return '\n';
      case 'escape': return t.text;
      case 'html': return stripTags(t.text);
      case 'link': {
        const label = inline(t.tokens).trim();
        const href = String(t.href || '');
        if (!SAFE_URL.test(href)) return label;
        const bare = href.replace(/^mailto:/i, '');
        return !label || label === href || label === bare ? bare : `${label} (${href})`;
      }
      case 'image': return t.text ? `${t.text} (${t.href})` : t.href;
      case 'text': return t.tokens ? inline(t.tokens) : decode(t.text);
      default: return t.tokens ? inline(t.tokens) : decode(t.text ?? t.raw ?? '');
    }
  }).join('');
}
const indent = (s, pad) => s.split('\n').map((l) => (l ? pad + l : l)).join('\n');
function blocks(tokens = [], opts = {}) {
  const out = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'space': break;
      case 'heading': out.push(inline(t.tokens)); break;
      case 'paragraph': out.push(inline(t.tokens)); break;
      case 'text': out.push(t.tokens ? inline(t.tokens) : decode(t.text)); break;
      case 'blockquote': out.push(indent(blocks(t.tokens, opts), '    ')); break;
      case 'list': out.push(t.items.map((it, i) => {
        const mark = t.ordered ? `${(Number(t.start) || 1) + i}. ` : '• ';
        const body = blocks(it.tokens, opts).replace(/\n{2,}/g, '\n');
        return mark + indent(body, ' '.repeat(mark.length)).slice(mark.length);
      }).join('\n')); break;
      case 'code': {
        if (String(t.lang || '').trim() === 'bilingual') { out.push(bilingualText(parseBilingual(t.text))); break; }
        const custom = opts.code?.(t.lang || '', t.text);
        out.push(custom ?? indent(t.text, '    '));
        break;
      }
      case 'table': out.push([t.header, ...t.rows].map((row) => row.map((c) => inline(c.tokens).trim()).join('  ·  ')).join('\n')); break;
      case 'hr': out.push('————'); break;
      case 'html': { const s = stripTags(t.text).trim(); if (s) out.push(decode(s)); break; }
      default: if (t.tokens) out.push(blocks(t.tokens, opts)); else if (t.text) out.push(decode(t.text));
    }
  }
  return out.join('\n\n');
}

/** Markdown → readable plain text: no **, ##, [](), > or | syntax; links become "label (url)". `code(lang, text)` may
 *  render a fenced block its own way (letters draw ```chart blocks). Pure. */
export function markdownText(md, opts = {}) {
  return blocks(marked.lexer(normalizeBilingual(md)), opts).replace(/\n{3,}/g, '\n\n').trim();
}

// ── right-to-left: bilingual pairs, block direction, isolated RTL words ──
const RTL = '\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF';
const RTL_RE = new RegExp(`[${RTL}]`);
const RTL_LETTERS = new RegExp(`[${RTL}]`, 'g');
const LTR_LETTERS = new RegExp(`(?![${RTL}])\\p{L}`, 'gu');
const hasRtl = (s) => RTL_RE.test(s);
const hasLatin = (s) => /\p{Script=Latin}/u.test(s);
const count = (s, re) => (String(s).match(re) || []).length;
/** Which right-to-left language a run is in: Hebrew, Persian (its own letters), else Arabic. Pure. */
export const rtlLang = (s) => (/[\u0590-\u05FF\uFB1D-\uFB4F]/.test(s) ? 'he' : /[\u067E\u0686\u0698\u06AF\u06A9\u06CC]/.test(s) ? 'fa' : 'ar');
const FONT = {   // Georgia has no Arabic/Hebrew; name faces that do (Android, Apple, Windows), slightly larger
  ar: "'Noto Naskh Arabic','Geeza Pro','Al Nile','Times New Roman','Segoe UI',Tahoma,serif",
  fa: "'Noto Naskh Arabic','Geeza Pro','Al Nile','Times New Roman','Segoe UI',Tahoma,serif",
  he: "'Noto Serif Hebrew','Times New Roman','Arial Hebrew',serif",
};
const MARKS = /^[*_~\s]+|[*_~\s]+$/g;

/** One line read as an original beside its translation — `هو الله: *He is God.*` (or `He is God — هو الله`), list marker
 *  allowed — → { orig, trans } (Markdown kept), or null. One side all right-to-left, the other all Latin. Pure. */
export function pairLine(line) {
  const s = String(line ?? '').replace(/^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+/, '');
  if (!hasRtl(s) || !hasLatin(s)) return null;
  for (const m of s.matchAll(/\s*(?::|：|\s[—–-])[*_]*\s+/g)) {
    let a = s.slice(0, m.index), b = s.slice(m.index + m[0].length);
    const lead = a.match(/^[*_]+/)?.[0];   // **هو الله:** *He…* — the bold opened before the colon closes after it
    if (lead && !a.trimEnd().endsWith(lead) && b.startsWith(lead)) b = b.slice(lead.length);
    a = a.replace(MARKS, ''); b = b.trim();
    if (b.startsWith('*') && !b.startsWith('**') && b.endsWith('*') && !b.slice(1, -1).includes('*')) b = b.slice(1, -1);
    if (b.startsWith('_') && b.endsWith('_') && !b.slice(1, -1).includes('_')) b = b.slice(1, -1);
    if (!a || !b) continue;
    if (hasRtl(a) && !hasLatin(a) && hasLatin(b) && !hasRtl(b)) return { orig: a, trans: b };
    if (hasLatin(a) && !hasRtl(a) && hasRtl(b) && !hasLatin(b)) return { orig: b.replace(MARKS, ''), trans: a };
  }
  return null;
}

/** A ```bilingual block's body → [{ orig, trans }]: an original line, then its translation on the next (either order),
 *  or both on one line as pairLine reads them. Pure. */
export function parseBilingual(src) {
  const pairs = [];
  for (const raw of String(src ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const p = pairLine(line);
    if (p) { pairs.push(p); continue; }
    const text = line.replace(/^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+/, '');
    const rtl = count(text, RTL_LETTERS) > count(text, LTR_LETTERS);
    const last = pairs.at(-1);
    if (rtl) {
      if (last && !last.orig) last.orig = text.replace(MARKS, '');
      else pairs.push({ orig: text.replace(MARKS, ''), trans: '' });
    } else if (last && !last.trans) last.trans = text;
    else pairs.push({ orig: '', trans: text });
  }
  return pairs;
}

/** Markdown before rendering: a :::bilingual fence becomes ```bilingual, and a run of mixed-script pair lines (bullets or
 *  plain lines, blank lines allowed between) becomes one ```bilingual block. Code fences are left alone. Pure. */
export function normalizeBilingual(md) {
  const lines = String(md ?? '').split('\n');
  const out = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence === ':::' && /^\s*:::\s*$/.test(line)) { out.push('```'); fence = null; continue; }
    if (fence) { out.push(line); if (fence !== ':::' && line.trim().startsWith(fence)) fence = null; continue; }
    const open = line.match(/^\s*(```|~~~)/);
    if (open) { fence = open[1]; out.push(line); continue; }
    if (/^\s*:::\s*bilingual\s*$/i.test(line)) { fence = ':::'; out.push('```bilingual'); continue; }
    if (!pairLine(line)) { out.push(line); continue; }
    const run = [];
    let j = i;
    while (j < lines.length) {
      if (pairLine(lines[j])) { run.push(lines[j].replace(/^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+/, '')); j++; continue; }
      let k = j; while (k < lines.length && !lines[k].trim()) k++;
      if (k > j && k < lines.length && pairLine(lines[k])) { j = k; continue; }
      break;
    }
    out.push('', '```bilingual', ...run, '```', '');
    i = j - 1;
  }
  return out.join('\n');
}

const inlineHtml = (s) => marked.parseInline(String(s ?? ''));
/** Pairs → a two-column table, one row per line: the original on the right (dir=rtl, its own font, larger), the
 *  translation on the left (dir=ltr, italic, muted). Readable at 360 px as is; phones that honour the media query in
 *  emailDocument stack each pair (original over translation). Inline styles only. Pure. */
export function bilingualHtml(pairs, palette = PALETTE) {
  if (!pairs.length) return '';
  const lang = rtlLang(pairs.map((p) => p.orig).join(' '));
  const rows = pairs.map((p) => {
    const l = p.orig ? rtlLang(p.orig) : lang;
    return '<tr>'
      + `<td class="em-bil-o" dir="rtl" lang="${l}" width="50%" style="width:50%;text-align:right;vertical-align:top;padding:8px 0 8px 14px;border-bottom:1px solid #e3ebee;font-family:${FONT[l]};font-size:18.5px;line-height:1.8;font-style:normal;color:${palette.ink}">${inlineHtml(p.orig)}</td>`
      + `<td class="em-bil-t" dir="ltr" lang="en" width="50%" style="width:50%;text-align:left;vertical-align:top;padding:10px 14px 8px 0;border-bottom:1px solid #e3ebee;font-style:italic;font-size:15px;line-height:1.55;color:#4a545c">${inlineHtml(p.trans)}</td>`
      + '</tr>';
  }).join('');
  return `<table role="presentation" class="em-bil" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:10px 0 18px">${rows}</table>`;
}
/** Pairs → plain text: the original on one line, its translation on the next, a blank line between pairs. Pure. */
export function bilingualText(pairs) {
  const plain = (s) => inline(Lexer.lexInline(String(s ?? ''))).trim();
  return pairs.map((p) => [plain(p.orig), plain(p.trans)].filter(Boolean).join('\n')).join('\n\n');
}

/** Blocks holding right-to-left text get an explicit direction by their dominant script (an English sentence with one
 *  Persian word stays ltr; a Persian line goes rtl, right-aligned, in an Arabic-script face). Blocks with no RTL text
 *  keep dir="auto" (an all-English letter is byte-identical). Pure. */
function directionalize(html) {
  return html.replace(/<(p|li|h3|h4|td|th) dir="auto"([^>]*)>/g, (m, tag, attrs, off, str) => {
    const end = str.indexOf(`</${tag}>`, off);
    const inner = decode(stripTags(str.slice(off + m.length, end < 0 ? undefined : end)));
    if (!hasRtl(inner)) return m;
    if (count(inner, RTL_LETTERS) <= count(inner, LTR_LETTERS)) return `<${tag} dir="ltr"${attrs}>`;
    const l = rtlLang(inner);
    const css = `text-align:right;font-family:${FONT[l]};`;
    const a = /style="/.test(attrs) ? attrs.replace(/text-align:[a-z]+;?/, '').replace('style="', `style="${css}`) : `${attrs} style="${css}"`;
    return `<${tag} dir="rtl" lang="${l}"${a}>`;
  });
}

/** Inside left-to-right text, each run of Arabic/Persian/Hebrew words → <span dir="rtl" lang> (a bidi isolate), so a
 *  word like فرنگ cannot drag the sentence's punctuation across. Text under an rtl element, <pre> or <code> is left. Pure. */
const RUN = new RegExp(`[${RTL}](?:[${RTL}\\s\\u200c\\u200d.,،؛؟0-9\\u06F0-\\u06F9-]*[${RTL}])?`, 'g');
const VOID = /^(br|hr|img|meta|input|wbr)$/i;
function isolateRtl(html) {
  const stack = [];
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith('<')) {
      const close = part.match(/^<\/([a-z0-9]+)/i);
      if (close) { const i = stack.map((e) => e.tag).lastIndexOf(close[1].toLowerCase()); if (i >= 0) stack.length = i; return part; }
      const open = part.match(/^<([a-z0-9]+)/i);
      if (open && !VOID.test(open[1]) && !part.endsWith('/>')) {
        const tag = open[1].toLowerCase();
        const dir = part.match(/\sdir="(rtl|ltr)"/)?.[1] || stack.at(-1)?.dir || 'ltr';
        stack.push({ tag, dir, raw: tag === 'pre' || tag === 'code' || stack.at(-1)?.raw });
      }
      return part;
    }
    const top = stack.at(-1);
    if (!part || top?.dir === 'rtl' || top?.raw || !hasRtl(part)) return part;
    return part.replace(RUN, (run) => `<span dir="rtl" lang="${rtlLang(run)}">${run}</span>`);
  }).join('');
}

// Dark mode: clients that honour prefers-color-scheme (Apple Mail, iOS, Outlook.com) get these; inline styles are the
// light look every client shows. Gmail ignores <style> media queries and applies its own inversion.
const DARK = `@media (prefers-color-scheme: dark){
.em-body{background:#16191c!important;color:#e6e1d8!important}
.em-body p,.em-body li,.em-body td,.em-body div,.em-body h3,.em-body h4,.em-body strong,.em-body b{color:#e6e1d8!important}
.em-body h3,.em-body h4,.em-body th{color:#8fd0e6!important}
.em-body a{color:#8fd0e6!important;border-color:#8fd0e6!important}
.em-body blockquote{color:#cfc8bd!important;border-color:#4a6a75!important}
.em-body pre,.em-body code,.em-body div[style*="background"]{background:#22272b!important;color:#e6e1d8!important}
.em-body mark{background:#5a4a1a!important}
.em-body td.em-bil-t{color:#b9c2c8!important}
.em-body td.em-bil-o,.em-body td.em-bil-t{border-color:#33404a!important}
}
@media (max-width:420px){
table.em-bil td.em-bil-o,table.em-bil td.em-bil-t{display:block!important;width:auto!important}
table.em-bil td.em-bil-o{border-bottom:0!important;padding:10px 0 0!important}
table.em-bil td.em-bil-t{padding:2px 0 10px!important}
}`;

/** Fragment → a whole HTML document for a mail client (charset, viewport, light/dark). A full document passes through. */
export function emailDocument(inner, { title = '' } = {}) {
  const s = String(inner ?? '');
  if (/^\s*(<!doctype|<html)/i.test(s)) return s;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">`
    + `${title ? `<title>${esc(title)}</title>` : ''}<style>${DARK}</style></head>`
    + `<body style="margin:0;padding:0"><div class="em-body" style="padding:16px;font-family:Georgia,'Times New Roman',serif;color:${PALETTE.ink};font-size:16px;line-height:1.6">${s}</div></body></html>`;
}

/** THE one normaliser every mailer sends through → { text, html }, always both parts:
 *    markdown → html rendered + text stripped of syntax
 *    html     → kept (wrapped as a document); text as given (or the html's words)
 *    text     → read as Markdown (line breaks kept): html rendered, text stripped; pre: true → a <pre>, text untouched
 *  Pure. */
export function renderEmail({ markdown = null, text = null, html = null, pre = false, title = '' } = {}) {
  if (markdown != null) {
    return { text: text ?? markdownText(markdown), html: emailDocument(html ?? markdownHtml(markdown), { title }) };
  }
  if (html) return { text: text ?? decode(stripTags(String(html).replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)[^>]*>/gi, '\n'))).replace(/\n{3,}/g, '\n\n').trim(), html: emailDocument(html, { title }) };
  const t = String(text ?? '');
  if (pre) return { text: t, html: emailDocument(preHtml(t), { title }) };
  return { text: markdownText(t), html: emailDocument(markdownHtml(t, { breaks: true }), { title }) };
}
