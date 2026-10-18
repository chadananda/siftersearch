// TEXT CLEANER — every extracted text, whatever its format, before import (10-18 import inspection: 133 of 169 Dewey imports
// stored printed LINES as paragraphs — "Immortals" came in as 6,218 paragraphs of ~10 words; 84 kept running headers,
// 66 broken hyphens, 62 Markdown emphasis like "r**é**gime"). Works on Markdown BLOCKS (blank-line separated), so it fixes
// pdftotext lines, OCR'd .txt and Word files with a hard break on every printed line alike. Pure.
//   1. page markers: form feeds (pdftotext) become <pb n="k"/>
//   2. running headers/footers: a short line repeated ≥ 4 times (digits folded) is dropped; bare page numbers too
//   3. emphasis markers dropped (the store is plain text); headings deeper than ### capped at ###
//   4. reflow: the SOURCE's false paragraph marks are repaired — Word/RTF files made from OCR carry a hard paragraph mark on
//      every printed line, so each line reached the Markdown as its own blank-line block (Markdown itself is fine with line
//      breaks inside a paragraph). A block that does not end a sentence joins the next that continues it; a line-end hyphen
//      is closed.
const TERMINAL = /[.!?:;"”’)\]…]$/;
const fold = (t) => String(t).toLowerCase().replace(/\d+/g, '#').replace(/[^\p{L}#]+/gu, ' ').trim();
const isHeading = (b) => /^#{1,6}\s/.test(b);
const isMarker = (b) => /^<pb\b/.test(b);
const isList = (b) => /^([*\-•]\s|\d+[.)]\s|>)/.test(b);
const PAGE_NO = /^(page\s+)?([\divxlcIVXLC]{1,6}|-\s*\d+\s*-|\[\s*\d+\s*\])\.?$/;

export function cleanText(text) {
  // 1. pages
  let t = String(text || '').replace(/\r/g, '');
  if (t.includes('\f')) t = t.split('\f').map((pg, i) => `<pb n="${i + 1}"/>\n\n${pg}`).join('\n\n');
  // lines inside one block (pdftotext, plain text): each line is its own unit for header detection; blocks come later
  let blocks = t.split(/\n{2,}/).flatMap((b) => (isHeading(b.trim()) ? [b] : b.split('\n'))).map((b) => b.trim()).filter(Boolean);
  // 3. emphasis and deep headings (before folding, so "**THE**" and "THE" count as the same line)
  blocks = blocks.map((b) => b.replace(/(\*\*|__)/g, '').replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2').replace(/^#{4,6}\s/, '### '));
  // 2. running headers / footers and page numbers. A repeated short line is a running header ONLY when it sits next to a
  //    page boundary (a page marker or a bare page number) in at least half its appearances — "O SON OF MAN!" repeats
  //    dozens of times in the Hidden Words and is text, not a header.
  const keyOf = (b) => fold(b.replace(/^#+\s*/, ''));
  const boundary = blocks.map((b) => isMarker(b) || PAGE_NO.test(b.replace(/^#+\s*/, '')));
  const near = (k) => boundary.slice(Math.max(0, k - 2), k + 3).some(Boolean);
  const seen = new Map();
  blocks.forEach((b, k) => {
    if (isMarker(b) || b.split(/\s+/).length > 8) return;
    const e = seen.get(keyOf(b)) || { n: 0, edge: 0 };
    e.n++; if (near(k)) e.edge++;
    seen.set(keyOf(b), e);
  });
  blocks = blocks.filter((b) => {
    if (isMarker(b)) return true;
    if (PAGE_NO.test(b.replace(/^#+\s*/, ''))) return false;
    const e = seen.get(keyOf(b));
    return !(e && keyOf(b) && e.n >= 4 && e.edge / e.n >= 0.5);
  });
  // 4. reflow — the typical printed line tells a wrapped line from a real (short) last line of a paragraph
  const lens = blocks.filter((b) => !isHeading(b) && !isMarker(b)).map((b) => b.length).sort((a, b) => a - b);
  const median = lens[Math.floor(lens.length / 2)] || 0;
  const wrapped = median > 0 && median < 140;   // printed lines; long blocks are already paragraphs
  const out = [];
  for (const b of blocks) {
    const prev = out.at(-1);
    if (prev && !isHeading(prev) && !isMarker(prev) && !isList(prev) && !isHeading(b) && !isList(b)) {
      if (isMarker(b)) { out.push(b); continue; }
      const prevText = isMarker(prev) ? null : prev;
      if (prevText) {
        const hyphen = /\p{L}-$/u.test(prevText) && /^\p{Ll}/u.test(b);
        const words = prevText.split(/\s+/);
        const running = words.length >= 5 && words.filter((w) => /^\p{Lu}/u.test(w)).length / words.length < 0.6;
        // a block ENDS a paragraph when it ends a sentence and is either a short last line or longer than any printed line
        // (a whole paragraph already — joining those made 5,000-word "paragraphs", 10-18)
        const ended = TERMINAL.test(prevText) && (!wrapped || prevText.length < median * 0.85 || prevText.length > median * 1.5);
        const continues = /^[\p{Ll}\d(“"‘'—–-]/u.test(b) || (running && !ended) || (wrapped && !ended && prevText.length >= median * 0.6);
        if (hyphen) { out[out.length - 1] = prevText.replace(/-$/, '') + b; continue; }
        if (!ended && continues) { out[out.length - 1] = `${prevText} ${b}`; continue; }
      }
    }
    // a page marker inside a paragraph: keep the paragraph running across it (the marker goes before the next block)
    if (isMarker(b) && prev && !isHeading(prev) && !TERMINAL.test(prev) && !isMarker(prev)) { out.push(b); continue; }
    out.push(b);
  }
  // a paragraph split by a page marker: "…the end of <pb n=3/> the sentence" → join around the marker
  const final = [];
  for (let k = 0; k < out.length; k++) {
    const b = out[k], prev = final.at(-1), next = out[k + 1];
    if (isMarker(b) && prev && next && !isHeading(prev) && !TERMINAL.test(prev) && /^[\p{Ll}\d]/u.test(next)) { final[final.length - 1] = `${prev} ${b} ${next}`; k++; continue; }
    final.push(b);
  }
  // typesetting hyphens left INSIDE a line ("Iran- ian", 2,321 in one RTF): closed, unless the next word is a conjunction
  // ("pre- and post-war")
  return final.join('\n\n').replace(/[ \t]+/g, ' ').replace(/ ([,.;:!?])/g, '$1')
    .replace(/(\p{L}{2,})- (?!(?:and|or|nor|to|und|et|ou)\b)(\p{Ll}{2,})/gu, '$1$2');
}
