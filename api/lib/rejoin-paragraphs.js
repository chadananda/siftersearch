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
const tail = (t) => String(t).replace(/(\s*(\*{1,2}|_{1,2}|\\?\[[^\]]{0,40}\\?\]|\(\d[\d,\s-]*\)|<pb[^>]*\/>))+\s*$/, '');
const END = { test: (t) => END_RE.test(tail(t)) || END_RE.test(String(t)) };
const STRUCTURAL = /^(#{1,6}\s|>|[-*+]\s|\||!\[|\d+\.\s|\[\^[^\]]+\]:|<pb\b|<!--|---\s*$|\{)/;
const PAGE_LINE = /^(?:\[?pg\.?\s*)?(\d{1,4})\]?$/i;              // "123", "[pg 123]"

// lists, verse, tables of contents, number columns: mostly short lines — not running prose
const shortLines = (b) => { const ls = String(b).split('\n').map((l) => l.trim()).filter(Boolean); return ls.length >= 3 && ls.filter((l) => l.length < 30).length / ls.length > 0.5; };
const isProse = (b) => !STRUCTURAL.test(b) && b.length >= 40 && !shortLines(b) && !/^\d+(\s+\d+)+$/.test(b.trim());
// does b carry on a sentence a left open?
function continues(a, b) {
  if (!isProse(b) && !/^[a-z]/.test(b)) return false;
  if (/^[a-z(—,;]/.test(b)) return true;                                       // lowercase / continuing punctuation (an opening quote alone is not)
  return a.length >= 150 && /^[A-Z’']/.test(b) && b.length >= 60 && !/^[A-Z][^.!?]{0,80}$/.test(b);   // mid-sentence before a name
}

/** @returns {{ body: string, joins: number, pages: number, seams: string[] }} (seams: the first few joins, for review) */
export function rejoin(body) {
  const blocks = String(body).split(/\n\s*\n/);
  const out = [];
  let joins = 0, pages = 0;
  const seams = [];
  for (let i = 0; i < blocks.length; i++) {
    const cur = blocks[i];
    const t = cur.trim();
    // a bare page number between whole paragraphs is a page marker, not a paragraph
    const lone = t.match(PAGE_LINE);
    if (lone && out.length && i + 1 < blocks.length) { out.push(`<pb n="${lone[1]}"/>`); pages++; continue; }
    if (!isProse(t) || END.test(t)) { out.push(cur); continue; }
    // absorb following continuations, across a bare page-number line
    let merged = t;
    for (let k = i + 1; k < blocks.length; k++) {
      let next = blocks[k].trim(), marker = ' ';
      const page = next.match(PAGE_LINE);
      if (page && k + 1 < blocks.length) {                      // "…the West or" / "123" / "Middle East have…"
        const after = blocks[k + 1].trim();
        if (!continues(merged, after)) break;
        marker = ` <pb n="${page[1]}"/> `; pages++; k++; next = after;
      } else if (!continues(merged, next)) break;
      // a line-end hyphen joins without a space and stays ("well-" + "known"; dropping it would fuse real compounds)
      if (seams.length < 6) seams.push(`…${merged.slice(-60)} ‖${marker.trim() ? marker.trim() : ''}‖ ${next.slice(0, 60)}…`);
      merged = `${merged}${/-$/.test(merged) ? '' : marker}${next}`.replace(/ {2,}/g, ' ');
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
