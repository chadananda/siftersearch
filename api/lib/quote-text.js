// Shared quotation primitives (pure): folding for comparison and extraction of quoted spans. Used by raw search's
// source resolution (source-resolve.js) and Anis's quote guard (anis/quotes.js) — one definition of "a quote".

/** Lowercase, no diacritics/apostrophes/quote marks, punctuation → spaces. Both sides of every comparison. */
export const foldText = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[‘’ʼ`'"“”]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Quoted spans long enough to be a quotation of a text (≥5 words). */
export function quoteSpans(text) {
  return [...String(text || '').matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1].trim())
    .filter((q) => q.split(/\s+/).length >= 5);
}

/** Does `text` contain the quoted words? An ellipsis may join verbatim pieces; each piece of ≥3 words must appear. */
export function containsQuote(text, span) {
  const hay = foldText(text);
  const pieces = String(span).split(/\.\.\.|…/).map(foldText).filter((p) => p.split(' ').length >= 3);
  return pieces.length > 0 && pieces.every((p) => hay.includes(p));
}
