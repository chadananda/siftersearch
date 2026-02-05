#!/usr/bin/env node
/**
 * Clean up orphaned entries from Meilisearch.
 *
 * Handles two types of orphans:
 * 1. Document-level: docs in Meilisearch but not in SQLite
 * 2. Paragraph-level: paragraph IDs in Meilisearch that no longer exist
 *    in the content table (caused by re-ingestion creating new IDs)
 *
 * Usage:
 *   node scripts/cleanup-meili-orphans.js            # Execute cleanup
 *   node scripts/cleanup-meili-orphans.js --dry-run   # Preview only
 */

import '../api/lib/config.js';
import { getMeili } from '../api/lib/search.js';
import { queryAll } from '../api/lib/db.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(dryRun ? 'DRY RUN — no changes will be made\n' : 'Cleaning orphaned entries from Meilisearch\n');

  const client = getMeili();

  // ─── Document-level orphan cleanup ───────────────────────────────────
  const sqliteDocs = await queryAll('SELECT id FROM docs WHERE deleted_at IS NULL');
  const sqliteDocIds = new Set(sqliteDocs.map(d => d.id));
  console.log('Active SQLite docs:', sqliteDocIds.size);

  const meiliStats = await client.index('documents').getStats();
  console.log('Meilisearch docs:', meiliStats.numberOfDocuments);

  let docOrphans = [];
  let offset = 0;
  while (true) {
    const batch = await client.index('documents').getDocuments({ limit: 1000, offset });
    if (batch.results.length === 0) break;
    for (const doc of batch.results) {
      if (!sqliteDocIds.has(doc.id)) docOrphans.push(doc.id);
    }
    if (batch.results.length < 1000) break;
    offset += 1000;
  }

  console.log('Orphan docs in Meilisearch:', docOrphans.length);

  if (docOrphans.length > 0 && !dryRun) {
    await client.index('documents').deleteDocuments(docOrphans);
    // Also delete paragraphs for orphan docs
    for (const id of docOrphans) {
      try {
        await client.index('paragraphs').deleteDocuments({ filter: `doc_id = ${id}` });
      } catch { /* ignore */ }
    }
    console.log('Deleted', docOrphans.length, 'orphan documents');
  }

  // ─── Paragraph-level orphan cleanup ──────────────────────────────────
  console.log('\nChecking paragraph-level orphans...');

  const paragraphsIndex = client.index('paragraphs');
  let totalOrphans = 0;
  let totalValid = 0;
  let docsWithOrphans = 0;
  let docsChecked = 0;

  for (const doc of sqliteDocs) {
    docsChecked++;
    if (docsChecked % 100 === 0) {
      process.stdout.write(`  Checked ${docsChecked}/${sqliteDocs.length} documents...\r`);
    }

    // Get all content IDs from DB for this doc
    const dbContent = await queryAll('SELECT id FROM content WHERE doc_id = ?', [doc.id]);
    const dbIdSet = new Set(dbContent.map(r => r.id));

    // Get all paragraph IDs from Meilisearch for this doc
    let off = 0;
    const meiliIds = [];
    while (true) {
      const result = await paragraphsIndex.getDocuments({
        filter: `doc_id = ${doc.id}`,
        fields: ['id'],
        limit: 1000,
        offset: off
      });
      if (!result.results || result.results.length === 0) break;
      meiliIds.push(...result.results.map(r => r.id));
      if (result.results.length < 1000) break;
      off += 1000;
    }

    const orphanIds = meiliIds.filter(id => !dbIdSet.has(id));

    if (orphanIds.length > 0) {
      docsWithOrphans++;
      totalOrphans += orphanIds.length;
      totalValid += meiliIds.length - orphanIds.length;
      console.log(`  [${doc.id}] ${meiliIds.length} in Meili, ${dbContent.length} in DB, ${orphanIds.length} orphans`);

      if (!dryRun) {
        for (let i = 0; i < orphanIds.length; i += 1000) {
          const batch = orphanIds.slice(i, i + 1000);
          await paragraphsIndex.deleteDocuments(batch);
        }
      }
    } else {
      totalValid += meiliIds.length;
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Documents checked:      ${docsChecked}`);
  console.log(`Documents with orphans: ${docsWithOrphans}`);
  console.log(`Orphaned paragraphs:    ${totalOrphans}`);
  console.log(`Orphaned documents:     ${docOrphans.length}`);
  console.log(`Valid paragraphs:       ${totalValid}`);
  console.log(`${'─'.repeat(60)}`);

  if (dryRun) {
    console.log('\nDry run complete. Run without --dry-run to execute cleanup.');
  } else {
    console.log(`\nCleaned up ${totalOrphans} orphaned paragraphs and ${docOrphans.length} orphaned documents.`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
