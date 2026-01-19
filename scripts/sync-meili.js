#!/usr/bin/env node

/**
 * Sync document metadata from SQLite to Meilisearch
 *
 * Updates Meilisearch documents index with current metadata from database
 */

import { queryAll } from '../api/lib/db.js';
import { getMeili, INDEXES } from '../api/lib/search.js';

const dryRun = process.argv.includes('--dry-run');
const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');

async function main() {
  console.log('Sync Document Metadata to Meilisearch');
  console.log('=====================================');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const meili = getMeili();

  // Get all documents from database
  const docs = await queryAll(`
    SELECT id, title, author, religion, collection, language, year, description
    FROM docs
    WHERE deleted_at IS NULL
    ${limit > 0 ? `LIMIT ${limit}` : ''}
  `);

  console.log(`Syncing ${docs.length} documents to Meilisearch...`);

  if (!dryRun) {
    // Update in batches
    const batchSize = 500;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      await meili.index(INDEXES.DOCUMENTS).updateDocuments(batch);
      console.log(`  Updated ${Math.min(i + batchSize, docs.length)}/${docs.length}`);
    }
  }

  console.log('');
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
