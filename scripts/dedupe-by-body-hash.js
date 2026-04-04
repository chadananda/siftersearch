#!/usr/bin/env node
/**
 * Deduplicate documents by normalized body hash
 *
 * Finds active documents with identical normalized body content and
 * soft-deletes duplicates, keeping the one with the most content rows.
 *
 * Also reports "near-duplicate" documents that share a high percentage
 * of normalized paragraph hashes (extracts, variant editions).
 *
 * Usage:
 *   node scripts/dedupe-by-body-hash.js                    # Dry run
 *   node scripts/dedupe-by-body-hash.js --execute          # Soft-delete exact duplicates
 *   node scripts/dedupe-by-body-hash.js --near-dupes       # Also show near-duplicates
 *   node scripts/dedupe-by-body-hash.js --backfill         # Backfill body_hash_normalized from source files
 */

import '../api/lib/config.js';
import { query, queryAll, queryOne } from '../api/lib/db.js';
import { removeDocument, hashBodyNormalized, parseMarkdownFrontmatter } from '../api/services/ingester.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

const EXECUTE = process.argv.includes('--execute');
const NEAR_DUPES = process.argv.includes('--near-dupes');
const BACKFILL = process.argv.includes('--backfill');

const LIBRARY_BASE = join(process.env.HOME, 'Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library');

async function backfillNormalizedHashes() {
  console.log('=== Backfilling body_hash_normalized ===\n');

  const docs = await queryAll(`
    SELECT id, file_path, title FROM docs
    WHERE deleted_at IS NULL AND body_hash_normalized IS NULL AND file_path IS NOT NULL
    ORDER BY id
  `);

  console.log(`${docs.length} docs need body_hash_normalized backfill`);
  let updated = 0;
  let failed = 0;

  for (const doc of docs) {
    try {
      const fullPath = join(LIBRARY_BASE, doc.file_path);
      const text = await readFile(fullPath, 'utf-8');
      const { content } = parseMarkdownFrontmatter(text);
      const hashNorm = hashBodyNormalized(content);
      await query('UPDATE docs SET body_hash_normalized = ? WHERE id = ?', [hashNorm, doc.id]);
      updated++;
    } catch {
      failed++;
    }
  }
  console.log(`Updated: ${updated}, Failed (file missing): ${failed}\n`);
}

async function findExactDuplicates() {
  console.log('=== Exact Duplicates ===\n');

  // Use body_hash_normalized if the column exists, fall back to body_hash
  const cols = (await queryAll('PRAGMA table_info(docs)')).map(c => c.name);
  let normCount = 0;
  if (cols.includes('body_hash_normalized')) {
    normCount = (await queryOne(`SELECT COUNT(*) as cnt FROM docs WHERE body_hash_normalized IS NOT NULL AND deleted_at IS NULL`)).cnt;
  }
  const hashCol = normCount > 100 ? 'body_hash_normalized' : 'body_hash';
  console.log(`Using ${hashCol} (${normCount} docs have normalized hashes)\n`);

  const groups = await queryAll(`
    SELECT ${hashCol} as hash, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM docs
    WHERE deleted_at IS NULL AND ${hashCol} IS NOT NULL AND ${hashCol} != ''
    GROUP BY ${hashCol}
    HAVING cnt > 1
    ORDER BY cnt DESC
  `);

  if (groups.length === 0) {
    console.log('No duplicate documents found.');
    return;
  }

  const totalExcess = groups.reduce((sum, g) => sum + g.cnt - 1, 0);
  console.log(`Found ${groups.length} duplicate groups (${totalExcess} excess documents)\n`);

  let removedCount = 0;

  for (const group of groups) {
    const docIds = group.ids.split(',').map(Number);
    const docs = await queryAll(`
      SELECT d.id, d.title, d.file_path,
             (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL) as content_count
      FROM docs d
      WHERE d.id IN (${docIds.map(() => '?').join(',')})
      ORDER BY content_count DESC, d.id DESC
    `, docIds);

    const keep = docs[0];
    const dupes = docs.slice(1);

    if (group.cnt <= 5) {
      console.log(`[${group.cnt}x] "${keep.title?.slice(0, 70)}"`);
      console.log(`  KEEP: id=${keep.id} (${keep.content_count} paras)`);
      for (const d of dupes) {
        console.log(`  ${EXECUTE ? 'DELETE' : 'WOULD DELETE'}: id=${d.id} (${d.content_count} paras)`);
      }
    } else {
      console.log(`[${group.cnt}x] "${keep.title?.slice(0, 70)}" — KEEP id=${keep.id}, ${EXECUTE ? 'delete' : 'would delete'} ${dupes.length} others`);
    }

    if (EXECUTE) {
      for (const d of dupes) {
        try {
          await removeDocument(d.id);
          removedCount++;
        } catch (err) {
          console.error(`  ERROR removing id=${d.id}: ${err.message}`);
        }
      }
    } else {
      removedCount += dupes.length;
    }
  }

  console.log(`\n${EXECUTE ? 'Removed' : 'Would remove'}: ${removedCount} duplicates`);
  if (!EXECUTE) console.log('Use --execute to soft-delete duplicates.');
}

