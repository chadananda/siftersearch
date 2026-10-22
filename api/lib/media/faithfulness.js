// FAITHFULNESS (Chad 10-22: "(Vol II)" was hallucinated — "the most serious kind" of failure): every edited layer is aligned
// to the ASR's own words by time (an edit keeps its words inside the span it replaced), and any region where the edited
// text holds MORE than was heard — extra words, or brackets / digits / volume numbers the ASR never produced — is reverted
// to the heard words. Respellings ("Nabeel's" → "Nabíl’s", "Sogefendik" → "Shoghi Effendi") and drops (fillers) pass. Pure.
import { addsWords } from './vocab.js';
import { sentencesOf } from './paragraphs.js';

const flat = (paragraphs) => paragraphs.flatMap((p, pi) => p.words.map((w, wi) => ({ ...w, pi, wi })));
const mid = (w) => (Number(w.s) + Number(w.e)) / 2;

/** Each final word → the index of the raw word whose time holds its midpoint (else the nearest raw word by start). */
function mapToRaw(raw, fin) {
  const out = new Array(fin.length);
  let j = 0;
  for (let i = 0; i < fin.length; i++) {
    const m = mid(fin[i]);
    while (j < raw.length - 1 && raw[j].e <= m && raw[j + 1].s <= m) j++;
    let best = j;
    if (j + 1 < raw.length && Math.abs(raw[j + 1].s - m) < Math.abs(raw[j].s - m) && !(raw[j].s <= m && m <= raw[j].e)) best = j + 1;
    out[i] = best;
  }
  return out;
}

/**
 * The regions where the final words differ from the heard words, each judged. raw: ASR words [{ w, s, e }] (flattenWords);
 * paragraphs: an edited layer. → [{ r0, r1, f: [flat indexes], heard, now, insertion: why|null }]
 */
export function regions(raw, paragraphs) {
  const fin = flat(paragraphs);
  if (!raw.length || !fin.length) return [];
  const map = mapToRaw(raw, fin);
  // group final words by the raw word they sit on; a run of raw indexes whose texts differ is one region
  const byRaw = new Map();
  fin.forEach((w, i) => { const r = map[i]; if (!byRaw.has(r)) byRaw.set(r, []); byRaw.get(r).push(i); });
  const same = (r) => { const f = byRaw.get(r) || []; return f.length === 1 && fin[f[0]].w === raw[r].w; };
  const out = [];
  for (let r = 0; r < raw.length; r++) {
    if (same(r)) continue;
    let r1 = r;
    while (r1 + 1 < raw.length && !same(r1 + 1)) r1++;
    const f = []; for (let k = r; k <= r1; k++) f.push(...(byRaw.get(k) || []));
    const heard = raw.slice(r, r1 + 1).map((w) => w.w).join(' ');
    const now = f.filter((i) => !fin[i].hide).map((i) => fin[i].w).join(' ');
    out.push({ r0: r, r1: r1 + 1, f, heard, now, insertion: now && addsWords(heard, now) ? 'adds to what was heard' : null });
    r = r1;
  }
  return out;
}

/** Revert every insertion region to the heard words (with their own times). → { paragraphs, reverted: [{ t, heard, now }] } */
export function revertInsertions(raw, paragraphs) {
  const fin = flat(paragraphs);
  const bad = regions(raw, paragraphs).filter((g) => g.insertion && g.f.length);
  if (!bad.length) return { paragraphs, reverted: [] };
  const drop = new Set(), put = new Map();   // flat index of a region's first final word → the heard words
  for (const g of bad) { g.f.forEach((i) => drop.add(i)); put.set(Math.min(...g.f), raw.slice(g.r0, g.r1).map((w) => ({ w: w.w, s: w.s, e: w.e }))); }
  const ps = paragraphs.map((p) => ({ ...p, words: [] }));
  fin.forEach((w, i) => {
    if (put.has(i)) ps[w.pi].words.push(...put.get(i));
    if (!drop.has(i)) { const { pi, wi, ...rest } = w; ps[pi].words.push(rest); }
  });
  // sentences are word ranges: rebuild them where a paragraph's word count changed
  const fixed = ps.map((p, i) => (p.words.length === paragraphs[i].words.length ? p : { ...p, sentences: sentencesOf(p.words).map((x) => [x.i0, x.i1]) }));
  return { paragraphs: fixed, reverted: bad.map((g) => ({ t: raw[g.r0].s, heard: g.heard, now: g.now })) };
}
