#!/usr/bin/env node
/**
 * Test side-by-side results (original + translation)
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { hybridSearch } from '../api/lib/search.js';

async function test() {
  console.log('=== Test Side-by-Side Results ===\n');

  // Search for Arabic content that should have translations
  const results = await hybridSearch('God prayer worship', {
    semanticRatio: 0.5,
    limit: 5,
    filters: { language: 'ar' }
  });

  console.log(`Found ${results.hits.length} Arabic results\n`);

  for (const hit of results.hits) {
    console.log('---');
    console.log(`Title: ${hit.title}`);
    console.log(`Score: ${hit._rankingScore?.toFixed(4)}`);
    console.log(`\nOriginal (${hit.language}):`);
    console.log(`  ${hit.text?.substring(0, 150)}...`);

    if (hit.translation) {
      console.log(`\nTranslation (en):`);
      console.log(`  ${hit.translation.substring(0, 150)}...`);
      console.log('\n✅ Side-by-side available!');
    } else {
      console.log('\n⚠️  No translation available');
    }
    console.log();
  }

  // Check how many have translations
  const withTranslation = results.hits.filter(h => h.translation);
  console.log(`\n=== Summary ===`);
  console.log(`Results with translation: ${withTranslation.length}/${results.hits.length}`);
}

test().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
