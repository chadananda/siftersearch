// THE LIBRARIAN'S TITLE INDEX (Chad 10-19: "our librarian API cannot be so weak as to miss slight variations in title").
// The library's full-text title search ANDs every word, so one extra word ("Táríkh-i-", a subtitle) or another spelling
// ("Zuhur al-Haqq" for "Ẓuhúru'l-Ḥaqq", "Bahaullah") made a held work invisible. Here every live document's title is
// reduced to its MAIN title — folded (no diacritics or apostrophes), without subtitle, volume, edition, generic prefix
// ("The", "Táríkh-i-", "Kitáb-i-") — and matched FUZZILY: by character trigrams of the squashed title (spacing and
// transliteration: "zuhurul haqq" ≈ "zuhur al haqq") and by its words (order, small spelling slips). Authors folded the same
// way. Built from the docs repo (keyset pages), kept on disk ($DEWEY_DIR/title-index.json, rebuilt after 6 h) because each
// holdings check runs in a fresh worker; in memory once loaded.
import { readFile, writeFile, mkdir, stat, rename } from 'fs/promises';
import { join } from 'path';

export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘'ʼ`]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'to', 'for', 'by', 'with', 'from', 'at', 'i', 'e', 'al', 'el', 'ul', 'l', 'de', 'la', 'le', 'des', 'du', 'et', 'der', 'die', 'das', 'und']);
const PREFIX = /^(?:the|a|an|tarikh|kitab|risaliy|risala|risalih|lawh|lawhi|majmuih|majmuiy|tafsir|sharh|al|el)\s+(?=\S)/;
const CUT = /\s*(?:[:;(\[—]|,?\s+vol(?:ume)?\.?\s*[\divxlc]+\b|,?\s+part\s+\d|,?\s+\d+(?:st|nd|rd|th)\s+ed|\s+-\s)/i;

const keyFold = (s) => fold(String(s || '').replace(/[’‘'ʼ`]/g, ' '));   // an apostrophe joins transliterated parts: a word break
/** A title's MAIN title, folded, prefix gone. Pure. */
export function mainKey(t) {
  let m = keyFold(String(t || '').split(CUT)[0]);
  for (let k = 0; k < 2; k++) m = m.replace(PREFIX, '');
  return m.replace(/\s+/g, ' ').trim();
}
const words = (k) => k.split(' ').filter((w) => w.length > 1 && !STOP.has(w));
const squash = (k) => words(k).join('');
// the consonant SKELETON: transliterations differ in vowels and doubled letters (Ẓuhúru'l-Ḥaqq / Zuhur al-Haqq / Zuhurul-Haq)
const skeleton = (s) => s.replace(/[aeiouy]/g, '').replace(/(.)\1+/g, '$1');
const grams = (s) => { const g = new Set(); const p = ` ${s} `; for (let i = 0; i + 3 <= p.length; i++) g.add(p.slice(i, i + 3)); return g; };

/** Edit distance (bounded rows). Pure. */
export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
const simStr = (a, b) => (!a || !b ? 0 : 1 - lev(a, b) / Math.max(a.length, b.length));
// two words are the same word: equal, or (≥ 5 letters) one slip apart — "haqq"/"haq" is caught by the squashed form
const sameWord = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && lev(a, b) <= 1);

/** How alike two MAIN titles are, 0–1: the better of the squashed spelling match and the word match. Pure. */
export function titleScore(qk, dk) {
  const qs = squash(qk), ds = squash(dk);
  if (!qs || !ds) return 0;
  const sk = skeleton(qs), dsk = skeleton(ds);
  const spelled = Math.max(simStr(qs, ds), sk.length >= 5 && dsk.length >= 5 ? simStr(sk, dsk) * 0.97 : 0);
  const qw = words(qk), dw = words(dk);
  const found = qw.filter((w) => dw.some((d) => sameWord(w, d))).length;
  const extra = Math.max(0, dw.length - found);
  // every word of the asked title in the document's, few words of its own — and those AFTER the work's title, never in
  // front ("An Homage to Memorials of the Faithful" is not Memorials of the Faithful); a ONE-word title must be the whole
  // title ("Prayers" is not "Prayers and Meditations")
  const leads = dw.length && qw.length ? !sameWord(dw[0], qw[0]) : false;
  const worded = !qw.length || (qw.length === 1 && extra > 0) ? 0
    : (found / qw.length) * (extra === 0 ? 1 : extra <= 1 ? 0.95 : extra <= 3 ? 0.88 : 0.75) * (leads && extra > 0 ? 0.8 : 1);
  // (one word that IS the title written together — "Dawnbreakers" — is the same title: its squashed spelling is equal)
  return Math.max(qw.length === 1 && extra > 0 && spelled < 0.95 ? Math.min(spelled, 0.79) : spelled, worded);
}
/** Do two author strings name the same person? (surnames, folded; "Mazandarani" = "Mírzá Asadu'lláh Fáḍil Mázandarání"). Pure. */
export function authorMatch(a, b) {
  const aw = words(fold(a)).filter((w) => w.length > 2), bw = words(fold(b)).filter((w) => w.length > 2);
  if (!aw.length || !bw.length) return null;   // unknown
  return aw.some((x) => bw.some((y) => sameWord(x, y) || (x.length >= 6 && y.length >= 6 && (x.startsWith(y) || y.startsWith(x)))));
}

/** rows [{ id, title, author, paragraph_count, … }] → an index. Pure. */
export function buildIndex(rows) {
  const docs = [], byGram = new Map();
  for (const r of rows) {
    // its main title, and its subtitle when that is a title in its own right ("The Kitáb-i-Íqán: The Book of Certitude")
    const sub = String(r.title || '').split(/\s*:\s*/)[1];
    const keys = [mainKey(r.title), sub && words(mainKey(sub)).length >= 2 ? mainKey(sub) : null].filter((k) => k && squash(k));
    if (!keys.length) continue;
    const i = docs.push({ ...r, key: keys[0], keys }) - 1;
    for (const k of keys) for (const g of grams(skeleton(squash(k)))) { const a = byGram.get(g); if (a) a.push(i); else byGram.set(g, [i]); }
  }
  return { docs, byGram, size: docs.length };
}

const DERIVATIVE = /\b(?:study (?:guide|questions|notes|outline|aid)|faculty notes|notes on|commentary|companion|introduction to|homage|perspective|a review|review of|summary of|a summary|meditation on|outline of|reader'?s guide|self-quotation|index to|concordance|lesson plans?|workbook|teaching|reflections on|study of|selections from|extracts? from|excerpts? from)\b/i;

/** A work's title (and author) → the library documents that ARE it by title, best first: [{ doc, score, author }]. */
export function matchTitle(index, title, { author = null, alt = [], min = 0.8, limit = 12 } = {}) {
  const keys = [...new Set([title, ...alt, ...String(title || '').match(/\(([^)]{4,})\)/g)?.map((x) => x.slice(1, -1)) || []].map(mainKey).filter((k) => squash(k).length >= 3))];
  const best = new Map();
  for (const qk of keys) {
    const qg = grams(skeleton(squash(qk)));   // candidates by SKELETON trigrams: spelling variants share them
    const count = new Map();
    for (const g of qg) for (const i of index.byGram.get(g) || []) count.set(i, (count.get(i) || 0) + 1);
    const pool = [...count.entries()].filter(([, c]) => c >= Math.max(1, qg.size * 0.3)).sort((a, b) => b[1] - a[1]).slice(0, 400);
    for (const [i] of pool) {
      const d = index.docs[i];
      let s = Math.max(...d.keys.map((k) => titleScore(qk, k)));
      // a DERIVATIVE work carries the title too — a study guide, notes, a commentary, a companion — and is not the work
      // unless that is what was asked for ("Some Answered Questions: Study Guide", "Seven Valleys: Faculty notes")
      if (DERIVATIVE.test(d.title) && !DERIVATIVE.test(title)) s -= 0.3;
      const am = author ? authorMatch(author, d.author) : null;
      if (am === true) s = Math.min(1, s + 0.05); else if (am === false) s -= 0.08;   // same title, another author: perhaps another work
      if (s >= min && s > (best.get(i)?.score ?? 0)) best.set(i, { doc: d, score: +s.toFixed(3), author: am });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || (b.doc.paragraph_count ?? 0) - (a.doc.paragraph_count ?? 0)).slice(0, limit);
}

// ── the index on disk and in memory ──
let memo = null;
const FILE = () => join(process.env.DEWEY_DIR || '/tank/sifter/dewey', 'title-index.json');
const MAX_AGE = 6 * 3600e3;

/** The index: memory → disk (≤ 6 h old) → rebuilt from the docs repo (keyset pages of 1,000) and saved. */
export async function titleIndex({ list = null, file = FILE() } = {}) {
  if (memo && Date.now() - memo.at < MAX_AGE) return memo.index;
  try {
    const st = await stat(file);
    if (Date.now() - st.mtimeMs < MAX_AGE) { const rows = JSON.parse(await readFile(file, 'utf8')); memo = { at: st.mtimeMs, index: buildIndex(rows) }; return memo.index; }
  } catch { /* none yet */ }
  const listDocs = list || (await import('../docs-repo.js')).listDocs;
  const rows = [];
  for (let afterId = 0; ;) {
    const { docs } = await listDocs({ fields: ['id', 'title', 'author', 'paragraph_count', 'language', 'collection'], afterId, limit: 1000, count: false });
    if (!docs.length) break;
    rows.push(...docs);
    afterId = docs.at(-1).id;
    if (docs.length < 1000) break;
  }
  await mkdir(join(file, '..'), { recursive: true }).catch(() => {});
  await writeFile(`${file}.tmp`, JSON.stringify(rows)).then(() => rename(`${file}.tmp`, file)).catch(() => {});
  memo = { at: Date.now(), index: buildIndex(rows) };
  return memo.index;
}
