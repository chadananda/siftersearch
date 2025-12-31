#!/usr/bin/env node

/**
 * Sync Content to libsql
 *
 * One-time migration script to sync paragraph content from Meilisearch to libsql.
 * This is needed for documents that were indexed before libsql was set up.
 *
 * Usage:
 *   node scripts/sync-content-to-libsql.js [options]
 *
 * Options:
 *   --dry-run       Show what would be synced without making changes
 *   --limit=N       Limit to N documents (default: all)
 *   --language=XX   Only sync documents in this language (ar, fa, etc.)
 *   --document=ID   Sync a specific document
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { query, queryOne, queryAll } from '../api/lib/db.js';
import { getMeili, INDEXES } from '../api/lib/search.js';
import { logger } from '../api/lib/logger.js';

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const langArg = args.find(a => a.startsWith('--language='));
const docArg = args.find(a => a.startsWith('--document='));

const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
const filterLanguage = langArg ? langArg.split('=')[1] : null;
const specificDocId = docArg ? docArg.split('=')[1] : null;

async function syncContentToLibsql() {
  console.log('📚 Sync Content to libsql');
  console.log('=========================');

  if (dryRun) {
    console.log('🔍 DRY RUN - No changes will be made\n');
  }

  const meili = getMeili();

  // Get documents that need syncing
  let filter = filterLanguage ? `language = "${filterLanguage}"` : null;
  if (specificDocId) {
    filter = `id = "${specificDocId}"`;
  }

  console.log('Finding documents in Meilisearch...');
  const docsResult = await meili.index(INDEXES.DOCUMENTS).search('', {
    limit: limit || 10000,
    filter,
    attributesToRetrieve: ['id', 'title', 'language', 'paragraph_count']
  });

  console.log(`Found ${docsResult.hits.length} documents\n`);

  // Statistics
  let docsProcessed = 0;
  let docsSkipped = 0;
  let docsSynced = 0;
  let totalParasSynced = 0;

  for (const doc of docsResult.hits) {
    docsProcessed++;

    // Check if document already has content in libsql
    const existingCount = await queryOne(
      'SELECT COUNT(*) as count FROM content WHERE doc_id = ?',
      [doc.id]
    );

    if (existingCount?.count > 0) {
      // Already has content
      docsSkipped++;
      continue;
    }

    // Get paragraphs from Meilisearch
    const parasResult = await meili.index(INDEXES.PARAGRAPHS).search('', {
      filter: `document_id = "${doc.id}"`,
      limit: 1000,
      sort: ['paragraph_index:asc']
    });

    if (parasResult.hits.length === 0) {
      console.log(`⏭️  ${doc.title}: No paragraphs in Meilisearch`);
      docsSkipped++;
      continue;
    }

    console.log(`📄 ${doc.title}: Syncing ${parasResult.hits.length} paragraphs...`);

    if (!dryRun) {
      const now = new Date().toISOString();
      let syncedCount = 0;

      for (const p of parasResult.hits) {
        try {
          await query(`
            INSERT OR IGNORE INTO content (id, doc_id, paragraph_index, text, blocktype, heading, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [p.id, doc.id, p.paragraph_index, p.text, p.blocktype || 'paragraph', p.heading || null, now, now]);
          syncedCount++;
        } catch (err) {
          logger.warn({ err: err.message, paraId: p.id }, 'Failed to insert paragraph');
        }
      }

      totalParasSynced += syncedCount;
    } else {
      totalParasSynced += parasResult.hits.length;
    }

    docsSynced++;
  }

  // Summary
  console.log('\n=========================');
  console.log('📊 Sync Summary');
  console.log('=========================');
  console.log(`Documents processed: ${docsProcessed}`);
  console.log(`Documents synced: ${docsSynced}`);
  console.log(`Documents skipped (already have content): ${docsSkipped}`);
  console.log(`Total paragraphs synced: ${totalParasSynced}`);

  if (dryRun) {
    console.log('\n📝 This was a dry run. Run without --dry-run to apply changes.');
  }
}

// Run
syncContentToLibsql().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
