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
export function locate(text, index, { minCoverage = 0.8, candidates = 3 } = {}) {
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
  const positions = k.length - GRAM + 1;
  const ranked = [...docPos].sort((a, b) => b[1].size - a[1].size).slice(0, candidates);
  let best = null;
  for (const [docId] of ranked) {
    // Keep paragraphs that carry a real part of the passage — OR lie mostly inside it: some editions keep each
    // printed LINE as a paragraph (Madaniyyih, BKW19), and a line never covers 8% of a long passage.
    const indexed = (i) => Math.max(1, Math.ceil((index.keys[i].length - GRAM + 1) / STEP));
    const chosen = [...paraPos].filter(([i, pos]) => index.paras[i].docId === docId
      && pos.size >= 3 && (pos.size >= 0.08 * positions || pos.size >= 0.5 * indexed(i)))
      .map(([i]) => i).sort((a, b) => a - b);
    const hay = chosen.map((i) => index.keys[i]).join('');
    let seen = 0, total = 0;
    for (let j = 0; j + GRAM <= k.length; j += 2) { total++; if (hay.includes(k.slice(j, j + GRAM))) seen++; }
    const coverage = total ? seen / total : 0;
    if (!best || coverage > best.coverage) best = { docId, paraIds: chosen.map((i) => index.paras[i].id), coverage };
  }
  best.coverage = Number(best.coverage.toFixed(3));
  return best.coverage >= minCoverage ? best : { ...best, rejected: true };
}
