// Query spell-correction against the LIBRARY'S OWN vocabulary (Chad 10-16: readers recall "two or three [words], often
// misspelled … should still match correctly"). Measured: one slip ("prayr allows change") cut Meili from 50,000+ matches to
// 19 and the known-item test found a misspelled 3-word recall 19% of the time. So correction happens BEFORE search: a word
// missing from the vocabulary (or rare beside a far more common neighbour) becomes the most frequent library word one edit
// away — two for longer words — in its own script (Latin, Arabic/Persian, Hebrew). Pure core; the vocabulary file is built
// by the vocab-build ops job (api/lib/ops/vocab-job.js) and loaded lazily.
import { readFileSync, statSync } from 'fs';
import { readFile } from 'fs/promises';

/** A word folded as the indexes see it: lower case; no diacritics, apostrophes or Arabic tashkil/tatweel; ي/ى→ی, ك→ک. */
export function foldWord(w) {
  return String(w || '').normalize('NFD').replace(/[̀-̲ͯ]/g, '').replace(/[ً-ٰٟـ]/g, '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[’‘'ʼ`ʿʾ]/g, '').toLowerCase();
}

/** Words of a text, folded (the vocabulary builder and the corrector share this). */
export const wordsOf = (text) => (foldWord(String(text || '').replace(/⁅\/?[a-z]?\d*⁆/gi, ' ')).match(/\p{L}+/gu) || []);

const LATIN = 'abcdefghijklmnopqrstuvwxyz';
const ARABIC = 'ابتثجحخدذرزسشصضطظعغفقلمنهویءآأؤإئةپچژگک';
const HEBREW = 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ';
const alphabetOf = (w) => (/[؀-ۿ]/.test(w) ? ARABIC : /[֐-׿]/.test(w) ? HEBREW : LATIN);

/** Every string one edit away: deletion, adjacent swap, substitution, insertion. */
export function edits1(w, alphabet = alphabetOf(w)) {
  const out = new Set();
  for (let i = 0; i <= w.length; i++) {
    const a = w.slice(0, i), b = w.slice(i);
    if (b) out.add(a + b.slice(1));
    if (b.length > 1) out.add(a + b[1] + b[0] + b.slice(2));
    for (const c of alphabet) { if (b) out.add(a + c + b.slice(1)); out.add(a + c + b); }
  }
  out.delete(w);
  return out;
}

/** Best correction of one folded word, or null to keep it. vocab: Map word → frequency. */
export function correctWord(word, vocab, { minLen = 4, rareBelow = 20, dominance = 50 } = {}) {
  const w = foldWord(word);
  if (w.length < minLen || !/^\p{L}+$/u.test(w)) return null;
  const own = vocab.get(w) || 0;
  const best = (cands) => { let b = null, f = 0; for (const c of cands) { const n = vocab.get(c) || 0; if (n > f) { b = c; f = n; } } return b ? { word: b, freq: f } : null; };
  let cand = best(edits1(w));
  // a known word is kept unless it is rare and a neighbour is overwhelmingly more common (an OCR or common typo form)
  if (own) return cand && own < rareBelow && cand.freq >= own * dominance ? cand.word : null;
  if (!cand && w.length >= 6) {
    const two = new Set();
    for (const e of edits1(w)) for (const e2 of edits1(e)) if (vocab.has(e2)) two.add(e2);
    cand = best(two);
  }
  return cand?.word || null;
}

/** → { query, corrections: [{ from, to }] } — the query with misspelled words replaced (other text untouched). */
export function correctQuery(query, vocab) {
  if (!vocab?.size) return { query, corrections: [] };
  const corrections = [];
  const out = String(query || '').replace(/[\p{L}\p{M}’‘'ʼ`ʿʾ]+/gu, (tok) => {
    const to = correctWord(tok, vocab);
    if (!to || to === foldWord(tok)) return tok;
    corrections.push({ from: tok, to });
    return to;
  });
  return { query: corrections.length ? out : query, corrections };
}

// ── the vocabulary (built by ops job vocab-build; one "word<TAB>freq" per line, most frequent first) ──
export const VOCAB_FILE = process.env.VOCAB_FILE || '/fast/sifter-vocab/vocab.tsv';
const loaded = new Map();   // file → { mtime, vocab, at }
const reloading = new Map();   // file → promise of a background (re)load
const parseLines = (vocab, lines, from, to) => { for (let i = from; i < to; i++) { const line = lines[i]; const t = line.indexOf('\t'); if (t > 0) vocab.set(line.slice(0, t), Number(line.slice(t + 1))); } };
/** The vocabulary Map for a file, reloaded when the file changes (checked at most once a minute); empty when absent.
 *  Only a process that never warmed it reads it synchronously (~2 s for 1.8M words — the first search of a fresh API
 *  process paid it, 10-22); a CHANGED file is reloaded in the background while the old vocabulary keeps serving. */
export function vocabulary(file = VOCAB_FILE) {
  const cur = loaded.get(file);
  if (cur && Date.now() - cur.at < 60000) return cur.vocab;
  try {
    const m = statSync(file).mtimeMs;
    if (!cur) {
      const vocab = new Map();
      const lines = readFileSync(file, 'utf8').split('\n');
      parseLines(vocab, lines, 0, lines.length);
      loaded.set(file, { mtime: m, vocab, at: Date.now() });
    } else {
      cur.at = Date.now();
      if (m !== cur.mtime) warmVocabulary(file);
    }
  } catch { if (!cur) loaded.set(file, { mtime: 0, vocab: new Map(), at: Date.now() }); }
  return loaded.get(file).vocab;
}
/** Load the vocabulary OFF the request path: an async read, parsed in slices that yield the event loop. Resolves to its size. */
export function warmVocabulary(file = VOCAB_FILE, { slice = 50000 } = {}) {
  if (reloading.has(file)) return reloading.get(file);
  const p = (async () => {
    const m = statSync(file).mtimeMs;
    const lines = (await readFile(file, 'utf8')).split('\n');
    const vocab = new Map();
    for (let i = 0; i < lines.length; i += slice) {
      parseLines(vocab, lines, i, Math.min(lines.length, i + slice));
      await new Promise((ok) => setImmediate(ok));
    }
    loaded.set(file, { mtime: m, vocab, at: Date.now() });
    return vocab.size;
  })().catch(() => 0).finally(() => reloading.delete(file));
  reloading.set(file, p);
  return p;
}
