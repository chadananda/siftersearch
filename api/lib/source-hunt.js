// SourceHunt (Chad 2026-10-04): an English quote → (1) the published book it comes from (OceanLibrary first), (2) every
// other publication that cites it, (3) the likely original tablet, with its text and the oceanoflights / Phelps Inventory
// links. Candidates come from the Qdrant phrase + BM25 layers (no Meili); the link graph (passage-links.js) walks
// quote → source → original. A paragraph COUNTS only when it holds the quote verbatim (word 3-gram overlap).
// Deps injected (default: the live ones) so the logic is testable without a database.
import { overlap, matchWords } from './passage-links.js';
import { firstPerson } from './authorship/reader.js';
import { paragraphAuthor } from './authorship/effective.js';
import { authorAuthority } from './authority.js';

const VERBATIM = 0.6;        // share of the quote's word 3-grams a paragraph must hold
const CANDIDATES = 60;

/** The quote as searched: quotation marks, ellipses and reference tails dropped; the longest run between ellipses is the
 *  one matched against paragraphs (an elided quote never appears whole in its source). */
export function prepareQuote(raw) {
  const text = String(raw || '').replace(/[“”"«»]/g, ' ').replace(/\s*\([^()]{0,80}\)\s*$/, '').replace(/\s+/g, ' ').trim();
  const runs = text.split(/\s*(?:\.\.\.|…)\s*/).map((s) => s.trim()).filter(Boolean);
  const longest = runs.sort((a, b) => b.length - a.length)[0] || '';
  return { text, match: longest, words: matchWords(longest).length };
}

const isCanonical = (p) => !p.source_site || p.source_site === 'oceanlibrary.com';

/**
 * Rank origin candidates: the writer's OWN book beats a compilation or study that quotes it; then the writer's standing,
 * the canonical library (OceanLibrary) over scraped sites, how many matches link to it as their source, and how fully it
 * holds the quote.
 */
export function rankOrigins(cands) {
  const key = (c) => [c.ownWork ? 1 : 0, c.authority ?? 0, isCanonical(c) ? 1 : 0, c.linkedFrom || 0, c.overlap || 0];
  return [...cands].sort((a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i]; return a.id - b.id; });
}

export async function sourceHunt(raw, deps = {}) {
  const NEED = ['phrases', 'keyword', 'links', 'passages', 'meta', 'rows'];
  const d = NEED.every((k) => deps[k]) ? deps : { ...(await defaultDeps()), ...deps };
  const q = prepareQuote(raw);
  if (q.words < 4) return { error: 'Paste at least four words of the quote.' };
  const t0 = Date.now();

  // 1. candidates: phrase vectors (meaning + wording) and BM25 (wording), whole library + scraped sites
  const [ph, kw] = await Promise.all([
    d.phrases(q.match, { limit: CANDIDATES, filters: {} }).catch(() => ({ hits: [] })),
    d.keyword(q.match, { limit: CANDIDATES, filters: {} }).catch(() => ({ hits: [] })),
  ]);
  const ids = [...new Set([...ph.hits, ...kw.hits].map((h) => h.paragraph_id))];
  const rows = await d.rows(ids);
  const matches = rows.map((r) => ({ ...r, overlap: overlap(q.match, r.text) })).filter((r) => r.overlap >= VERBATIM);

  // 2. the source each match quotes (a citing book → the Gleanings paragraph), added to the origin pool
  const links = await d.links(matches.map((m) => m.id), { quotedBy: false });
  const linkedFrom = new Map();
  for (const m of matches) for (const s of links.get(m.id)?.sources || []) if ((s.link?.coverage ?? 0) >= 0.8) linkedFrom.set(s.id, (linkedFrom.get(s.id) || 0) + 1);
  const extra = [...linkedFrom.keys()].filter((id) => !matches.some((m) => m.id === id));
  const pool = [...matches, ...(await d.rows(extra)).map((r) => ({ ...r, overlap: overlap(q.match, r.text) }))]
    .filter((c) => c.doc_role !== 'metadata')
    .map((c) => {
      const writer = paragraphAuthor({ authors: c.authors, author: c.book_author });
      const book = firstPerson(c.book_author || '') || c.book_author;
      return { ...c, writer, ownWork: !!writer && (firstPerson(writer) || writer) === book, authority: authorAuthority(writer), linkedFrom: linkedFrom.get(c.id) || 0 };
    });
  if (!pool.length) return { quote: q.text, origin: null, citedBy: [], tablet: await tabletGuess(d, q, null), ms: Date.now() - t0 };

  const origin = rankOrigins(pool)[0];

  // 3. everything else that holds the quote, plus what the link graph says quotes the origin — grouped by publication
  const full = (await d.links([origin.id], { quotedBy: true })).get(origin.id) || {};
  const byDoc = new Map();
  const add = (p) => {
    if (p.doc_id === origin.doc_id) return;
    const cur = byDoc.get(p.doc_id) || { documentId: p.doc_id, title: p.title, author: p.book_author, site: p.source_site || null,
      url: p.url, paragraphs: 0, first: p.id };
    cur.paragraphs++; byDoc.set(p.doc_id, cur);
  };
  for (const m of pool) if (m.id !== origin.id) add(m);
  const quoters = (full.quotedBy?.passages || []).map((p) => ({ id: p.id, doc_id: p.documentId, title: p.document.title,
    book_author: p.document.author, url: p.url, source_site: null }));
  for (const p of quoters) if (!pool.some((m) => m.id === p.id)) add(p);
  const citedBy = [...byDoc.values()].sort((a, b) => (a.site ? 1 : 0) - (b.site ? 1 : 0) || b.paragraphs - a.paragraphs);

  return {
    quote: q.text,
    origin: { id: origin.id, documentId: origin.doc_id, title: origin.title, author: origin.writer, bookAuthor: origin.book_author,
      text: origin.text, url: origin.url, site: origin.source_site || 'library', overlap: +origin.overlap.toFixed(2) },
    citedBy, citedByLinkCount: full.quotedBy?.count || 0,
    tablet: await tabletGuess(d, q, full),
    ms: Date.now() - t0,
  };
}

/** The original: a LINKED one (translation or quote→source→original) is certain; otherwise the nearest Arabic/Persian
 *  paragraphs by phrase vector are offered as candidates, labelled as such. Each carries its tablet metadata. */
async function tabletGuess(d, q, links) {
  const withMeta = async (p, basis) => p && ({ id: p.id, documentId: p.documentId, title: p.document?.title, text: p.text,
    url: p.url, basis, meta: await d.meta(p.documentId).catch(() => null) });
  if (links?.original) return { certain: true, ...(await withMeta(links.original, links.original.path || 'translation')) };
  const near = await d.phrases(q.match, { limit: 3, filters: { langGroup: 'ar-fa', religion: "Baha'i" } }).catch(() => ({ hits: [] }));
  const ps = await d.passages(near.hits.map((h) => h.paragraph_id));
  const out = [];
  for (const h of near.hits) { const p = ps.get(h.paragraph_id); if (p) out.push({ ...(await withMeta(p, 'cross-lingual')), score: +h.score.toFixed(3) }); }
  return { certain: false, candidates: out };
}

async function defaultDeps() {
  const [{ searchPhrases, searchKeywordQdrant }, { resolveLinks, getPassages }, { queryAll }, { getDocMeta }, { linkFor }] = await Promise.all([
    import('./search/qdrant-layers.js'), import('./passage-links.js'), import('./db.js'), import('./doc-meta-store.js'), import('./source-links.js')]);
  return {
    phrases: searchPhrases, keyword: searchKeywordQdrant, links: resolveLinks, passages: getPassages, meta: getDocMeta,
    async rows(ids) {
      const uniq = [...new Set(ids.map(Number).filter(Boolean))];
      if (!uniq.length) return [];
      const rs = await queryAll(`SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.authors, c.external_para_id, d.title, d.author AS book_author,
          d.source_site, d.source_url, d.metadata, d.slug, d.filename, d.religion, d.collection, d.doc_role
        FROM content c JOIN docs d ON d.id = c.doc_id
        WHERE c.id IN (${uniq.map(() => '?').join(',')}) AND c.deleted_at IS NULL AND d.deleted_at IS NULL`, uniq, 'source-hunt:rows');
      return rs.map((r) => ({ ...r, text: String(r.text || '').replace(/⁅\/?s\d+⁆/g, ''),
        url: linkFor({ id: r.doc_id, source_url: r.source_url, metadata: r.metadata, religion: r.religion, collection: r.collection,
          slug: r.slug, filename: r.filename, external_para_id: r.external_para_id }, r.paragraph_index).url }));
    },
  };
}
