#!/usr/bin/env node

/**
 * Migration: Add authority field to existing Meilisearch documents
 *
 * This script:
 * 1. Reinitializes index settings (adds authority as sortable/filterable)
 * 2. Fetches all paragraphs from Meilisearch
 * 3. Calculates authority for each based on author/collection/religion
 * 4. Updates documents with the new authority field
 */

import { getMeili, INDEXES, initializeIndexes } from '../api/lib/search.js';
import { getAuthority } from '../api/lib/authority.js';
import { logger } from '../api/lib/logger.js';

const BATCH_SIZE = 500;

async function migrateAuthority() {
  console.log('🔄 Starting authority migration...\n');

  // Step 1: Reinitialize indexes with new settings (adds authority)
  console.log('📋 Step 1: Reinitializing index settings...');
  await initializeIndexes();
  console.log('✅ Index settings updated with authority field\n');

  // Wait for settings to be applied
  await new Promise(r => setTimeout(r, 2000));

  const meili = getMeili();
  const paragraphIndex = meili.index(INDEXES.PARAGRAPHS);
  const documentIndex = meili.index(INDEXES.DOCUMENTS);

  // Step 2: Get total counts
  console.log('📊 Step 2: Counting documents...');
  const paraStats = await paragraphIndex.getStats();
  const docStats = await documentIndex.getStats();
  console.log(`   - ${paraStats.numberOfDocuments.toLocaleString()} paragraphs`);
  console.log(`   - ${docStats.numberOfDocuments.toLocaleString()} documents\n`);

  // Step 3: Update paragraphs with authority
  console.log('📝 Step 3: Adding authority to paragraphs...');
  let offset = 0;
  let updated = 0;
  let authorityStats = {};

  while (true) {
    // Fetch batch of paragraphs
    const results = await paragraphIndex.getDocuments({
      limit: BATCH_SIZE,
      offset,
      fields: ['id', 'author', 'religion', 'collection', 'authority']
    });

    if (results.results.length === 0) break;

    // Calculate authority for each and prepare updates
    const updates = results.results.map(doc => {
      const authority = getAuthority({
        author: doc.author,
        religion: doc.religion,
        collection: doc.collection
      });

      // Track stats
      authorityStats[authority] = (authorityStats[authority] || 0) + 1;

      return {
        id: doc.id,
        authority
      };
    });

    // Batch update
    await paragraphIndex.updateDocuments(updates);
    updated += updates.length;
    offset += BATCH_SIZE;

    process.stdout.write(`\r   Updated ${updated.toLocaleString()} / ${paraStats.numberOfDocuments.toLocaleString()} paragraphs...`);
  }
  console.log('\n✅ Paragraphs updated\n');

  // Step 4: Update documents with authority
  console.log('📚 Step 4: Adding authority to documents...');
  offset = 0;
  let docUpdated = 0;

  while (true) {
    const results = await documentIndex.getDocuments({
      limit: BATCH_SIZE,
      offset,
      fields: ['id', 'author', 'religion', 'collection']
    });

    if (results.results.length === 0) break;

    const updates = results.results.map(doc => ({
      id: doc.id,
      authority: getAuthority({
        author: doc.author,
        religion: doc.religion,
        collection: doc.collection
      })
    }));

    await documentIndex.updateDocuments(updates);
    docUpdated += updates.length;
    offset += BATCH_SIZE;

    process.stdout.write(`\r   Updated ${docUpdated.toLocaleString()} / ${docStats.numberOfDocuments.toLocaleString()} documents...`);
  }
  console.log('\n✅ Documents updated\n');

  // Step 5: Show authority distribution
  console.log('📊 Authority distribution (paragraphs):');
  const sortedAuthority = Object.entries(authorityStats)
    .sort((a, b) => parseInt(b[0]) - parseInt(a[0]));

  for (const [auth, count] of sortedAuthority) {
    const label = getAuthorityLabel(parseInt(auth));
    const bar = '█'.repeat(Math.min(50, Math.round(count / updated * 200)));
    console.log(`   ${auth.padStart(2)}: ${count.toLocaleString().padStart(8)} ${bar} (${label})`);
  }

  console.log('\n✅ Migration complete!');
  console.log(`   - ${updated.toLocaleString()} paragraphs updated`);
  console.log(`   - ${docUpdated.toLocaleString()} documents updated`);
  console.log('\n💡 New documents will automatically get authority assigned during indexing.');
}

function getAuthorityLabel(authority) {
  if (authority >= 10) return 'Sacred Text';
  if (authority >= 9) return 'Authoritative';
  if (authority >= 8) return 'Institutional';
  if (authority >= 7) return 'Official';
  if (authority >= 6) return 'Reference';
  if (authority >= 5) return 'Published';
  if (authority >= 4) return 'Historical';
  if (authority >= 3) return 'Research';
  if (authority >= 2) return 'Commentary';
  return 'Unofficial';
}

// Run migration
migrateAuthority().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
