// THE email renderer — every mailer (tower sendEmail: alerts, digests, Dewey, audits; the Worker's Anís letters and
// digests) sends { text, html } from here: Markdown → safe inline-styled HTML (raw HTML escaped except a few inline tags,
// only http/https/mailto links) + a plain-text alternative with the Markdown syntax removed and URLs kept.
// Pure (marked only) — imported by the Cloudflare Worker too. Chad 10-22: "Anís digests of unrendered markdown".
import { Marked } from 'marked';

export const PALETTE = Object.freeze({ ink: '#2b2621', sea: '#1f6f8b', mist: '#8fa3ab', rule: '#a9cbd6' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SAFE_URL = /^(https?:|mailto:|#)/i;
// inline tags a writer may use on purpose (the reading guide's <mark>, superscript note numbers); everything else is shown as text
const SAFE_TAG = /^<\/?(mark|sup|sub|br|b|i|em|strong|u|small)\s*\/?>$/i;

const marked = new Marked({ gfm: true, async: false });
const markedBreaks = new Marked({ gfm: true, breaks: true, async: false });
for (const m of [marked, markedBreaks]) {
  m.use({ renderer: {
    html({ text }) { return String(text).split(/(<[^>]*>)/).map((p) => (SAFE_TAG.test(p.trim()) ? p : esc(p))).join(''); },
    link({ href, title, tokens }) {
      const inner = this.parser.parseInline(tokens);
      return SAFE_URL.test(String(href || '').trim()) ? `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}>${inner}</a>` : inner;
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
  return (breaks ? markedBreaks : marked).parse(String(md ?? ''))
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
  return blocks(marked.lexer(String(md ?? '')), opts).replace(/\n{3,}/g, '\n\n').trim();
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
