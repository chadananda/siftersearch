// Canonical-content integrity — the detector for a canonical document whose content has been emptied.
//
// THE INCIDENT (2026-06-12, found 2026-08-25): the sites-ingester's reconcileDeletes soft-deleted every
// paragraph of 20 OceanLibrary canonicals — 14,588 paragraphs, including the Epistle to the Son of the Wolf,
// Bahá'í Administration, Paris Talks and the Secret of Divine Civilization. The source files were on disk
// the whole time. Basic search queries — patience, prayer, purity — returned nothing found.
//
// IT SURVIVED TWO MONTHS BECAUSE NOTHING WATCHED FOR IT. The June integrity tripwire alarms on live-content
// DROPS; these were already-deleted rows sitting quietly, so every subsequent run saw a stable zero and
// reported health. A detector that only sees transitions cannot see a steady-state defect.
//
// FOUR OF THE TWENTY WERE INVISIBLE EVEN TO THE OBVIOUS QUERY, because they carried `duplicate_of` pointing
// at an OceanLibrary record with zero live content — an empty shell. The only real copy of each work was
// suppressed in favour of nothing. So "has a duplicate_of target" is NOT on its own an explanation: the
// target must actually hold prose. That distinction is the whole point of this check.
//
// Deps: db (read-only).
import { queryAll } from './db.js';

/**
 * Canonical docs holding zero live content, split into the two cases that matter.
 *
 *   orphaned    — no duplicate_of at all, or a duplicate_of target that is ALSO empty. A real defect: this
 *                 work is not in the corpus in any form.
 *   suppressed  — duplicate_of points at a doc that genuinely holds live prose. Correct and expected; the
 *                 content lives under the target.
 *
 * ok is false when `orphaned` is non-empty. A blanket "docs with no content" count would report ~7 for a
 * healthy corpus and be permanently ignored, so the two cases are separated rather than summed.
 */
/**
 * Canonical works that have MORE THAN ONE LIVE COPY — a real duplicate, as opposed to a tombstone.
 *
 * Why this exists (2026-08-25): a title listing showed two "Prayers and Meditations" and read as a dedupe
 * failure. It was not — 8301 was soft-deleted in May with `duplicate_of` → 20805, and the listing endpoint
 * simply had no `deleted_at` filter, so it returned the tombstone beside the living record. A count of rows
 * bearing a title answers nothing; only a count of LIVE rows holding CONTENT does.
 *
 * Both conditions are required. A row that is deleted is not a duplicate, and a row with no live prose is a
 * husk — the concern of guttedCanonicals(), not this check. Summing either into "duplicates" produces false
 * alarms that train the reader to ignore the alarm.
 */
export async function liveDuplicateCanonicals({ query = queryAll } = {}) {
  const rows = await query(`
    SELECT LOWER(TRIM(d.title)) key, COUNT(*) n,
           GROUP_CONCAT(d.id) ids, GROUP_CONCAT(COALESCE(d.source_site, 'main-library')) sites
      FROM docs d
     WHERE d.deleted_at IS NULL
       AND d.duplicate_of IS NULL
       AND (d.source_site = 'oceanlibrary.com' OR d.source_site IS NULL)
       AND EXISTS (SELECT 1 FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL)
     GROUP BY key
    HAVING n > 1
     ORDER BY n DESC`, [], 'audit:live-duplicate-canonicals');

  return {
    ok: rows.length === 0,
    duplicates: rows.length,
    detail: rows.length === 0
      ? 'every canonical title resolves to exactly one live copy holding content'
      : `${rows.length} canonical title(s) have more than one LIVE copy holding content`,
    sample: rows.slice(0, 20).map((r) => ({ title: r.key, copies: r.n, ids: r.ids, sites: r.sites })),
  };
}

export async function guttedCanonicals({ query = queryAll } = {}) {
  // CANONICAL = oceanlibrary.com or the main library (source_site NULL). A scraped copy going empty is not
  // this defect — the corpus holds 147,477 scraped docs and they churn.
  const rows = await query(`
    SELECT d.id, d.title, d.source_site, d.duplicate_of,
           (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL) live,
           (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id) total,
           (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.duplicate_of AND c.deleted_at IS NULL) target_live
      FROM docs d
     WHERE d.deleted_at IS NULL
       AND (d.source_site = 'oceanlibrary.com' OR d.source_site IS NULL)
     GROUP BY d.id
    HAVING live = 0
     ORDER BY total DESC`, [], 'audit:gutted-canonicals');

  const orphaned = [], suppressed = [];
  for (const r of rows) {
    const entry = { id: r.id, title: r.title, sourceSite: r.source_site,
      deletedRows: r.total, duplicateOf: r.duplicate_of, targetLive: r.target_live };
    // A duplicate_of target holding prose is the ONE benign explanation. Everything else — no target, or a
    // target that is itself an empty shell — is a work that has silently left the corpus.
    if (r.duplicate_of && r.target_live > 0) suppressed.push(entry);
    else orphaned.push(entry);
  }

  const recoverable = orphaned.filter((o) => o.deletedRows > 0);
  return {
    ok: orphaned.length === 0,
    checked: rows.length,
    orphaned: orphaned.length,
    suppressed: suppressed.length,
    // Rows still present but soft-deleted are RESTORABLE in place — the June restore cleared deleted_at and
    // recovered 14,588 paragraphs without re-ingesting anything.
    recoverable: recoverable.length,
    recoverableParagraphs: recoverable.reduce((n, o) => n + o.deletedRows, 0),
    detail: orphaned.length === 0
      ? `every canonical doc holds live content (${suppressed.length} correctly suppressed by a duplicate_of target that has prose)`
      : `${orphaned.length} canonical doc(s) hold ZERO live content and are not covered by a duplicate_of target — `
        + `${recoverable.length} of them still have soft-deleted rows that can be restored in place `
        + `(${recoverable.reduce((n, o) => n + o.deletedRows, 0)} paragraphs)`,
    sample: orphaned.slice(0, 20),
    suppressedSample: suppressed.slice(0, 10),
  };
}
