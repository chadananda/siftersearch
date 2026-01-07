#!/usr/bin/env node

/**
 * Migrate Meilisearch paragraphs from document_id to doc_id
 *
 * This script:
 * 1. Reads all paragraphs from Meilisearch
 * 2. Renames document_id -> doc_id
 * 3. Updates paragraphs in batches
 * 4. Updates filterable attributes
 */

import { MeiliSearch } from 'meilisearch';

const MEILI_HOST = process.env.MEILISEARCH_HOST || 'http://localhost:7700';
const MEILI_KEY = process.env.MEILISEARCH_KEY || '';
const BATCH_SIZE = 1000;

const meili = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_KEY });

async function migrate() {
  const paragraphsIndex = meili.index('paragraphs');

  // Step 1: Get current stats
  const stats = await paragraphsIndex.getStats();
  console.log(`Total documents: ${stats.numberOfDocuments}`);

  // Check field distribution
  console.log('Field distribution:');
  console.log(`  document_id: ${stats.fieldDistribution?.document_id || 0}`);
  console.log(`  doc_id: ${stats.fieldDistribution?.doc_id || 0}`);

  // Step 2: Update filterable attributes to include doc_id
  console.log('\nUpdating filterable attributes...');
  const currentSettings = await paragraphsIndex.getSettings();
  const filterableAttrs = currentSettings.filterableAttributes || [];

  if (!filterableAttrs.includes('doc_id')) {
    filterableAttrs.push('doc_id');
  }
  // Remove document_id if present (will be removed after migration)
  const updatedAttrs = filterableAttrs.filter(a => a !== 'document_id');
  updatedAttrs.push('document_id'); // Keep temporarily for queries

  await paragraphsIndex.updateFilterableAttributes(updatedAttrs);
  console.log('Filterable attributes updated');

  // Wait for settings to be applied
  await new Promise(r => setTimeout(r, 2000));

  // Step 3: Migrate documents in batches
  let offset = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;

  console.log('\nMigrating documents...');

  while (true) {
    // Get batch of documents
    const result = await paragraphsIndex.getDocuments({
      limit: BATCH_SIZE,
      offset,
      fields: ['id', 'document_id', 'doc_id']
    });

    if (result.results.length === 0) break;

    // Find documents that need migration (have document_id but not doc_id)
    const toMigrate = result.results.filter(doc =>
      doc.document_id !== undefined && doc.doc_id === undefined
    );

    if (toMigrate.length > 0) {
      // Create updates - copy document_id to doc_id
      const updates = toMigrate.map(doc => ({
        id: doc.id,
        doc_id: doc.document_id
      }));

      await paragraphsIndex.updateDocuments(updates);
      totalMigrated += updates.length;
      console.log(`  Migrated ${totalMigrated} documents...`);
    }

    totalSkipped += result.results.length - toMigrate.length;
    offset += BATCH_SIZE;

    // Progress update
    if (offset % 10000 === 0) {
      console.log(`  Processed ${offset} documents, migrated ${totalMigrated}, skipped ${totalSkipped}`);
    }
  }

  console.log(`\nMigration complete!`);
  console.log(`  Total migrated: ${totalMigrated}`);
  console.log(`  Total skipped (already had doc_id): ${totalSkipped}`);

  // Step 4: Update final filterable attributes (remove document_id)
  console.log('\nUpdating final filterable attributes (removing document_id)...');
  const finalAttrs = updatedAttrs.filter(a => a !== 'document_id');
  if (!finalAttrs.includes('doc_id')) finalAttrs.push('doc_id');
  await paragraphsIndex.updateFilterableAttributes(finalAttrs);

  // Wait for settings to apply
  await new Promise(r => setTimeout(r, 2000));

  // Verify
  const finalStats = await paragraphsIndex.getStats();
  console.log('\nFinal field distribution:');
  console.log(`  document_id: ${finalStats.fieldDistribution?.document_id || 0}`);
  console.log(`  doc_id: ${finalStats.fieldDistribution?.doc_id || 0}`);

  console.log('\nDone!');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
