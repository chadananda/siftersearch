// Own-source step (Chad's standing rule: the same words in several sources → cite the best published one): a passage whose
// WRITER is a Central Figure or Shoghi Effendi but whose BOOK is another author's (Shoghi Effendi's The Promised Day Is Come
// quoting Bahá'u'lláh) is swapped for the same words in the writer's own work. Code only — library metadata (author vs
// book_author) and one writer-limited search of the quoted span per such passage, in parallel, under one wall budget. No LLM.
// Deps: lookup.js quoteCandidates/holds (rankOrigins order), source-hunt DOCTRINAL, authorship/reader firstPerson.
import { firstPerson } from '../authorship/reader.js';
import { quoteCandidates, holds } from './lookup.js';

/** Wall budget of the whole step (ms): a search later than this keeps the original passage. */
export const OWN_SOURCE_MS = 300;
const MAX_WORDS = 40, MIN_WORDS = 5;
const canon = (n) => firstPerson(n || '') || n || null;
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
const clip = (s) => words(s).slice(0, MAX_WORDS).join(' ');
const keyOf = (p) => p?.id ?? `${p?.document_id}:${p?.paragraph_index}`;

/** The words the book quotes: the longest span in quotation marks (5+ words; an ellipsis splits it), else the paragraph
 *  itself (a block quotation, attributed whole to the writer). At most 40 words, so the source paragraph holds it verbatim.
 *  This reads LIBRARY text, never the reader's. Pure. */
export function quotedSpan(text) {
  const t = String(text || '');
  const spans = [...t.matchAll(/[“"]([^“”"]{10,})[”"]/g)].flatMap((m) => m[1].split(/\s*(?:…|\.\.\.)\s*/))
    .map((s) => s.trim()).filter((s) => words(s).length >= MIN_WORDS);
  if (spans.length) return clip(spans.sort((a, b) => words(b).length - words(a).length)[0]);
  return words(t).length >= MIN_WORDS ? clip(t) : null;
}

/** Is the passage a doctrinal writer's words inside ANOTHER author's book? Pure. */
export function quotedElsewhere(p, doctrinal) {
  const w = canon(p?.author), b = canon(p?.book_author);
  return !!w && !!b && w !== b && doctrinal.has(w) && p?.blocktype !== 'footnote';
}

// the writer's own work holding the span verbatim
const ownHolder = (q, writer, span) => canon(q?.author) === writer && canon(q?.book_author || q?.author) === writer && holds(q.text, span).exact;

/**
 * passages → { passages, swapped: [{ from, to, writer }], searches, late, ms }. Each quoted passage's slot goes to the writer's
 * own passage (with its link); the quoting passage moves to the end as context (the prompt marks it "as quoted in this work
 * by …"). An own passage already in the list is used with no search; otherwise ONE search(span, null, 5, { author: writer })
 * per passage, all in parallel, ranked by quoteCandidates (rankOrigins). A search later than budgetMs, failed or empty → the
 * original passage stays. `shape` turns a raw search hit into the caller's passage shape.
 */
export async function preferOwnWork(passages, { search = null, budgetMs = OWN_SOURCE_MS, shape = (h) => h } = {}) {
  const t0 = Date.now();
  const done = (extra = {}) => ({ passages, swapped: [], searches: 0, late: 0, ...extra, ms: Date.now() - t0 });
  if (!Array.isArray(passages) || !passages.length) return done();
  const { DOCTRINAL } = await import('../source-hunt.js');
  const jobs = passages.map((p, i) => ({ p, i })).filter(({ p }) => quotedElsewhere(p, DOCTRINAL))
    .map((j) => ({ ...j, writer: canon(j.p.author), span: quotedSpan(j.p.text) })).filter((j) => j.span);
  if (!jobs.length) return done();
  for (const j of jobs) j.own = passages.find((q) => q !== j.p && ownHolder(q, j.writer, j.span)) || null;
  const need = jobs.filter((j) => !j.own && search);
  let late = 0;
  if (need.length) {
    const LATE = Symbol('late');
    let timer;
    const deadline = new Promise((r) => { timer = setTimeout(r, Math.max(0, budgetMs - (Date.now() - t0)), LATE); });
    const got = await Promise.all(need.map((j) => Promise.race([
      Promise.resolve().then(() => search(j.span, null, 5, { author: j.writer })).catch(() => []), deadline])));
    clearTimeout(timer);
    await Promise.all(need.map(async (j, k) => {
      if (got[k] === LATE) { late++; return; }
      const ranked = await quoteCandidates(Array.isArray(got[k]) ? got[k] : [], j.span).catch(() => []);
      const hit = ranked.find((h) => ownHolder(h, j.writer, j.span));
      j.own = hit ? shape(hit) : null;
    }));
  }
  const found = jobs.filter((j) => j.own);
  if (!found.length) return done({ searches: need.length, late });
  const lead = passages.slice(), tail = [];
  for (const j of found) { lead[j.i] = j.own; tail.push(j.p); }
  const seen = new Set();
  const out = [...lead, ...tail].filter((p) => { const k = keyOf(p); if (seen.has(k)) return false; seen.add(k); return true; });
  return { passages: out, swapped: found.map((j) => ({ from: keyOf(j.p), to: keyOf(j.own), writer: j.writer })), searches: need.length, late, ms: Date.now() - t0 };
}
