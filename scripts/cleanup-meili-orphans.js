#!/usr/bin/env node
/**
 * Clean up orphan documents in Meilisearch
 * (docs that exist in Meilisearch but not in SQLite)
 */

import '../api/lib/config.js';
import { getMeili } from '../api/lib/search.js';
import { queryAll } from '../api/lib/db.js';

async function main() {
  const client = getMeili();

  // Get all doc IDs from SQLite
  const sqliteDocs = await queryAll('SELECT id FROM docs');
  const sqliteIds = new Set(sqliteDocs.map(d => d.id));
  console.log('SQLite docs:', sqliteIds.size);

  // Get Meilisearch stats
  const meiliStats = await client.index('documents').getStats();
  console.log('Meilisearch docs:', meiliStats.numberOfDocuments);

  // Find orphans
  let orphans = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const batch = await client.index('documents').getDocuments({ limit, offset });
    if (batch.results.length === 0) break;

    for (const doc of batch.results) {
      if (!sqliteIds.has(doc.id)) {
        orphans.push(doc.id);
      }
    }
    offset += limit;
  }

  console.log('Orphan docs in Meilisearch:', orphans.length);

  if (orphans.length > 0) {
    console.log('Deleting orphans...');
    await client.index('documents').deleteDocuments(orphans);
    console.log('Deleted', orphans.length, 'orphan documents');
  } else {
    console.log('No orphans to clean up');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
