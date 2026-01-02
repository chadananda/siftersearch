#!/usr/bin/env node
/**
 * Test cross-lingual semantic search
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { hybridSearch } from '../api/lib/search.js';

async function test() {
  console.log('=== Test 1: English query, filter to Arabic only ===\n');

  // Search for "divine unity" concept filtering to Arabic only
  const results = await hybridSearch('divine unity and the oneness of God', {
    semanticRatio: 1.0,  // Pure semantic search
    limit: 10,
    filters: ['language = ar']
  });

  console.log('Found', results.hits.length, 'Arabic results\n');

  for (const hit of results.hits.slice(0, 3)) {
    console.log('---');
    console.log(`Title: ${hit.title}`);
    console.log(`Score: ${hit._rankingScore?.toFixed(4)}`);
    console.log(`Text: ${hit.text.substring(0, 200)}...`);
    console.log();
  }

  console.log('\n=== Test 2: English query, filter to Persian only ===\n');

  const results2 = await hybridSearch('prayer and worship', {
    semanticRatio: 1.0,
    limit: 10,
    filters: ['language = fa']
  });

  console.log('Found', results2.hits.length, 'Persian results\n');

  for (const hit of results2.hits.slice(0, 3)) {
    console.log('---');
    console.log(`Title: ${hit.title}`);
    console.log(`Score: ${hit._rankingScore?.toFixed(4)}`);
    console.log(`Text: ${hit.text.substring(0, 200)}...`);
    console.log();
  }

  console.log('\n=== Test 3: Compare keyword vs semantic for Arabic ===\n');

  // Keyword search (semanticRatio = 0)
  const keyword = await hybridSearch('الله', {
    semanticRatio: 0,
    limit: 5,
    filters: ['language = ar']
  });
  console.log('Keyword search for "الله":', keyword.hits.length, 'results');

  // Semantic search
  const semantic = await hybridSearch('الله', {
    semanticRatio: 1.0,
    limit: 5,
    filters: ['language = ar']
  });
  console.log('Semantic search for "الله":', semantic.hits.length, 'results');
}

test().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
