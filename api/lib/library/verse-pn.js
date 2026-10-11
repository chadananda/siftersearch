// Display numbers (pn) for verse-grouped scripture (KJV, Tanakh, Qur'an). Chad 10-11: "the way we number paragraphs in the
// Bible and Qur'an (pn) is the current verse number at the start … verses inside each paragraph are labeled with super".
// A block holds its first verse + one per <sup>c:v</sup>; its pn is the chapter:verse it STARTS at. Deterministic: the
// first <sup> of a chapter anchors the count (forwards and backwards), every other <sup> is a checksum. A block before
// verse 1 (an invocation, a title) gets no pn. ILM's own exported pn, when a file has one, always wins. Pure; no I/O.
const SUP = /<sup>\s*(\d+):(\d+)\s*<\/sup>/g;
const sups = (t) => [...String(t || '').matchAll(SUP)].map((m) => ({ c: Number(m[1]), v: Number(m[2]) }));
const chapterOfHeading = (h) => { const m = String(h || '').match(/(\d+)\s*$/) || String(h || '').match(/Chapter\s+(\d+)/i); return m ? Number(m[1]) : null; };

/**
 * Every block that carries a <sup> RE-ANCHORS the count: it starts one verse before its first <sup>. A block without one
 * starts one after the previous block's last verse (its last <sup>, else its start). A <sup> missing in the source (it
 * happens: Numbers 7, Romans 3, Rodwell III) therefore never shifts any other block. Checks reported, never "fixed":
 * a gap or overlap between blocks, and a non-consecutive <sup> inside a block.
 * @param paras [{ text, heading }] in reading order (one document)
 * @returns { pn: (string|null)[], checksum_failures: number, chapters: number, issues: [{ i, kind, detail }] }
 */
export function versePn(paras) {
  const pn = new Array(paras.length).fill(null);
  const issues = [];
  let chapters = 0;
  const groups = [];
  paras.forEach((p, i) => { const h = p.heading || ''; if (!groups.length || groups[groups.length - 1].h !== h) groups.push({ h, idx: [] }); groups[groups.length - 1].idx.push(i); });
  for (const g of groups) {
    const anchored = g.idx.find((i) => sups(paras[i].text).length);
    const chapter = anchored != null ? sups(paras[anchored].text)[0].c : chapterOfHeading(g.h);
    if (chapter == null) continue;                          // no anchor and no chapter: leave unnumbered
    chapters++;
    // first anchored block may be preceded by unmarked blocks: count them backwards from it
    const k = anchored != null ? g.idx.indexOf(anchored) : -1;
    let prevEnd = null;
    if (k > 0) {
      let st = sups(paras[anchored].text)[0].v - 1;
      for (let j = k - 1; j >= 0; j--) { st -= 1; if (st >= 1) pn[g.idx[j]] = `${chapter}:${st}`; }
      prevEnd = sups(paras[anchored].text)[0].v - 2;
    } else if (k < 0) prevEnd = 0;
    for (let j = Math.max(0, k); j < g.idx.length; j++) {
      const i = g.idx[j]; const s = sups(paras[i].text);
      let st;
      if (s.length) {
        st = s[0].v - 1;
        if (s.some((x) => x.c !== chapter)) issues.push({ i, kind: 'chapter', detail: `sup chapter ${s.find((x) => x.c !== chapter).c} under chapter ${chapter}` });
        if (prevEnd != null && st !== prevEnd + 1) issues.push({ i, kind: st > prevEnd + 1 ? 'gap' : 'overlap', detail: `expected ${chapter}:${prevEnd + 1}, block starts ${chapter}:${st}` });
        s.forEach((x, m) => { if (m && x.v !== s[m - 1].v + 1) issues.push({ i, kind: 'inside', detail: `${x.c}:${s[m - 1].v} then ${x.c}:${x.v}` }); });
        prevEnd = s[s.length - 1].v;
      } else { st = (prevEnd ?? 0) + 1; prevEnd = st; }
      if (st >= 1) pn[i] = `${chapter}:${st}`;
    }
  }
  return { pn, checksum_failures: issues.length, chapters, issues };
}
