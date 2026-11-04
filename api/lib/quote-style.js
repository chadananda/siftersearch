// Quoted words look different from Anís's own (Chad 11-04): rendered reply HTML → an <em> holding a quotation (it opens
// with a quotation mark, or is Arabic/Persian/Hebrew script) gets the quotation style, and a <blockquote> is a quotation
// block. RTL quotations stay upright (italics are wrong for Arabic script) with dir="rtl". Which words are quotations is
// decided server-side (quotes.js markQuotes); this only renders it. Pure; shared by chat, widget, admin, dialogue and email.

/** The quotation ink: a warm sepia, distinct from body text and from links. Mirrors --quote in src/styles/global.css. */
export const QUOTE_INK = Object.freeze({ light: '#6b4a2b', dark: '#dcc4a0' });

const RTL = '֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿';
const RTL_RE = new RegExp(`[${RTL}]`);
const OPENS_QUOTE = /^\s*(?:<a\b[^>]*>\s*)?(?:“|"|&quot;|&#34;|&#8220;|&ldquo;|«|&laquo;|„)/;
const text = (html) => html.replace(/<[^>]*>/g, '');
/** Is this <em>'s inner HTML a quotation? A quotation mark first, or right-to-left script with no Latin letters. */
export const isQuoteEm = (inner) => OPENS_QUOTE.test(inner) || (RTL_RE.test(text(inner)) && !/\p{Script=Latin}/u.test(text(inner)));
export const isRtlText = (inner) => RTL_RE.test(text(inner)) && !/\p{Script=Latin}/u.test(text(inner));

/**
 * Rendered HTML → quotation-styled HTML.
 * `inline: false` (site, widget, admin): class hooks — <em class="quote">, <em class="quote" dir="rtl">, <blockquote class="quote">;
 *   the page's CSS (--quote token) colours them.
 * `inline: true` (email: clients ignore stylesheets): the same with inline styles in `color`.
 * Already-classed or styled tags are left alone, so a second pass changes nothing. Pure.
 */
export function styleQuotes(html, { inline = false, color = QUOTE_INK.light } = {}) {
  const src = String(html ?? '');
  if (!/<(em|blockquote)>/.test(src)) return src;
  return src
    .replace(/<em>((?:(?!<\/?em\b)[\s\S])*)<\/em>/g, (m, inner) => {
      if (!isQuoteEm(inner)) return m;
      const rtl = isRtlText(inner);
      if (!inline) return `<em class="quote"${rtl ? ' dir="rtl"' : ''}>${inner}</em>`;
      return `<em${rtl ? ' dir="rtl"' : ''} style="color:${color};font-style:${rtl ? 'normal' : 'italic'}">${inner}</em>`;
    })
    .replace(/<blockquote>/g, inline ? `<blockquote style="color:${color}">` : '<blockquote class="quote">');
}
