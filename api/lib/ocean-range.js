// OceanLibrary range links: `<book url>?paraId=para_N&selectionString=<ilmid>.<from>~<ilmid>.<to>` (verified in the
// browser 2026-10-08). Offsets count NON-WHITESPACE characters of the paragraph as the site shows it; our stored text
// still carries markup the site does not display (escapes, [^n] notes, [pg n] page marks, image/link syntax, _ and *),
// so those are skipped when counting. ilmid = <bookid>-<ilm_id> for "bl…" ids, else <bookid>_<ilm_id> (824/824 checked).
// Pure.

// Markup our text keeps that the page does not show: [pattern, how many leading chars of the match stay visible]
const HIDDEN = [
  /\\(?=[\\`*_{}[\]()#+\-.!])/y,            // markdown escape: drop the backslash
  /\[\^[^\]\s]+\]/y,                        // footnote marker [^1]
  /\[pg [^\]]*\]/y,                         // page marker [pg xix]
  /!?\[(?=[^\]]*\]\([^)]*\))/y,             // opening of ![img](url) / [link](url): drop "![" or "["
  /\]\([^)]*\)/y,                           // ...and its "](url)"
  /[_*]/y,                                  // emphasis
  /[̱̲]/y,                        // combining line below (S̱háh): the site underlines with markup instead
];

/** For each char of `text`: is it a character the site counts (visible, not whitespace)? */
export function countedMask(text) {
  const mask = new Array(text.length).fill(true);
  for (let i = 0; i < text.length;) {
    let hit = null;
    for (const re of HIDDEN) { re.lastIndex = i; const m = re.exec(text); if (m && m[0].length) { hit = m[0].length; break; } }
    if (hit) { for (let k = i; k < i + hit; k++) mask[k] = false; i += hit; continue; }
    if (/\s/.test(text[i])) mask[i] = false;
    i++;
  }
  return mask;
}

/** Site offset of a char index in our stored text: counted chars before it. */
export function siteOffset(text, index) {
  const mask = countedMask(text);
  let n = 0;
  for (let k = 0; k < Math.min(index, text.length); k++) if (mask[k]) n++;
  return n;
}

export const ilmid = (bookid, ilmId) => `${bookid}${String(ilmId).startsWith('bl') ? '-' : '_'}${ilmId}`;

const norm = (s) => s.normalize('NFC').replace(/[‘’ʼ`´]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').toLowerCase();

/** Char span of `quote` inside `text` (case/quote-mark/space-insensitive), or null. */
export function findSpan(text, quote) {
  // map normalised positions back to the original: build the normalised string char by char
  const map = [];
  let flat = '';
  const src = text.normalize('NFC');
  for (let i = 0; i < src.length; i++) {
    const c = norm(src[i]);
    if (c === ' ' && flat.endsWith(' ')) continue;
    flat += c; map.push(i);
  }
  const q = norm(quote).trim();
  const at = q ? flat.indexOf(q) : -1;
  if (at < 0) return null;
  return { start: map[at], end: map[at + q.length - 1] + 1 };
}

/**
 * Range link for a passage that runs from `start` to `end` (paragraph objects, possibly the same one).
 * @param {string} bookUrl   the book's OceanLibrary URL (docs.source_url)
 * @param {string} bookid    frontmatter bookid (docs.external_id)
 * @param {{para_id, ilm_id, text, from}} start  from = char index in start.text (default 0)
 * @param {{para_id, ilm_id, text, to}}   end    to = char index (exclusive) in end.text (default its length)
 */
export function rangeUrl(bookUrl, bookid, start, end = start) {
  if (!bookUrl || !bookid || !start?.ilm_id || !end?.ilm_id) return null;
  const from = siteOffset(start.text || '', start.from ?? 0);
  const to = siteOffset(end.text || '', end.to ?? (end.text || '').length);
  const base = bookUrl.replace(/\/?$/, '/');
  const sel = `${ilmid(bookid, start.ilm_id)}.${from}~${ilmid(bookid, end.ilm_id)}.${to}`;
  return `${base}?paraId=${encodeURIComponent(start.para_id)}&selectionString=${encodeURIComponent(sel)}`;
}

/** Range link for a quote found inside one paragraph; falls back to null when the quote is not in it. */
export function quoteUrl(bookUrl, bookid, para, quote) {
  const span = findSpan(para?.text || '', quote || '');
  if (!span) return null;
  return rangeUrl(bookUrl, bookid, { ...para, from: span.start }, { ...para, to: span.end });
}
