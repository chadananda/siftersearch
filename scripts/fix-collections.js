#!/usr/bin/env node

/**
 * Fix Collection Metadata
 *
 * Updates collection values in Meilisearch that contain " > " separators
 * by extracting just the first folder name (top-level collection).
 *
 * Also fixes other incorrect collection values like:
 * - "Baha'i" (religion used as collection)
 * - "1952" (year used as collection)
 */

import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Load environment
import dotenv from 'dotenv';
dotenv.config({ path: path.join(PROJECT_ROOT, '.env-public') });
dotenv.config({ path: path.join(PROJECT_ROOT, '.env-secrets') });

// Map MEILISEARCH_KEY to MEILI_MASTER_KEY if not set
if (!process.env.MEILI_MASTER_KEY && process.env.MEILISEARCH_KEY) {
  process.env.MEILI_MASTER_KEY = process.env.MEILISEARCH_KEY;
}

import { getMeili, INDEXES } from '../api/lib/search.js';

// Known valid collections (from the library structure)
const VALID_COLLECTIONS = [
  'Pilgrim Notes',
  'Essays',
  'Tablets',
  'Administrative',
  'Prayers',
  'Translations',
  'General'
];

// Mappings for incorrect collection values
const COLLECTION_FIXES = {
  // Religion used as collection
  "Baha'i": 'General',
  'Islam': 'General',
  'Christianity': 'General',
  'Judaism': 'General',
  'Buddhism': 'General',
  'Hinduism': 'General',
  'Zoroastrianism': 'General',
  // Year used as collection
  '1952': 'Essays'
};

async function fixCollections() {
  const meili = getMeili();

  console.log('\n📚 Collection Metadata Fixer');
  console.log('============================\n');

  // Get current facet distribution
  console.log('🔍 Checking current collections...\n');

  const paraSearch = await meili.index(INDEXES.PARAGRAPHS).search('', {
    limit: 0,
    facets: ['collection']
  });

  const collections = paraSearch.facetDistribution?.collection || {};
  console.log('Current collections:');
  for (const [name, count] of Object.entries(collections)) {
    const needsFix = name.includes(' > ') || COLLECTION_FIXES[name];
    console.log(`  ${needsFix ? '⚠️ ' : '✓ '} "${name}": ${count} paragraphs`);
  }

  // Find all collections that need fixing
  const toFix = Object.entries(collections).filter(([name]) =>
    name.includes(' > ') || COLLECTION_FIXES[name]
  );

  if (toFix.length === 0) {
    console.log('\n✅ All collections are valid. Nothing to fix.');
    return;
  }

  console.log(`\n🔧 Found ${toFix.length} collections to fix.\n`);

  // Fix each collection
  for (const [oldCollection, count] of toFix) {
    // Determine the correct collection name
    let newCollection;
    if (oldCollection.includes(' > ')) {
      // Extract first part before " > "
      newCollection = oldCollection.split(' > ')[0];
    } else if (COLLECTION_FIXES[oldCollection]) {
      newCollection = COLLECTION_FIXES[oldCollection];
    } else {
      newCollection = 'General';
    }

    console.log(`Fixing: "${oldCollection}" → "${newCollection}" (${count} paragraphs)`);

    // Get all paragraphs with this collection
    let offset = 0;
    const batchSize = 1000;
    let fixed = 0;

    while (true) {
      const results = await meili.index(INDEXES.PARAGRAPHS).search('', {
        filter: `collection = "${oldCollection}"`,
        limit: batchSize,
        offset,
        attributesToRetrieve: ['id']
      });

      if (results.hits.length === 0) break;

      // Update documents in batch
      const updates = results.hits.map(hit => ({
        id: hit.id,
        collection: newCollection
      }));

      await meili.index(INDEXES.PARAGRAPHS).updateDocuments(updates);
      fixed += updates.length;

      console.log(`  Updated ${fixed}/${count} paragraphs...`);

      if (results.hits.length < batchSize) break;
      offset += batchSize;
    }

    // Also fix in documents index
    const docResults = await meili.index(INDEXES.DOCUMENTS).search('', {
      filter: `collection = "${oldCollection}"`,
      limit: 1000,
      attributesToRetrieve: ['id']
    });

    if (docResults.hits.length > 0) {
      const docUpdates = docResults.hits.map(hit => ({
        id: hit.id,
        collection: newCollection
      }));
      await meili.index(INDEXES.DOCUMENTS).updateDocuments(docUpdates);
      console.log(`  Also updated ${docUpdates.length} documents.`);
    }

    console.log(`  ✅ Done: ${fixed} paragraphs fixed.`);
  }

  // Wait for tasks to complete
  console.log('\n⏳ Waiting for indexing tasks to complete...');
  const tasks = await meili.tasks.getTasks({
    statuses: ['enqueued', 'processing'],
    limit: 100
  });

  if (tasks.results.length > 0) {
    console.log(`  ${tasks.results.length} tasks pending...`);
    // Wait a bit for tasks to process
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Verify fix
  console.log('\n🔍 Verifying fix...\n');

  const verifySearch = await meili.index(INDEXES.PARAGRAPHS).search('', {
    limit: 0,
    facets: ['collection']
  });

  const newCollections = verifySearch.facetDistribution?.collection || {};
  console.log('Collections after fix:');
  for (const [name, count] of Object.entries(newCollections)) {
    const isValid = !name.includes(' > ') && !COLLECTION_FIXES[name];
    console.log(`  ${isValid ? '✓' : '⚠️'} "${name}": ${count} paragraphs`);
  }

  console.log('\n✅ Collection fix complete!');
}

// Run
fixCollections().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
