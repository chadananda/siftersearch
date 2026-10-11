// Display numbers (pn) for verse-grouped scripture (KJV, Tanakh, Qur'an). Chad 10-11: "the way we number paragraphs in the
// Bible and Qur'an (pn) is the current verse number at the start … verses inside each paragraph are labeled with super".
// A block holds its first verse + one per <sup>c:v</sup>; its pn is the chapter:verse it STARTS at. Deterministic: the
// first <sup> of a chapter anchors the count (forwards and backwards), every other <sup> is a checksum. A block before
// verse 1 (an invocation, a title) gets no pn. ILM's own exported pn, when a file has one, always wins. Pure; no I/O.
const SUP = /<sup>\s*(\d+):(\d+)\s*<\/sup>/g;
const sups = (t) => [...String(t || '').matchAll(SUP)].map((m) => ({ c: Number(m[1]), v: Number(m[2]) }));
const chapterOfHeading = (h) => { const m = String(h || '').match(/(\d+)\s*$/) || String(h || '').match(/Chapter\s+(\d+)/i); return m ? Number(m[1]) : null; };

/**
 * @param paras [{ text, heading }] in reading order (one document)
 * @returns { pn: (string|null)[], checksum_failures: number, chapters: number }
 */
export function versePn(paras) {
  const pn = new Array(paras.length).fill(null);
  let failures = 0, chapters = 0;
  // chapter groups: consecutive paragraphs sharing a heading (a heading-less document is one group)
  const groups = [];
  paras.forEach((p, i) => { const h = p.heading || ''; if (!groups.length || groups[groups.length - 1].h !== h) groups.push({ h, idx: [] }); groups[groups.length - 1].idx.push(i); });
  for (const g of groups) {
    const n = g.idx.map((i) => 1 + sups(paras[i].text).length);
    const k = g.idx.findIndex((i) => sups(paras[i].text).length);
    let chapter, start = new Array(g.idx.length);
    if (k >= 0) {
      const s0 = sups(paras[g.idx[k]].text)[0];
      chapter = s0.c; start[k] = s0.v - 1;
      for (let j = k + 1; j < g.idx.length; j++) start[j] = start[j - 1] + n[j - 1];
      for (let j = k - 1; j >= 0; j--) start[j] = start[j + 1] - n[j];
    } else {
      chapter = chapterOfHeading(g.h);
      if (chapter == null) continue;                       // no anchor and no chapter: leave unnumbered
      start[0] = 1; for (let j = 1; j < g.idx.length; j++) start[j] = start[j - 1] + n[j - 1];
    }
    chapters++;
    g.idx.forEach((i, j) => {
      if (start[j] < 1) return;                            // before verse 1: invocation / title
      pn[i] = `${chapter}:${start[j]}`;
      sups(paras[i].text).forEach((s, m) => { if (s.c !== chapter || s.v !== start[j] + m + 1) failures++; });
    });
  }
  return { pn, checksum_failures: failures, chapters };
}
