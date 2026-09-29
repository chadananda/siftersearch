// concepts/anchor — locate a KNOWN original passage (CTAI / bahai.org, stored beside its translation) inside the
// ingested originals, verbatim. Deterministic: a pairing is accepted only when the passage's own letters are found.
// Why not embeddings: measured on Gleanings vs CTAI (2026-09-28) cross-lingual nearest-paragraph was right 35% of
// the time among 78k originals; the same text found letter-for-letter is right by construction. Deps: none.

const DIACRITICS = /[ً-ْٰـ‌‍]/g;
const FOLD = [['ي', 'ی'], ['ى', 'ی'], ['ك', 'ک'], ['ة', 'ه'], ['ۀ', 'ه'], ['أ', 'ا'], ['إ', 'ا'], ['آ', 'ا'], ['ٱ', 'ا'], ['ؤ', 'و'], ['ئ', 'ی']];

/** Letters only, spelling variants folded — the two sources differ in ی/ي, ک/ك, hamza seats, diacritics, spacing. */
export function letterKey(text) {
  let t = String(text || '').normalize('NFKC').replace(/⁅\/?s\d+⁆/g, '').replace(DIACRITICS, '');
  for (const [a, b] of FOLD) t = t.split(a).join(b);
  return t.replace(/[^ء-ۓ]/g, '');
}

const GRAM = 8;
const STEP = 4;   // index every 4th gram; queries use every gram, so any shared run of GRAM+STEP-1 letters is seen

/** Index original paragraphs: [{ id, docId, text }] → a gram index plus their keys. */
export function buildIndex(paras) {
  const keys = paras.map((p) => letterKey(p.text));
  const grams = new Map();
  keys.forEach((k, i) => {
    for (let j = 0; j + GRAM <= k.length; j += STEP) {
      const g = k.slice(j, j + GRAM);
      const hit = grams.get(g);
      if (hit === undefined) grams.set(g, i); else if (typeof hit === 'number') { if (hit !== i) grams.set(g, [hit, i]); } else if (hit[hit.length - 1] !== i) hit.push(i);
    }
  });
  return { paras, keys, grams };
}

/**
 * Where is this original passage in the index? Returns { docId, paraIds, coverage } or null.
 * Documents are ranked by how much OF THE PASSAGE they cover; the paragraphs carrying a real part of it are chosen,
 * and the result is accepted only if `minCoverage` of the passage's grams occur verbatim in those paragraphs.
 */
export function locate(text, index, { minCoverage = 0.8, candidates = 3, allowDocs = null } = {}) {
  const k = letterKey(text);
  if (k.length < GRAM * 2) return null;
  // Positions of the passage each document covers. Ranking documents by TOTAL votes let the huge manuscript
  // volumes win on size (thousands of paragraphs sharing common phrases) — measured: Gleanings anchored 64%.
  // Covered positions do not grow with document size.
  const docPos = new Map();
  const paraPos = new Map();
  for (let j = 0; j + GRAM <= k.length; j++) {
    const hit = index.grams.get(k.slice(j, j + GRAM));
    if (hit === undefined) continue;
    for (const i of (typeof hit === 'number' ? [hit] : hit)) {
      const d = index.paras[i].docId;
      if (!docPos.has(d)) docPos.set(d, new Set());
      docPos.get(d).add(j);
      if (!paraPos.has(i)) paraPos.set(i, new Set());
      paraPos.get(i).add(j);
    }
  }
  if (!docPos.size) return null;
  // allowDocs: a SHORT passage (a closing formula) occurs in many volumes; its neighbours say which one it is in.
  const ranked = [...docPos].filter(([d]) => !allowDocs || allowDocs.has(d)).sort((a, b) => b[1].size - a[1].size).slice(0, candidates);
  if (!ranked.length) return null;
  let best = null;
  for (const [docId] of ranked) {
    // A paragraph belongs to the passage when at least half of IT lies inside the passage (a line of a
    // line-per-paragraph edition, a piece of a split answer) or it holds at least half of the passage (a long
    // paragraph around a short one). A neighbour sharing only a sliver at the boundary fails both.
    const passageGrams = new Set(); for (let j = 0; j + GRAM <= k.length; j++) passageGrams.add(k.slice(j, j + GRAM));
    const inside = (i) => { const pk = index.keys[i]; let a = 0, n = 0; for (let j = 0; j + GRAM <= pk.length; j += 2) { n++; if (passageGrams.has(pk.slice(j, j + GRAM))) a++; } return n ? a / n : 0; };
    const holds = (i) => { const pk = index.keys[i]; let a = 0, n = 0; for (let j = 0; j + GRAM <= k.length; j += 2) { n++; if (pk.includes(k.slice(j, j + GRAM))) a++; } return n ? a / n : 0; };
    const chosen = [...paraPos].filter(([i, pos]) => index.paras[i].docId === docId && pos.size >= 2
      && (inside(i) >= 0.5 || holds(i) >= 0.5)).map(([i]) => i).sort((a, b) => a - b);
    const hay = chosen.map((i) => index.keys[i]).join('');
    let seen = 0, total = 0;
    for (let j = 0; j + GRAM <= k.length; j += 2) { total++; if (hay.includes(k.slice(j, j + GRAM))) seen++; }
    const coverage = total ? seen / total : 0;
    if (!best || coverage > best.coverage) best = { docId, paraIds: chosen.map((i) => index.paras[i].id), coverage };
  }
  best.coverage = Number(best.coverage.toFixed(3));
  return best.coverage >= minCoverage ? best : { ...best, rejected: true };
}
