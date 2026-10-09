// Re-join paragraphs that PDF conversion broke mid-sentence (Chad 2026-10-08: "page-broken paragraphs should be merged
// with a page marker inserted"). A blank line every printed line-group or page split sentences into "paragraphs" (Momen,
// "Learning from History": one every ~240 chars; 560 library files). A block that ends mid-sentence is joined to the
// block that continues it; a bare page-number line between them becomes <pb n="N"/> at the join (page-breaks.js stores
// it as block_attrs.pb at ingest); a plain line-wrap join is a space. Headings, list items, quotes, tables, images and
// footnote definitions are never joined. Pure.

// sentence-final, allowing a trailing note number ("…the Bahá’í world.5", "…faith.[^3]")
const END_RE = /[.!?:;”"’'\)\]—…]\s*(\[\^?\d+\]|\d{1,3})?\s*$/;
// judge the text, not its wrapping: trailing emphasis (**, _), escaped / bracketed citations (**\[16\]**, [12, 17]),
// footnote refs and page tags are stripped first ("…progress of the soul." **\[16\]** ends a sentence)
// one bounded token at a time — a nested (\s*(…))+\s*$ pattern backtracked exponentially and froze a 35k-file run for 8 h
const TAIL_TOKEN = /(\*{1,2}|_{1,2}|\\?\[[^\]\n]{0,40}\\?\]|\(\d[\d, -]{0,20}\)|<pb[^>\n]{0,40}\/>)$/;
const tail = (t) => {
  let s = String(t).trimEnd();
  for (let i = 0; i < 8; i++) { const n = s.replace(TAIL_TOKEN, '').trimEnd(); if (n === s) break; s = n; }
  return s;
};
const END = { test: (t) => END_RE.test(tail(t)) || END_RE.test(String(t)) };
const STRUCTURAL = /^(#{1,6}\s|>|[-*+]\s|\||!\[|\d+\.\s|\[\^[^\]]+\]:|<pb\b|<!--|---\s*$|\{)/;
// "123", "[pg 123]", "page vi", "p. 12", "- 7 -"; a running header "Title of the Paper            12" too
const PAGE_LINE = /^(?:\[?(?:pg|page|p)\.?\s*)?[-–]?\s*(\d{1,4}|[ivxlc]{1,7})\s*[-–]?\]?$/i;
const RUNNING_HEAD = /^[^\n]{3,120}?\s{5,}(\d{1,4})$/;
const pageOf = (t) => { const m = t.match(PAGE_LINE) || (t.includes('\n') ? null : t.match(RUNNING_HEAD)); return m ? m[1] : null; };

// lists, verse, tables of contents, number columns: mostly short lines — not running prose
const shortLines = (b) => { const ls = String(b).split('\n').map((l) => l.trim()).filter(Boolean); return ls.length >= 3 && ls.filter((l) => l.length < 30).length / ls.length > 0.5; };
const isProse = (b) => !STRUCTURAL.test(b) && b.length >= 40 && !shortLines(b) && !/^\d+(\s+\d+)+$/.test(b.trim());
// does b carry on a sentence a left open?
// a block whose LAST line is a heading ("2) The Nature of Existentialism") does not run on
const endsWithHeading = (a) => { const ls = String(a).split('\n'); const last = ls[ls.length - 1].trim(); return ls.length > 1 && last.length < 70 && /^(\d+[).]|[IVX]+\.|[A-Z][^.!?,;:]*$)/.test(last); };
function continues(a, b, { capitals = true } = {}) {
  if (endsWithHeading(a)) return false;
  if (!isProse(b) && !/^[a-z]/.test(b)) return false;
  if (/^[a-z(—,;]/.test(b)) return true;                                       // lowercase / continuing punctuation (an opening quote alone is not)
  // mid-sentence before a name — only in files that are clearly line-broken (else commentary glosses, lemma lists merge)
  return capitals && a.length >= 150 && /^[A-Z’']/.test(b) && b.length >= 60 && !/^[A-Z][^.!?]{0,80}$/.test(b);
}

/** @returns {{ body: string, joins: number, pages: number, seams: string[] }} (seams: the first few joins, for review) */
export function rejoin(body) {
  const blocks = String(body).split(/\n\s*\n/);
  // capital-letter continuations only where lowercase ones show the file really is line-broken (≥10% of prose blocks)
  const lower = blocks.filter((b, i) => i + 1 < blocks.length && isProse(b.trim()) && !END.test(b.trim()) && /^[a-z(—,;]/.test(blocks[i + 1].trim())).length;
  const prose = blocks.filter((b) => isProse(b.trim())).length;
  const capitals = prose > 0 && lower / prose >= 0.1;
  const out = [];
  let joins = 0, pages = 0;
  const seams = [];
  for (let i = 0; i < blocks.length; i++) {
    const cur = blocks[i];
    const t = cur.trim();
    // a bare page number between whole paragraphs is a page marker, not a paragraph
    const lone = pageOf(t);
    if (lone && out.length && i + 1 < blocks.length) { out.push(`<pb n="${lone}"/>`); pages++; continue; }
    if (!isProse(t) || END.test(t)) { out.push(cur); continue; }
    // absorb following continuations, across a bare page-number line
    let merged = t;
    for (let k = i + 1; k < blocks.length; k++) {
      let next = blocks[k].trim(), marker = ' ';
      const page = pageOf(next);
      if (page && k + 1 < blocks.length) {                      // "…the West or" / "123" / "Middle East have…"
        const after = blocks[k + 1].trim();
        if (!continues(merged, after, { capitals })) break;
        marker = ` <pb n="${page}"/> `; pages++; k++; next = after;
      } else if (!continues(merged, next, { capitals })) break;
      if (seams.length < 6) seams.push(`…${merged.slice(-60)} ‖${marker.trim() ? marker.trim() : ''}‖ ${next.slice(0, 60)}…`);
      // a line-end hyphen between lowercase fragments is soft ("compara-" + "tively" → "comparatively"); any other joins as is
      if (/[a-z]-$/.test(merged) && /^[a-z]/.test(next) && !marker.trim()) merged = `${merged.slice(0, -1)}${next}`.replace(/ {2,}/g, ' ');
      else merged = `${merged}${/-$/.test(merged) ? '' : marker}${next}`.replace(/ {2,}/g, ' ');
      joins++; i = k;
      if (END.test(next)) break;
    }
    out.push(merged);
  }
  return { body: out.join('\n\n'), joins, pages, seams };
}

/** Share of prose blocks that end mid-sentence and are continued — the scan's flag. */
export function brokenShare(body) {
  const blocks = String(body).split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  let broken = 0, prose = 0;
  for (let i = 0; i + 1 < blocks.length; i++) {
    if (!isProse(blocks[i])) continue;
    prose++;
    if (!END.test(blocks[i]) && continues(blocks[i], blocks[i + 1])) broken++;
  }
  return { broken, prose, share: prose ? broken / prose : 0 };
}
