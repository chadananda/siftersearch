// Repairing documents whose author/title are FILE LOCATORS rather than metadata.
//
// One implementation, two callers: scripts/backfill-source-metadata.mjs (CLI) and
// GET/POST /api/admin/ingest/metadata-* (the management API, so a review needs no shell).
// Splitting the rule across both is how the two would drift, and this rule decides what ~2,058 live
// documents claim about their own authorship.
//
// The rule itself lives in api/lib/text/source-metadata.js and is shared with the converter, so a document
// repaired here and a document converted tomorrow are judged identically.
// Deps: api/lib/db.js, api/lib/text/source-metadata.js

import { queryAll, query } from '../db.js';
import { resolveSourceMetadata, isLocatorAuthor, isFilenameTitle } from '../text/source-metadata.js';

/** Candidate rows: the locator shape in SQL, confirmed per-row in JS so the rule is stated once. */
async function candidates(limit) {
  return queryAll(
    `SELECT id, title, author, file_path FROM docs
      WHERE deleted_at IS NULL
        AND (author LIKE 'pdf-%' OR author LIKE 'doc-%' OR author LIKE 'docx-%'
             OR author LIKE 'html-%' OR author LIKE 'txt-%' OR author LIKE 'epub-%')
      ORDER BY id LIMIT ?`, [limit], 'metadata-repair:candidates');
}

/**
 * Audit (and optionally repair) locator metadata.
 * `apply` defaults to FALSE: this rewrites what live documents claim about their authorship, so writing is
 * always an explicit act. Returns counts plus samples, which is what makes a review possible.
 */
export async function auditLocatorMetadata({ limit = 5000, apply = false, sampleSize = 15 } = {}) {
  const docs = await candidates(limit);
  const tally = { candidates: docs.length, recoveredBoth: 0, authorOnly: 0, titleOnly: 0, neither: 0, skipped: 0, written: 0 };
  const samples = [];

  for (const d of docs) {
    if (!isLocatorAuthor(d.author) && !isFilenameTitle(d.title)) { tally.skipped++; continue; }
    const head = await queryAll(
      `SELECT text FROM content WHERE doc_id=? AND deleted_at IS NULL AND blocktype IN ('paragraph','quote')
        ORDER BY paragraph_index LIMIT 12`, [d.id], 'metadata-repair:doc-head');
    const meta = resolveSourceMetadata({ stubTitle: d.title, stubAuthor: d.author, text: head.map((r) => r.text).join('\n') });

    if (meta.author && meta.title) tally.recoveredBoth++;
    else if (meta.author) tally.authorOnly++;
    else if (meta.title) tally.titleOnly++;
    else tally.neither++;

    if (samples.length < sampleSize) {
      samples.push({ id: d.id, fromAuthor: d.author, fromTitle: d.title,
        toAuthor: meta.author, toTitle: meta.title ?? d.title, notes: meta.notes });
    }
    if (apply) {
      // NULL, never a placeholder. An unrecoverable TITLE keeps the existing one — a filename slug is poor
      // but still readable, whereas a null title leaves a document with no handle at all.
      await query(`UPDATE docs SET author=?, title=COALESCE(?, title), updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [meta.author, meta.title, d.id], 'metadata-repair:write');
      tally.written++;
    }
  }
  // The number that decides whether this is ready: how often the document actually names its author.
  const considered = tally.candidates - tally.skipped;
  tally.recoveryRate = considered ? Math.round(((tally.recoveredBoth + tally.authorOnly) / considered) * 100) : 0;
  return { apply, ...tally, samples };
}
