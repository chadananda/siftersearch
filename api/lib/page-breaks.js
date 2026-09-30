// Print-page breaks in source markdown (Chad, 2026-09-30): <pb vol="3" n="112"/> (TEI page break; empty <pb/> = a join
// with no known number) stays in the SOURCE for publication references and is never part of a paragraph's text.
// Ingest: each paragraph gets the page it STARTS on (pdf_page = n, block_attrs.pdf_vol = vol) and the breaks that fall
// inside it (block_attrs.pb = [[offset, vol, n], …], offsets into the stored text). HTML comments (a page's footnotes,
// <!-- fn: … -->) are dropped from the text too. Pure; no deps.
const PB = /<pb(?:\s+vol="(\d+)")?(?:\s+n="(\d+)")?\s*\/>|⟦pb:(\d*):(\d*)⟧/g;
const COMMENT = /<!--[\s\S]*?-->/g;

/** Before AI segmentation: one space-free token per break, so the word-numbered passes cannot split a tag. */
export const protectPageBreaks = (text) => String(text).replace(PB, (m, v, n, v2, n2) => `⟦pb:${v ?? v2 ?? ''}:${n ?? n2 ?? ''}⟧`);

export const hasPageBreaks = (text) => { PB.lastIndex = 0; return PB.test(String(text)); };

/**
 * Walk the chunks in reading order; returns new chunks with the tags/comments removed and the page recorded.
 * A chunk left empty (it held only a break or a note) is dropped — its break still moves the running page.
 */
export function applyPageBreaks(chunks) {
  let vol = null, page = null;
  const out = [];
  for (const c of chunks) {
    const raw = String(c.text ?? '').replace(COMMENT, ' ');
    let startVol = vol, startPage = page, text = '', last = 0, sawText = false;
    const inside = [];
    PB.lastIndex = 0;
    for (let m; (m = PB.exec(raw));) {
      const before = raw.slice(last, m.index);
      if (before.trim()) sawText = true;
      text += before;
      const v = m[1] ?? m[3], n = m[2] ?? m[4];
      const nv = v ? Number(v) : vol, nn = n ? Number(n) : null;
      if (!sawText) { startVol = nv; startPage = nn; }      // a break at the very start: the paragraph begins on it
      else inside.push([text.replace(/\s+/g, ' ').trimStart().length, nv, nn]);
      vol = nv; page = nn;
      last = m.index + m[0].length;
    }
    text = (text + raw.slice(last)).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const attrs = { ...(c.attrs || {}) };
    if (startPage != null && attrs.pdf_page == null) attrs.pdf_page = String(startPage);
    if (startVol != null) attrs.pdf_vol = startVol;
    if (inside.length) attrs.pb = inside;
    out.push({ ...c, text, attrs: Object.keys(attrs).length ? attrs : (c.attrs ?? null) });
  }
  return out;
}
