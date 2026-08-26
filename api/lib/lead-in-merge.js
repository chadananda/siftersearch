// lead-in-merge — rejoin a vocative opening to the passage it opens.
//
// The Hidden Words are stored as 314 paragraphs for ~157 verses, because the source markdown puts a blank
// line after the invocation:
//
//     O SON OF SPIRIT!                         ← its own paragraph, 16 chars
//     The best beloved of all things in My …    ← the body
//
// They are one utterance. The split is an artifact of source formatting, and it costs real things: the
// invocation row carries no aligned original (it is half a sentence, matchable to nothing), it pollutes
// search with 16-character hits, and it doubles the paragraph count so every coverage figure for the book
// reads half what it is. Chad, 2026-08-25: "I would merge the openings of each hidden words to the body."
//
// CONSERVATIVE BY CONSTRUCTION. This rewrites scripture, so the rule refuses anything it is not sure of: the
// lead-in must be SHORT, must be a VOCATIVE ending in '!', and the following paragraph must be substantially
// longer. A rule that merged on shortness alone would swallow headings, dates and one-line quotations.
// Deps: content (updateText, single-writer routed), db, logger.

import { query, queryAll } from './db.js';
import { logger } from './logger.js';

// Vocative openings in the Writings: "O Son of Spirit!", "O Ye Sons of Spirit!", "O My Friend!", "O Friends!"
const VOCATIVE = /^O\s+[^.!?]{1,60}!$/i;
const MAX_LEAD_IN = 80;          // characters; the longest real invocation is well under this
const MIN_BODY_RATIO = 1.5;      // the body must be meaningfully longer than its opening

/** True when `text` is a vocative lead-in rather than a passage in its own right. Pure. */
export function isLeadIn(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > 0 && t.length <= MAX_LEAD_IN && VOCATIVE.test(t);
}

/**
 * Pair each lead-in with the body that follows it. Pure — takes rows, returns the merges it would make.
 *
 * A lead-in with no following body, or followed by another lead-in, is LEFT ALONE. Merging into nothing
 * would delete the invocation; merging two invocations together would invent an utterance.
 */
export function planLeadInMerges(rows) {
  const merges = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const lead = rows[i], body = rows[i + 1];
    if (!isLeadIn(lead.text)) continue;
    if (isLeadIn(body.text)) continue;                            // two openings in a row → not a pair
    const bodyText = String(body.text || '').trim();
    if (bodyText.length < String(lead.text).trim().length * MIN_BODY_RATIO) continue;
    merges.push({
      leadId: lead.id, bodyId: body.id,
      leadIndex: lead.paragraph_index, bodyIndex: body.paragraph_index,
      lead: String(lead.text).trim(),
      // Keep BOTH texts, the opening first — this is a rejoin, not a replacement. The invocation is part of
      // the verse and is frequently the phrase a reader quotes.
      merged: `${String(lead.text).trim()}\n${bodyText}`,
    });
    i++;                                                          // the body is consumed; don't reuse it
  }
  return merges;
}

/**
 * Apply the merges to one document: body row absorbs the opening, opening row is soft-deleted.
 *
 * dryRun reports every merge in full so the result can be read before scripture is rewritten.
 */
export async function mergeLeadIns(docId, { dryRun = true, limit = 5000 } = {}) {
  const rows = await queryAll(
    `SELECT id, paragraph_index, text FROM content
      WHERE doc_id = ? AND deleted_at IS NULL AND COALESCE(blocktype,'paragraph') IN ('paragraph','quote')
      ORDER BY paragraph_index LIMIT ?`, [Number(docId), limit], 'lead-in-merge:read');

  const merges = planLeadInMerges(rows);
  const result = {
    docId: Number(docId), paragraphs: rows.length, merges: merges.length,
    remainingAfter: rows.length - merges.length, dryRun,
    samples: merges.slice(0, 5).map((m) => ({ lead: m.lead, preview: m.merged.slice(0, 110) })),
    applied: 0,
  };
  if (dryRun || !merges.length) return result;

  const { content } = await import('./content.js');
  for (const m of merges) {
    await content.updateText(m.bodyId, m.merged);                 // routed to the single writer
    // SOFT delete, not content.deleteParagraph() — that one is a hard DELETE. The opening's text survives in
    // the merged row either way, but this rewrites scripture, and a reversible edit is the only kind worth
    // making to it. `synced=0` re-indexes the row out of search.
    await query(`UPDATE content SET deleted_at = ?, synced = 0 WHERE id = ? AND deleted_at IS NULL`,
      [new Date().toISOString(), m.leadId], 'lead-in-merge:retire-opening');
    result.applied++;
  }
  logger.warn({ docId, merged: result.applied }, 'lead-in-merge: rejoined vocative openings (AUDIT)');
  return result;
}
