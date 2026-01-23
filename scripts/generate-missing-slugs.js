#!/usr/bin/env node
/**
 * Generate Missing Document Slugs
 *
 * Generates URL-safe slugs for documents that are missing them.
 * This fixes the "Document not found" error when viewing documents via slug URLs.
 *
 * Usage:
 *   node scripts/generate-missing-slugs.js           # Dry run - show what would change
 *   node scripts/generate-missing-slugs.js --apply   # Actually apply changes
 *   node scripts/generate-missing-slugs.js --id 123  # Single document
 */

import { query, queryAll } from '../api/lib/db.js';
import { generateDocSlug, generateUniqueSlug } from '../api/lib/slug.js';
import { getMeili, INDEXES } from '../api/lib/search.js';

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const singleId = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;

async function main() {
  console.log(dryRun ? '=== DRY RUN (use --apply to commit changes) ===' : '=== APPLYING CHANGES ===');
  console.log('');

  // Get documents to fix
  let docs;
  if (singleId) {
    docs = await queryAll(`
      SELECT id, title, author, language, file_path
      FROM docs
      WHERE id = ? AND deleted_at IS NULL
    `, [singleId]);
  } else {
    docs = await queryAll(`
      SELECT id, title, author, language, file_path
      FROM docs
      WHERE deleted_at IS NULL
        AND (slug IS NULL OR slug = '')
      ORDER BY id
    `);
  }

  console.log(`Found ${docs.length} documents missing slugs\n`);

  // Track existing slugs to ensure uniqueness
  const existingSlugsResult = await queryAll(`
    SELECT DISTINCT slug
    FROM docs
    WHERE slug IS NOT NULL
      AND LENGTH(slug) > 0
      AND deleted_at IS NULL
  `);
  const existingSlugs = new Set(existingSlugsResult.map(r => r.slug));

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of docs) {
    try {
      // Extract filename from file_path
      const filename = doc.file_path.split('/').pop();

      // Generate base slug
      const baseSlug = generateDocSlug({
        title: doc.title,
        author: doc.author,
        language: doc.language,
        filename
      });

      if (!baseSlug) {
        console.log(`[${doc.id}] Skipped - could not generate slug from: ${doc.title || filename}`);
        skipped++;
        continue;
      }

      // Ensure uniqueness
      const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs);
      existingSlugs.add(uniqueSlug);

      console.log(`[${doc.id}] ${doc.file_path}`);
      console.log(`  title: "${doc.title}"`);
      console.log(`  slug: "${uniqueSlug}"`);

      if (!dryRun) {
        // Update database
        await query('UPDATE docs SET slug = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [uniqueSlug, doc.id]);

        // Try to update Meilisearch (optional - don't fail if unavailable)
        try {
          const meili = getMeili();
          if (meili) {
            await meili.index(INDEXES.DOCUMENTS).updateDocuments([{
              id: doc.id,
              slug: uniqueSlug
            }], { primaryKey: 'id' });
          }
        } catch (meiliErr) {
          // Meilisearch update failed - that's okay, we'll sync later
        }

        // Mark content as unsynced so search index gets updated
        await query('UPDATE content SET synced = 0 WHERE doc_id = ?', [doc.id]);
        console.log(`  ✓ Updated\n`);
      } else {
        console.log(`  (dry run - no changes made)\n`);
      }

      updated++;
    } catch (err) {
      console.error(`[${doc.id}] Error: ${err.message}`);
      errors++;
    }
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`Checked: ${docs.length}`);
  console.log(`${dryRun ? 'Would update' : 'Updated'}: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  if (dryRun && updated > 0) {
    console.log('\nRun with --apply to commit these changes');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
