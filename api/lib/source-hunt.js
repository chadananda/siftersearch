// SourceHunt (Chad 2026-10-04): an English quote → (1) the published book it comes from (OceanLibrary first), (2) every
// other publication that cites it, (3) the likely original tablet, with its text and the oceanoflights / Phelps Inventory
// links. Candidates come from the Qdrant phrase + BM25 layers (no Meili); the link graph (passage-links.js) walks
// quote → source → original. A paragraph COUNTS only when it holds the quote verbatim (word 3-gram overlap).
// Deps injected (default: the live ones) so the logic is testable without a database.
import { overlap, matchWords } from './passage-links.js';
import { firstPerson } from './authorship/reader.js';
import { paragraphAuthor } from './authorship/effective.js';
import { authorAuthority } from './authority.js';
import { segment, cleanText } from './phrases.js';

/** Stored text still carries HTML entities in ~96k paragraphs (mostly the bahai-library.com copies: `&quot;` around a
 *  quoted Arabic line in a Persian passage). Decoded before matching, highlighting and display. */
const NAMED = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: '\u00a0', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', mdash: '—', ndash: '–', zwnj: '\u200c', zwj: '\u200d' };
export const decodeEntities = (s) => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (NAMED[e.toLowerCase()] ?? m));

const VERBATIM = 0.6;
// A translation VARIANT ("…and the people of the world its citizens" for "…and mankind its citizens", Chad 10-05) shares
// too few 3-word runs for the verbatim gate (5 of 12), so it also counts when nearly all its content words are present and
// a quarter of its phrasing matches. The writer's own book then still wins over a booklet that quotes it.
const VARIANT_WORDS = 0.75, VARIANT_PHRASING = 0.25;
const STOP = new Set('the a an and or of to in on at by for with from as is are was were be been it its this that these those his her their our your my thy thee thou ye he she they we i you who which what but not no nor so than then there here all any'.split(' '));
export function contentContainment(quote, text) {
  const q = [...new Set(matchWords(quote).filter((w) => !STOP.has(w) && w.length > 1))];
  if (!q.length) return 0;
  const have = new Set(matchWords(text));
  return q.filter((w) => have.has(w)).length / q.length;
}
/** Holds the quote: verbatim (3-gram share ≥ 0.6) or a close translation variant. */
const holds = (quote, text, ov = overlap(quote, text)) => ov >= VERBATIM || (ov >= VARIANT_PHRASING && contentContainment(quote, text) >= VARIANT_WORDS);        // share of the quote's word 3-grams a paragraph must hold
const CANDIDATES = 60;
const QD_MS = 10000;     // a deliberate lookup, not the 1 s search path: wait for Qdrant under build load (2.5 s timed out silently)

/** The quote as searched: quotation marks, ellipses and reference tails dropped; the longest run between ellipses is the
 *  one matched against paragraphs (an elided quote never appears whole in its source). */
