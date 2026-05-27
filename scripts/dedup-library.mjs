#!/usr/bin/env node
// Deduplicate library documents.
//
// Modes:
//   --dry-run  (default) Print what would be done
//   --execute  Move files to quarantine + soft-delete DB records
//
// Strategy:
//   Primary library (source_site IS NULL):
//     - Group by body_hash; keep lowest ID (first ingested); move file extras to _quarantine/
//     - Also soft-deletes DB records for moved files
//
//   Site docs (source_site IS NOT NULL, e.g. bahai-library.com):
//     - Keep human-readable slug (file without numeric-only basename); soft-delete numeric-ID duplicates
//     - File move not needed (sites are managed by sites-ingester)
//
// Safe to re-run — skips already-deleted records.

import { readFileSync, mkdirSync, renameSync, existsSync } from 'fs';
import { join, basename, resolve } from 'path';
import { queryAll, query, queryOne } from '../api/lib/db.js';
import { logger } from '../api/lib/logger.js';
import { runMigrations } from '../api/lib/migrations/runner.js';

const DRY_RUN = !process.argv.includes('--execute');
const LIBRARY_ROOT = '/home/chad/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library';
const QUARANTINE_ROOT = '/home/chad/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/_quarantine';

if (DRY_RUN) logger.info('DRY RUN — pass --execute to apply changes');
else logger.warn('EXECUTE MODE — files will be moved, DB records soft-deleted');

await runMigrations();

let filesQuarantined = 0;
let dbSoftDeleted = 0;
let errors = 0;

// ──────────────────────────────────────────────
// Phase 1: Primary library body_hash duplicates
// ──────────────────────────────────────────────
logger.info('Phase 1: Primary library body_hash duplicates...');

const hashGroups = await queryAll(`
  SELECT body_hash, MIN(id) as keeper_id, COUNT(*) as copies, GROUP_CONCAT(id ORDER BY id) as all_ids
  FROM docs
  WHERE deleted_at IS NULL AND source_site IS NULL AND body_hash IS NOT NULL
  GROUP BY body_hash HAVING copies > 1
  ORDER BY copies DESC
`);

logger.info({ groups: hashGroups.length }, 'Hash duplicate groups found');

for (const group of hashGroups) {
  const dupeIds = group.all_ids.split(',').map(Number).filter(id => id !== group.keeper_id);
  const dupes = await queryAll(
    `SELECT id, file_path, title FROM docs WHERE id IN (${dupeIds.join(',')}) AND deleted_at IS NULL`
  );

  for (const dupe of dupes) {
    const absPath = dupe.file_path ? join(LIBRARY_ROOT, dupe.file_path) : null;

    // Move the file if it exists and is within the library root
    if (absPath && existsSync(absPath) && absPath.startsWith(LIBRARY_ROOT)) {
      const rel = dupe.file_path;
      const dest = join(QUARANTINE_ROOT, rel);
      const destDir = dest.substring(0, dest.lastIndexOf('/'));

      if (DRY_RUN) {
        logger.info({ action: 'quarantine', from: absPath, to: dest, docId: dupe.id, title: dupe.title });
      } else {
        try {
          mkdirSync(destDir, { recursive: true });
          renameSync(absPath, dest);
          filesQuarantined++;
        } catch (err) {
          logger.error({ err: err.message, path: absPath }, 'Failed to move file');
          errors++;
          continue;
        }
      }
    }

    // Soft-delete the DB record
    if (DRY_RUN) {
      logger.info({ action: 'soft-delete', docId: dupe.id, title: dupe.title, keeperId: group.keeper_id });
    } else {
      await query(
        `UPDATE docs SET deleted_at = datetime('now'), duplicate_of = ? WHERE id = ?`,
        [group.keeper_id, dupe.id]
      );
      // Also soft-delete associated content rows
      await query(
        `UPDATE content SET deleted_at = datetime('now') WHERE doc_id = ? AND deleted_at IS NULL`,
        [dupe.id]
      );
      dbSoftDeleted++;
    }
  }
}

// ──────────────────────────────────────────────
// Phase 2: Site doc title duplicates
// ──────────────────────────────────────────────
logger.info('Phase 2: Site doc (bahai-library.com) title duplicates...');

const siteDupGroups = await queryAll(`
  SELECT title, source_site, COUNT(*) as copies, MIN(id) as min_id, MAX(id) as max_id,
         GROUP_CONCAT(id ORDER BY id) as all_ids
  FROM docs
  WHERE deleted_at IS NULL AND source_site IS NOT NULL AND title IS NOT NULL AND title != '.'
  GROUP BY title, source_site HAVING copies > 1
  ORDER BY copies DESC
`);

logger.info({ groups: siteDupGroups.length }, 'Site title duplicate groups found');

for (const group of siteDupGroups) {
  const ids = group.all_ids.split(',').map(Number);

  // Prefer human-readable slug (non-numeric basename) over numeric IDs like "6973.md"
  const rows = await queryAll(
    `SELECT id, file_path FROM docs WHERE id IN (${ids.join(',')}) AND deleted_at IS NULL`
  );

  // Determine keeper: prefer non-numeric-only basename
  const isNumericFile = (fp) => fp && /\/\d+\.md$/.test(fp);
  const nonNumeric = rows.filter(r => !isNumericFile(r.file_path));
  const keeperRow = nonNumeric.length > 0 ? nonNumeric[0] : rows[0];
  const dupes = rows.filter(r => r.id !== keeperRow.id);

  for (const dupe of dupes) {
    if (DRY_RUN) {
      logger.info({ action: 'site-soft-delete', docId: dupe.id, keeperId: keeperRow.id, title: group.title, site: group.source_site });
    } else {
      await query(
        `UPDATE docs SET deleted_at = datetime('now'), duplicate_of = ? WHERE id = ?`,
        [keeperRow.id, dupe.id]
      );
      await query(
        `UPDATE content SET deleted_at = datetime('now') WHERE doc_id = ? AND deleted_at IS NULL`,
        [dupe.id]
      );
      dbSoftDeleted++;
    }
  }
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
if (DRY_RUN) {
  logger.info({
    hashDupGroups: hashGroups.length,
    siteDupGroups: siteDupGroups.length,
    note: 'Run with --execute to apply'
  }, 'Dry run complete');
} else {
  logger.info({ filesQuarantined, dbSoftDeleted, errors }, 'Deduplication complete');
  if (errors > 0) logger.warn(`${errors} file move errors — check logs above`);
}

process.exit(0);
