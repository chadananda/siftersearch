// The instructor-notes ledger: the persistent research-notes database Chad asked for, and the thing that
// makes "avoid repetition" enforceable rather than a plea in a prompt.
//
// Before researching a paragraph, the engine asks this module what it already taught about the subjects in
// that paragraph. Two channels, because one is not enough:
//   EXACT  — by subject key / resolved entity id: "have we already explained THIS person?"
//   FUZZY  — over note bodies: "have we already said something like this?", which catches the same idea
//            arriving under a different label. (SQL LIKE for now; a Meili index is Phase A+ — see the plan.)
//
// ONLY ACCEPTED NOTES COUNT AS TAUGHT. A rejected note must never suppress a later good one, or the
// mechanism meant to prevent repetition quietly becomes a gap-maker instead.
// Deps: api/lib/db.js. Plan: planning/dawn-breakers-notes-plan.md

import { query, queryAll, queryOne } from '../db.js';

export const NOTES_VERSION = 'notes-v1';
/** Review states. `accepted` and `edited` are both KEPT — edited means a human improved it, not rejected it. */
export const KEPT = ['accepted', 'edited'];

/** Normalise a subject into a stable key. Entity ids are preferred: a resolved id cannot drift, a string can. */
export const subjectKey = ({ entityId = null, term = null } = {}) => (entityId
  ? `entity:${Number(entityId)}`
  : `term:${String(term || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`);

/**
 * What has this book already TAUGHT about these subjects? The engine passes the result into the research
 * prompt as "already covered — only add a new dimension".
 */
export async function taughtAbout(docId, subjectKeys = [], { limit = 40 } = {}) {
  if (!subjectKeys.length) return [];
  const ph = subjectKeys.map(() => '?').join(',');
  return queryAll(
    `SELECT id, para_id, paragraph_index, chapter_num, category, subject_key,
            COALESCE(edited_body, body) note, claim_kind, new_dimension
       FROM study_notes
      WHERE doc_id = ? AND subject_key IN (${ph}) AND review IN ('accepted','edited')
      ORDER BY paragraph_index LIMIT ?`,
    [docId, ...subjectKeys, limit], 'notes:taught-about');
}

/** Fuzzy channel: has something LIKE this already been said in this book? Cheap pre-check before researching. */
export async function similarNotes(docId, phrase, { limit = 8 } = {}) {
  const p = String(phrase || '').trim();
  if (p.length < 4) return [];
  return queryAll(
    `SELECT id, para_id, paragraph_index, category, COALESCE(edited_body, body) note
       FROM study_notes
      WHERE doc_id = ? AND review IN ('accepted','edited') AND COALESCE(edited_body, body) LIKE ?
      ORDER BY paragraph_index LIMIT ?`,
    [docId, `%${p}%`, limit], 'notes:similar');
}

/**
 * Record one note. Returns its id. `review` starts 'pending': nothing is taught until a human keeps it,
 * which is what makes the interactive loop safe to run repeatedly.
 */
export async function addNote(n) {
  const r = await query(
    `INSERT INTO study_notes
       (doc_id, para_id, paragraph_index, chapter_num, chapter_title, category, subject_key, subject_entity_id,
        body, claim_kind, sources_json, new_dimension, review, model, version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`,
    [n.docId, n.paraId, n.paragraphIndex, n.chapterNum ?? null, n.chapterTitle ?? null, n.category,
      n.subjectKey, n.subjectEntityId ?? null, n.body, n.claimKind ?? null,
      n.sources ? JSON.stringify(n.sources) : null, n.newDimension ?? null,
      n.model ?? null, n.version ?? NOTES_VERSION], 'notes:add');
  return r?.lastInsertRowid ?? null;
}

/** Review a note. An edit is stored SEPARATELY from the original so the prompt can be judged against it. */
export async function reviewNote(id, { review, editedBody = null }) {
  if (!['pending', 'accepted', 'edited', 'rejected'].includes(review)) throw new Error(`bad review state: ${review}`);
  await query(
    `UPDATE study_notes SET review = ?, edited_body = COALESCE(?, edited_body), reviewed_at = unixepoch() WHERE id = ?`,
    [review, editedBody, id], 'notes:review');
}

/**
 * Stamp a paragraph PROCESSED — including when it produced no notes, which is the common case and a correct
 * outcome. Completion is this stamp, never a note count (api/lib/pipeline/processed.js).
 */
export async function markParagraphProcessed(docId, paraId, notesWritten = 0, version = NOTES_VERSION) {
  await query(
    `INSERT INTO study_note_pass (doc_id, para_id, version, notes_written, at)
     VALUES (?,?,?,?,unixepoch())
     ON CONFLICT(doc_id, para_id, version) DO UPDATE SET notes_written = excluded.notes_written, at = excluded.at`,
    [docId, paraId, version, notesWritten], 'notes:mark-processed');
}

/** Has this paragraph been processed at this version? Drives resume, so a re-run costs nothing. */
export async function isParagraphProcessed(docId, paraId, version = NOTES_VERSION) {
  return !!(await queryOne(
    `SELECT 1 FROM study_note_pass WHERE doc_id=? AND para_id=? AND version=?`,
    [docId, paraId, version], 'notes:is-processed'));
}

/** Progress for a book (and optionally one chapter): paragraphs processed vs notes kept. */
export async function noteProgress(docId, { chapter = null, version = NOTES_VERSION } = {}) {
  const pass = await queryOne(
    `SELECT COUNT(*) processed, COALESCE(SUM(notes_written),0) notes FROM study_note_pass WHERE doc_id=? AND version=?`,
    [docId, version], 'notes:progress-pass');
  const byReview = await queryAll(
    `SELECT review, COUNT(*) n FROM study_notes WHERE doc_id=?${chapter ? ' AND chapter_num=?' : ''} GROUP BY review`,
    chapter ? [docId, chapter] : [docId], 'notes:progress-review');
  const counts = Object.fromEntries(byReview.map((r) => [r.review, r.n]));
  return {
    docId, version, chapter,
    paragraphsProcessed: pass?.processed || 0,
    notesWritten: pass?.notes || 0,
    pending: counts.pending || 0, accepted: counts.accepted || 0,
    edited: counts.edited || 0, rejected: counts.rejected || 0,
    // The number that says whether the prompt is any good: of the notes a human has judged, how many survived.
    keepRate: (() => {
      const judged = (counts.accepted || 0) + (counts.edited || 0) + (counts.rejected || 0);
      return judged ? Math.round((((counts.accepted || 0) + (counts.edited || 0)) / judged) * 100) : null;
    })(),
  };
}