async function findNearDuplicates() {
  console.log('\n=== Near-Duplicates (paragraph overlap) ===\n');

  // Query normalized_hash directly from content table — no denormalization needed
  const docs = await queryAll(`
    SELECT id, title FROM docs
    WHERE deleted_at IS NULL AND paragraph_count >= 3
    ORDER BY id
  `);

  console.log(`Loading paragraph hashes for ${docs.length} documents...`);

  const docHashSets = new Map();
  const hashToDocIds = new Map();

  for (const doc of docs) {
    const rows = await queryAll(
      `SELECT DISTINCT normalized_hash FROM content WHERE doc_id = ? AND deleted_at IS NULL AND normalized_hash IS NOT NULL`,
      [doc.id]
    );
    if (rows.length < 3) continue;

    const hashSet = new Set(rows.map(r => r.normalized_hash));
    docHashSets.set(doc.id, { title: doc.title, hashSet, total: hashSet.size });

    for (const h of hashSet) {
      if (!hashToDocIds.has(h)) hashToDocIds.set(h, []);
      hashToDocIds.get(h).push(doc.id);
    }
  }

  console.log(`Comparing ${docHashSets.size} documents...\n`);

  const checkedPairs = new Set();
  const nearDupes = [];

  for (const [docId, docData] of docHashSets) {
    const overlapCounts = new Map();
    for (const h of docData.hashSet) {
      for (const otherId of (hashToDocIds.get(h) || [])) {
        if (otherId <= docId) continue; // Only check each pair once
        overlapCounts.set(otherId, (overlapCounts.get(otherId) || 0) + 1);
      }
    }

    for (const [otherId, sharedCount] of overlapCounts) {
      const otherData = docHashSets.get(otherId);
      if (!otherData) continue;

      const smaller = Math.min(docData.total, otherData.total);
      const overlapPct = sharedCount / smaller;
      if (overlapPct >= 0.5) {
        nearDupes.push({
          docA: docId, titleA: docData.title, totalA: docData.total,
          docB: otherId, titleB: otherData.title, totalB: otherData.total,
          shared: sharedCount, overlapPct
        });
      }
    }
  }

  nearDupes.sort((a, b) => b.overlapPct - a.overlapPct);

  if (nearDupes.length === 0) {
    console.log('No near-duplicates found (>50% paragraph overlap).');
    return;
  }

  console.log(`Found ${nearDupes.length} near-duplicate pairs:\n`);
  for (const nd of nearDupes.slice(0, 50)) {
    const pct = (nd.overlapPct * 100).toFixed(0);
    console.log(`  ${pct}% overlap (${nd.shared} shared paragraphs):`);
    console.log(`    id=${nd.docA} "${nd.titleA?.slice(0, 60)}" (${nd.totalA} unique paras)`);
    console.log(`    id=${nd.docB} "${nd.titleB?.slice(0, 60)}" (${nd.totalB} unique paras)`);
  }
  if (nearDupes.length > 50) {
    console.log(`  ... and ${nearDupes.length - 50} more pairs`);
  }
}

async function main() {
  console.log(EXECUTE ? '*** EXECUTE MODE ***\n' : '*** DRY RUN ***\n');

  if (BACKFILL) await backfillNormalizedHashes();
  await findExactDuplicates();
  if (NEAR_DUPES) await findNearDuplicates();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
