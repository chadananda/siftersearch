#!/usr/bin/env node

/**
 * Refresh Authority Values
 *
 * Updates authority values for all documents in Meilisearch
 * without re-ingesting content. Uses the current authority
 * calculation logic from api/lib/authority.js.
 *
 * Usage:
 *   node scripts/refresh-authority.js [--dry-run]
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { getMeili, INDEXES } from '../api/lib/search.js';
import { getAuthority, reloadConfig } from '../api/lib/authority.js';
import { logger } from '../api/lib/logger.js';

const dryRun = process.argv.includes('--dry-run');
const BATCH_SIZE = 1000;

async function refreshAuthority() {
  console.log('Refreshing authority values...');
  console.log(dryRun ? '(DRY RUN - no changes will be made)' : '');

  // Reload authority config from library meta.yaml files
  reloadConfig();

  const meili = getMeili();
  const index = meili.index(INDEXES.PARAGRAPHS);

  let offset = 0;
  let totalUpdated = 0;
  let totalProcessed = 0;
  const updates = [];
  const seenDocs = new Set();

  // Track authority changes by collection
  const collectionChanges = {};

  while (true) {
    // Fetch batch of documents
    const { results, total } = await index.getDocuments({
      limit: BATCH_SIZE,
      offset,
      fields: ['id', 'doc_id', 'author', 'religion', 'collection', 'authority', 'title']
    });

    if (results.length === 0) break;

    console.log(`Processing ${offset + 1} - ${offset + results.length} of ${total}...`);

    for (const doc of results) {
      totalProcessed++;

      // Calculate new authority
      const newAuthority = getAuthority({
        author: doc.author,
        religion: doc.religion,
        collection: doc.collection
      });

      const oldAuthority = parseInt(doc.authority) || 5;

      if (newAuthority !== oldAuthority) {
        // Track change
        const key = `${doc.religion}/${doc.collection}`;
        if (!collectionChanges[key]) {
          collectionChanges[key] = { old: oldAuthority, new: newAuthority, count: 0 };
        }
        collectionChanges[key].count++;

        // Queue update
        updates.push({
          id: doc.id,
          authority: newAuthority
        });
        totalUpdated++;

        // Log first change per doc
        const docKey = doc.doc_id || doc.id;
        if (!seenDocs.has(docKey)) {
          seenDocs.add(docKey);
          logger.info({
            title: doc.title?.substring(0, 50),
            collection: doc.collection,
            oldAuthority,
            newAuthority
          }, 'Authority change');
        }
      }
    }

    // Send updates in batches
    if (updates.length >= BATCH_SIZE && !dryRun) {
      console.log(`  Updating ${updates.length} documents...`);
      await index.updateDocuments(updates);
      updates.length = 0;
    }

    offset += results.length;
  }

  // Final batch
  if (updates.length > 0 && !dryRun) {
    console.log(`  Updating final ${updates.length} documents...`);
    await index.updateDocuments(updates);
  }

  // Summary
  console.log('\n=== Authority Refresh Summary ===');
  console.log(`Total paragraphs processed: ${totalProcessed}`);
  console.log(`Total paragraphs updated: ${totalUpdated}`);
  console.log(`Unique documents changed: ${seenDocs.size}`);

  if (Object.keys(collectionChanges).length > 0) {
    console.log('\nChanges by collection:');
    for (const [key, change] of Object.entries(collectionChanges).sort((a, b) => b[1].count - a[1].count)) {
      console.log(`  ${key}: ${change.old} → ${change.new} (${change.count} paragraphs)`);
    }
  }

  if (dryRun) {
    console.log('\n(DRY RUN - no changes were made)');
  }
}

refreshAuthority()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
