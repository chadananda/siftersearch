#!/usr/bin/env node

/**
 * Fix "Unknown" authors on Báb documents
 *
 * Updates documents where:
 * - ID contains "the_b_b" (from path "The Báb")
 * - author is "Unknown"
 *
 * Sets author to "The Báb" for all matching documents and paragraphs.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { getMeili, INDEXES } from '../api/lib/search.js';

async function main() {
  console.log('🔧 Fixing Báb document authors\n');

  const meili = getMeili();
  const docsIndex = meili.index(INDEXES.DOCUMENTS);
  const parasIndex = meili.index(INDEXES.PARAGRAPHS);

  let fixed = 0;
  let paragraphsFixed = 0;
  let offset = 0;
  const limit = 100;

  // Find all documents with author "Unknown"
  console.log('Finding documents with Unknown author...');

  while (true) {
    const result = await docsIndex.search('', {
      filter: 'author = "Unknown"',
      limit,
      offset,
      attributesToRetrieve: ['id', 'title', 'author']
    });

    if (result.hits.length === 0) break;

    console.log(`\nProcessing batch of ${result.hits.length} documents (offset ${offset})...`);

    for (const doc of result.hits) {
      // Check if ID suggests this is a Báb document
      // ID format: baha_i_core_tablets_the_b_b_001_address_to_believers
      if (doc.id.includes('the_b_b') || doc.id.includes('the_bab')) {
        console.log(`  ✅ ${doc.title}: "Unknown" → "The Báb"`);

        // Update document
        await docsIndex.updateDocuments([{ id: doc.id, author: 'The Báb' }]);
        fixed++;

        // Update all paragraphs for this document
        let paraOffset = 0;
        while (true) {
          const paragraphs = await parasIndex.search('', {
            filter: `document_id = "${doc.id}"`,
            limit: 500,
            offset: paraOffset,
            attributesToRetrieve: ['id']
          });

          if (paragraphs.hits.length === 0) break;

          const updates = paragraphs.hits.map(p => ({ id: p.id, author: 'The Báb' }));
          await parasIndex.updateDocuments(updates);
          paragraphsFixed += paragraphs.hits.length;

          paraOffset += paragraphs.hits.length;
          if (paraOffset >= paragraphs.estimatedTotalHits) break;
        }
      }
    }

    offset += limit;
    if (offset >= result.estimatedTotalHits) break;
  }

  // Wait for updates to be applied
  console.log('\nWaiting for updates to be applied...');
  await new Promise(r => setTimeout(r, 2000));

  console.log(`\n✅ Complete!`);
  console.log(`   Documents fixed: ${fixed}`);
  console.log(`   Paragraphs fixed: ${paragraphsFixed}`);
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
