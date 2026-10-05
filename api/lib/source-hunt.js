// SourceHunt (Chad 2026-10-04): an English quote → (1) the published book it comes from (OceanLibrary first), (2) every
// other publication that cites it, (3) the likely original tablet, with its text and the oceanoflights / Phelps Inventory
// links. Candidates come from the Qdrant phrase + BM25 layers (no Meili); the link graph (passage-links.js) walks
// quote → source → original. A paragraph COUNTS only when it holds the quote verbatim (word 3-gram overlap).
// Deps injected (default: the live ones) so the logic is testable without a database.
import { overlap, matchWords } from './passage-links.js';
import { firstPerson } from './authorship/reader.js';
import { paragraphAuthor } from './authorship/effective.js';
import { authorAuthority } from './authority.js';

/** Stored text still carries HTML entities in ~96k paragraphs (mostly the bahai-library.com copies: `&quot;` around a
 *  quoted Arabic line in a Persian passage). Decoded before matching, highlighting and display. */
const NAMED = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: '\u00a0', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', mdash: '—', ndash: '–', zwnj: '\u200c', zwj: '\u200d' };
export const decodeEntities = (s) => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (NAMED[e.toLowerCase()] ?? m));

const VERBATIM = 0.6;        // share of the quote's word 3-grams a paragraph must hold
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
  const key = (c) => [(c.overlap || 0) >= VERBATIM ? 1 : 0, quoteAuthor && canon(c.writer) === canon(quoteAuthor) ? 1 : 0, c.ownWork ? 1 : 0,
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
  const say = (stage, data) => { try { emit(stage, { ...data, ms: Date.now() - t0 }); } catch { /* a closed stream never breaks the hunt */ } };
  say('query', { words: q.words, runs: q.text.split(/\s*(?:\.\.\.|…)\s*/).filter(Boolean).length });

  // 1. candidates: phrase vectors (meaning + wording) and BM25 (wording), whole library + scraped sites
  const [ph, kw] = await Promise.all([
    d.phrases(q.match, { limit: CANDIDATES, filters: {}, timeoutMs: QD_MS }).catch(() => ({ hits: [] })),
    d.keyword(q.match, { limit: CANDIDATES, filters: {}, timeoutMs: QD_MS }).catch(() => ({ hits: [] })),
  ]);
  const ids = [...new Set([...ph.hits, ...kw.hits].map((h) => h.paragraph_id))];
  const rows = await d.rows(ids);
  const probedDocs = [...new Map(rows.map((r) => [r.doc_id, docBrief(r)])).values()];
  say('candidates', { phrase: ph.hits.length, keyword: kw.hits.length, paragraphs: ids.length, documents: probedDocs });
  const matches = rows.map((r) => ({ ...r, overlap: overlap(q.match, r.text) })).filter((r) => r.overlap >= VERBATIM);
  say('verbatim', { count: matches.length, rejected: rows.length - matches.length,
    documents: [...new Map(matches.map((r) => [r.doc_id, docBrief(r)])).values()] });

  // 2. the source each match quotes (a citing book → the Gleanings paragraph), added to the origin pool
  const links = await d.links(matches.map((m) => m.id), { quotedBy: false });
  const linkedFrom = new Map();
  for (const m of matches) for (const s of links.get(m.id)?.sources || []) if ((s.link?.coverage ?? 0) >= 0.8) linkedFrom.set(s.id, (linkedFrom.get(s.id) || 0) + 1);
  const extra = [...linkedFrom.keys()].filter((id) => !matches.some((m) => m.id === id));
  say('links', { sources: linkedFrom.size, added: extra.length });
  const pool = [...matches, ...(await d.rows(extra)).map((r) => ({ ...r, overlap: overlap(q.match, r.text) }))]
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
    const more = [...new Set([...p2.hits, ...k2.hits].map((h) => h.paragraph_id))].filter((id) => !pool.some((c) => c.id === id));
    for (const r of await d.rows(more)) {
      const ov = overlap(q.match, r.text);
      if (ov < VERBATIM || r.doc_role === 'metadata') continue;
      const writer = paragraphAuthor({ authors: r.authors, author: r.book_author });
      const book = firstPerson(r.book_author || '') || r.book_author;
      pool.push({ ...r, overlap: ov, writer, ownWork: !!writer && (firstPerson(writer) || writer) === book, authority: authorAuthority(writer), linkedFrom: 0 });
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
  const exact = quoteRanges(origin.text, q.text);
  const originOut = { id: origin.id, documentId: origin.doc_id, title: origin.title, author: origin.writer, bookAuthor: origin.book_author,
    text: origin.text, highlight: exact.length ? exact : await originalRanges(d, q, origin.id, origin.text),
    highlightBy: exact.length ? 'wording' : 'meaning', url: origin.url, site: siteOf(origin.url, origin.source_site), overlap: +origin.overlap.toFixed(2) };
  say('origin', { origin: originOut, candidates: ranked.length });

  // 3. everything else that holds the quote, plus what the link graph says quotes the origin — grouped by publication
  const full = (await d.links([origin.id], { quotedBy: true })).get(origin.id) || {};
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
  const tablet = await tabletGuess(d, q, full, quoteAuthor);
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
  const top = Math.max(...spans.map((x) => x.score));
  const out = [];
  for (const x of spans.filter((s) => s.score >= top - 0.03 && s.end > s.start)) {
    const piece = decodeEntities(raw.slice(x.start, x.end).replace(/⁅\/?s\d+⁆/g, '')).replace(/[ \t]+/g, ' ').trim();
    const at = piece.length >= 4 ? shown.indexOf(piece) : -1;
    if (at >= 0) out.push([at, at + piece.length]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of out) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
  return merged;
}

async function tabletGuess(d, q, links, author = null) {
  const withMeta = async (p, basis) => {
    if (!p) return p;
    const text = decodeEntities(p.text);
    return { id: p.id, documentId: p.documentId, title: p.document?.title, text, highlight: await originalRanges(d, q, p.id, text), highlightBy: 'meaning',
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
