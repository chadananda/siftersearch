// A reply's blockquotes + their citation lines (markdown) → blocks / segments, so the chat clients can show each quoted passage as a
// passage card (cover, quote, linked citation). Pure, no deps: shared by the server (assistant/quote-cards.js) and BOTH chat clients
// (src/components/ChatInterface.svelte, src/widget/SifterChat.svelte). A block with no card stays plain markdown (email/PDF/voice never use this).

const QUOTE = /^\s*>/;
const DASH = /^\s*(?:[—–―]|-{1,2})\s*/;
const LINK = /\[((?:[^[\]]|\[[^\]]*\])*)\]\((https?:\/\/[^\s)]+)\)/;

/** Text folded for matching: no accents, markup, links' urls or punctuation, lower case. */
export const foldQuote = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** The quote's key: its first 12 folded words (the client matches a card by url, else by this). */
export const quoteKey = (body) => foldQuote(body).split(' ').slice(0, 12).join(' ');

// a citation line: "— [*Work*, place](url)" (a dash, then a link somewhere), or a short line opening with a link right under the quote
const isCite = (line, adjacent) => LINK.test(line) && (DASH.test(line) || (adjacent && /^\s*[*_]*\[/.test(line) && line.trim().length <= 200));

/** Every blockquote → { start, end (line index, exclusive, citation line included), body (markdown, no ">"), attribution (markdown, no dash) | null, url | null, key }. */
export function quoteBlocks(md) {
  const lines = String(md || '').split('\n'), out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!QUOTE.test(lines[i])) continue;
    let j = i; while (j < lines.length && QUOTE.test(lines[j])) j++;
    const inner = lines.slice(i, j).map((l) => l.replace(/^\s*>\s?/, ''));
    let last = inner.length - 1; while (last >= 0 && !inner[last].trim()) last--;
    let attribution = null, end = j, bodyLines = inner.slice(0, last + 1);
    if (last > 0 && isCite(inner[last], true)) { attribution = inner[last]; bodyLines = inner.slice(0, last); }
    else {
      let k = j; while (k < lines.length && !lines[k].trim()) k++;
      if (k < lines.length && !QUOTE.test(lines[k]) && isCite(lines[k], k === j)) { attribution = lines[k]; end = k + 1; }
    }
    while (bodyLines.length && !bodyLines.at(-1).trim()) bodyLines.pop();
    const body = bodyLines.join('\n');
    const att = attribution ? attribution.replace(DASH, '').trim() : null;
    out.push({ start: i, end, body, attribution: att, url: att ? att.match(LINK)[2] : null, key: quoteKey(body) });
    i = end - 1;
  }
  return out;
}

/** The card for a block: same url, else same quote key. */
export const cardFor = (block, cards) => (cards || []).find((c) => c?.url && c.url === block.url)
  || (cards || []).find((c) => c?.key && block.key && c.key === block.key) || null;

/** md + cards → [{ kind: 'text', md } | { kind: 'quote', md, body, attribution, card }]; blocks without a card stay in the text. */
export function quoteSegments(md, cards) {
  const src = String(md || '');
  if (!cards?.length || !src) return [{ kind: 'text', md: src }];
  const lines = src.split('\n'), out = [];
  let from = 0;
  for (const b of quoteBlocks(src)) {
    const card = cardFor(b, cards);
    if (!card || !b.body.trim()) continue;
    if (b.start > from) out.push({ kind: 'text', md: lines.slice(from, b.start).join('\n') });
    out.push({ kind: 'quote', md: lines.slice(b.start, b.end).join('\n'), body: b.body, attribution: b.attribution, card });
    from = b.end;
  }
  if (from < lines.length) out.push({ kind: 'text', md: lines.slice(from).join('\n') });
  return out.filter((s) => s.kind === 'quote' || s.md.trim());
}

/** The cover at width w through the image service (ImageKit `tr=` syntax, as the book card): pair with a srcset. */
// Our covers size by ImageKit `tr=`; bahai-education.org's own image worker (/ix/, Star of the West issue scans, referenced in place) by `w=`.
export const coverAt = (url, w) => (url ? `${url}${url.includes('?') ? '&' : '?'}${/^https:\/\/bahai-education\.org\/ix\//.test(url) ? `w=${w}` : `tr=w-${w},q-80,e-sharpen`}` : null);
export const coverSrcset = (url, widths = [48, 96, 144]) => (url ? widths.map((w) => `${coverAt(url, w)} ${w}w`).join(', ') : null);
