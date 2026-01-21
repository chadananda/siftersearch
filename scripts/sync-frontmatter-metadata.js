#!/usr/bin/env node
/**
 * Sync Frontmatter Metadata to Database
 *
 * Updates title, description, and language from source file frontmatter
 * WITHOUT triggering full re-ingestion (avoids expensive AI segmentation).
 *
 * Usage:
 *   node scripts/sync-frontmatter-metadata.js           # Dry run - show what would change
 *   node scripts/sync-frontmatter-metadata.js --apply   # Actually apply changes
 *   node scripts/sync-frontmatter-metadata.js --id 109  # Single document
 */

import { query, queryAll, queryOne } from '../api/lib/db.js';
import { parseMarkdownFrontmatter } from '../api/services/ingester.js';
import { getMeili, INDEXES } from '../api/lib/search.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import config from '../api/lib/config.js';

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const singleId = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;

async function main() {
  console.log(dryRun ? '=== DRY RUN (use --apply to commit changes) ===' : '=== APPLYING CHANGES ===');
  console.log('');

  // Get documents to check
  let docs;
  if (singleId) {
    docs = await queryAll('SELECT id, file_path, title, language, description FROM docs WHERE id = ? AND deleted_at IS NULL', [singleId]);
  } else {
    // Get all docs where title looks like a filename (contains INBA or starts with number)
    docs = await queryAll(`
      SELECT id, file_path, title, language, description
      FROM docs
      WHERE deleted_at IS NULL
        AND (title LIKE '%INBA%' OR title GLOB '[0-9]*')
      ORDER BY id
    `);
  }

  console.log(`Found ${docs.length} documents to check\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of docs) {
    try {
      const fullPath = join(config.library.basePath, doc.file_path);
      const content = await readFile(fullPath, 'utf-8');
      const { metadata: frontmatter } = parseMarkdownFrontmatter(content);

      // Check what needs updating
      const changes = [];

      if (frontmatter.title && frontmatter.title !== doc.title) {
        changes.push(`title: "${doc.title}" → "${frontmatter.title}"`);
      }
      if (frontmatter.language && frontmatter.language !== doc.language) {
        changes.push(`language: "${doc.language}" → "${frontmatter.language}"`);
      }
      if (frontmatter.description && frontmatter.description !== doc.description) {
        const oldDesc = doc.description?.substring(0, 30) || '(none)';
        const newDesc = frontmatter.description.substring(0, 30);
        changes.push(`description: "${oldDesc}..." → "${newDesc}..."`);
      }

      if (changes.length === 0) {
        skipped++;
        continue;
      }

      console.log(`[${doc.id}] ${doc.file_path}`);
      for (const change of changes) {
        console.log(`  ${change}`);
      }

      if (!dryRun) {
        await query(`
          UPDATE docs SET
            title = COALESCE(?, title),
            language = COALESCE(?, language),
            description = COALESCE(?, description),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [
          frontmatter.title || null,
          frontmatter.language || null,
          frontmatter.description || null,
          doc.id
        ]);

        // Update Meilisearch document index directly
        const meili = getMeili();
        if (meili) {
          await meili.index(INDEXES.DOCUMENTS).updateDocuments([{
            id: doc.id,
            title: frontmatter.title || doc.title,
            language: frontmatter.language || doc.language,
            description: frontmatter.description || doc.description
          }], { primaryKey: 'id' });
        }

        // Mark content as unsynced so search index gets updated
        await query('UPDATE content SET synced = 0 WHERE doc_id = ?', [doc.id]);
        console.log(`  ✓ Updated (DB + Meilisearch)\n`);
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
  console.log(`Would update: ${updated}`);
  console.log(`Skipped (no changes): ${skipped}`);
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
