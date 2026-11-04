// Own-source step (Chad's standing rule: the same words in several sources → cite the best published one): a passage whose
// WRITER is a Central Figure or Shoghi Effendi but whose BOOK is another author's (Shoghi Effendi's The Promised Day Is Come
// quoting Bahá'u'lláh) is swapped for the same words in the writer's own work. Code only — library metadata (author vs
// book_author) and one LITERAL lookup of the quoted span per such passage (BM25 on Qdrant paragraphs_kw limited to the writer,
// rows by id, a link for the one winner; no embedding), in parallel, under one wall budget. No LLM, no fuzzy matching.
// Deps: tools.js literal_search layer, paragraphs-repo paragraphsByIds, hit-links withLinks, lookup.js quoteCandidates/holds
// (rankOrigins order), source-hunt DOCTRINAL, authorship/reader firstPerson.
import { firstPerson } from '../authorship/reader.js';
import { quoteCandidates, holds } from './lookup.js';

/** Wall budget of the whole step (ms): a search later than this keeps the original passage. */
export const OWN_SOURCE_MS = 300;
/** BM25 hits read per lookup: a line quoted by many commentaries crowds the writer's own work down (production 11-04, writer
 *  filter: Gleanings CXVII at rank 14 for "The earth is but one country…", Gleanings CXXXII at 19 for "Ye are the fruits…"). */
export const OWN_SOURCE_HITS = 30;
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

/** The live lookup: the span's exact words → BM25 (literal_search's layer, Qdrant paragraphs_kw, ~20 ms) inside the writer's
 *  paragraphs (writerOnly author filter) → those rows by id (paragraphDoc shape: author = the paragraph's writer, book_author =
 *  the work's). No embedding, no planner, no links (only the chosen passage is linked: linkHits). → rows in rank order. */
export async function literalOwnSearch(span, { author } = {}, { limit = OWN_SOURCE_HITS, timeoutMs = OWN_SOURCE_MS, keyword = null, byIds = null } = {}) {
  keyword ??= await (await import('./tools.js')).layerFn('literal_search');
  const paragraphsByIds = byIds || (await import('../paragraphs-repo.js')).paragraphsByIds;
  const hits = (await keyword(String(span), { limit, filters: { author, writerOnly: true }, timeoutMs }))?.hits || [];
  if (!hits.length) return [];
  const rows = new Map((await paragraphsByIds(hits.map((h) => h.paragraph_id))).map((p) => [Number(p.id), p]));
  return hits.map((h) => rows.get(Number(h.paragraph_id))).filter(Boolean);
}
/** The chosen passage's link (hit-links withLinks: the best publisher of the same words). */
export const linkHits = async (hits) => (await import('../hit-links.js')).withLinks(hits);

// the writer's own work holding the span verbatim — never a provisional translation (source-hunt isProvisional): a published
// book's passage is not traded for a reading aid (w8:db-27: The Dawn-Breakers → "Farewell address … (provisional translation)")
const ownHolder = (q, writer, span, provisional) => canon(q?.author) === writer && canon(q?.book_author || q?.author) === writer
  && !provisional(q) && holds(q.text, span).exact;

/**
 * passages → { passages, swapped: [{ from, to, writer }], searches, late, ms }. Each quoted passage's slot goes to the writer's
 * own passage (with its link); the quoting passage moves to the end as context (the prompt marks it "as quoted in this work
 * by …"). An own passage already in the list is used with no search; otherwise ONE search(span, { author: writer }, { timeoutMs })
 * per passage (live: literalOwnSearch), all in parallel, ranked by quoteCandidates (rankOrigins); the winner alone goes through
 * link (live: linkHits). Search + rank + link of every passage share the budget: later than budgetMs, failed, or no own passage
 * holding the span EXACTLY → the original passage stays. `shape` turns a (linked) hit into the caller's passage shape.
 * `keep(p)` true → never swapped: a passage of the book the reader named is that book's words, not a copy to trade away.
 */
export async function preferOwnWork(passages, { search = null, link = null, budgetMs = OWN_SOURCE_MS, shape = (h) => h, keep = null } = {}) {
  const t0 = Date.now();
  const done = (extra = {}) => ({ passages, swapped: [], searches: 0, late: 0, ...extra, ms: Date.now() - t0 });
  if (!Array.isArray(passages) || !passages.length) return done();
  const { DOCTRINAL, isProvisional } = await import('../source-hunt.js');
  const jobs = passages.map((p, i) => ({ p, i })).filter(({ p }) => quotedElsewhere(p, DOCTRINAL) && !keep?.(p))
    .map((j) => ({ ...j, writer: canon(j.p.author), span: quotedSpan(j.p.text) })).filter((j) => j.span);
  if (!jobs.length) return done();
  for (const j of jobs) j.own = passages.find((q) => q !== j.p && ownHolder(q, j.writer, j.span, isProvisional)) || null;
  const need = jobs.filter((j) => !j.own && search);
  let late = 0;
  if (need.length) {
    const LATE = Symbol('late');
    let timer;
    const left = () => Math.max(0, budgetMs - (Date.now() - t0));
    const deadline = new Promise((r) => { timer = setTimeout(r, left(), LATE); });
    const lookup = async (j) => {
      const hits = await search(j.span, { author: j.writer }, { timeoutMs: left() });
      const ranked = await quoteCandidates(Array.isArray(hits) ? hits : [], j.span);
      const hit = ranked.find((h) => ownHolder(h, j.writer, j.span, isProvisional));
      if (!hit) return null;
      const [linked] = link ? await link([hit]).catch(() => [hit]) : [hit];
      return shape(linked || hit);
    };
    const got = await Promise.all(need.map((j) => Promise.race([lookup(j).catch(() => null), deadline])));
    clearTimeout(timer);
    need.forEach((j, k) => { if (got[k] === LATE) late++; else j.own = got[k]; });
  }
  const found = jobs.filter((j) => j.own);
  if (!found.length) return done({ searches: need.length, late });
  const lead = passages.slice(), tail = [];
  for (const j of found) { lead[j.i] = j.own; tail.push(j.p); }
  const seen = new Set();
  const out = [...lead, ...tail].filter((p) => { const k = keyOf(p); if (seen.has(k)) return false; seen.add(k); return true; });
  return { passages: out, swapped: found.map((j) => ({ from: keyOf(j.p), to: keyOf(j.own), writer: j.writer })), searches: need.length, late, ms: Date.now() - t0 };
}
