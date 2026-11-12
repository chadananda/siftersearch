// Own-source step (Chad's standing rule: the same words in several sources → cite the best published one): a passage whose
// WRITER is a Central Figure or Shoghi Effendi but whose BOOK is another author's (Shoghi Effendi's The Promised Day Is Come
// quoting Bahá'u'lláh) is swapped for the same words in the writer's own work; so is a writer quoting his OWN other work (the
// Hidden Words in Fountain of Wisdom), and a slug-titled scrape gives way to a properly published copy of the same words. Code only — library metadata (author vs
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
// a shaped hit can lack id and index: never let two paragraphs of one document share a key (they deduped into one, 11-11)
const keyOf = (p) => p?.id ?? p?.paragraph_id ?? `${p?.document_id}:${p?.paragraph_index ?? String(p?.text || '').slice(0, 80)}`;

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

/** Only the spans IN QUOTATION MARKS (5+ words), longest first — no whole-paragraph fallback. Pure. */
export function quotedOnly(text) {
  return [...String(text || '').matchAll(/[“"]([^“”"]{10,})[”"]/g)].flatMap((m) => m[1].split(/\s*(?:…|\.\.\.)\s*/))
    .map((s) => s.trim()).filter((s) => words(s).length >= MIN_WORDS).sort((a, b) => words(b).length - words(a).length).map(clip);
}

/** A scraped page with no real title ("shoghi-effendi-trans-011-the-dawn-breakers_en", "Page 14"): a POOR COPY of some work. Pure. */
export const slugTitle = (x) => { const t = String(x || '').trim(); return /^page \d+$/i.test(t) || (!!t && !/\s/.test(t) && /[-_]/.test(t)); };

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
  // no author (a poor copy's lookup): the same words anywhere in the library
  const hits = (await keyword(String(span), { limit, filters: author ? { author, writerOnly: true } : {}, timeoutMs }))?.hits || [];
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
// the ORIGINAL of words a writer quotes from his own other work (battery 11-10 "justice": the Hidden Words' "The best beloved of
// all things in My sight is Justice" cited from Fountain of Wisdom): another document of his, holding the words NOT in quotation marks
const selfOrigin = (q, j, provisional) => ownHolder(q, j.writer, j.span, provisional) && Number(q.document_id) !== Number(j.p.document_id)
  && !quotedOnly(q.text).some((x) => holds(x, j.span).exact);
// a better-published COPY of a poor copy's words (battery 11-10 "bab-born": The Dawn-Breakers as a scraped page titled
// "shoghi-effendi-trans-011-the-dawn-breakers_en", authored "Shoghi Effendi", linked to a #:~:text= page): another document
// with a real title holding the same words — its title, author and link replace the scrape's
const betterCopy = (q, j, provisional) => !!q && Number(q.document_id) !== Number(j.p.document_id) && !slugTitle(q.title) && !provisional(q)
  && holds(q.text, j.span).exact && !quotedOnly(q.text).some((x) => holds(x, j.span).exact);   // a book QUOTING the words is not a copy
// a LAST-RESORT source (Shoghi Effendi's *Uncompiled Published Letters*; feedback citation source order) gives way to a published
// work of the same writer holding the same words (battery 11-10 timeline: the 1844 declaration cited from it first)
// — or to a published compilation carrying his words (scenario 11-12 decentralization: "consultation, frank and unfettered, is the
// bedrock" is in *Consultation*; the passage's author is his, the book's is the compiler's)
export const LAST_RESORT = /\bUncompiled (?:Published )?Letters\b/i;
const compiled = (q, j, provisional) => canon(q?.author) === j.writer && !provisional(q) && holds(q.text, j.span).exact
  && !quotedOnly(q.text).some((x) => holds(x, j.span).exact);
const published = (q, j, provisional) => (ownHolder(q, j.writer, j.span, provisional) || compiled(q, j, provisional))
  && Number(q.document_id) !== Number(j.p.document_id) && !LAST_RESORT.test(q.title || '');
// a SCRAPE-HOST edition (r17 11-11: Nabíl's opening of The Dawn-Breakers cited as "The Seven Proofs #610" from the Nicolas/Terry
// edition on bahai-library.com, which carries his narrative): the same words in a published book (not another scrape, not a study)
export const SCRAPE_HOST = /^https?:\/\/(?:www\.)?(?:bahai-library\.com|oceanoflights\.org)\//i;
const hostCopy = (q, j, provisional) => betterCopy(q, j, provisional) && !SCRAPE_HOST.test(String(q.source_url || q.url || '')) && q.authority !== 'scholarship';
const fits = (q, j, provisional) => (j.kind === 'copy' ? betterCopy(q, j, provisional) : j.kind === 'host' ? hostCopy(q, j, provisional) : j.kind === 'self' ? selfOrigin(q, j, provisional)
  : j.kind === 'published' ? published(q, j, provisional) : ownHolder(q, j.writer, j.span, provisional));

/**
 * passages → { passages, swapped: [{ from, to, writer }], searches, late, ms }. Each quoted passage's slot goes to the writer's
 * own passage (with its link); the quoting passage moves to the end as context (the prompt marks it "as quoted in this work
 * by …"). An own passage already in the list is used with no search; otherwise ONE search(span, { author: writer }, { timeoutMs })
 * per passage (live: literalOwnSearch), all in parallel, ranked by quoteCandidates (rankOrigins); the winner alone goes through
 * link (live: linkHits). Search + rank + link of every passage share the budget: later than budgetMs, failed, or no own passage
 * holding the span EXACTLY → the original passage stays. `shape` turns a (linked) hit into the caller's passage shape.
 * `keep(p)` true → never swapped: a passage of the book the reader named is that book's words, not a copy to trade away.
 * `writers` adds writers to the doctrinal set for this call only.
 */
export async function preferOwnWork(passages, opts = {}) {
  const first = await ownPass(passages, opts);
  // a swap can land on a poor copy (a writer's words found in a slug-titled scrape): one more pass trades it for the published copy (11-11)
  const left = (opts.budgetMs ?? OWN_SOURCE_MS) - first.ms;
  if (!first.swapped.length || left <= 0) return first;
  const again = await ownPass(first.passages, { ...opts, budgetMs: left, onlyKinds: new Set(['copy', 'host']), only: new Set(first.swapped.map((x) => x.to)) });
  if (!again.swapped.length) return first;
  return { ...again, swapped: [...first.swapped, ...again.swapped], searches: first.searches + again.searches, late: first.late + again.late, ms: first.ms + again.ms };
}
async function ownPass(passages, { search = null, link = null, budgetMs = OWN_SOURCE_MS, shape = (h) => h, keep = null, writers = [], onlyKinds = null, only = null } = {}) {
  const t0 = Date.now();
  const done = (extra = {}) => ({ passages, swapped: [], searches: 0, late: 0, ...extra, ms: Date.now() - t0 });
  if (!Array.isArray(passages) || !passages.length) return done();
  const { DOCTRINAL: CORE, isProvisional } = await import('../source-hunt.js');
  // `writers`: more writers whose words, quoted in another's book, go back to their own (guidance.js: the House of Justice's
  // letters quoted in Lights of Guidance → the published message)
  const DOCTRINAL = writers.length ? new Set([...CORE, ...writers.map(canon)]) : CORE;
  // four kinds: 'elsewhere' (a writer quoted in another's book), 'self' (a writer quoting his own other work, in marks),
  // 'copy' (a passage of a poor copy: a slug-titled scrape), 'host' (a scrape-host edition: the words in a published book), 'published' (a last-resort source: the writer's published work instead)
  const kindOf = (p) => (keep?.(p) ? null : quotedElsewhere(p, DOCTRINAL) ? 'elsewhere' : slugTitle(p.title) ? 'copy'
    : LAST_RESORT.test(p.title || '') && canon(p.author) ? 'published'
    : DOCTRINAL.has(canon(p.author)) && canon(p.author) === canon(p.book_author || p.author) && quotedOnly(p.text).length ? 'self' : SCRAPE_HOST.test(String(p.source_url || '')) ? 'host' : null);
  const jobs = passages.map((p, i) => ({ p, i, kind: only && !only.has(keyOf(p)) ? null : kindOf(p) })).filter((j) => j.kind && (!onlyKinds || onlyKinds.has(j.kind)))
    .map((j) => ({ ...j, writer: j.kind === 'copy' || j.kind === 'host' ? null : canon(j.p.author), span: j.kind === 'self' ? quotedOnly(j.p.text)[0] : j.kind === 'copy' || j.kind === 'host' || j.kind === 'published' ? (words(j.p.text).length >= MIN_WORDS ? clip(j.p.text) : null) : quotedSpan(j.p.text) })).filter((j) => j.span);
  if (!jobs.length) return done();
  for (const j of jobs) j.own = passages.find((q) => q !== j.p && fits(q, j, isProvisional)) || null;
  const need = jobs.filter((j) => !j.own && search);
  let late = 0;
  if (need.length) {
    const LATE = Symbol('late');
    let timer;
    const left = () => Math.max(0, budgetMs - (Date.now() - t0));
    const deadline = new Promise((r) => { timer = setTimeout(r, left(), LATE); });
    const lookup = async (j) => {
      // a last-resort letter: a compilation often carries an excerpt from mid-paragraph (Lights of Guidance's "…the Guardian has
      // re-emphasized the necessity of avoiding over centralization"), so 12-word windows from its middle are tried beside the opening (a letter is often one long sentence)
      if (j.kind === 'published') {
        const w = words(j.p.text), at = (f) => w.slice(Math.floor(w.length * f), Math.floor(w.length * f) + 12).join(' ');
        // (12–15 words, not the 40-word clip: a compilation splits a letter into shorter paragraphs)
        const spans = w.length >= 36 ? [w.slice(0, 15).join(' '), at(1 / 3), at(2 / 3)] : [j.span];
        const tries = await Promise.all(spans.map(async (span) => {
          const hits = await search(span, { author: j.writer }, { timeoutMs: left() }).catch(() => []);
          return (Array.isArray(hits) ? hits : []).find((h) => fits(h, { ...j, span }, isProvisional)) || null;
        }));
        const hit = tries.find(Boolean);
        if (!hit) return null;
        const [linked] = link ? await link([hit]).catch(() => [hit]) : [hit];
        return shape(linked || hit);
      }
      const hits = await search(j.span, { author: j.writer }, { timeoutMs: left() });
      // a copy is any work (history included), so the search order stands; a writer's words are ranked as quotations (rankOrigins)
      // (an added writer is not core literature, which quoteCandidates ranks alone: search order too)
      const ranked = j.kind === 'copy' || j.kind === 'host' || j.kind === 'published' || !CORE.has(j.writer) ? (Array.isArray(hits) ? hits : []) : await quoteCandidates(Array.isArray(hits) ? hits : [], j.span);
      const hit = ranked.find((h) => fits(h, j, isProvisional));
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
  // a poor copy holds the same words as its better copy: dropped, never kept as context (the writer cited the scrape, 11-11);
  // a last-resort letter is not kept either: left in as context the writer still cited it (11-12 decentralization)
  for (const j of found) { lead[j.i] = j.own; if (j.kind !== 'copy' && j.kind !== 'host' && j.kind !== 'published') tail.push(j.p); }
  const seen = new Set();
  const out = [...lead, ...tail].filter((p) => { const k = keyOf(p); if (seen.has(k)) return false; seen.add(k); return true; });
  return { passages: out, swapped: found.map((j) => ({ from: keyOf(j.p), to: keyOf(j.own), writer: j.writer, kind: j.kind })), searches: need.length, late, ms: Date.now() - t0 };
}