export function prepareQuote(raw) {
  const text = String(raw || '').replace(/[“”"«»]/g, ' ').replace(/\s*\([^()]{0,80}\)\s*$/, '').replace(/\s+/g, ' ').trim();
  const runs = text.split(/\s*(?:\.\.\.|…)\s*/).map((s) => s.trim()).filter(Boolean);
  const longest = runs.sort((a, b) => b.length - a.length)[0] || '';
  return { text, match: longest, words: matchWords(longest).length };
}

/** Where the quote sits in a passage: character ranges [start, end) of the longest run of the quote's words found in order
 *  (accent-, apostrophe- and punctuation-blind, as the verbatim test). An elided quote ("… … …") gives one range per run.
 *  Runs shorter than three words are not marked (a stray "of the" is no evidence). */
export function quoteRanges(passage, quoteText) {
  const tok = (s) => [...String(s).matchAll(/[\p{L}\p{N}’'ʼ‘`]+/gu)].map((m) => ({ w: matchWords(m[0]).join(''), start: m.index, end: m.index + m[0].length }))
    .filter((t) => t.w);
  const P = tok(passage), out = [];
  for (const run of String(quoteText).split(/\s*(?:\.\.\.|…)\s*/)) {
    const Q = tok(run).map((t) => t.w);
    if (Q.length < 3) continue;
    let best = { len: 0, end: -1 }, prev = new Array(Q.length + 1).fill(0);
    for (let i = 1; i <= P.length; i++) {               // longest common contiguous word run (DP, one row kept)
      const cur = new Array(Q.length + 1).fill(0);
      for (let j = 1; j <= Q.length; j++) if (P[i - 1].w === Q[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best.len) best = { len: cur[j], end: i - 1 }; }
      prev = cur;
    }
    if (best.len >= 3) out.push([P[best.end - best.len + 1].start, P[best.end].end]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// Where a citation is SHOWN (Chad 10-05): a public copy wins — OceanLibrary, Ocean of Lights, Phelps, Bahá'í Library Online —
// and a SifterSearch-only copy appears only when the work has no public copy. The site is read from where the link POINTS
// (a library document linking to OceanLibrary is an OceanLibrary citation), copies are matched by normalised title.
const SITE_RANK = { 'oceanlibrary.com': 1, 'oceanoflights.org': 2, phelps: 3, 'bahai-library.com': 4, library: 5 };
export function siteOf(url, sourceSite) {
  const u = String(url || '');
  if (/oceanlibrary\.com/i.test(u)) return 'oceanlibrary.com';
  if (/oceanoflights\.org/i.test(u)) return 'oceanoflights.org';
  if (/portlandiator|phelps/i.test(u)) return 'phelps';
  if (/bahai-library\.com/i.test(u)) return 'bahai-library.com';
  return sourceSite && SITE_RANK[sourceSite] ? sourceSite : 'library';
}
const titleKey = (t) => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[‘’'`ʼ]/g, '')
  .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/^(the|a|an)\s+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** One entry per work: the best public copy; paragraph counts merged; library-only copies kept only when nothing else exists. */
export function dedupeCitations(items) {
  const best = new Map();
  for (const c of items) {
    const k = titleKey(c.title) || `doc:${c.documentId}`;
    const cur = best.get(k);
    if (!cur) { best.set(k, { ...c, copies: 1 }); continue; }
    const keep = (SITE_RANK[c.site] ?? 9) < (SITE_RANK[cur.site] ?? 9) ? { ...c } : cur;
    best.set(k, { ...keep, paragraphs: Math.max(cur.paragraphs, c.paragraphs), copies: cur.copies + 1 });
  }
  return [...best.values()].sort((a, b) => (SITE_RANK[a.site] ?? 9) - (SITE_RANK[b.site] ?? 9) || b.paragraphs - a.paragraphs);
}

const isCanonical = (p) => !p.source_site || p.source_site === 'oceanlibrary.com';

// The doctrinal authors (Chad 10-03: compilations display the Báb, Bahá’u’lláh, ‘Abdu’l-Bahá, Shoghi Effendi; UHJ is not doctrinal).
const DOCTRINAL = new Set(['The Báb', 'Bahá’u’lláh', '‘Abdu’l-Bahá', 'Shoghi Effendi']);

/** Whose words these are, by VOTE over the verbatim matches: a match WRITTEN by a doctrinal author is strong evidence
 *  (2), a doctrinal author the reader marks as QUOTED in a match is weaker (1); a name merely mentioned never counts — "the
 *  teachings of Bahá’u’lláh revolve" is Shoghi Effendi writing about Him. Ties go to standing. Null when no doctrinal
 *  author is credited. */
export function quoteAuthorOf(matches) {
  const votes = new Map();
  const vote = (n, w) => { const c = firstPerson(n || '') || n; if (DOCTRINAL.has(c)) votes.set(c, (votes.get(c) || 0) + w); };
  for (const m of matches) {
    vote(m.writer, 2);
    let list = [];
    try { list = JSON.parse(m.authors || '[]') || []; } catch { /* no list */ }
    for (const a of list) if (a?.role === 'quoted' && a.name) vote(a.name, 1);
  }
  let best = null, bv = 0, ba = -1;
  for (const [n, v] of votes) { const a = authorAuthority(n) ?? 0; if (v > bv || (v === bv && a > ba)) { best = n; bv = v; ba = a; } }
  return best;
}

/**
 * Rank origin candidates — only a paragraph that HOLDS the quote can be its origin; then the QUOTE'S writer's own text (a UHJ letter quoting Bahá’u’lláh counts as the UHJ's
 * "own work" — paragraph attribution does not split every mixed paragraph); the writer's OWN book beats a compilation or study that quotes it; then the writer's standing,
 * the canonical library (OceanLibrary) over scraped sites, how many matches link to it as their source, and how fully it
 * holds the quote. Between the same writer's own books, the library's Core Publications, then the EARLIEST
 * (a later compilation of a writer's extracts — Call to the Nations — quotes the original, The World Order of Bahá’u’lláh),
 * and where years are missing, the paragraph more books are linked as quoting (quotedCount).
 */
export function rankOrigins(cands, quoteAuthor = null) {
  const canon = (n) => firstPerson(n || '') || n;
  const year = (c) => { const y = parseInt(c.year, 10); return y > 0 ? y : 9999; };
  const key = (c) => [c.holds ?? ((c.overlap || 0) >= VERBATIM) ? 1 : 0, quoteAuthor && canon(c.writer) === canon(quoteAuthor) ? 1 : 0, c.ownWork ? 1 : 0,
    /core publications/i.test(c.collection || '') ? 1 : 0, c.authority ?? 0, isCanonical(c) ? 1 : 0, c.linkedFrom || 0,
    -year(c), c.quotedCount || 0, c.overlap || 0];
  return [...cands].sort((a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i]; return a.id - b.id; });
}

// opts.emit(stage, data): each stage's REAL result as soon as it exists — the page's live console replays these (never
// invented progress). Stages: query · candidates · verbatim · links · writer · targeted · origin · cited · tablet.
const docBrief = (r) => ({ id: r.doc_id, title: r.title, site: r.source_site || 'library', religion: r.religion || null });
export async function sourceHunt(raw, deps = {}, { emit = () => {} } = {}) {
  const NEED = ['phrases', 'keyword', 'links', 'passages', 'meta', 'rows'];
  const d = NEED.every((k) => deps[k]) ? deps : { ...(await defaultDeps()), ...deps };
  const q = prepareQuote(raw);
  if (q.words < 4) return { error: 'Paste at least four words of the quote.' };
  const t0 = Date.now();
  const stages = {};   // stage → ms since start (kept in the result: the audit log shows where the time went)
  const say = (stage, data) => { stages[stage] = Date.now() - t0; try { emit(stage, { ...data, ms: stages[stage] }); } catch { /* a closed stream never breaks the hunt */ } };
  say('query', { words: q.words, runs: q.text.split(/\s*(?:\.\.\.|…)\s*/).filter(Boolean).length });

  // 1. candidates BY MEANING: phrase vectors (cross-lingual, cross-translation) and BM25, over the whole library + sites —
  // and the same restricted to the doctrinal writers, so a line quoted by dozens of books cannot crowd out its own source
  const DOC = { author: [...DOCTRINAL], religion: "Baha'i" };
  const [ph, kw, phD, kwD] = await Promise.all([
    d.phrases(q.match, { limit: CANDIDATES, filters: {}, timeoutMs: QD_MS }).catch(() => ({ hits: [] })),
    d.keyword(q.match, { limit: CANDIDATES, filters: {}, timeoutMs: QD_MS }).catch(() => ({ hits: [] })),
    d.phrases(q.match, { limit: 20, filters: DOC, timeoutMs: QD_MS }).catch(() => ({ hits: [] })),
    d.keyword(q.match, { limit: 10, filters: DOC, timeoutMs: QD_MS }).catch(() => ({ hits: [] })),
  ]);
  const order = [...phD.hits, ...ph.hits, ...kwD.hits, ...kw.hits];
  const ids = [...new Set(order.map((h) => h.paragraph_id))];
  const span = new Map(order.filter((h) => h.span).map((h) => [h.paragraph_id, h.span]));
  const rows = await d.rows(ids);
  const probedDocs = [...new Map(rows.map((r) => [r.doc_id, docBrief(r)])).values()];
  say('candidates', { phrase: ph.hits.length + phD.hits.length, keyword: kw.hits.length + kwD.hits.length, paragraphs: ids.length, documents: probedDocs });
  // 1b. which candidates HOLD the quote — judged by a System-1 decision on meaning (any translation or paraphrase), never by
  // shared wording (Chad 10-05: "this is a cross-translation search, so no phrase matching should be used"); the wording
  // test is only the fallback when no decision is available.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ranked0 = ids.map((id) => byId.get(id)).filter(Boolean);
  const decided = await decideHolds(d, q, ranked0.slice(0, HOLDS_MAX), span);
  const holdsRow = (r) => (decided ? decided.has(r.id) : holds(q.match, r.text, overlap(q.match, r.text)));
  const matches = ranked0.filter(holdsRow).map((r) => ({ ...r, overlap: overlap(q.match, r.text), holds: true }));
  say('verbatim', { count: matches.length, rejected: rows.length - matches.length, by: decided ? 'decision' : 'wording',
    documents: [...new Map(matches.map((r) => [r.doc_id, docBrief(r)])).values()] });

  // 2. the source each match quotes (a citing book → the Gleanings paragraph), added to the origin pool
  const links = await d.links(matches.map((m) => m.id), { quotedBy: false });
  const linkedFrom = new Map();
  for (const m of matches) for (const s of links.get(m.id)?.sources || []) if ((s.link?.coverage ?? 0) >= 0.8) linkedFrom.set(s.id, (linkedFrom.get(s.id) || 0) + 1);
  const extra = [...linkedFrom.keys()].filter((id) => !matches.some((m) => m.id === id));
  say('links', { sources: linkedFrom.size, added: extra.length });
  const pool = [...matches, ...(await d.rows(extra)).map((r) => ({ ...r, overlap: overlap(q.match, r.text), holds: true }))]
    .filter((c) => c.doc_role !== 'metadata')
    .map((c) => {
      const writer = paragraphAuthor({ authors: c.authors, author: c.book_author });
      const book = firstPerson(c.book_author || '') || c.book_author;
      return { ...c, writer, ownWork: !!writer && (firstPerson(writer) || writer) === book, authority: authorAuthority(writer), linkedFrom: linkedFrom.get(c.id) || 0 };
    });
  // 2b. the quote's writer's OWN paragraphs: a line quoted by dozens of books can crowd its source out of the first
  // candidates, so search again inside that writer's texts (author_fold filter) and add what holds the quote verbatim
  const quoteAuthor = quoteAuthorOf(pool);
  say('writer', { quoteAuthor });
  if (quoteAuthor) {
    const f = { author: quoteAuthor, religion: "Baha'i" };
    const [p2, k2] = await Promise.all([
      d.phrases(q.match, { limit: 20, filters: f, timeoutMs: QD_MS }).catch(() => ({ hits: [] })),
      d.keyword(q.match, { limit: 20, filters: f, timeoutMs: QD_MS }).catch(() => ({ hits: [] })),
    ]);
    const more = [...new Set([...p2.hits, ...k2.hits].map((h) => h.paragraph_id))].filter((id) => !pool.some((c) => c.id === id) && !byId.has(id));
    const moreRows = await d.rows(more);
    for (const h of p2.hits) if (h.span) span.set(h.paragraph_id, h.span);
    const decided2 = moreRows.length ? await decideHolds(d, q, moreRows.slice(0, HOLDS_MAX), span) : new Set();
    for (const r of moreRows) {
      const ov = overlap(q.match, r.text);
      if (!(decided2 ? decided2.has(r.id) : holds(q.match, r.text, ov)) || r.doc_role === 'metadata') continue;
      const writer = paragraphAuthor({ authors: r.authors, author: r.book_author });
      const book = firstPerson(r.book_author || '') || r.book_author;
      pool.push({ ...r, overlap: ov, holds: true, writer, ownWork: !!writer && (firstPerson(writer) || writer) === book, authority: authorAuthority(writer), linkedFrom: 0 });
    }
    say('targeted', { searched: more.length, pool: pool.length });
  }
  if (!pool.length) return { quote: q.text, origin: null, citedBy: [], tablet: await tabletGuess(d, q, null, quoteAuthor), ms: Date.now() - t0 };

  // how many paragraphs the link graph records as quoting each leading candidate — the original is quoted, the compilation
  // that reprints it rarely is (the tiebreak when publication years are missing)
  const lead = rankOrigins(pool, quoteAuthor).slice(0, 8);
  const qc = await d.links(lead.map((c) => c.id), { quotedBy: true }).catch(() => new Map());
  for (const c of lead) c.quotedCount = qc.get(c.id)?.quotedBy?.count || 0;
  const ranked = rankOrigins(pool, quoteAuthor), origin = ranked[0];
  // the quote's words in order where the source holds this wording; otherwise (another translation, a paraphrase) the
  // passage's phrases nearest the quote BY MEANING — the same phrase-vector spans that mark the original
  // the citation graph for the origin starts NOW, beside the source highlight (they do not depend on each other)
  const fullP = d.links([origin.id], { quotedBy: true }).then((m) => m.get(origin.id) || {}).catch(() => ({}));
  const tabletP = fullP.then((full) => tabletGuess(d, q, full, quoteAuthor));   // the original, as soon as the graph names it
  // highlight BY MEANING (the clause decision) — any translation; the exact word run only when no decision is available
  const byMeaning = await meaningRanges(d, q, origin.id, origin.text, 'en');
  const exactAll = byMeaning.highlightBy === 'decision' ? [] : quoteRanges(origin.text, q.text);
  const hl = byMeaning.highlightBy === 'decision' ? byMeaning : exactAll.length ? { highlight: exactAll, highlightBy: 'wording' } : byMeaning;
  const originOut = { id: origin.id, documentId: origin.doc_id, title: origin.title, author: origin.writer, bookAuthor: origin.book_author,
    text: origin.text, highlight: hl.highlight, highlightBy: hl.highlightBy,
    url: origin.url, site: siteOf(origin.url, origin.source_site), overlap: +origin.overlap.toFixed(2) };
  say('origin', { origin: originOut, candidates: ranked.length });

  // 3. everything else that holds the quote, plus what the link graph says quotes the origin — grouped by publication
  const full = await fullP;
  const byDoc = new Map();
  const add = (p) => {
    if (p.doc_id === origin.doc_id) return;
    const cur = byDoc.get(p.doc_id) || { documentId: p.doc_id, title: p.title, author: p.book_author, site: siteOf(p.url, p.source_site),
      url: p.url, paragraphs: 0, first: p.id };
    cur.paragraphs++; byDoc.set(p.doc_id, cur);
  };
  for (const m of pool) if (m.id !== origin.id) add(m);
  const quoters = (full.quotedBy?.passages || []).map((p) => ({ id: p.id, doc_id: p.documentId, title: p.document.title,
    book_author: p.document.author, url: p.url, source_site: null }));
  for (const p of quoters) if (!pool.some((m) => m.id === p.id)) add(p);
  const citedBy = dedupeCitations([...byDoc.values()]);
  say('cited', { citedBy, citedByLinkCount: full.quotedBy?.count || 0 });
  const tablet = await tabletP;
  say('tablet', { tablet });

  return {
    quote: q.text,
    quoteAuthor,
    origin: originOut,
    citedBy, citedByLinkCount: full.quotedBy?.count || 0,
    // why this source: the next best candidates with the facts the ranking used
    considered: ranked.slice(0, 6).map((c) => ({ id: c.id, title: c.title, writer: c.writer, bookAuthor: c.book_author,
      ownWork: c.ownWork, site: c.source_site || 'library', collection: c.collection || null, year: c.year || null, quotedCount: c.quotedCount ?? null, overlap: +c.overlap.toFixed(2) })),
    tablet,
    ms: Date.now() - t0,
    stages,
  };
}

/** The original: a LINKED one (translation or quote→source→original) is certain; otherwise the nearest Arabic/Persian
 *  paragraphs by phrase vector are offered as candidates, labelled as such. Each carries its tablet metadata. */
/** Highlight ranges in an ORIGINAL: the quote's best phrases inside that paragraph (phrase index spans over the STORED text),
 *  each located again in the DISPLAYED text by content — display decodes entities and drops sentence markers, so raw offsets
 *  would drift. Phrases within 0.03 of the best score are marked; overlaps merge. */
async function originalRanges(d, q, id, shown) {
  if (!d.spans || !d.rawText) return [];
  const [spans, raw] = await Promise.all([d.spans(q.match, id, { limit: 8, timeoutMs: QD_MS }).catch(() => []), d.rawText(id).catch(() => null)]);
  if (!spans.length || !raw) return [];
  // the phrase index stores spans over cleanText(raw) (sentence markers removed) — slicing the raw text shifted them into
  // the middle of words (10-05). Only the single best phrase: a fallback must not scatter marks.
  const clean = cleanText(raw);
  const out = [];
  for (const x of [spans.reduce((m, s) => (s.score > m.score ? s : m))].filter((s) => s.end > s.start)) {
    const piece = decodeEntities(clean.slice(x.start, x.end)).replace(/[ \t]+/g, ' ').trim();
    const at = piece.length >= 4 ? shown.indexOf(piece) : -1;
    if (at >= 0) out.push([at, at + piece.length]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of out) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
  return merged;
}

/**
 * The quote's clauses inside a passage, chosen by a System-1 DECISION model (Chad 10-05: "use Clef-flash to find the
 * highlight range of a concept match"): the passage is split into its clauses (the phrase index's own segmenter — meaning,
 * never length), and one choice question asks which numbered clause says what the quotation says, in any language or
 * translation, with "none" as an option. Clauses with real probability (≥ 0.15 and ≥ 40% of the top) are marked; adjacent
 * ones merge. Logged per task (sourcehunt-highlight) — served by Clef-flash where routed, Jev checking it in the background.
 * Returns ranges, [] for "none", or null when the decision is unavailable (the caller keeps the vector spans).
 */
const MAX_CLAUSES = 18;
const HOLDS_MAX = 24;

/** Which candidate paragraphs CONTAIN the quoted statement — one System-1 call, one yes/no (noul) per candidate, each shown
 *  as an excerpt around its best-matching phrase. Same saying in any translation or close paraphrase = yes; same topic = no.
 *  Logged as task sourcehunt-holds (Jev serves; Clef shadows). Returns a Set of ids, or null when no decision is available. */
async function decideHolds(d, q, rows, span = new Map()) {
  if (!d.decide || !rows.length) return null;
  const excerpt = (r) => {
    const t = r.text || '', s = span.get(r.id);
    if (t.length <= 900) return t;
    const a = Math.max(0, (s?.start ?? 0) - 350), b = Math.min(t.length, (s?.end ?? 550) + 350);
    return `${a > 0 ? '… ' : ''}${t.slice(a, b)}${b < t.length ? ' …' : ''}`;
  };
  const state = `QUOTATION:\n${q.text}\n\nPASSAGES:\n` + rows.map((r, i) => `[p${i + 1}] ${excerpt(r)}`).join('\n\n');
  const questions = Object.fromEntries(rows.map((r, i) => [`p${i + 1}`, { type: 'noul',
    instructions: `Does passage [p${i + 1}] contain the quoted statement — the same saying, whether in the same words, another translation, or a close paraphrase? A passage that only discusses the same topic does not.` }]));
  const res = await d.decide('sourcehunt-holds', state, questions).catch(() => null);
  if (!res?.answers) return null;
  return new Set(rows.filter((r, i) => (res.answers[`p${i + 1}`]?.noul ?? 0) >= 0.5).map((r) => r.id));
}
async function decideRanges(d, quoteText, text, lang, hint = []) {
  if (!d.decide) return null;
  let units = segment(text, lang);
  if (units.length < 2) return null;
  if (units.length > MAX_CLAUSES) {                           // a window of clauses around the vector hint
    const c = hint.length ? Math.max(0, units.findIndex((u) => u.end > hint[0][0])) : 0;
    const from = Math.max(0, Math.min(units.length - MAX_CLAUSES, c - (MAX_CLAUSES >> 1)));
    units = units.slice(from, from + MAX_CLAUSES);
  }
  const clause = (u) => text.slice(u.start, u.end);
  // one yes/no per clause — a quote often spans several clauses ("For like seeketh like, / and taketh pleasure in …"), and a
  // single choice could mark only one of them
  const state = `QUOTATION (English):\n${quoteText}\n\nPASSAGE (${lang === 'en' ? 'English' : 'Arabic/Persian'}) — numbered clauses:\n`
    + units.map((u, i) => `[c${i + 1}] ${clause(u)}`).join('\n');
  const questions = Object.fromEntries(units.map((u, i) => [`c${i + 1}`, { type: 'noul',
    instructions: `Is clause [c${i + 1}] part of what the quotation says — the same meaning, in any language or translation? A clause that is only on the same topic is not.` }]));
  // VOTE (Chad 10-05): Clef and Clef-flash judge the clauses at once; if their clause sets agree that is the answer, if not
  // Jev gives a second opinion and each clause takes the majority. One model alone marked strays (Jev 0.64/0.50 beside the
  // true 0.91/0.81; Clef-flash missed a true clause at 0.41).
  const ask = (backend) => d.decide('sourcehunt-highlight', state, questions, { backend }).then((r) => r?.answers || null).catch(() => null);
  const pick = (ans) => {                                 // a model's clauses: ≥0.5 and within 0.2 of its own best
    if (!ans) return null;
    const ps = units.map((u, i) => ans[`c${i + 1}`]?.noul ?? 0), top = Math.max(...ps);
    return new Set(ps.map((p, i) => (p >= 0.5 && p >= top - 0.2 ? i : -1)).filter((i) => i >= 0));
  };
  const [big, flash] = await Promise.all([ask('clef'), ask('clef-flash')]);
  const A = pick(big), B = pick(flash);
  const same = A && B && A.size === B.size && [...A].every((i) => B.has(i));
  let chosen;
  if (same) chosen = A;
  else {
    const C = pick(await ask('jev'));
    const votes = [A, B, C].filter(Boolean);
    if (!votes.length) return null;
    chosen = new Set(units.map((u, i) => i).filter((i) => votes.filter((v) => v.has(i)).length >= Math.min(2, votes.length) ));
  }
  if (!chosen.size) return [];
  const strength = (i) => [big, flash].reduce((m, a) => Math.max(m, a?.[`c${i + 1}`]?.noul ?? 0), 0);
  const picked = [...chosen].sort((a, b) => a - b).map((i) => ({ u: units[i], i, p: strength(i) }));
  const ranges = [];
  for (const x of picked) {
    const last = ranges[ranges.length - 1];
    if (last && x.i === last.i + 1) { last.r[1] = x.u.end; last.i = x.i; last.p = Math.max(last.p, x.p); } else ranges.push({ r: [x.u.start, x.u.end], i: x.i, p: x.p });
  }
  // A quotation WITHOUT an ellipsis is one continuous passage: keep only the run of clauses holding the strongest match,
  // and drop strays elsewhere in the paragraph (Jev said 0.61 for "who arises to serve all on earth" beside the true clause
  // of "The earth is but one country…", 10-05). An elided quote ("… …") may mark several runs.
  if (!/\.\.\.|…/.test(quoteText) && ranges.length > 1) return [ranges.reduce((m, x) => (x.p > m.p ? x : m)).r];
  return ranges.map((x) => x.r);
}

/** Highlight an original: Clef/Jev's clause decision where it answers, else the phrase-vector spans. */
async function meaningRanges(d, q, id, text, lang) {
  // the vector spans only steer WHICH clauses are asked about when a passage has more than MAX_CLAUSES; otherwise both run at once
  const short = segment(text, lang).length <= MAX_CLAUSES;
  const vecP = originalRanges(d, q, id, text);
  const [vec, dec] = short ? await Promise.all([vecP, decideRanges(d, q.text, text, lang, [])])
    : await vecP.then(async (v) => [v, await decideRanges(d, q.text, text, lang, v)]);
  return dec && dec.length ? { highlight: dec, highlightBy: 'decision' } : { highlight: vec, highlightBy: vec.length ? 'vectors' : null };
}

async function tabletGuess(d, q, links, author = null) {
  const withMeta = async (p, basis) => {
    if (!p) return p;
    const text = decodeEntities(p.text);
    return { id: p.id, documentId: p.documentId, title: p.document?.title, text, ...(await meaningRanges(d, q, p.id, text, 'ar')),
      url: p.url, basis, meta: await d.meta(p.documentId).catch(() => null) };
  };
  if (links?.original) {
    // The LINK fixes the tablet; the paragraph inside it is re-checked: the quote's closest paragraphs in that tablet by
    // cross-lingual phrase similarity. The linked one stands if it is among them; otherwise the closest replaces it
    // (battery 10-04: Súriy-i-Haykal right tablet / wrong paragraph in 89% of cases, Hidden Words 31%).
    const o = links.original;
    const inDoc = await d.phrases(q.match, { limit: 5, timeoutMs: QD_MS, filters: { documentId: o.documentId } }).catch(() => ({ hits: [] }));
    const ids = inDoc.hits.map((h) => h.paragraph_id);
    if (!ids.length || ids.includes(o.id)) return { certain: true, ...(await withMeta(o, o.path || 'translation')) };
    const best = (await d.passages([ids[0]])).get(ids[0]);
    return { certain: true, ...(await withMeta(best || o, best ? 'tablet linked; paragraph by similarity' : (o.path || 'translation'))),
      linkedParagraph: best ? { id: o.id, text: o.text } : undefined };
  }
  // only the quote's own writer's originals: an ‘Abdu’l-Bahá talk near in meaning is not the source of a Bahá’u’lláh line
  const near = await d.phrases(q.match, { limit: 8, timeoutMs: QD_MS, filters: { langGroup: 'ar-fa', religion: "Baha'i", ...(author ? { author } : {}) } }).catch(() => ({ hits: [] }));
  const ps = await d.passages(near.hits.map((h) => h.paragraph_id));
  const out = [], seen = new Set();   // one candidate per document
  for (const h of near.hits) {
    const p = ps.get(h.paragraph_id); if (!p || seen.has(p.documentId)) continue;
    seen.add(p.documentId); out.push({ ...(await withMeta(p, 'cross-lingual')), score: +h.score.toFixed(3) });
  }
  return { certain: false, candidates: out.slice(0, 3) };
}

async function defaultDeps() {
  const [{ searchPhrases, searchKeywordQdrant, searchPhraseSpans }, { resolveLinks, getPassages }, { queryAll, queryOne }, { getDocMeta }, { linkFor }] = await Promise.all([
    import('./search/qdrant-layers.js'), import('./passage-links.js'), import('./db.js'), import('./doc-meta-store.js'), import('./source-links.js')]);
  return {
    phrases: searchPhrases, keyword: searchKeywordQdrant, links: resolveLinks, passages: getPassages, meta: getDocMeta, spans: searchPhraseSpans,
    rawText: async (id) => (await queryOne('SELECT text FROM content WHERE id = ?', [Number(id)], 'source-hunt:raw'))?.text ?? null,
    // System-1 decision (task-routed: Clef-flash serves where routing.json says so; every call logged + shadowed)
    decide: async (task, state, questions, { backend = null } = {}) => (await import('./systemone.js')).ask(task, state, questions, { timeoutMs: 4000, retries: 0, backend }),
    async rows(ids) {
      const uniq = [...new Set(ids.map(Number).filter(Boolean))];
      if (!uniq.length) return [];
      const rs = await queryAll(`SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.authors, c.external_para_id, d.title, d.author AS book_author,
          d.source_site, d.source_url, d.metadata, d.slug, d.filename, d.religion, d.collection, d.doc_role, d.year
        FROM content c JOIN docs d ON d.id = c.doc_id
        WHERE c.id IN (${uniq.map(() => '?').join(',')}) AND c.deleted_at IS NULL AND d.deleted_at IS NULL`, uniq, 'source-hunt:rows');
      return rs.map((r) => ({ ...r, text: decodeEntities(String(r.text || '').replace(/⁅\/?s\d+⁆/g, '')),
        url: linkFor({ id: r.doc_id, source_url: r.source_url, metadata: r.metadata, religion: r.religion, collection: r.collection,
          slug: r.slug, filename: r.filename, external_para_id: r.external_para_id }, r.paragraph_index).url }));
    },
  };
}
