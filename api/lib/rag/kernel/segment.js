// kernel/segment — partition paragraphs into cache-friendly units the stages process concurrently.
// 'toc': consecutive runs sharing a chapter label (books whose table of contents the adapter parsed onto
// each paragraph's `chapter`). 'bounded': ~segMax-paragraph runs cut at a heading edge, with a HARD cut at
// segMax*3 so heading-less books still split (else one giant sequential segment defeats concurrency).
// Falls back to bounded when 'toc' is asked but no chapter labels are present. Carrying a digest across a
// boundary is the stage's job; here we only partition.
export function segment(paragraphs, { mode = 'bounded', segMax = 60 } = {}) {
  if (mode === 'toc' && paragraphs.some((p) => p.chapter != null)) return runsBy(paragraphs, (p) => p.chapter);
  const segs = [];
  let cur = [];
  for (const p of paragraphs) {
    const headingChanged = cur.length && p.heading !== cur[cur.length - 1].heading;
    if ((cur.length >= segMax && headingChanged) || cur.length >= segMax * 3) { segs.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

// Consecutive-run grouping: a new segment starts whenever the key changes.
function runsBy(items, keyOf) {
  const segs = [];
  let cur = [];
  for (const it of items) {
    if (cur.length && keyOf(it) !== keyOf(cur[cur.length - 1])) { segs.push(cur); cur = []; }
    cur.push(it);
  }
  if (cur.length) segs.push(cur);
  return segs;
}
