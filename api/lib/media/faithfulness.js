// FAITHFULNESS (Chad 10-22: "(Vol II)" was hallucinated — "the most serious kind" of failure): every edited layer is aligned
// to the ASR's own words (in order, resyncing after each edit), and any region where the edited
// text holds MORE than was heard — extra words, or brackets / digits / volume numbers the ASR never produced — is reverted
// to the heard words. Respellings ("Nabeel's" → "Nabíl’s", "Sogefendik" → "Shoghi Effendi") and drops (fillers) pass. Pure.
import { keyOf, addsWords } from './vocab.js';
import { sentencesOf } from './paragraphs.js';

const flat = (paragraphs) => paragraphs.flatMap((p, pi) => p.words.map((w, wi) => ({ ...w, pi, wi })));
/**
 * Is `now` an insertion against `heard` (one differing region)? Nothing heard there; new brackets, digits or a volume
 * number; or more words than were heard that do not sound like them (a respelling may split a garbled word into a name:
 * "Shoghi-Fezi" → "Shoghi Effendi" sounds alike and passes; "Nabeel's narrative" → "Nabips Narrative (Vol II)" does not).
 */
export function insertionOf(heard, now) {
  if (!now) return null;
  if (!heard) return 'words where nothing was heard';
  return addsWords(heard, now) ? (/[()[\]{}\d]|\b(?:vol|volume|chapter|page)\b/i.test(now) ? 'brackets, numbers or a volume that were not said' : 'more words than were heard') : null;
}

const same = (a, b) => a.w === b.w || keyOf(a.w) === keyOf(b.w);   // case and punctuation edits are not content

/** The next point where both sequences agree again for `run` words (fin from i, raw from j), within `win` words; the
 *  most balanced sync point first (an edit usually replaces about as many words as it covers). */
function resync(fin, raw, i, j, { win = 40, run = 3 } = {}) {
  for (let d = 1; d <= 2 * win; d++) {
    const order = [...Array(d + 1).keys()].sort((x, y) => Math.abs(2 * x - d) - Math.abs(2 * y - d));
    for (const a of order) {
      const b = d - a;
      if (a > win || b > win || i + a >= fin.length || j + b >= raw.length) continue;
      let ok = true;
      for (let k = 0; k < run && ok; k++) ok = (i + a + k >= fin.length && j + b + k >= raw.length) || (i + a + k < fin.length && j + b + k < raw.length && same(fin[i + a + k], raw[j + b + k]));
      if (ok) return [i + a, j + b];
    }
  }
  return [fin.length, raw.length];
}

/**
 * The regions where the final words differ from the heard words, each judged. raw: ASR words [{ w, s, e }] (flattenWords);
 * paragraphs: an edited layer. Walks both in order (an edit keeps its place; hidden words keep their text), resyncing
 * after each difference — not by time alone, since ASR segments can overlap in time (10-22 audit: three false alarms).
 * → [{ r0, r1, f: [flat indexes], heard, now, insertion: why|null }]
 */
export function regions(raw, paragraphs) {
  const fin = flat(paragraphs);
  const out = [];
  let i = 0, j = 0;
  while (i < fin.length && j < raw.length) {
    if (same(fin[i], raw[j])) { i++; j++; continue; }
    const [i1, j1] = resync(fin, raw, i, j);
    const f = []; for (let k = i; k < i1; k++) f.push(k);
    const heard = raw.slice(j, j1).map((w) => w.w).join(' ');
    const now = f.filter((k) => !fin[k].hide).map((k) => fin[k].w).join(' ');
    out.push({ r0: j, r1: j1, f, heard, now, insertion: insertionOf(heard, now) });
    i = i1; j = j1;
  }
  if (i < fin.length) {   // words after the last heard word: all added
    const f = []; for (let k = i; k < fin.length; k++) f.push(k);
    const now = f.filter((k) => !fin[k].hide).map((k) => fin[k].w).join(' ');
    if (now) out.push({ r0: raw.length, r1: raw.length, f, heard: '', now, insertion: insertionOf('', now) });
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
