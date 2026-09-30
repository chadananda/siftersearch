// Passage link graph for the public API (Chad, 2026-09-30: "CTAI [must] be able to use the siftersearch api to find any
// original quote for any verse it finds in english"). Three layers: content_alignment (translation ↔ original),
// content_source_links (quoting paragraph → the paragraph it quotes), content.translation_text (English stored beside an
// original). A quote resolves THROUGH its source to that source's original. Deps: db, source-links, search.
import { queryAll } from './db.js';
import { linkFor } from './source-links.js';

const ph = (a) => a.map(() => '?').join(',');
const clean = (s) => (s || '').replace(/⁅\/?s\d+⁆/g, '').replace(/[ \t]+/g, ' ').trim();
const QUOTED_BY_SHOWN = 10;

/** Word stream for matching: case-, diacritic- and punctuation-blind (Bahá'u'lláh = Baha'u'llah = Bahaullah). */
export function matchWords(s) {
  return clean(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/['’ʼ‘`ʻʿʾ]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const grams = (w, n = 3) => {
  if (w.length < n) return new Set(w.length ? [w.join(' ')] : []);
  const g = new Set();
  for (let i = 0; i + n <= w.length; i++) g.add(w.slice(i, i + n).join(' '));
  return g;
};

/**
 * How much of the shorter text the longer one contains (word 3-grams). 1 = one holds the other verbatim; a verse that is
 * part of a paragraph scores 1, a paragraph that is part of a longer quoted passage also scores 1.
 */
export function overlap(a, b) {
  const ga = grams(matchWords(a)), gb = grams(matchWords(b));
  if (!ga.size || !gb.size) return 0;
  const [small, big] = ga.size <= gb.size ? [ga, gb] : [gb, ga];
  let hit = 0;
  for (const g of small) if (big.has(g)) hit++;
  return hit / small.size;
}

/** Up to three verbatim phrase windows (Meili matches only the first 10 query words — longer phrases are truncated). */
export function phraseWindows(text, size = 8) {
  const words = clean(text).replace(/["“”]/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length <= 10) return words.length >= 3 ? [words.join(' ')] : [];
  const at = [0, Math.floor((words.length - size) / 2), words.length - size];
  return [...new Set(at.map((i) => words.slice(i, i + size).join(' ')))];
}

/** Passages by id, shaped for the API: text without sentence markers, document, reference link by policy. */
export async function getPassages(ids) {
  const uniq = [...new Set(ids.map(Number).filter(Boolean))];
  if (!uniq.length) return new Map();
  const rows = await queryAll(
    `SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.heading, c.external_para_id, c.translation_text,
            c.translation_authority, COALESCE(NULLIF(c.language, ''), d.language) AS language,
            d.title, d.author, d.religion, d.collection, d.source_url, d.metadata, d.slug, d.filename
       FROM content c JOIN docs d ON d.id = c.doc_id
      WHERE c.id IN (${ph(uniq)}) AND c.deleted_at IS NULL AND d.deleted_at IS NULL`, uniq, 'passage-links:passages');
  return new Map(rows.map((r) => {
    const link = linkFor({ id: r.doc_id, source_url: r.source_url, metadata: r.metadata, religion: r.religion,
      collection: r.collection, slug: r.slug, filename: r.filename, external_para_id: r.external_para_id }, r.paragraph_index);
    return [r.id, {
      id: r.id, documentId: r.doc_id, paragraphIndex: r.paragraph_index, language: r.language || null,
      text: clean(r.text), heading: r.heading || null,
      english: r.translation_text ? { text: clean(r.translation_text), authority: r.translation_authority || null } : null,
      document: { title: r.title, author: r.author, religion: r.religion, collection: r.collection },
      url: link.url, readerUrl: link.reader_url,
    }];
  }));
}

/**
 * Every link of each paragraph:
 *   originals   — this paragraph is a translation; the original-language paragraph(s) it translates
 *   translations— this paragraph is an original; its translation paragraph(s)
 *   sources     — this paragraph quotes these; each carries ITS originals (a quote → Gleanings → the Arabic)
 *   quotedBy    — paragraphs that quote this one (count + the first few)
 *   original    — the single best original, whichever path reaches it (null when none is linked yet)
 * @param {number[]} ids content ids
 * @param {{ quotedBy?: boolean }} opts
 * @returns {Promise<Map<number, object>>}
 */
export async function resolveLinks(ids, { quotedBy = true } = {}) {
  const uniq = [...new Set(ids.map(Number).filter(Boolean))];
  const out = new Map();
  if (!uniq.length) return out;
  const [asTrans, asOrig, sources, quoters, quoteCounts] = await Promise.all([
    queryAll(`SELECT trans_id, orig_id, basis, score, method FROM content_alignment
               WHERE retired_at IS NULL AND trans_id IN (${ph(uniq)})`, uniq, 'passage-links:originals'),
    queryAll(`SELECT trans_id, orig_id, basis, score, method FROM content_alignment
               WHERE retired_at IS NULL AND orig_id IN (${ph(uniq)})`, uniq, 'passage-links:translations'),
    queryAll(`SELECT quote_id, source_id, coverage, share, basis, method FROM content_source_links
               WHERE quote_id IN (${ph(uniq)}) ORDER BY coverage DESC`, uniq, 'passage-links:sources'),
    quotedBy ? queryAll(`SELECT quote_id, source_id, coverage FROM content_source_links WHERE source_id IN (${ph(uniq)})
               ORDER BY coverage DESC LIMIT 2000`, uniq, 'passage-links:quoted-by') : [],
    quotedBy ? queryAll(`SELECT source_id, COUNT(*) AS n FROM content_source_links WHERE source_id IN (${ph(uniq)})
               GROUP BY source_id`, uniq, 'passage-links:quoted-by-count') : [],
  ]);
  // second hop: the sources' own originals
  const srcIds = [...new Set(sources.map((s) => s.source_id))];
  const srcOrig = srcIds.length ? await queryAll(
    `SELECT trans_id, orig_id, basis, score, method FROM content_alignment
      WHERE retired_at IS NULL AND trans_id IN (${ph(srcIds)})`, srcIds, 'passage-links:source-originals') : [];

  const shownQuoters = new Map();
  for (const q of quoters) {
    const list = shownQuoters.get(q.source_id) || [];
    if (list.length < QUOTED_BY_SHOWN) shownQuoters.set(q.source_id, [...list, q]);
  }
  const passages = await getPassages([
    ...uniq, ...asTrans.map((r) => r.orig_id), ...asOrig.map((r) => r.trans_id), ...srcIds,
    ...srcOrig.map((r) => r.orig_id), ...[...shownQuoters.values()].flat().map((q) => q.quote_id),
  ]);
  const group = (rows, key) => rows.reduce((m, r) => m.set(r[key], [...(m.get(r[key]) || []), r]), new Map());
  const byTrans = group(asTrans, 'trans_id'), byOrig = group(asOrig, 'orig_id'), bySrcTrans = group(srcOrig, 'trans_id');
  const bySource = group(sources, 'quote_id');
  const counts = new Map(quoteCounts.map((r) => [r.source_id, r.n]));
  const ranked = (rows) => [...rows].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const alignLink = (r, pid) => passages.get(pid) && { ...passages.get(pid), link: { basis: r.basis, score: r.score, method: r.method } };

  for (const id of uniq) {
    if (!passages.has(id)) continue;
    const originals = ranked(byTrans.get(id) || []).map((r) => alignLink(r, r.orig_id)).filter(Boolean);
    const translations = ranked(byOrig.get(id) || []).map((r) => alignLink(r, r.trans_id)).filter(Boolean);
    const src = (bySource.get(id) || []).filter((s) => passages.has(s.source_id)).map((s) => ({
      ...passages.get(s.source_id),
      link: { coverage: s.coverage, share: s.share, basis: s.basis, method: s.method },
      originals: ranked(bySrcTrans.get(s.source_id) || []).map((r) => alignLink(r, r.orig_id)).filter(Boolean),
    }));
    const viaSource = src.find((s) => s.originals.length);
    const original = originals[0] ? { ...originals[0], path: 'translation' }
      : viaSource ? { ...viaSource.originals[0], path: 'quote→source→original', source: { id: viaSource.id, documentId: viaSource.documentId, title: viaSource.document.title, url: viaSource.url } }
        : null;
    out.set(id, {
      id, original, originals, translations, sources: src,
      quotedBy: quotedBy ? {
        count: counts.get(id) || 0,
        passages: (shownQuoters.get(id) || []).map((q) => passages.get(q.quote_id)
          && { ...passages.get(q.quote_id), link: { coverage: q.coverage } }).filter(Boolean),
      } : undefined,
    });
  }
  return out;
}

/**
 * English (or any) text → the passages that hold it verbatim → their originals. Exact phrases first (no embedding);
 * semantic search only when no phrase matches and `semantic` is on (a different translation of the same verse).
 * @param {string} text
 * @param {{ limit?: number, semantic?: boolean, minOverlap?: number, search: Function }} opts
 *   search(query, opts) = hybridSearch (injected so this module stays testable)
 */
export async function findOriginals(text, { limit = 5, semantic = true, minOverlap = 0.5, search }) {
  const retrieve = { attributesToRetrieve: ['id'], attributesToHighlight: [], limit: 20 };
  const windows = phraseWindows(text);
  const phraseHits = (await Promise.all(windows.map((w) =>
    search(`"${w}"`, { ...retrieve, semanticRatio: 0 }).then((r) => r.hits || []).catch(() => []))))
    .flat();
  let method = 'phrase';
  let candidateIds = [...new Set(phraseHits.map((h) => Number(h.id)))];
  let passages = await getPassages(candidateIds);
  let scored = [...passages.values()].map((p) => ({ p, overlap: overlap(text, p.text) })).filter((c) => c.overlap >= minOverlap);
  if (!scored.length && semantic) {
    method = 'semantic';
    const hits = await search(clean(text).slice(0, 2000), { ...retrieve, semanticRatio: 1 }).then((r) => r.hits || []).catch(() => []);
    candidateIds = [...new Set(hits.map((h) => Number(h.id)))];
    passages = await getPassages(candidateIds);
    scored = candidateIds.filter((id) => passages.has(id)).map((id) => ({ p: passages.get(id), overlap: overlap(text, passages.get(id).text) }));
  }
  const links = await resolveLinks(scored.map((c) => c.p.id), { quotedBy: false });
  const matches = scored.map((c) => ({ passage: c.p, overlap: Number(c.overlap.toFixed(3)), links: links.get(c.p.id) }))
    // verbatim first; among equals a passage whose original is already linked
    .sort((a, b) => b.overlap - a.overlap || Number(!!b.links?.original) - Number(!!a.links?.original));
  const originals = [];
  const seen = new Set();
  for (const m of matches) {
    for (const o of [m.links?.original, ...(m.links?.originals || []), ...(m.links?.sources || []).flatMap((s) => s.originals)]) {
      if (!o || seen.has(o.id)) continue;
      seen.add(o.id);
      originals.push({ ...o, foundThrough: { id: m.passage.id, title: m.passage.document.title, overlap: m.overlap } });
    }
  }
  return { method, matches: matches.slice(0, limit), originals: originals.slice(0, limit) };
}
