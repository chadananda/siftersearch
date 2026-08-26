// original-term — "What is the original word for X in this passage?"
//
// The question Chad wants search and chat to answer directly (2026-08-25):
//   "What is the original word for 'justice' in the passage 'the best beloved of all things...'?"
//
// And the answer is not decorative. In Hidden Words Arabic #2 "Justice" renders الإنْصاف (inṣáf, equity),
// NOT العدل (ʿadl, rectitude). Two different roots carrying different obligations, shown to the English
// reader as one word. Elsewhere "prayer" stands for Ṣalát, Duʿá or Dhikr — three unrelated roots. A reader
// who cannot see which term is meant cannot tell those apart, and neither can a chat answer.
//
// This reads the stored word_alignment (migration 121); it makes no network call and no model call. The
// alignment came from the aligned source at ingest, so the answer is a lookup, not an inference — which is
// what makes it safe to put in front of a reader.
// Deps: db (read-only).

import { queryAll, queryOne } from './db.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Find the aligned pairs whose ENGLISH side matches `term` within one paragraph.
 *
 * Matching is on the translation side because that is what a reader can see and quote. Returns ALL matches
 * rather than one: a paragraph may render the same English word from two different originals, and collapsing
 * that to a single answer would hide exactly the distinction this exists to surface.
 */
export function findAlignedTerm(wordAlignment, term) {
  let pairs = [];
  try { pairs = JSON.parse(wordAlignment || '[]'); } catch { return []; }
  const want = norm(term);
  if (!want) return [];
  const hits = pairs.filter((p) => {
    const t = norm(p.translation);
    return t === want || t.split(' ').includes(want) || t.includes(want);
  });
  return hits.map((p) => ({
    original: p.source, translation: p.translation,
    sourceSpan: p.source_span, targetSpan: p.target_span,
  }));
}

/**
 * Answer the question for a paragraph, by paragraph id.
 *
 * Returns `{ found: false, reason }` rather than an empty success when the paragraph has no alignment — the
 * two are different facts, and a reader told "no original word" when we simply never aligned that paragraph
 * has been misinformed.
 */
export async function originalTermForParagraph(paraId, term) {
  const row = await queryOne(
    `SELECT id, doc_id, text, original_text, original_lang, word_alignment, translation_authority
       FROM content WHERE id = ? AND deleted_at IS NULL`, [Number(paraId)], 'original-term:by-para');
  if (!row) return { found: false, reason: 'paragraph not found' };
  if (!row.original_text) {
    return { found: false, reason: 'this paragraph has no aligned original yet', docId: row.doc_id };
  }
  if (!row.word_alignment) {
    // The paragraph HAS an original but no word map: answerable at passage level, not word level. Say so.
    return { found: false, reason: 'original text is stored, but this paragraph has no word-level alignment',
      docId: row.doc_id, originalText: row.original_text, originalLang: row.original_lang };
  }
  const matches = findAlignedTerm(row.word_alignment, term);
  return {
    found: matches.length > 0,
    ...(matches.length ? {} : { reason: `no aligned original found for "${term}" in this paragraph` }),
    paraId: row.id, docId: row.doc_id, term,
    originalLang: row.original_lang, translationAuthority: row.translation_authority,
    matches, originalText: row.original_text, translation: row.text,
  };
}

/**
 * Answer from a QUOTED PASSAGE rather than an id — the shape a reader's question actually arrives in
 * ("...in the passage 'the best beloved of all things...'"). Finds the paragraph by its stored English, then
 * looks the term up in that paragraph's alignment.
 *
 * Deliberately matched against `text` (our English) and not against search: this must return the paragraph
 * the reader quoted, not the most semantically similar one. Semantic search drifts badly on doctrinal terms,
 * and a near-miss here would confidently answer about a different passage.
 */
export async function originalTermForQuote(quote, term, { limit = 3 } = {}) {
  const q = String(quote || '').trim();
  if (q.length < 12) return { found: false, reason: 'quote too short to identify a passage' };
  const rows = await queryAll(
    `SELECT id FROM content
      WHERE deleted_at IS NULL AND original_text IS NOT NULL AND text LIKE ?
      ORDER BY length(text) LIMIT ?`, [`%${q}%`, limit], 'original-term:by-quote');
  if (!rows.length) {
    return { found: false, reason: 'no aligned paragraph contains that quote — it may be unaligned, or worded differently' };
  }
  const answers = [];
  for (const r of rows) answers.push(await originalTermForParagraph(r.id, term));
  const hit = answers.find((a) => a.found);
  return hit || answers[0];
}
