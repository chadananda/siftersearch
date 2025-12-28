#!/usr/bin/env node
/**
 * Migrate Embeddings from Meilisearch to LibSQL
 *
 * This script harvests existing OpenAI embeddings from Meilisearch
 * and stores them in libsql for caching. This prevents having to
 * regenerate expensive embeddings when re-indexing documents.
 *
 * Usage:
 *   node scripts/migrate-embeddings.js [--dry-run] [--batch-size=100]
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Load environment
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { migrateEmbeddingsFromMeilisearch, getEmbeddingCacheStats } from '../api/services/indexer.js';

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 100;

async function main() {
  console.log('='.repeat(60));
  console.log('Embedding Migration: Meilisearch → LibSQL');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Batch size: ${batchSize}`);
  console.log('');

  // Show current cache stats
  console.log('Current cache stats:');
  try {
    const beforeStats = await getEmbeddingCacheStats();
    console.log(`  Documents in libsql: ${beforeStats.documents}`);
    console.log(`  Paragraphs in libsql: ${beforeStats.paragraphs}`);
    console.log(`  With embeddings: ${beforeStats.withEmbeddings}`);
    console.log('');
  } catch (err) {
    console.log(`  (Could not get stats: ${err.message})`);
    console.log('');
  }

  console.log('Starting migration...');
  console.log('');

  const startTime = Date.now();

  try {
    const stats = await migrateEmbeddingsFromMeilisearch({
      dryRun,
      batchSize,
      onProgress: (progress) => {
        // Log progress periodically
        if (progress.documents % 100 === 0 || progress.documents === progress.total) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[${elapsed}s] Documents: ${progress.documents}/${progress.total}, Paragraphs: ${progress.paragraphs}, Embeddings: ${progress.embeddings}`);
        }
      }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('='.repeat(60));
    console.log('Migration Complete');
    console.log('='.repeat(60));
    console.log(`Duration: ${duration}s`);
    console.log(`Documents processed: ${stats.documents}`);
    console.log(`Paragraphs processed: ${stats.paragraphs}`);
    console.log(`Embeddings saved: ${stats.embeddings}`);
    console.log(`Errors: ${stats.errors}`);

    if (dryRun) {
      console.log('');
      console.log('(DRY RUN - no changes were made)');
      console.log('Run without --dry-run to perform actual migration');
    }

    // Show updated cache stats
    if (!dryRun) {
      console.log('');
      console.log('Updated cache stats:');
      try {
        const afterStats = await getEmbeddingCacheStats();
        console.log(`  Documents in libsql: ${afterStats.documents}`);
        console.log(`  Paragraphs in libsql: ${afterStats.paragraphs}`);
        console.log(`  With embeddings: ${afterStats.withEmbeddings}`);
        console.log(`  Cache hit rate: ${(afterStats.cacheHitRate * 100).toFixed(1)}%`);
      } catch (err) {
        console.log(`  (Could not get stats: ${err.message})`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
